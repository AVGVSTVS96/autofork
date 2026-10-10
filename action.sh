#!/usr/bin/env bash
set -euo pipefail

failed="$RUNNER_TEMP/autopatch-failed"
skip="$(cat "$failed" 2>/dev/null || true)"
head="$(git rev-parse HEAD)"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

if ! node "$GITHUB_ACTION_PATH/dist/autopatch.js" sync ${skip:+--skip "$skip"}; then
  echo "result=failed" >> "$GITHUB_OUTPUT"
  exit 1
fi

if [ "$(git rev-parse HEAD)" != "$head" ]; then
  parents=()
  for parent in $(git log -1 --format=%P); do parents+=(-f "parents[]=$parent"); done
  remote="https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
  scratch="refs/heads/autopatch-objects-${GITHUB_RUN_ID}"
  git push --quiet "$remote" "HEAD:$scratch" 2>&1 | { grep -v '^remote:' || true; } >&2
  trap 'git push --quiet "$remote" --delete "$scratch" || true' EXIT
  signed="$(gh api "repos/$GITHUB_REPOSITORY/git/commits" \
    -f message="$(git log -1 --format=%B)" -f tree="$(git rev-parse 'HEAD^{tree}')" "${parents[@]}" --jq .sha)"
  gh api -X PATCH "repos/$GITHUB_REPOSITORY/git/refs/heads/$GITHUB_REF_NAME" -f sha="$signed" > /dev/null
  echo "pushed ${signed:0:12} to $GITHUB_REF_NAME, signed by GitHub"
fi

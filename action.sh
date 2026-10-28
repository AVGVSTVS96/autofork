#!/usr/bin/env bash
set -euo pipefail

failed="$RUNNER_TEMP/autofork-failed"
skip="$(cat "$failed" 2>/dev/null || true)"
[ "${GITHUB_EVENT_NAME:-}" = schedule ] || skip=""
head="$(git rev-parse HEAD)"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

heal=""
[ "${HEAL:-true}" = true ] || heal="--no-heal"

codex_auth="${CODEX_HOME:-$HOME/.codex}/auth.json"
if [ -n "${CODEX_AUTH:-}" ]; then
  mkdir -p "$(dirname "$codex_auth")"
  printf '%s' "$CODEX_AUTH" > "$codex_auth"
fi

keep_codex_auth() {
  [ -n "${CODEX_AUTH:-}" ] && [ -n "${CODEX_AUTH_URL:-}" ] || return 0
  [ "$(cat "$codex_auth")" != "$CODEX_AUTH" ] || return 0
  oidc="$(curl -fsS -H "Authorization: Bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=autofork" | jq -r .value)"
  if curl -fsS -X POST -H "Authorization: Bearer $oidc" -H "Content-Type: application/json" --data-binary @"$codex_auth" "$CODEX_AUTH_URL" > /dev/null; then
    echo "saved Codex's refreshed sign-in"
  else
    echo "::warning::couldn't save Codex's refreshed sign-in; sign in again if the next run can't reach Codex"
  fi
}
trap keep_codex_auth EXIT

if ! node "$GITHUB_ACTION_PATH/dist/autofork.js" sync ${skip:+--skip "$skip"} $heal; then
  echo "result=failed" >> "$GITHUB_OUTPUT"
  exit 1
fi

# A workflow's GITHUB_TOKEN can't push changes to workflow files, so for those the autofork app lends the fork a token.
app_token() {
  [ -n "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ] || { echo "the autofork workflow needs \`id-token: write\` in its permissions"; return 1; }
  oidc="$(curl -fsS -H "Authorization: Bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=autofork" | jq -r .value)" \
    || { echo "GitHub didn't give the workflow its OIDC token"; return 2; }
  answer="$(curl -sS -X POST -H "Authorization: Bearer $oidc" -w '\n%{http_code}' https://autofork.com/api/github/token)" \
    || { echo "autofork.com didn't answer"; return 2; }
  status="${answer##*$'\n'}"
  answer="${answer%$'\n'*}"
  [ "$status" = 200 ] && jq -er .token <<< "$answer" && return
  jq -er .error <<< "$answer" 2> /dev/null || echo "autofork.com answered $status"
  [ "$status" = 403 ] && return 1 || return 2
}

if [ "$(git rev-parse HEAD)" != "$head" ]; then
  push="$GH_TOKEN"
  if ! git diff --quiet "$head" HEAD -- .github/workflows && [ "$GH_TOKEN" = "$ACTIONS_TOKEN" ]; then
    push="$(app_token)" && got=0 || got=$?
    if [ "$got" = 2 ]; then
      echo "autofork: this sync changes workflow files, and autofork couldn't get the token that pushes them: $push" >&2
      echo "result=failed" >> "$GITHUB_OUTPUT"
      exit 1
    fi
    if [ "$got" = 1 ]; then
      title="autofork can't push upstream's workflow changes"
      body="This sync changes workflow files, and a workflow's own GitHub token can't push those: $push.

To let it, [install the autofork app](https://github.com/apps/autofork-app/installations/new) on this repo and give \`.github/workflows/autofork.yml\` \`id-token: write\` in its \`permissions\`, or pass the autofork step a \`token\` that can push workflows. Then run the workflow by hand, and close this issue."
      issue="$(gh issue list -R "$GITHUB_REPOSITORY" --state open --search "$title in:title" --json number,title \
        --jq "map(select(.title == \"$title\"))[0].number // empty" 2> /dev/null || true)"
      [ -n "$issue" ] || gh issue create -R "$GITHUB_REPOSITORY" --title "$title" --body "$body" > /dev/null \
        || echo "::warning::autofork couldn't open an issue about it: turn on the fork's issues and give the workflow issues: write"
      echo "autofork: $body" >&2
      echo "result=failed" >> "$GITHUB_OUTPUT"
      exit 1
    fi
    echo "::add-mask::$push"
  fi
  parents=()
  for parent in $(git log -1 --format=%P); do parents+=(-f "parents[]=$parent"); done
  remote="https://x-access-token:${push}@github.com/${GITHUB_REPOSITORY}.git"
  scratch="refs/heads/autofork-objects-${GITHUB_RUN_ID}"
  git push --quiet "$remote" "HEAD:$scratch" 2>&1 | { grep -v '^remote:' || true; } >&2
  trap 'git push --quiet "$remote" --delete "$scratch" || true; keep_codex_auth' EXIT
  signed="$(GH_TOKEN="$push" gh api "repos/$GITHUB_REPOSITORY/git/commits" \
    -f message="$(git log -1 --format=%B)" -f tree="$(git rev-parse 'HEAD^{tree}')" "${parents[@]}" --jq .sha)"
  if ! moved="$(GH_TOKEN="$push" gh api -X PATCH "repos/$GITHUB_REPOSITORY/git/refs/heads/$GITHUB_REF_NAME" -f sha="$signed" 2>&1)"; then
    if [ "$(gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/$GITHUB_REF_NAME" --jq .object.sha)" = "$head" ]; then
      echo "$moved" >&2
      exit 1
    fi
    echo "$GITHUB_REF_NAME changed while this ran, so the next run syncs it instead"
    echo "result=moved" >> "$GITHUB_OUTPUT"
    exit 0
  fi
  echo "pushed ${signed:0:12} to $GITHUB_REF_NAME, signed by GitHub"

  for flow in $(git diff --name-only --diff-filter=A "$head" HEAD -- .github/workflows); do
    for wait in 0 5 15; do
      sleep "$wait"
      GH_TOKEN="$push" gh api -X PUT "repos/$GITHUB_REPOSITORY/actions/workflows/$(basename "$flow")/disable" > /dev/null 2>&1 && continue 2
    done
    echo "::warning::upstream added $flow, and autofork couldn't turn it off in this fork: turn it off in the Actions tab if the fork shouldn't run it"
  done

  for doc in $(git diff --name-only --diff-filter=A "$head" HEAD -- '.autofork/*/UPSTREAM.md'); do
    id="$(basename "$(dirname "$doc")")"
    if ! gh issue create -R "$GITHUB_REPOSITORY" --title "$id: upstream does this now" \
      --body "$(cat "$doc")"$'\n\n'"Paused in ${signed:0:12}." > /dev/null; then
      echo "::warning::upstream has $id now and autofork paused it, but couldn't open an issue about it: turn on the fork's issues and give the workflow issues: write"
    fi
  done
fi

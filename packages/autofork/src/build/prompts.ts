import type { Fork } from "../config/types.ts";
import { DIR, WORKFLOWS } from "../layout.ts";
import { unbuilt } from "../patches/files.ts";
import type { Build, Failed } from "./types.ts";

const SYNCING = (upstream: string) =>
  `You are keeping a patched fork of ${upstream} in sync. The fork is upstream plus a stack of patches, each one described in ${DIR}/<id>/PATCH.md.`;

const pickChecks = ({ setup }: Fork, source: string) =>
  `This fork has no check yet. From upstream's CI (\`git show ${source}:.github/workflows\`), write ${DIR}/config.json's ${
    setup === undefined
      ? `"setup", which installs dependencies, and "verify", which checks a build, each one \`sh -c\` command. A sync runs them on a fresh machine and puts the checkout back as git has it after \`setup\`, so \`setup\` installs all \`verify\` needs, outside the checkout or where git ignores it. Both have to pass on upstream alone too, or the sync drops them.`
      : `"verify", which checks a build, as one \`sh -c\` command. A sync runs it on a fresh machine after \`${setup}\`, so it can use only what that installs. It has to pass on upstream alone too, or the sync drops it.`
  }`;

const runChecks = ({ setup, verify }: Fork, after: string[]) =>
  `Run upstream's own checks for the code you touched, and ${verify === undefined ? "your `verify`" : `\`${verify}\``}, which the sync has to pass.${setup === undefined ? "" : ` Dependencies are installed: \`${setup}\` ran here, so run it again if you change them.`} Fix what your change breaks.${after.length > 0 ? ` Patches after this one aren't applied yet: ${after.join(", ")}. Each goes on top of yours, so leave what its PATCH.md asks for to it.` : ""}`;

export const healPrompt = (config: Fork, build: Build, id: string, broken: string) => {
  const index = config.patches.indexOf(id);
  const before = config.patches.slice(0, index);
  const after = config.patches.slice(index + 1).filter((later) => !build.upstreamHas.has(later));
  const fresh = unbuilt(build.dir, id);
  const generated = config.generated ?? [];

  const steps = [
    `Read ${DIR}/${id}/PATCH.md. It says what the patch does and why, and that's the contract.`,
    ...(fresh
      ? []
      : [
          `${DIR}/${id}/${id}.patch is how it was done before. Use it as a guide, not as text to force in.`,
        ]),
    "Build it on what upstream has now, the smallest change that fully does what PATCH.md says: where upstream has its own version of what the patch touches, change that rather than bringing the old one back. Follow upstream's code and conventions, and leave everything else alone.",
    ...(config.verify === undefined ? [pickChecks(config, build.source)] : []),
    runChecks(config, after),
    ...(fresh
      ? [
          `Add a short paragraph to the end of ${DIR}/${id}/PATCH.md on why it's built the way it is, for whoever rebuilds it after upstream moves. Keep what's there as it is.`,
        ]
      : []),
  ];

  return `${SYNCING(config.upstream)}

This checkout is upstream at ${build.source}${before.length > 0 ? `, with ${before.join(", ")} already applied` : ""}. ${fresh ? `Patch "${id}" is new and hasn't been built yet.` : broken}

${steps.map((step, number) => `${number + 1}. ${step}`).join("\n")}

The sync keeps your source change and puts ${DIR}/ and ${WORKFLOWS}/ back after you, except what this asks you to write there. Remove anything your checks generated that git would pick up${generated.length > 0 ? `, but leave ${generated.join(", ")}, which the sync rebuilds` : ""}.
If upstream already does what PATCH.md asks, or something close enough that building it would duplicate upstream's own version, write one line saying what upstream does to ${DIR}/${id}/UPSTREAM.md, and the sync leaves the patch out.`;
};

export const fixPrompt = (
  config: Fork,
  build: Build,
  ids: string[],
  failed: Failed,
  from: string,
) => {
  const paused = ids.filter((id) => build.upstreamHas.has(id));
  const later = config.patches.slice(ids.length);
  const generated = config.generated ?? [];
  const changes =
    from === build.source
      ? ""
      : `\n\nTo see what upstream changed: git diff --stat ${from} ${build.source}`;
  const base = build.steps[0];

  return `${SYNCING(config.upstream)}

This checkout is upstream at ${build.source} with the patches on top, one commit each, named by its id: ${ids.join(", ")}.${paused.length > 0 ? ` Upstream already has ${paused.join(", ")}: leave ${paused.length === 1 ? "its commit" : "their commits"} empty.` : ""} They all apply, but \`${config[failed.check] ?? ""}\` fails with them. Its last lines:

\`\`\`
${failed.lines}
\`\`\`${changes}

Make it pass. Fold each fix into the commit of the patch it belongs to (git commit --fixup, then an autosquash rebase onto ${base}), built on what upstream has now and in upstream's code and conventions, so each patch still does what its PATCH.md says. When you're done, the commits on ${base} are these patches, one each, named by its id, in this order.${config.setup !== undefined && failed.check === "verify" ? ` Dependencies are installed: \`${config.setup}\` ran here, so run it again if you change them.` : ""}${later.length > 0 ? ` Patches after these aren't applied yet: ${later.join(", ")}. Each goes on top, so leave what its PATCH.md asks for to it.` : ""}

The sync keeps your commits and puts ${DIR}/ and ${WORKFLOWS}/ back after you, except what this asks you to write there. Leave out of your commits anything your checks generated${generated.length > 0 ? `, and the changes setup made to ${generated.join(", ")}, which the sync rebuilds` : ""}.
If upstream now does what a patch's PATCH.md asks, or something close enough that the patch would duplicate upstream's own version, edit that patch's commit so it's empty, keeping the commit, and write one line saying what upstream does to ${DIR}/<id>/UPSTREAM.md. The sync leaves the patch out.`;
};

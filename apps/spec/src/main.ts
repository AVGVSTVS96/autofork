import "./style.css";

const REPO = "https://github.com/AVGVSTVS96/patch_md-spec";

/* ---------------------------------------------------------------------------
 * Code samples
 *
 * Kept as plain strings (arrays joined with newlines where the content holds
 * backticks or `${...}`) so nothing is interpreted as a template expression.
 * ------------------------------------------------------------------------- */
const structureSample = `---
id: <patch-id>
summary: <short summary of the patch's intent>
version: <semver>
lastUpdated: <yyyy-mm-dd>
---

# <Patch Title>

## Intent

<What the patch does and why, in plain prose. This is what an agent reads
to re-anchor an edit when the target file changes.>

## Patch Edits

### <target/path>

<one or more edits>

### <target/path-2, split by target, path, type, or section>

<one or more edits>`;

const searchReplaceSample = [
  "<<<<<<< SEARCH",
  "    console.log(chalk.green(`Updated ${APP_NAME}`));",
  "=======",
  "    console.log(chalk.green(`Updated ${APP_NAME}`));",
  '    try { (await import("node:child_process")).spawnSync("pi-patcher", ["reconcile"], { stdio: "inherit" }); } catch {}',
  ">>>>>>> REPLACE",
].join("\n");

const hunkSample = [
  "@@ pi self_update success branch @@",
  "                    console.log(chalk.green(`Updated ${APP_NAME}`));",
  '+                    try { (await import("node:child_process")).spawnSync("pi-patcher", ["reconcile"], { stdio: "inherit" }); } catch {}',
].join("\n");

const treeSample = `bootstrap-hook/
├── PATCH.md
├── hook-insert/
│   └── PATCH.md
└── hook-config/
    └── PATCH.md`;

const frontmatterSample = `# parent patch frontmatter
parts: [hook-insert, hook-config]

# sub-patch frontmatter
parent: bootstrap-hook`;

const exampleSample = [
  "---",
  "id: bootstrap-hook",
  "summary: Re-run `pi-patcher reconcile` after pi finishes updating itself.",
  "---",
  "",
  "# Bootstrap hook",
  "",
  "## Intent",
  "",
  "Patches Pi to run `pi-patcher reconcile` after pi finishes updating itself.",
  "",
  "After pi's `pi update` finishes updating pi, run `pi-patcher reconcile` so every",
  "installed patch is re-applied to the freshly updated install.",
  "",
  "The hook goes right after the existing `Updated ${APP_NAME}` success log in pi's",
  "self-update path. It must stay valid in pi's compiled ESM output, and it must not",
  "change update behavior if `pi-patcher` is missing or fails to start.",
  "",
  "## Patch Edits",
  "",
  "### dist/package-manager-cli.js",
  "",
  "> note: end of the self-update branch, right after `Updated ${APP_NAME}`",
  "",
  "```diff",
  "@@ pi self update success branch @@",
  "    console.log(chalk.green(`Updated ${APP_NAME}`));",
  '+    try { (await import("node:child_process")).spawnSync("pi-patcher", ["reconcile"], { stdio: "inherit" }); } catch {}',
  "```",
].join("\n");

/* ------------------------------------------------------------------------- */

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function highlight(src: string): string {
  return src
    .split("\n")
    .map((line) => {
      const safe = esc(line);
      if (line.startsWith("@@")) return `<span class="text-accent">${safe}</span>`;
      if (line.startsWith("<<<<<<<") || line.startsWith(">>>>>>>") || line.startsWith("======="))
        return `<span class="text-accent opacity-70">${safe}</span>`;
      if (line.startsWith("+") && !line.startsWith("++"))
        return `<span class="text-emerald-600 dark:text-emerald-400">${safe}</span>`;
      if (line.startsWith("-") && !line.startsWith("--"))
        return `<span class="text-rose-600 dark:text-rose-400">${safe}</span>`;
      if (line.startsWith(">")) return `<span class="italic opacity-70">${safe}</span>`;
      return safe;
    })
    .join("\n");
}

const codeBlock = (src: string): string => `<pre><code>${highlight(src)}</code></pre>`;
const block = (src: string): string => `<div class="mt-5">${codeBlock(src)}</div>`;

const githubIcon = `<svg viewBox="0 0 24 24" fill="currentColor" class="h-[18px] w-[18px]" aria-hidden="true"><path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.21 3.44 9.63 8.2 11.19.6.1.82-.25.82-.56v-2.02c-3.34.71-4.04-1.58-4.04-1.58-.55-1.37-1.34-1.74-1.34-1.74-1.09-.73.08-.72.08-.72 1.2.08 1.84 1.21 1.84 1.21 1.07 1.79 2.81 1.27 3.5.97.11-.76.42-1.27.76-1.56-2.67-.3-5.47-1.3-5.47-5.79 0-1.28.47-2.33 1.24-3.15-.12-.3-.54-1.5.12-3.13 0 0 1.01-.32 3.3 1.2a11.6 11.6 0 0 1 6 0c2.29-1.52 3.3-1.2 3.3-1.2.66 1.63.24 2.83.12 3.13.77.82 1.24 1.87 1.24 3.15 0 4.5-2.81 5.49-5.49 5.78.43.37.81 1.1.81 2.22v3.29c0 .31.21.67.82.56A12.01 12.01 0 0 0 24 12.29C24 5.78 18.63.5 12 .5Z"/></svg>`;

const iconIntent = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6 text-accent" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`;
const iconAnchor = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6 text-accent" aria-hidden="true"><circle cx="12" cy="5" r="3"/><line x1="12" x2="12" y1="22" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg>`;
const iconHeal = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6 text-accent" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`;
const arrowDown = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-[18px] w-[18px]" aria-hidden="true"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>`;

const card = (icon: string, title: string, body: string): string => `
  <div class="p-8 border-t border-border first:border-t-0 md:border-t-0 md:border-l md:first:border-l-0">
    ${icon}
    <h2 class="mt-4">${title}</h2>
    <p class="mt-2">${body}</p>
  </div>`;

const specHeading = (id: string, title: string): string => `<h2 id="${id}">${title}</h2>`;

const app = document.querySelector<HTMLDivElement>("#app")!;
app.className = "mx-auto flex min-h-svh w-full max-w-[1126px] flex-col border-x border-border";

app.innerHTML = `
<header class="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-bg/80 px-6 py-4 backdrop-blur md:px-8">
  <a href="#top" class="flex items-center gap-2 font-medium text-text-h">
    <img src="/favicon.svg" width="20" height="19" alt="" />
    <span>PATCH<span class="text-accent">.md</span></span>
  </a>
  <nav class="flex items-center gap-2">
    <a class="card-link max-sm:hidden" href="#spec">Spec</a>
    <a class="card-link" href="${REPO}" target="_blank" rel="noreferrer">${githubIcon}<span class="max-sm:sr-only">GitHub</span></a>
  </nav>
</header>

<section id="top" class="flex flex-col items-center gap-6 px-6 py-20 text-center md:py-28">
  <img src="/favicon.svg" width="60" height="58" alt="PATCH.md logo" />
  <span class="chip">early draft · v0.1.0</span>
  <h1>PATCH<span class="text-accent">.md</span></h1>
  <p class="max-w-2xl text-lg">
    A file format for defining source patches that AI agents can self-heal and reapply.
    Plain-prose <strong class="text-text-h">intent</strong> plus
    content-anchored <strong class="text-text-h">edits</strong>.
  </p>
  <div class="flex flex-wrap justify-center gap-2">
    <a class="card-link" href="#spec">${arrowDown}Read the spec</a>
    <a class="card-link" href="${REPO}" target="_blank" rel="noreferrer">${githubIcon}GitHub</a>
  </div>
</section>

<div class="ticks"></div>
<section class="border-t border-border px-6 py-14 md:px-8">
  <div class="mx-auto max-w-3xl space-y-5">
    <p>
      <span class="text-text-h">PATCH.md</span> is a file format for defining a source
      patch that agents can apply and self-update over time. A patch file holds two
      things: its <strong class="text-text-h">intent</strong>, written in plain prose,
      and its <strong class="text-text-h">edits</strong>, a diff or patch hunk that 
      defines the current state of the patch's code.
    </p>
    <p>
      Anchoring to content is what lets a patch survive changes to the file it targets.
      When an edit stops matching, an agent can read the intent and the old edit, find
      the equivalent place in the updated file, and rewrite the edit to fit. The format
      describes the patch; the tools built around it do the applying and the repairing.
    </p>
  </div>
</section>

<div class="ticks"></div>
<!-- <section class="grid border-t border-border md:grid-cols-3"> -->
<!--   ${card(iconIntent, "Intent in prose", "Every patch explains what it does and why in plain language, the description an agent reads to re-anchor an edit when the target file moves.")} -->
<!--   ${card(iconAnchor, "Content-anchored edits", "Edits match on the code around them, as search/replace blocks or diff hunks, never on line numbers, so they survive upstream changes.")} -->
<!--   ${card(iconHeal, "Agent-driven healing", "When an edit drifts, an agent reads the intent and the old edit, finds the new location, and rewrites the patch to fit the updated file.")} -->
<!-- </section> -->

<div class="ticks"></div>
<section id="spec" class="border-t border-border px-6 py-16 md:px-8 md:py-20">
  <div class="mx-auto max-w-3xl">
    <p class="font-mono text-sm text-accent">Specification · v0.1.0</p>
    <h1 class="mt-2">The format</h1>

    <section class="mt-14">
      ${specHeading("file", "File")}
      <p class="mt-4">
        One patch is one <code>PATCH.md</code> file, kept by convention at
        <code>&lt;patch-id&gt;/PATCH.md</code>. The <code>&lt;patch-id&gt;</code> can be
        a custom or generated name, id, etc.
      </p>
    </section>

    <section class="mt-14">
      ${specHeading("structure", "Structure")}
      <p class="mt-4">
        A patch can list several targets, each under its own target heading, and each
        target can hold more than one edit.
      </p>
      ${block(structureSample)}
    </section>

    <section class="mt-14">
      ${specHeading("edit-forms", "Edit forms")}
      <p class="mt-4">
        An edit is a fenced code block that defines the patch's current code. Two
        formats are recommended to start. Use whichever you prefer.
      </p>
      <p class="mt-6 font-medium text-text-h">Search/replace block</p>
      <p class="mt-2">Shows the full before and after, anchored on the whole replaced region.</p>
      ${block(searchReplaceSample)}
      <p class="mt-6 font-medium text-text-h">Hunk</p>
      <p class="mt-2">Diff style, marks only the changed lines.</p>
      ${block(hunkSample)}
      <ul class="mt-5 list-disc space-y-2 pl-5">
        <li><code>-</code> marks a removed line and <code>+</code> marks an added line.</li>
        <li>
          Optional, for extra context or agent hints: an <code>@@ … @@</code> header,
          or a <code>&gt; note:</code> line directly before an edit.
        </li>
      </ul>
    </section>

    <section class="mt-14">
      ${specHeading("applying", "Applying edits")}
      <p class="mt-4">
        Every edit has a before and an after. The before must appear exactly once in
        the target file, so there is never any doubt about where the edit goes. Applying
        replaces the before with the after. Because the match is unique, applying the
        same patch twice is safe, and a tool can read each edit's state directly:
      </p>
      <ul class="mt-5 space-y-3">
        <li class="flex items-baseline gap-3"><span class="chip text-emerald-600 dark:text-emerald-400">applied</span><span>the after is present</span></li>
        <li class="flex items-baseline gap-3"><span class="chip text-accent">pending</span><span>the before is present</span></li>
        <li class="flex items-baseline gap-3"><span class="chip text-rose-600 dark:text-rose-400">drift</span><span>neither is present</span></li>
      </ul>
      <p class="mt-5">
        All edits in a patch apply together or not at all. If any edit fails, a tool
        restores the file to how it started.
      </p>
    </section>

    <section class="mt-14">
      ${specHeading("splitting", "Splitting a patch")}
      <p class="mt-4">
        A patch can touch several files, but when one grows large or bundles unrelated
        changes, split it into smaller sub-patches. Smaller patches are easier to
        maintain, and easier for an agent to heal. Sub-patches nest inside their
        parent's directory, and the
        relationships are declared in frontmatter.
      </p>
      ${block(treeSample)}
      ${block(frontmatterSample)}
    </section>

    <section class="mt-14">
      ${specHeading("healing", "Agent-driven healing")}
      <p class="mt-4">
        When an edit no longer matches its target, the patch has drifted. From the
        <code>PATCH.md</code>, an agent can automatically fix and update the patch when
        the target changes. Snapshot the target before editing and restore it if
        anything fails. A tool can also let the agent decline, for example when the
        feature a patch depended on has been removed, instead of forcing a change that
        no longer fits.
      </p>
      <p class="mt-4">
        Tool developers and patch authors decide how complex a change their agent is
        allowed to heal automatically.
      </p>
    </section>

    <section id="example" class="mt-14">
      ${specHeading("example", "Example")}
      <p class="mt-4">
        The <code>bootstrap-hook</code> patch from
        <a class="text-text-h underline decoration-border underline-offset-4 hover:decoration-accent" href="${REPO}" target="_blank" rel="noreferrer">pi-patcher</a>,
        written as a single <code>PATCH.md</code>:
      </p>
      ${block(exampleSample)}
    </section>
  </div>
</section>

<div class="ticks"></div>
<footer class="flex flex-col items-center justify-between gap-3 border-t border-border px-6 py-8 text-sm md:px-8 sm:flex-row">
  <p>PATCH.md · v0.1.0 · early draft. Refinements and proposals welcome.</p>
  <a class="card-link" href="${REPO}" target="_blank" rel="noreferrer">${githubIcon}GitHub</a>
</footer>

<div class="h-12 border-t border-border md:h-20"></div>
`;

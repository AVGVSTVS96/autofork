// Regenerates the spec section of README.md from apps/website/src/spec.mdx.
// The README is hand-written except for the region between the spec markers,
// which this script owns. Run via `vp run gen-readme` (or the pre-commit hook).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { remark } from "remark";
import { visit } from "unist-util-visit";

const root = fileURLToPath(new URL("..", import.meta.url));
const specPath = new URL("../apps/website/src/spec.mdx", import.meta.url);
const readmePath = new URL("../README.md", import.meta.url);

const START = "<!-- spec:start -->";
const END = "<!-- spec:end -->";
const BANNER =
  "<!-- Generated from apps/website/src/spec.mdx. Edit that file instead, then run: vp run gen-readme -->";

// GitHub renders the README one level deeper than the site renders the spec.
const demoteHeadings = () => (tree) => {
  visit(tree, "heading", (node) => {
    node.depth += 1;
  });
};

// The site maps blockquotes to a styled callout; GitHub needs the alert marker.
const markAlerts = () => (tree) => {
  visit(tree, "blockquote", (node) => {
    const paragraph = node.children[0];
    if (paragraph?.type !== "paragraph") return;
    paragraph.children.unshift({ type: "html", value: "[!NOTE]\n" });
  });
};

const spec = readFileSync(specPath, "utf8");
const generated = String(
  remark().data("settings", { bullet: "-" }).use(demoteHeadings).use(markAlerts).processSync(spec),
).trimEnd();

const readme = readFileSync(readmePath, "utf8");
const start = readme.indexOf(START);
const end = readme.indexOf(END);
if (start === -1 || end === -1 || end < start) {
  console.error(`README.md is missing the ${START} / ${END} markers.`);
  process.exit(1);
}

const before = readme.slice(0, start + START.length);
const after = readme.slice(end);
const next = `${before}\n\n${BANNER}\n\n${generated}\n\n${after}`;

if (next !== readme) {
  writeFileSync(readmePath, next);
  console.log(`README.md spec section regenerated from ${specPath.pathname.slice(root.length)}`);
} else {
  console.log("README.md spec section already up to date.");
}

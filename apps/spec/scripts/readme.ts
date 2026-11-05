import type { Root } from "mdast";
import { remark } from "remark";
import { visit } from "unist-util-visit";

const deeper = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 6 } as const;

const START = "<!-- spec:start -->";
const END = "<!-- spec:end -->";

const BANNER =
  "<!-- Generated from apps/spec/src/spec/spec.mdx. Edit that file instead, then run: bun run readme -->";

const oneLevelDeeper = () => (tree: Root) => {
  visit(tree, "heading", (heading) => {
    heading.depth = deeper[heading.depth];
  });
};

const githubAlerts = () => (tree: Root) => {
  visit(tree, "blockquote", (quote) => {
    const [paragraph] = quote.children;

    if (paragraph?.type === "paragraph") {
      paragraph.children.unshift({ type: "html", value: "[!NOTE]\n" });
    }
  });
};

const spec = await Bun.file(new URL("../src/spec/spec.mdx", import.meta.url)).text();
const readmeFile = Bun.file(new URL("../README.md", import.meta.url));
const readme = await readmeFile.text();
const start = readme.indexOf(START);
const end = readme.indexOf(END);

if (start === -1 || end < start) {
  throw new Error(`README.md is missing the ${START} / ${END} markers.`);
}

const generated = String(
  await remark()
    .data("settings", { bullet: "-" })
    .use(oneLevelDeeper)
    .use(githubAlerts)
    .process(spec),
).trimEnd();

await readmeFile.write(
  `${readme.slice(0, start + START.length)}\n\n${BANNER}\n\n${generated}\n\n${readme.slice(end)}`,
);

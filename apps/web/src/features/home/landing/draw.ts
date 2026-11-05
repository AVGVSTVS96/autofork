const NS = "http://www.w3.org/2000/svg";

export const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export const front = () => innerHeight * 0.88;

export const svgEl = <Tag extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: Tag,
  attrs: Readonly<Record<string, string | number>>,
) => {
  const node = document.createElementNS(NS, tag);

  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }

  parent.append(node);

  return node;
};

export const removeAll = (root: ParentNode, selector: string) => {
  for (const node of root.querySelectorAll(selector)) {
    node.remove();
  }
};

export const px = (value: string) => Number(value.replace(/px$/u, ""));

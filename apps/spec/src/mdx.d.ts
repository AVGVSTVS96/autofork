declare module "*.mdx" {
  import type { ComponentType } from "react";

  // Mirrors MDX's own `MDXComponents`: an element/component override map. The
  // value props are intentionally loose (`any`) because the map mixes intrinsic
  // elements and custom components with unrelated prop shapes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MDXComponent: ComponentType<{ components?: Record<string, ComponentType<any>> }>;
  export default MDXComponent;
}

declare module "*.mdx" {
  import type { ComponentType, ElementType } from "react";

  const MDXContent: ComponentType<{ components?: Readonly<Record<string, ElementType>> }>;
  export default MDXContent;
}

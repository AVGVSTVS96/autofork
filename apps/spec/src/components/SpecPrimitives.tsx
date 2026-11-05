import { isValidElement, type ComponentProps, type ReactNode } from "react";

const classNames = (...values: Array<string | undefined>) => values.filter(Boolean).join(" ");

const stringify = (children: ReactNode): string => {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(stringify).join("");
  if (isValidElement<{ children?: ReactNode }>(children)) return stringify(children.props.children);
  return "";
};

const slugify = (children: ReactNode) =>
  stringify(children)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");

export function Callout({ children, className, ...props }: ComponentProps<"blockquote">) {
  return (
    <blockquote {...props} className={classNames("callout mt-6", className)}>
      {children}
    </blockquote>
  );
}

export function SpecHeading({ id, children, className, ...props }: ComponentProps<"h2">) {
  const anchorId = id ?? slugify(children);

  return (
    <h2 {...props} id={anchorId} className={classNames("group", className)}>
      <a href={`#${anchorId}`} className="spec-anchor">
        {children}
        <span
          aria-hidden="true"
          className="text-accent opacity-0 transition-opacity group-hover:opacity-100"
        >
          #
        </span>
      </a>
    </h2>
  );
}

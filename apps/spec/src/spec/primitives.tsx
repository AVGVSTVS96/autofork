import type { ComponentProps } from "react";

const joined = (...names: (string | undefined)[]) => names.filter(Boolean).join(" ");

export const Callout = ({ children, className, ...props }: ComponentProps<"blockquote">) => (
  <blockquote {...props} className={joined("callout mt-6", className)}>
    {children}
  </blockquote>
);

export const SpecHeading = ({ id, children, className, ...props }: ComponentProps<"h2">) => (
  <h2 {...props} id={id} className={joined("group", className)}>
    <a href={`#${id}`} className="spec-anchor">
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

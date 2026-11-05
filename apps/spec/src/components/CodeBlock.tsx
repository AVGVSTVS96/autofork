import { isValidElement, type ComponentProps, type ReactNode } from "react";

function lineClass(line: string): string | undefined {
  if (line.startsWith("@@")) return "text-accent";
  if (line.startsWith("<<<<<<<") || line.startsWith(">>>>>>>") || line.startsWith("=======")) {
    return "text-accent opacity-70";
  }
  if (line.startsWith("+") && !line.startsWith("++"))
    return "text-emerald-600 dark:text-emerald-400";
  if (line.startsWith("-") && !line.startsWith("--")) return "text-rose-600 dark:text-rose-400";
  if (line.startsWith(">")) return "italic opacity-70";
  return undefined;
}

const stringify = (children: ReactNode): string => {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(stringify).join("");
  return "";
};

type CodeChildProps = {
  children?: ReactNode;
  className?: string;
};

export function CodeBlock({ children, ...props }: ComponentProps<"pre">) {
  if (!isValidElement<CodeChildProps>(children)) {
    return <pre {...props}>{children}</pre>;
  }

  const codeProps = children.props;
  const lines = stringify(codeProps.children).replace(/\n$/, "").split("\n");

  return (
    <pre {...props}>
      <code className={codeProps.className}>
        {lines.map((line, i) => {
          // Re-emit the newline `split` stripped (except after the last line);
          // `pre code` keeps it visible via `white-space: pre`.
          const text = i < lines.length - 1 ? `${line}\n` : line;
          return (
            <span key={i} className={lineClass(line)}>
              {text}
            </span>
          );
        })}
      </code>
    </pre>
  );
}

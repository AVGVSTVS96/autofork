import { isValidElement } from "react";
import type { ComponentProps } from "react";

const conflict = ["<<<<<<<", ">>>>>>>", "======="];

const lineClass = (line: string) => {
  if (line.startsWith("@@")) {
    return "text-accent";
  }

  if (conflict.some((marker) => line.startsWith(marker))) {
    return "text-accent opacity-70";
  }

  if (line.startsWith("+") && !line.startsWith("++")) {
    return "text-emerald-600 dark:text-emerald-400";
  }

  if (line.startsWith("-") && !line.startsWith("--")) {
    return "text-rose-600 dark:text-rose-400";
  }

  return line.startsWith(">") ? "italic opacity-70" : undefined;
};

interface Code {
  readonly children: string;
  readonly className?: string;
}

export const CodeBlock = ({ children, ...props }: ComponentProps<"pre">) => {
  if (!isValidElement<Code>(children)) {
    return <pre {...props}>{children}</pre>;
  }

  const lines = children.props.children.replace(/\n$/u, "").split("\n");
  const last = lines.length - 1;

  return (
    <pre {...props}>
      <code className={children.props.className}>
        {lines.map((line, index) => (
          <span key={`${index}:${line}`} className={lineClass(line)}>
            {index < last ? `${line}\n` : line}
          </span>
        ))}
      </code>
    </pre>
  );
};

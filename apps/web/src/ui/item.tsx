import type { ReactNode } from "react";

export const Item = ({
  state,
  children,
  end,
  detail,
}: {
  state: "ok" | "now" | "wait" | "bad" | "paused";
  children: ReactNode;
  end?: string | undefined;
  detail?: ReactNode;
}) => (
  <li className={`item ${state}`}>
    <i aria-hidden="true" />
    <div className="body">{children}</div>
    {end === undefined ? null : <span className="end">{end}</span>}
    {detail === undefined ? null : <div className="detail">{detail}</div>}
  </li>
);

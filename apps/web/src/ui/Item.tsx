import type { ReactNode } from "react";

export const Item = ({
  state,
  children,
  end,
  detail,
}: {
  state: "ok" | "now" | "wait" | "bad" | "paused";
  children: ReactNode;
  end?: ReactNode;
  detail?: ReactNode;
}) => (
  <li className={`item ${state}`}>
    <i aria-hidden="true" />
    <div className="body">{children}</div>
    {end ? <span className="end">{end}</span> : null}
    {detail ? <div className="detail">{detail}</div> : null}
  </li>
);

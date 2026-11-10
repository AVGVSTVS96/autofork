import type { ReactNode } from "react";

export const Meter = ({ spent, cap }: { spent: number; cap: number }) => (
  <span className="meter" aria-hidden="true">
    {spent > 0 ? (
      <i style={{ width: `${Math.min(100, cap > 0 ? (spent / cap) * 100 : 100)}%` }} />
    ) : null}
  </span>
);

export const Gauge = ({
  value,
  of,
  spent,
  cap,
}: {
  value: ReactNode;
  of: string;
  spent: number;
  cap: number;
}) => (
  <span className="gauge">
    <span>
      <b>{value}</b> <small>{of}</small>
    </span>
    <Meter spent={spent} cap={cap} />
  </span>
);

import { money } from "../lib/spend/live.tsx";

export const Meter = ({ spent, cap }: { spent: number; cap: number }) => (
  <span className="meter" role="img" aria-label={`${money(spent)} of ${money(cap)}`}>
    <i style={{ width: `${Math.min(100, cap ? (spent / cap) * 100 : 0)}%` }} />
  </span>
);

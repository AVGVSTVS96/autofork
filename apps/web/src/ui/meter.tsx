export const Meter = ({ spent, cap }: { spent: number; cap: number }) => (
  <span className="meter" aria-hidden="true">
    <i style={{ width: `${Math.min(100, cap > 0 ? (spent / cap) * 100 : 0)}%` }} />
  </span>
);

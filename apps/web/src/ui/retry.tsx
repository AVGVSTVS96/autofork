export const Retry = ({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry: () => void;
  className?: string;
}) => (
  <div className={className === undefined ? "retry" : `retry ${className}`} role="alert">
    <p className="bad">{message}</p>
    <button type="button" className="btn" onClick={onRetry}>
      Try again
    </button>
  </div>
);

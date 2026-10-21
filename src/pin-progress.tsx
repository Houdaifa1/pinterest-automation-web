export function PinProgress({
  ready,
  posted,
  held,
  total,
  compact = false,
}: {
  ready: number;
  posted: number;
  held: number;
  total: number;
  compact?: boolean;
}) {
  const ratio = (n: number) =>
    total > 0 ? Math.min(100, Math.max(0, (n / total) * 100)) : 0;
  const done = ratio(posted),
    queued = done + ratio(ready),
    attention = queued + ratio(held);
  const description = `${posted} posted, ${ready} ready, ${held} needing attention out of ${total} tracked pins`;
  return (
    <div className={compact ? "pin-progress compact" : "pin-progress"}>
      {!compact && (
        <div
          className="pin-ring"
          role="img"
          aria-label={description}
          style={{
            background: `conic-gradient(#4ade80 0% ${done}%, #60a5fa ${done}% ${queued}%, #fbbf24 ${queued}% ${attention}%, #333 ${attention}% 100%)`,
          }}
        >
          <div>
            <strong>{total.toLocaleString()}</strong>
            <span>tracked pins</span>
          </div>
        </div>
      )}
      <div className="pin-progress-details">
        <div className="pin-progress-track" role="img" aria-label={description}>
          <span className="posted" style={{ width: `${done}%` }} />
          <span className="ready" style={{ width: `${ratio(ready)}%` }} />
          <span className="attention" style={{ width: `${ratio(held)}%` }} />
        </div>
        {!compact && (
          <div className="pin-legend">
            <span>
              <i className="posted" />
              {posted.toLocaleString()} posted
            </span>
            <span>
              <i className="ready" />
              {ready.toLocaleString()} ready
            </span>
            <span>
              <i className="attention" />
              {held.toLocaleString()} need attention
            </span>
            {total > posted + ready + held && (
              <span>
                <i />
                {(total - posted - ready - held).toLocaleString()} other
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

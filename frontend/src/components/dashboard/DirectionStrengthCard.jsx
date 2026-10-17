const DIRECTION_META = {
  LEFT: { emoji: '⬅️', label: 'LEFT' },
  RIGHT: { emoji: '➡️', label: 'RIGHT' },
  UP: { emoji: '⬆️', label: 'UP' },
  DOWN: { emoji: '⬇️', label: 'DOWN' },
};

function aggregateDirectionStats(sessions) {
  const totals = {
    LEFT: { attempts: 0, hits: 0 },
    RIGHT: { attempts: 0, hits: 0 },
    UP: { attempts: 0, hits: 0 },
    DOWN: { attempts: 0, hits: 0 },
  };

  sessions.forEach((session) => {
    const stats = session.directionStats;
    if (!stats) return;

    Object.keys(totals).forEach((direction) => {
      const d = stats[direction];
      if (!d) return;
      totals[direction].attempts += d.attempts || 0;
      totals[direction].hits += d.hits || 0;
    });
  });

  return Object.keys(totals).reduce((acc, direction) => {
    const { attempts, hits } = totals[direction];
    acc[direction] = {
      attempts,
      hits,
      accuracy: attempts > 0 ? (hits / attempts) * 100 : 0,
    };
    return acc;
  }, {});
}

export default function DirectionStrengthCard({ sessions = [] }) {
  const stats = aggregateDirectionStats(sessions);
  const directions = Object.keys(stats);
  const withAttempts = directions.filter((d) => stats[d].attempts > 0);

  if (withAttempts.length === 0) {
    return (
      <div className="card w-full">
        <p className="font-bold text-gray-800 mb-2">Direction Strength</p>
        <p className="text-sm text-gray-400">Play Fish Adventure to see direction stats</p>
      </div>
    );
  }

  const strongest = withAttempts.reduce(
    (best, d) => (stats[d].accuracy > stats[best].accuracy ? d : best),
    withAttempts[0]
  );
  const weakest = withAttempts.reduce(
    (worst, d) => (stats[d].accuracy < stats[worst].accuracy ? d : worst),
    withAttempts[0]
  );

  return (
    <div className="card w-full">
      <p className="font-bold text-gray-800 mb-4">Direction Strength</p>
      <div className="space-y-3">
        {directions.map((direction) => {
          const { accuracy, attempts } = stats[direction];
          const { emoji, label } = DIRECTION_META[direction];
          const isStrongest = withAttempts.length > 1 && direction === strongest;
          const isWeakest = withAttempts.length > 1 && direction === weakest;
          const barColor = isStrongest ? '#16a34a' : isWeakest ? '#f97316' : '#60a5fa';

          return (
            <div key={direction} className="flex items-center gap-3">
              <span className="w-20 text-sm font-medium text-gray-700 flex-shrink-0">
                {emoji} {label}
              </span>
              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(accuracy, 100)}%`, backgroundColor: barColor }}
                />
              </div>
              <span
                className="w-12 text-right text-sm font-semibold flex-shrink-0"
                style={{ color: attempts > 0 ? barColor : '#9ca3af' }}
              >
                {attempts > 0 ? `${Math.round(accuracy)}%` : '—'}
              </span>
              {isWeakest && (
                <span className="text-xs text-orange-500 font-medium whitespace-nowrap">
                  Needs more practice
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

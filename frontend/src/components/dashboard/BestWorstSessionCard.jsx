const GAME_NAMES = {
  fish: 'Fish Adventure',
  flower: 'Flower Game',
  aac: 'Communication Board',
};

function formatSessionDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function findBestWorst(sessions) {
  let best = sessions[0];
  let worst = sessions[0];

  sessions.forEach((session) => {
    const accuracy = session.performance?.accuracy || 0;
    if (accuracy > (best.performance?.accuracy || 0)) best = session;
    if (accuracy < (worst.performance?.accuracy || 0)) worst = session;
  });

  return { best, worst };
}

function SessionStatCard({ session, variant }) {
  const isBest = variant === 'best';
  const accuracy = session.performance?.accuracy || 0;
  const durationMin = Math.round((session.duration || 0) / 60);
  const level = session.performance?.difficultyReached || 1;
  const gameName = GAME_NAMES[session.module] || session.module;

  return (
    <div
      className="card flex-1 min-w-[220px]"
      style={{ borderWidth: 2, borderColor: isBest ? '#16a34a' : '#f97316' }}
    >
      <p className="font-semibold text-gray-800 mb-2">
        {isBest ? '🏆 Best Session' : '📉 Needs Improvement'}
      </p>
      <p className="text-sm text-gray-500">Date: {formatSessionDate(session.createdAt)}</p>
      <p className="text-sm text-gray-500">Game: {gameName}</p>
      <p className="text-sm text-gray-500">Accuracy: {accuracy.toFixed(0)}%</p>
      <p className="text-sm text-gray-500">Duration: {durationMin} min</p>
      <p className="text-sm text-gray-500">Level: {level}</p>
      {session.module === 'fish' && (
        <p className="text-sm text-gray-500">Food eaten: {session.performance?.attempts || 0}</p>
      )}
    </div>
  );
}

export default function BestWorstSessionCard({ sessions = [] }) {
  if (sessions.length === 0) {
    return (
      <div className="card w-full">
        <p className="font-bold text-gray-800 mb-2">Best &amp; Worst Sessions</p>
        <p className="text-sm text-gray-400">No sessions yet</p>
      </div>
    );
  }

  const { best, worst } = findBestWorst(sessions);
  const showWorst = sessions.length > 1 && worst._id !== best._id;

  return (
    <div className="card w-full">
      <p className="font-bold text-gray-800 mb-4">Best &amp; Worst Sessions</p>
      <div className="flex flex-wrap gap-4">
        <SessionStatCard session={best} variant="best" />
        {showWorst && <SessionStatCard session={worst} variant="worst" />}
      </div>
    </div>
  );
}

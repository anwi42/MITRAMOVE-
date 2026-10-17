const GAME_META = {
  fish: { emoji: '🐠', name: 'Fish Adventure' },
  flower: { emoji: '🌸', name: 'Flower Game' },
};

export default function FavouriteGameCard({ sessions = [] }) {
  const gameSessions = sessions.filter((s) => s.module === 'fish' || s.module === 'flower');

  if (gameSessions.length === 0) {
    return null;
  }

  const counts = { fish: 0, flower: 0 };
  const durations = { fish: 0, flower: 0 };

  gameSessions.forEach((s) => {
    counts[s.module] += 1;
    durations[s.module] += s.duration || 0;
  });

  const isTie = counts.fish > 0 && counts.flower > 0 && counts.fish === counts.flower;

  if (isTie) {
    return (
      <div className="card w-full">
        <p className="font-bold text-gray-800 mb-2">Favourite Game</p>
        <p className="text-lg font-semibold text-gray-700">🐠 🌸 Both games equally!</p>
        <p className="text-sm text-gray-500 mt-1">
          {counts.fish} Fish Adventure &middot; {counts.flower} Flower Game sessions
        </p>
      </div>
    );
  }

  const favourite = counts.fish > counts.flower ? 'fish' : 'flower';
  const meta = GAME_META[favourite];
  const timesPlayed = counts[favourite];
  const avgMinutes = timesPlayed > 0 ? durations[favourite] / timesPlayed / 60 : 0;

  return (
    <div className="card w-full">
      <p className="font-bold text-gray-800 mb-2">Favourite Game</p>
      <div className="flex items-center gap-4">
        <span className="text-4xl">{meta.emoji}</span>
        <div>
          <p className="text-lg font-semibold text-gray-800">{meta.name}</p>
          <p className="text-sm text-gray-500">Played {timesPlayed} times</p>
          <p className="text-sm text-gray-500">
            Average {avgMinutes.toFixed(1)} minutes per session
          </p>
        </div>
      </div>
    </div>
  );
}

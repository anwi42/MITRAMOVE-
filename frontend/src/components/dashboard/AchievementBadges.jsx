const BADGES = [
  {
    key: 'first-step',
    emoji: '🎯',
    name: 'First Step',
    condition: 'Complete 1 session',
    isUnlocked: ({ totalSessions }) => totalSessions >= 1,
  },
  {
    key: 'ten-sessions',
    emoji: '⭐',
    name: '10 Sessions',
    condition: 'Complete 10 sessions',
    isUnlocked: ({ totalSessions }) => totalSessions >= 10,
  },
  {
    key: 'twenty-five-sessions',
    emoji: '🏆',
    name: '25 Sessions',
    condition: 'Complete 25 sessions',
    isUnlocked: ({ totalSessions }) => totalSessions >= 25,
  },
  {
    key: 'sharp-shooter',
    emoji: '🎯',
    name: 'Sharp Shooter',
    condition: 'Reach 70% average accuracy',
    isUnlocked: ({ avgAccuracy }) => avgAccuracy >= 70,
  },
  {
    key: 'three-day-streak',
    emoji: '🔥',
    name: '3 Day Streak',
    condition: 'Play 3 days in a row',
    isUnlocked: ({ streak }) => streak >= 3,
  },
  {
    key: 'week-warrior',
    emoji: '🔥',
    name: 'Week Warrior',
    condition: 'Play 7 days in a row',
    isUnlocked: ({ streak }) => streak >= 7,
  },
  {
    key: 'fish-explorer',
    emoji: '🐠',
    name: 'Fish Explorer',
    condition: 'Play Fish Adventure',
    isUnlocked: ({ sessions }) => sessions.some((s) => s.module === 'fish'),
  },
  {
    key: 'flower-master',
    emoji: '🌸',
    name: 'Flower Master',
    condition: 'Reach level 3+ in Flower Game',
    isUnlocked: ({ sessions }) =>
      sessions.some((s) => s.module === 'flower' && (s.performance?.difficultyReached || 0) >= 3),
  },
];

export default function AchievementBadges({
  totalSessions = 0,
  avgAccuracy = 0,
  streak = 0,
  sessions = [],
}) {
  const context = { totalSessions, avgAccuracy, streak, sessions };

  return (
    <div className="card w-full">
      <p className="font-bold text-gray-800 mb-4">Achievements</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {BADGES.map((badge) => {
          const unlocked = badge.isUnlocked(context);

          return (
            <div
              key={badge.key}
              title={unlocked ? badge.name : badge.condition}
              className={`flex flex-col items-center text-center p-3 rounded-xl border transition ${
                unlocked ? 'bg-primary-50 border-primary-200' : 'bg-gray-50 border-gray-200'
              }`}
            >
              <span className="text-3xl mb-1">{unlocked ? badge.emoji : '🔒'}</span>
              <span
                className={`text-xs font-medium ${unlocked ? 'text-gray-800' : 'text-gray-400'}`}
              >
                {badge.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

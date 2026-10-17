import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';

const RECOMMENDED_SESSIONS_PER_WEEK = 3;
const BRIGHT_GREEN = '#16a34a';
const LIGHT_GREEN = '#86efac';

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMondayOfWeek(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay();
  const diff = day === 0 ? 6 : day - 1;
  result.setDate(result.getDate() - diff);
  return result;
}

function groupSessionsByWeek(sessions) {
  const weekCounts = new Map();

  sessions.forEach((session) => {
    const monday = getMondayOfWeek(new Date(session.createdAt));
    const key = formatDateKey(monday);
    weekCounts.set(key, (weekCounts.get(key) || 0) + 1);
  });

  return [...weekCounts.keys()]
    .sort()
    .map((key, idx) => ({ weekKey: key, label: `Week ${idx + 1}`, count: weekCounts.get(key) }));
}

export default function WeeklySessionsCard({ sessions = [] }) {
  if (sessions.length === 0) {
    return (
      <div className="card w-full">
        <p className="font-bold text-gray-800 mb-2">Weekly Sessions</p>
        <p className="text-sm text-gray-400">No sessions yet</p>
      </div>
    );
  }

  const weeks = groupSessionsByWeek(sessions);
  const bestWeek = weeks.reduce((best, w) => (w.count > best.count ? w : best), weeks[0]);
  const totalSessions = weeks.reduce((sum, w) => sum + w.count, 0);
  const avgPerWeek = weeks.length > 0 ? totalSessions / weeks.length : 0;

  return (
    <div className="card w-full">
      <p className="font-bold text-gray-800 mb-3">Weekly Sessions</p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={weeks}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis domain={[0, 7]} allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value) => [`${value} session${value === 1 ? '' : 's'}`, undefined]} />
          <ReferenceLine
            y={RECOMMENDED_SESSIONS_PER_WEEK}
            stroke="#f97316"
            strokeDasharray="4 4"
            label={{
              value: 'Recommended: 3/week',
              position: 'insideTopRight',
              fill: '#f97316',
              fontSize: 11,
            }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {weeks.map((week) => (
              <Cell
                key={week.weekKey}
                fill={week.count >= RECOMMENDED_SESSIONS_PER_WEEK ? BRIGHT_GREEN : LIGHT_GREEN}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-sm text-gray-600 mt-2">
        Best week: {bestWeek.count} sessions ({bestWeek.label})
      </p>
      <p className="text-sm text-gray-500">Average: {avgPerWeek.toFixed(1)} sessions per week</p>
    </div>
  );
}

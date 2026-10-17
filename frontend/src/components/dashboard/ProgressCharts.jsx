import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

const COLORS = {
  score: '#7c3aed',
  duration: '#3b82f6',
  level: '#6366f1',
};

function buildChartData(sessions) {
  return [...sessions]
    .slice(0, 7)
    .reverse()
    .map((session, idx) => ({
      name: `#${idx + 1}`,
      score: Math.round((session.performance?.accuracy || 0) * 10) / 10,
      durationMin: Math.round(((session.duration || 0) / 60) * 10) / 10,
      level: session.performance?.difficultyReached || session.recommendedLevel || 1,
    }));
}

export default function ProgressCharts({ sessions = [] }) {
  if (!sessions || sessions.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-400">No sessions yet</p>
      </div>
    );
  }

  const data = buildChartData(sessions);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="card">
        <p className="text-sm font-semibold text-gray-700 mb-2">Score (last 7 sessions)</p>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => [`${value}%`, 'Score']} />
            <Line
              type="monotone"
              dataKey="score"
              stroke={COLORS.score}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <p className="text-sm font-semibold text-gray-700 mb-2">Duration (minutes)</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => [`${value} min`, 'Duration']} />
            <Bar dataKey="durationMin" fill={COLORS.duration} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <p className="text-sm font-semibold text-gray-700 mb-2">Difficulty Level</p>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis domain={[1, 5]} allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => [`Level ${value}`, 'Difficulty']} />
            <Line
              type="monotone"
              dataKey="level"
              stroke={COLORS.level}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

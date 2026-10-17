import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

function computeTrend(yValues) {
  const n = yValues.length;
  if (n === 0) return { slope: 0, intercept: 0 };

  const xValues = yValues.map((_, i) => i + 1);

  const sumX = xValues.reduce((a, b) => a + b, 0);
  const sumY = yValues.reduce((a, b) => a + b, 0);
  const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
  const sumX2 = xValues.reduce((sum, x) => sum + x * x, 0);

  const denominator = n * sumX2 - sumX * sumX;
  const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

export default function AccuracyTrendCard({ sessions = [] }) {
  if (sessions.length === 0) {
    return (
      <div className="card w-full">
        <p className="font-bold text-gray-800 mb-2">Accuracy Trend</p>
        <p className="text-sm text-gray-400">No sessions yet</p>
      </div>
    );
  }

  // sessions arrive newest-first; reverse to chronological order
  const chronological = [...sessions].reverse();
  const accuracyValues = chronological.map((s) => s.performance?.accuracy || 0);
  const { slope, intercept } = computeTrend(accuracyValues);

  const chartData = chronological.map((session, idx) => {
    const sessionNumber = idx + 1;
    return {
      name: `#${sessionNumber}`,
      accuracy: accuracyValues[idx],
      trend: intercept + slope * sessionNumber,
    };
  });

  let trendLabel = 'Overall trend: Stable →';
  let trendColor = '#6b7280';
  if (slope > 0.5) {
    trendLabel = 'Overall trend: Improving ↑';
    trendColor = '#16a34a';
  } else if (slope < -0.5) {
    trendLabel = 'Overall trend: Declining ↓';
    trendColor = '#f97316';
  }

  return (
    <div className="card w-full">
      <p className="font-bold text-gray-800 mb-3">Accuracy Trend</p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value) => [`${value.toFixed(1)}%`, undefined]} />
          <Line
            type="monotone"
            dataKey="accuracy"
            name="Accuracy"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 4 }}
          />
          <Line
            type="linear"
            dataKey="trend"
            name="Trend"
            stroke="#f97316"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-sm font-semibold mt-2" style={{ color: trendColor }}>
        {trendLabel}
      </p>
    </div>
  );
}

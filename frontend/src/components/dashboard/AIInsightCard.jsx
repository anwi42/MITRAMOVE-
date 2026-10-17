import { useEffect, useState } from 'react';

const AI_SERVICE_URL = 'http://localhost:8000';

const TREND_DISPLAY = {
  up: { label: '↑ Improving', color: '#16a34a' },
  down: { label: '↓ Needs attention', color: '#ea580c' },
  stable: { label: '→ Stable', color: '#6b7280' },
};

export default function AIInsightCard({ childId }) {
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!childId) {
      setInsight(null);
      return undefined;
    }

    let cancelled = false;

    async function loadInsight() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${AI_SERVICE_URL}/insights/${childId}`);
        if (!response.ok) {
          throw new Error(`AI service responded with ${response.status}`);
        }
        const data = await response.json();
        if (!cancelled) setInsight(data);
      } catch (err) {
        if (!cancelled) setError('AI insight unavailable — is the AI service running?');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadInsight();

    return () => {
      cancelled = true;
    };
  }, [childId]);

  if (loading) {
    return (
      <div className="card w-full">
        <p className="text-sm text-gray-400">Generating insight...</p>
      </div>
    );
  }

  if (error || !insight) {
    return (
      <div className="card w-full">
        <p className="text-sm text-gray-400">{error || 'No insight available yet.'}</p>
      </div>
    );
  }

  const trendInfo = TREND_DISPLAY[insight.trend] || TREND_DISPLAY.stable;

  return (
    <div className="card w-full">
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold text-gray-800">🤖 Practice Recommendations</p>
        <span className="text-xs font-semibold text-gray-400">
          {insight.confidence}% confidence
        </span>
      </div>

      <p className="text-sm text-gray-700 mb-3">{insight.insight}</p>

      <div className="flex items-center justify-between text-sm border-t border-gray-100 pt-3">
        <span className="text-gray-500">Avg Accuracy: {insight.avgAccuracy.toFixed(1)}%</span>
        <span className="font-semibold" style={{ color: trendInfo.color }}>
          {trendInfo.label}
        </span>
      </div>
    </div>
  );
}

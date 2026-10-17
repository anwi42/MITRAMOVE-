import { useEffect, useState } from 'react';

const AI_SERVICE_URL = 'http://localhost:8000';

function statusStyle(fatigueScore, isFatigued) {
  if (isFatigued) return { bg: '#fee2e2', ring: '#ef4444', label: 'Fatigued' };
  if (fatigueScore >= 0.4) return { bg: '#ffedd5', ring: '#f97316', label: 'Mild Fatigue' };
  return { bg: '#dcfce7', ring: '#16a34a', label: 'Not Fatigued' };
}

export default function FatigueIndicator({ sessions = [] }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sessions || sessions.length === 0) {
      setResult(null);
      return undefined;
    }

    let cancelled = false;

    async function checkFatigue() {
      setLoading(true);
      setError(null);
      try {
        // sessions arrive newest-first; build chronological trend data
        // from the recent history, and use the most recent session's
        // duration as the current-session signal.
        const chronological = [...sessions].slice(0, 10).reverse();
        const reactionTimes = chronological.map((s) => s.performance?.responseTime || 0);
        const accuracyHistory = chronological.map((s) => s.performance?.accuracy || 0);
        const sessionDurationSec = sessions[0]?.duration || 0;

        const response = await fetch(`${AI_SERVICE_URL}/fatigue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reaction_times: reactionTimes,
            accuracy_history: accuracyHistory,
            session_duration_sec: sessionDurationSec,
          }),
        });

        if (!response.ok) {
          throw new Error(`AI service responded with ${response.status}`);
        }

        const data = await response.json();
        if (!cancelled) setResult(data);
      } catch (err) {
        if (!cancelled) setError('Fatigue check unavailable');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    checkFatigue();

    return () => {
      cancelled = true;
    };
  }, [sessions]);

  if (!sessions || sessions.length === 0) {
    return (
      <div className="card text-center py-8">
        <p className="text-gray-400">No sessions yet</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card text-center py-8">
        <p className="text-sm text-gray-400">Checking fatigue...</p>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="card text-center py-8">
        <p className="text-sm text-gray-400">{error || 'Fatigue check unavailable'}</p>
      </div>
    );
  }

  const { bg, ring, label } = statusStyle(result.fatigue_score, result.is_fatigued);
  const percentage = Math.round(result.fatigue_score * 100);

  return (
    <div className="card flex items-center gap-4">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm"
        style={{ backgroundColor: bg, border: `3px solid ${ring}`, color: ring }}
      >
        {percentage}%
      </div>
      <div>
        <p className="font-semibold text-gray-800">{label}</p>
        <p className="text-sm text-gray-500 mt-1">{result.suggestion}</p>
      </div>
    </div>
  );
}

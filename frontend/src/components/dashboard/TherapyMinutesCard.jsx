import { useEffect, useState } from 'react';
import api from '../../utils/api';

export default function TherapyMinutesCard({ childId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!childId) {
      setData(null);
      return undefined;
    }

    let cancelled = false;

    async function loadMonthlyMinutes() {
      setLoading(true);
      setError(null);
      try {
        const { data: response } = await api.get(`/sessions/child/${childId}/monthly-minutes`);
        if (!cancelled) setData(response);
      } catch (err) {
        if (!cancelled) setError('Could not load therapy minutes.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadMonthlyMinutes();

    return () => {
      cancelled = true;
    };
  }, [childId]);

  if (loading) {
    return (
      <div className="card w-full">
        <p className="text-sm text-gray-400">Loading this month's progress...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card w-full">
        <p className="text-sm text-gray-400">{error || 'No data yet.'}</p>
      </div>
    );
  }

  const { minutesThisMonth, monthlyGoal, percentage, sessionsThisMonth } = data;
  const goalReached = minutesThisMonth >= monthlyGoal;
  const barPercentage = Math.min(Math.max(percentage, 0), 100);

  return (
    <div className="card w-full">
      <p className="font-bold text-gray-800 mb-3">Therapy This Month</p>

      <div className="flex items-end justify-between mb-2 flex-wrap gap-2">
        <p className="text-2xl font-bold text-gray-800">
          {minutesThisMonth} / {monthlyGoal}{' '}
          <span className="text-sm font-normal text-gray-500">minutes</span>
        </p>
        {goalReached && (
          <span className="text-sm font-semibold" style={{ color: '#ca8a04' }}>
            🏆 Goal reached!
          </span>
        )}
      </div>

      <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-primary-600 rounded-full transition-all"
          style={{ width: `${barPercentage}%` }}
        />
      </div>

      <p className="text-sm text-gray-500">{percentage}% of monthly goal</p>
      <p className="text-xs text-gray-400 mt-1">{sessionsThisMonth} sessions this month</p>
    </div>
  );
}

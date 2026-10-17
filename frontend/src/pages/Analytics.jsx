import { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import api from '../utils/api';
import ProgressCharts from '../components/dashboard/ProgressCharts';
import FatigueIndicator from '../components/dashboard/FatigueIndicator';
import WeeklyReport from '../components/dashboard/WeeklyReport';
import AccuracyTrendCard from '../components/dashboard/AccuracyTrendCard';
import BestWorstSessionCard from '../components/dashboard/BestWorstSessionCard';
import WeeklySessionsCard from '../components/dashboard/WeeklySessionsCard';

function streakMessage(streak) {
  if (streak === 0) return 'Play today to start!';
  if (streak >= 7) return 'Amazing! 🌟';
  if (streak >= 3) return 'Keep it up! 💪';
  return '';
}

export default function Analytics() {
  const { childId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const child = location.state?.child;

  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [streak, setStreak] = useState(0);
  const [loadingStreak, setLoadingStreak] = useState(true);

  useEffect(() => {
    if (!child) {
      navigate('/dashboard', { replace: true });
    }
  }, [child, navigate]);

  useEffect(() => {
    if (!childId) return undefined;

    let cancelled = false;

    async function loadSessions() {
      setLoadingSessions(true);
      try {
        const { data } = await api.get('/sessions', { params: { childId, limit: 20 } });
        if (!cancelled) setSessions(data);
      } catch {
        if (!cancelled) setSessions([]);
      } finally {
        if (!cancelled) setLoadingSessions(false);
      }
    }

    async function loadSummary() {
      setLoadingSummary(true);
      try {
        const { data } = await api.get(`/dashboard/summary/${childId}`);
        if (!cancelled) setSummary(data);
      } catch {
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setLoadingSummary(false);
      }
    }

    async function loadStreak() {
      setLoadingStreak(true);
      try {
        const { data } = await api.get(`/children/${childId}/streak`);
        if (!cancelled) setStreak(data.currentStreak ?? 0);
      } catch {
        if (!cancelled) setStreak(0);
      } finally {
        if (!cancelled) setLoadingStreak(false);
      }
    }

    loadSessions();
    loadSummary();
    loadStreak();

    return () => {
      cancelled = true;
    };
  }, [childId]);

  if (!child) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 via-white to-white">
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="text-xl font-bold text-primary-600">MitraMove</div>
        <button
          type="button"
          className="text-sm text-gray-500 hover:text-primary-600 transition"
          onClick={() => navigate('/dashboard')}
        >
          ← Back to Dashboard
        </button>
      </nav>

      <div className="px-10 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">{child.name}&apos;s Analytics</h1>

        {loadingSummary ? (
          <p className="text-sm text-gray-400">Loading stats...</p>
        ) : (
          summary && (
            <div className="flex flex-wrap gap-4">
              <div className="card flex-1 min-w-[200px]">
                <p className="text-sm text-gray-500">Total Sessions</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{summary.totalSessions}</p>
              </div>
              <div className="card flex-1 min-w-[200px]">
                <p className="text-sm text-gray-500">Avg Accuracy</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">
                  {summary.avgAccuracy.toFixed(1)}%
                </p>
              </div>
              <div className="card flex-1 min-w-[200px]">
                <p className="text-sm text-gray-500">Avg Participation Score</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">
                  {summary.avgParticipationScore.toFixed(1)}
                </p>
              </div>
              <div className="card flex-1 min-w-[200px]">
                <p className="text-sm text-gray-500">🔥 Streak</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">
                  {loadingStreak ? '…' : streak}
                </p>
                <p className="text-xs text-gray-400 mt-1">Day Streak</p>
                {!loadingStreak && streakMessage(streak) && (
                  <p className="text-xs text-primary-600 font-medium mt-1">
                    {streakMessage(streak)}
                  </p>
                )}
              </div>
            </div>
          )
        )}

        {loadingSessions ? (
          <div className="card w-full">
            <p className="text-sm text-gray-400">Loading analytics...</p>
          </div>
        ) : (
          <>
            <ProgressCharts sessions={sessions} />
            <FatigueIndicator sessions={sessions} />
            <WeeklyReport child={child} sessions={sessions} />
            <AccuracyTrendCard sessions={sessions} />
            <BestWorstSessionCard sessions={sessions} />
            <WeeklySessionsCard sessions={sessions} />
          </>
        )}
      </div>
    </div>
  );
}

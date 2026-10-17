import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const ALERT_STYLES = {
  red: { emoji: '🔴', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
  yellow: { emoji: '🟡', bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700' },
  green: { emoji: '🟢', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
};

const DIRECTION_META = {
  LEFT: { emoji: '⬅️', label: 'LEFT' },
  RIGHT: { emoji: '➡️', label: 'RIGHT' },
  UP: { emoji: '⬆️', label: 'UP' },
  DOWN: { emoji: '⬇️', label: 'DOWN' },
};

const GOAL_TYPE_META = {
  accuracy: { label: 'Accuracy (%)', suffix: '%' },
  sessions: { label: 'Sessions Count', suffix: 'sessions' },
  level: { label: 'Difficulty Level', suffix: '/5' },
  direction: { label: 'Direction Accuracy', suffix: '%' },
};

const GAME_OPTIONS = [
  { value: 'fish', label: 'Fish Adventure' },
  { value: 'flower', label: 'Flower Garden' },
  { value: 'aac', label: 'Communication Board' },
];

function formatGoalValue(value, type) {
  const rounded = Math.round(value || 0);
  if (type === 'sessions') return `${rounded} sessions`;
  if (type === 'level') return `${rounded}/5`;
  return `${rounded}%`;
}

function getWeekStart(dateInput) {
  const d = new Date(dateInput);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

function groupSessionsByWeek(sessions) {
  if (!sessions || sessions.length === 0) return [];

  const sorted = [...sessions].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const firstWeekStart = getWeekStart(sorted[0].createdAt);
  const lastWeekStart = getWeekStart(sorted[sorted.length - 1].createdAt);

  const weeks = [];
  const cursor = new Date(firstWeekStart);
  let idx = 1;

  while (cursor <= lastWeekStart) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const count = sorted.filter((s) => {
      const t = new Date(s.createdAt);
      return t >= weekStart && t < weekEnd;
    }).length;

    weeks.push({ label: `Week ${idx}`, sessions: count, displayValue: count === 0 ? 0.15 : count });

    cursor.setDate(cursor.getDate() + 7);
    idx += 1;
  }

  return weeks;
}

function formatLastSession(dateStr) {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const dayMs = 1000 * 60 * 60 * 24;
  const diffDays = Math.floor((now.setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / dayMs);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

function accuracyColor(accuracy) {
  if (accuracy > 70) return 'text-primary-600';
  if (accuracy >= 40) return 'text-yellow-600';
  return 'text-red-600';
}

function trendMeta(trend) {
  if (trend === 'up') return { arrow: '↑', color: 'text-primary-600', label: 'Improving' };
  if (trend === 'down') return { arrow: '↓', color: 'text-orange-500', label: 'Declining' };
  return { arrow: '→', color: 'text-gray-400', label: 'Stable' };
}

function linearRegression(points) {
  const n = points.length;
  if (n === 0) return { slope: 0, intercept: 0 };

  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function aggregateDirectionStats(sessions) {
  const totals = {
    LEFT: { attempts: 0, hits: 0 },
    RIGHT: { attempts: 0, hits: 0 },
    UP: { attempts: 0, hits: 0 },
    DOWN: { attempts: 0, hits: 0 },
  };

  sessions.forEach((session) => {
    const stats = session.directionStats;
    if (!stats) return;
    Object.keys(totals).forEach((direction) => {
      const d = stats[direction];
      if (!d) return;
      totals[direction].attempts += d.attempts || 0;
      totals[direction].hits += d.hits || 0;
    });
  });

  return Object.keys(totals).reduce((acc, direction) => {
    const { attempts, hits } = totals[direction];
    acc[direction] = { attempts, hits, accuracy: attempts > 0 ? (hits / attempts) * 100 : 0 };
    return acc;
  }, {});
}

export default function TherapistDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [alerts, setAlerts] = useState([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);

  const [children, setChildren] = useState([]);
  const [loadingChildren, setLoadingChildren] = useState(true);

  const [expandedChildId, setExpandedChildId] = useState(null);
  const [childSessions, setChildSessions] = useState({});
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [openNoteSessionId, setOpenNoteSessionId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageStatus, setMessageStatus] = useState('');
  const [sentMessages, setSentMessages] = useState([]);

  const [goalsByChild, setGoalsByChild] = useState({});
  const [therapyPlanByChild, setTherapyPlanByChild] = useState({});

  useEffect(() => {
    loadAlerts();
    loadChildren();
  }, []);

  async function loadAlerts() {
    setLoadingAlerts(true);
    try {
      const { data } = await api.get('/children/alerts/therapist');
      setAlerts(data);
    } catch {
      setAlerts([]);
    } finally {
      setLoadingAlerts(false);
    }
  }

  async function loadChildren() {
    setLoadingChildren(true);
    try {
      const { data } = await api.get('/children/therapist');
      setChildren(data);
    } catch {
      setChildren([]);
    } finally {
      setLoadingChildren(false);
    }
  }

  async function loadChildDetail(childId) {
    setLoadingDetail(true);
    try {
      const [{ data: sessions }, { data: messages }, { data: goals }, { data: plan }] =
        await Promise.all([
          api.get(`/sessions/child/${childId}`),
          api.get(`/messages/therapist/${childId}`),
          api.get(`/goals/${childId}`),
          api.get(`/children/${childId}/therapy-plan`),
        ]);
      setChildSessions((prev) => ({ ...prev, [childId]: sessions }));
      setSentMessages(messages);
      setGoalsByChild((prev) => ({ ...prev, [childId]: goals }));
      setTherapyPlanByChild((prev) => ({ ...prev, [childId]: plan }));
    } catch {
      setChildSessions((prev) => ({ ...prev, [childId]: [] }));
      setSentMessages([]);
      setGoalsByChild((prev) => ({ ...prev, [childId]: [] }));
      setTherapyPlanByChild((prev) => ({ ...prev, [childId]: {} }));
    } finally {
      setLoadingDetail(false);
    }
  }

  async function addGoal(childId, payload) {
    await api.post('/goals', { childId, ...payload });
    const { data } = await api.get(`/goals/${childId}`);
    setGoalsByChild((prev) => ({ ...prev, [childId]: data }));
  }

  async function saveTherapyPlan(childId, payload) {
    const { data } = await api.post(`/children/${childId}/therapy-plan`, payload);
    setTherapyPlanByChild((prev) => ({ ...prev, [childId]: data }));
    return data;
  }

  function toggleChild(childId) {
    if (expandedChildId === childId) {
      setExpandedChildId(null);
      setOpenNoteSessionId(null);
      setMessageText('');
      setMessageStatus('');
      return;
    }
    setExpandedChildId(childId);
    setOpenNoteSessionId(null);
    setMessageText('');
    setMessageStatus('');
    loadChildDetail(childId);
  }

  function openNoteEditor(session) {
    setOpenNoteSessionId(session._id);
    setNoteDraft(session.therapistNotes || '');
  }

  async function saveNote(childId, sessionId) {
    setSavingNote(true);
    try {
      const { data } = await api.post(`/sessions/${sessionId}/notes`, { note: noteDraft });
      setChildSessions((prev) => ({
        ...prev,
        [childId]: prev[childId].map((s) => (s._id === sessionId ? data : s)),
      }));
      setOpenNoteSessionId(null);
      setNoteDraft('');
    } finally {
      setSavingNote(false);
    }
  }

  async function sendMessage(child) {
    if (!messageText.trim()) return;
    setSendingMessage(true);
    setMessageStatus('');
    try {
      await api.post('/messages', {
        toId: child.parentId,
        childId: child._id,
        message: messageText.trim(),
      });
      setMessageText('');
      setMessageStatus('✅ Message sent to parent');
      const { data } = await api.get(`/messages/therapist/${child._id}`);
      setSentMessages(data);
    } catch {
      setMessageStatus('Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 via-white to-white">
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="text-xl font-bold text-primary-600">🏥 MitraMove — Therapist</div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{user?.name}</span>
          <button className="btn-secondary" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </nav>

      <div className="px-10 py-6 space-y-6">
        <div className="card w-full">
          <p className="font-bold text-gray-800 mb-3">⚠️ Needs Attention</p>

          {loadingAlerts && <p className="text-sm text-gray-400">Loading alerts...</p>}

          {!loadingAlerts && alerts.length === 0 && (
            <p className="text-sm text-primary-600 font-medium">✅ All children on track!</p>
          )}

          {!loadingAlerts && alerts.length > 0 && (
            <div className="space-y-2">
              {alerts.map((alert, idx) => {
                const style = ALERT_STYLES[alert.alertLevel] || ALERT_STYLES.yellow;
                return (
                  <div
                    key={`${alert.child._id}-${alert.alertType}-${idx}`}
                    className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm ${style.bg} ${style.border} ${style.text}`}
                  >
                    <span>{style.emoji}</span>
                    <span className="font-semibold">{alert.child.name}</span>
                    <span>—</span>
                    <span>{alert.message}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card w-full">
          <p className="font-bold text-gray-800 mb-3">My Children</p>

          {loadingChildren && <p className="text-sm text-gray-400">Loading children...</p>}

          {!loadingChildren && children.length === 0 && (
            <div className="text-center py-10">
              <p className="text-gray-500">No children assigned yet.</p>
              <p className="text-gray-500 mt-1">
                Ask parent to link you to their child using your email:{' '}
                <span className="font-semibold text-primary-600">{user?.email}</span>
              </p>
            </div>
          )}

          {!loadingChildren && children.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Age</th>
                    <th className="py-2 pr-4">Last Session</th>
                    <th className="py-2 pr-4">Avg Accuracy</th>
                    <th className="py-2 pr-4">Level</th>
                    <th className="py-2 pr-4">Trend</th>
                    <th className="py-2 pr-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {children.map((child) => {
                    const trend = trendMeta(child.trend);
                    const isOpen = expandedChildId === child._id;
                    const sessions = childSessions[child._id] || [];

                    return (
                      <Fragment key={child._id}>
                        <tr className="border-b border-gray-50">
                          <td className="py-3 pr-4 font-semibold text-gray-800">{child.name}</td>
                          <td className="py-3 pr-4 text-gray-600">{child.age}</td>
                          <td className="py-3 pr-4 text-gray-600">
                            {formatLastSession(child.lastSession)}
                          </td>
                          <td className={`py-3 pr-4 font-semibold ${accuracyColor(child.avgAccuracy)}`}>
                            {child.avgAccuracy.toFixed(1)}%
                          </td>
                          <td className="py-3 pr-4 text-gray-600">Level {child.currentLevel}</td>
                          <td className={`py-3 pr-4 font-semibold ${trend.color}`}>{trend.arrow}</td>
                          <td className="py-3 pr-4">
                            <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => toggleChild(child._id)}>
                              {isOpen ? 'Hide Details' : 'View Details'}
                            </button>
                          </td>
                        </tr>

                        {isOpen && (
                          <tr>
                            <td colSpan={7} className="py-4">
                              <ChildDetailPanel
                                child={child}
                                sessions={sessions}
                                loading={loadingDetail}
                                openNoteSessionId={openNoteSessionId}
                                noteDraft={noteDraft}
                                setNoteDraft={setNoteDraft}
                                onOpenNoteEditor={openNoteEditor}
                                onCancelNote={() => setOpenNoteSessionId(null)}
                                onSaveNote={(sessionId) => saveNote(child._id, sessionId)}
                                savingNote={savingNote}
                                messageText={messageText}
                                setMessageText={setMessageText}
                                sendingMessage={sendingMessage}
                                messageStatus={messageStatus}
                                onSendMessage={() => sendMessage(child)}
                                sentMessages={sentMessages}
                                goals={goalsByChild[child._id] || []}
                                onAddGoal={(payload) => addGoal(child._id, payload)}
                                therapyPlan={therapyPlanByChild[child._id] || {}}
                                onSaveTherapyPlan={(payload) => saveTherapyPlan(child._id, payload)}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChildDetailPanel({
  child,
  sessions,
  loading,
  openNoteSessionId,
  noteDraft,
  setNoteDraft,
  onOpenNoteEditor,
  onCancelNote,
  onSaveNote,
  savingNote,
  messageText,
  setMessageText,
  sendingMessage,
  messageStatus,
  onSendMessage,
  sentMessages,
  goals,
  onAddGoal,
  therapyPlan,
  onSaveTherapyPlan,
}) {
  if (loading) {
    return <p className="text-sm text-gray-400 px-2">Loading details...</p>;
  }

  const chartSessions = [...sessions].reverse();
  const chartData = chartSessions.map((s, idx) => ({
    session: idx + 1,
    accuracy: s.performance?.accuracy || 0,
  }));

  const { slope, intercept } = linearRegression(
    chartData.map((d) => ({ x: d.session, y: d.accuracy }))
  );
  const trendData = chartData.map((d) => ({
    ...d,
    trend: slope * d.session + intercept,
  }));

  let trendLabel = 'Stable →';
  if (slope > 0.5) trendLabel = 'Improving ↑';
  else if (slope < -0.5) trendLabel = 'Declining ↓';

  const directionStats = aggregateDirectionStats(sessions);
  const withAttempts = Object.keys(directionStats).filter((d) => directionStats[d].attempts > 0);
  const strongest = withAttempts.length
    ? withAttempts.reduce((best, d) => (directionStats[d].accuracy > directionStats[best].accuracy ? d : best), withAttempts[0])
    : null;
  const weakest = withAttempts.length
    ? withAttempts.reduce((worst, d) => (directionStats[d].accuracy < directionStats[worst].accuracy ? d : worst), withAttempts[0])
    : null;

  const recentSessions = sessions.slice(0, 5);

  return (
    <div className="bg-gray-50 rounded-2xl p-5 space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Sessions" value={child.sessionCount} />
        <StatCard label="Avg Accuracy" value={`${child.avgAccuracy.toFixed(1)}%`} valueClass={accuracyColor(child.avgAccuracy)} />
        <StatCard label="Best Level" value={child.currentLevel} />
        <StatCard label="Last Played" value={formatLastSession(child.lastSession)} />
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-1">
          <p className="font-semibold text-gray-700">Accuracy Chart</p>
          <span className="text-sm font-semibold text-gray-500">{trendLabel}</span>
        </div>
        <p className="text-xs text-gray-400 mb-3">Last {chartData.length} sessions</p>
        {chartData.length === 0 ? (
          <p className="text-sm text-gray-400">No sessions yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="session" tick={{ fontSize: 12 }} label={{ value: 'Session', position: 'insideBottom', offset: -2, fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => `${value.toFixed(1)}%`} />
              <Line type="monotone" dataKey="accuracy" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="trend" stroke="#f97316" strokeWidth={2} dot={false} strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <p className="font-semibold text-gray-700 mb-4">Direction Strength</p>
        {withAttempts.length === 0 ? (
          <p className="text-sm text-gray-400">No direction data yet.</p>
        ) : (
          <div className="space-y-3">
            {Object.keys(DIRECTION_META).map((direction) => {
              const { attempts, accuracy } = directionStats[direction];
              const { emoji, label } = DIRECTION_META[direction];
              const isStrongest = withAttempts.length > 1 && direction === strongest;
              const isWeakest = withAttempts.length > 1 && direction === weakest;
              const barColor = isStrongest ? '#16a34a' : isWeakest ? '#f97316' : '#60a5fa';

              return (
                <div key={direction} className="flex items-center gap-3">
                  <span className="w-20 text-sm font-medium text-gray-700 flex-shrink-0">
                    {emoji} {label}
                  </span>
                  <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(accuracy, 100)}%`, backgroundColor: barColor }}
                    />
                  </div>
                  <span className="w-12 text-right text-sm font-semibold flex-shrink-0" style={{ color: attempts > 0 ? barColor : '#9ca3af' }}>
                    {attempts > 0 ? `${Math.round(accuracy)}%` : '—'}
                  </span>
                  {isWeakest && <span className="text-xs text-orange-500 font-medium whitespace-nowrap">Needs practice</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <GoalsSection goals={goals} onAddGoal={onAddGoal} />

      <TherapyPlanSection plan={therapyPlan} onSave={onSaveTherapyPlan} />

      <SessionFrequencySection
        sessions={sessions}
        recommendedSessionsPerWeek={therapyPlan?.sessionFrequency ?? child.recommendedSessionsPerWeek ?? 3}
      />

      <div className="card">
        <p className="font-semibold text-gray-700 mb-3">Recent Sessions</p>
        {recentSessions.length === 0 ? (
          <p className="text-sm text-gray-400">No sessions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Game</th>
                  <th className="py-2 pr-4">Duration</th>
                  <th className="py-2 pr-4">Accuracy</th>
                  <th className="py-2 pr-4">Level</th>
                  <th className="py-2 pr-4">Notes</th>
                </tr>
              </thead>
              <tbody>
                {recentSessions.map((session) => (
                  <Fragment key={session._id}>
                    <tr className="border-b border-gray-50">
                      <td className="py-2 pr-4 text-gray-600">
                        {new Date(session.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-4 text-gray-600 capitalize">{session.module}</td>
                      <td className="py-2 pr-4 text-gray-600">
                        {Math.round((session.duration || 0) / 60)}m
                      </td>
                      <td className={`py-2 pr-4 font-semibold ${accuracyColor(session.performance?.accuracy || 0)}`}>
                        {(session.performance?.accuracy || 0).toFixed(1)}%
                      </td>
                      <td className="py-2 pr-4 text-gray-600">
                        {session.performance?.difficultyReached || 1}
                      </td>
                      <td className="py-2 pr-4">
                        {openNoteSessionId === session._id ? (
                          <span className="text-gray-400 text-xs">Editing below...</span>
                        ) : session.therapistNotes ? (
                          <button
                            className="text-gray-500 italic text-xs text-left hover:underline"
                            onClick={() => onOpenNoteEditor(session)}
                          >
                            {session.therapistNotes}
                          </button>
                        ) : (
                          <button
                            className="text-primary-600 text-xs font-medium hover:underline"
                            onClick={() => onOpenNoteEditor(session)}
                          >
                            + Add note
                          </button>
                        )}
                      </td>
                    </tr>
                    {openNoteSessionId === session._id && (
                      <tr>
                        <td colSpan={6} className="pb-3">
                          <div className="flex items-start gap-2">
                            <textarea
                              className="input-field flex-1 text-sm"
                              rows={2}
                              placeholder="Write a note for this session..."
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                            />
                            <div className="flex flex-col gap-1">
                              <button
                                className="btn-primary text-xs px-3 py-1.5"
                                disabled={savingNote}
                                onClick={() => onSaveNote(session._id)}
                              >
                                {savingNote ? 'Saving...' : 'Save Note'}
                              </button>
                              <button className="btn-secondary text-xs px-3 py-1.5" onClick={onCancelNote}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <p className="font-semibold text-gray-700 mb-3">📨 Send Message to Parent</p>
        <textarea
          className="input-field text-sm"
          rows={3}
          placeholder="Type advice or observations for the parent..."
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
        />
        <div className="flex items-center justify-between mt-3">
          <button className="btn-primary" disabled={sendingMessage || !messageText.trim()} onClick={onSendMessage}>
            {sendingMessage ? 'Sending...' : 'Send Message'}
          </button>
          {messageStatus && <span className="text-sm text-gray-600">{messageStatus}</span>}
        </div>

        {sentMessages.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500">Last Messages Sent</p>
            {sentMessages.slice(0, 3).map((msg) => (
              <div key={msg._id} className="flex items-center justify-between text-sm border-b border-gray-100 pb-1">
                <span className="text-gray-400 text-xs">{new Date(msg.createdAt).toLocaleDateString()}</span>
                <span className="text-gray-700 truncate flex-1 px-3">{msg.message}</span>
                <span>{msg.isRead ? '✅' : '📩'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, valueClass = 'text-gray-800' }) {
  return (
    <div className="card text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

function GoalsSection({ goals, onAddGoal }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('accuracy');
  const [targetValue, setTargetValue] = useState('');
  const [deadline, setDeadline] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !targetValue || !deadline) return;

    setSubmitting(true);
    setError('');
    try {
      await onAddGoal({ title: title.trim(), type, targetValue: Number(targetValue), deadline });
      setTitle('');
      setType('accuracy');
      setTargetValue('');
      setDeadline('');
    } catch {
      setError('Failed to add goal');
    } finally {
      setSubmitting(false);
    }
  }

  const activeGoals = goals.filter((g) => g.status === 'active');
  const completedGoals = goals.filter((g) => g.status === 'completed');
  const expiredGoals = goals.filter((g) => g.status === 'expired');

  return (
    <div className="card">
      <p className="font-semibold text-gray-700 mb-3">🎯 Goals</p>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 mb-4">
        <input
          type="text"
          className="input-field text-sm flex-1 min-w-[160px]"
          placeholder="Goal title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select
          className="input-field text-sm w-44"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {Object.entries(GOAL_TYPE_META).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <input
            type="number"
            className="input-field text-sm w-20"
            placeholder="Target"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
          />
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {GOAL_TYPE_META[type].suffix}
          </span>
        </div>
        <input
          type="date"
          className="input-field text-sm w-40"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />
        <button className="btn-primary text-sm" disabled={submitting} type="submit">
          {submitting ? 'Adding...' : 'Add Goal'}
        </button>
      </form>

      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      {goals.length === 0 ? (
        <p className="text-sm text-gray-400">No goals set yet.</p>
      ) : (
        <div className="space-y-2">
          {activeGoals.map((goal) => (
            <GoalCard key={goal._id} goal={goal} />
          ))}
          {completedGoals.map((goal) => (
            <GoalCard key={goal._id} goal={goal} />
          ))}
          {expiredGoals.map((goal) => (
            <GoalCard key={goal._id} goal={goal} />
          ))}
        </div>
      )}
    </div>
  );
}

function GoalCard({ goal }) {
  if (goal.status === 'completed') {
    return (
      <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3">
        <p className="text-sm font-semibold text-primary-700">✅ {goal.title} — Achieved!</p>
      </div>
    );
  }

  if (goal.status === 'expired') {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-100 px-4 py-3">
        <p className="text-sm font-semibold text-gray-500">❌ {goal.title} — Deadline passed</p>
      </div>
    );
  }

  const progress = goal.progress || 0;
  const borderColor =
    progress > 75 ? 'border-primary-300' : progress >= 50 ? 'border-yellow-300' : 'border-red-300';
  const barColor = progress > 75 ? '#16a34a' : progress >= 50 ? '#eab308' : '#dc2626';

  return (
    <div className={`rounded-xl border ${borderColor} px-4 py-3 space-y-2`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">{goal.title}</p>
        <span className="text-sm font-semibold" style={{ color: barColor }}>
          {Math.round(progress)}%
        </span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: barColor }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          Current: {formatGoalValue(goal.currentValue, goal.type)} / Target:{' '}
          {formatGoalValue(goal.targetValue, goal.type)}
        </span>
        <span>
          Deadline:{' '}
          {new Date(goal.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>
    </div>
  );
}

function TherapyPlanSection({ plan, onSave }) {
  const [startDate, setStartDate] = useState('');
  const [reviewDate, setReviewDate] = useState('');
  const [currentFocus, setCurrentFocus] = useState('');
  const [recommendedGames, setRecommendedGames] = useState(['fish', 'flower']);
  const [sessionFrequency, setSessionFrequency] = useState(3);
  const [notes, setNotes] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    setStartDate(plan?.startDate ? plan.startDate.slice(0, 10) : '');
    setReviewDate(plan?.reviewDate ? plan.reviewDate.slice(0, 10) : '');
    setCurrentFocus(plan?.currentFocus || '');
    setRecommendedGames(
      plan?.recommendedGames && plan.recommendedGames.length > 0
        ? plan.recommendedGames
        : ['fish', 'flower']
    );
    setSessionFrequency(plan?.sessionFrequency ?? 3);
    setNotes(plan?.notes || '');
    setLastUpdated(plan?.lastUpdated || null);
    setSaveStatus('');
  }, [plan]);

  function toggleGame(value) {
    setRecommendedGames((prev) =>
      prev.includes(value) ? prev.filter((g) => g !== value) : [...prev, value]
    );
  }

  async function handleSave() {
    setSaving(true);
    setSaveStatus('');
    try {
      const data = await onSave({
        startDate: startDate || undefined,
        reviewDate: reviewDate || undefined,
        currentFocus,
        recommendedGames,
        sessionFrequency: Number(sessionFrequency) || 3,
        notes,
      });
      setLastUpdated(data?.lastUpdated || new Date().toISOString());
      setSaveStatus('✅ Therapy plan saved');
    } catch {
      setSaveStatus('Failed to save plan');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <p className="font-semibold text-gray-700 mb-3">📋 Therapy Plan</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Start Date</label>
          <input
            type="date"
            className="input-field text-sm"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Review Date</label>
          <input
            type="date"
            className="input-field text-sm"
            value={reviewDate}
            onChange={(e) => setReviewDate(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="text-xs text-gray-500 block mb-1">Current Focus</label>
        <textarea
          className="input-field text-sm"
          rows={2}
          placeholder="What motor skills are we focusing on?"
          value={currentFocus}
          onChange={(e) => setCurrentFocus(e.target.value)}
        />
      </div>

      <div className="mt-4">
        <label className="text-xs text-gray-500 block mb-2">Recommended Games</label>
        <div className="flex flex-wrap gap-4">
          {GAME_OPTIONS.map((game) => (
            <label key={game.value} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={recommendedGames.includes(game.value)}
                onChange={() => toggleGame(game.value)}
              />
              {game.label}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-4 w-48">
        <label className="text-xs text-gray-500 block mb-1">Session Frequency (per week)</label>
        <input
          type="number"
          min={1}
          className="input-field text-sm"
          value={sessionFrequency}
          onChange={(e) => setSessionFrequency(e.target.value)}
        />
      </div>

      <div className="mt-4">
        <label className="text-xs text-gray-500 block mb-1">Notes</label>
        <textarea
          className="input-field text-sm"
          rows={2}
          placeholder="Additional therapy notes..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button className="btn-primary" disabled={saving} onClick={handleSave}>
          {saving ? 'Saving...' : 'Save Plan'}
        </button>
        {saveStatus && <span className="text-sm text-gray-600">{saveStatus}</span>}
      </div>

      {lastUpdated && (
        <p className="text-xs text-gray-400 mt-2">
          Last updated: {new Date(lastUpdated).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

function SessionFrequencySection({ sessions, recommendedSessionsPerWeek }) {
  const weeks = groupSessionsByWeek(sessions);
  const counts = weeks.map((w) => w.sessions);

  const bestWeek = counts.length ? Math.max(...counts) : 0;
  const average = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
  const weeksMeetingTarget = counts.filter((c) => c >= recommendedSessionsPerWeek).length;
  const complianceRate = counts.length ? (weeksMeetingTarget / counts.length) * 100 : 0;

  const complianceColor =
    complianceRate >= 80 ? 'text-primary-600' : complianceRate >= 50 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className="card">
      <p className="font-semibold text-gray-700 mb-1">📅 Session Frequency</p>
      <p className="text-xs text-gray-500 mb-3">
        Recommended: {recommendedSessionsPerWeek} sessions/week (from therapy plan)
      </p>

      {weeks.length === 0 ? (
        <p className="text-sm text-gray-400">No sessions yet.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeks}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 7]} allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(_value, _name, props) => [`${props.payload.sessions} sessions`, 'Sessions']} />
              <ReferenceLine
                y={recommendedSessionsPerWeek}
                stroke="#16a34a"
                strokeDasharray="5 5"
                label={{
                  value: `Recommended: ${recommendedSessionsPerWeek}/week`,
                  position: 'insideTopRight',
                  fontSize: 11,
                  fill: '#16a34a',
                }}
              />
              <Bar dataKey="displayValue" radius={[4, 4, 0, 0]}>
                {weeks.map((week, idx) => (
                  <Cell
                    key={idx}
                    fill={
                      week.sessions === 0
                        ? '#dc2626'
                        : week.sessions >= recommendedSessionsPerWeek
                        ? '#16a34a'
                        : '#f97316'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="text-sm text-gray-600">
              Best week: <span className="font-semibold text-gray-800">{bestWeek} sessions</span>
            </div>
            <div className="text-sm text-gray-600">
              Average: <span className="font-semibold text-gray-800">{average.toFixed(1)} sessions/week</span>
            </div>
            <div className="text-sm text-gray-600">
              Compliance rate:{' '}
              <span className={`font-semibold ${complianceColor}`}>{Math.round(complianceRate)}%</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import AddChildModal from './AddChildModal';
import WeeklyCalendar from './WeeklyCalendar';
import AIInsightCard from './AIInsightCard';
import DirectionStrengthCard from './DirectionStrengthCard';
import TherapyMinutesCard from './TherapyMinutesCard';
import FavouriteGameCard from './FavouriteGameCard';
import AchievementBadges from './AchievementBadges';
import ImprovementPlan from './ImprovementPlan';

export default function ParentDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [summary, setSummary] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const [streak, setStreak] = useState(0);
  const [loadingStreak, setLoadingStreak] = useState(false);
  const [weekActiveDates, setWeekActiveDates] = useState([]);
  const [loadingWeek, setLoadingWeek] = useState(false);

  const [allSessions, setAllSessions] = useState([]);
  const [loadingAllSessions, setLoadingAllSessions] = useState(false);

  const [goals, setGoals] = useState([]);
  const [loadingGoals, setLoadingGoals] = useState(false);

  const [therapyPlan, setTherapyPlan] = useState(null);
  const [loadingTherapyPlan, setLoadingTherapyPlan] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [unreadMessages, setUnreadMessages] = useState([]);
  const [showMessageModal, setShowMessageModal] = useState(false);

  const [showLinkInput, setShowLinkInput] = useState(false);
  const [therapistEmailInput, setTherapistEmailInput] = useState('');
  const [linkStatus, setLinkStatus] = useState('');
  const [linkingTherapist, setLinkingTherapist] = useState(false);

  useEffect(() => {
    loadChildren();
    loadMessages();
  }, []);

  async function loadMessages() {
    try {
      const { data } = await api.get('/messages/parent');
      setUnreadMessages(data.filter((m) => !m.isRead));
    } catch {
      setUnreadMessages([]);
    }
  }

  async function markMessageRead(messageId) {
    try {
      await api.patch(`/messages/${messageId}/read`);
      setUnreadMessages((prev) => {
        const next = prev.filter((m) => m._id !== messageId);
        if (next.length === 0) setShowMessageModal(false);
        return next;
      });
    } catch {
      // ignore
    }
  }

  async function handleLinkTherapist(childId) {
    if (!therapistEmailInput.trim()) return;
    setLinkingTherapist(true);
    setLinkStatus('');
    try {
      const { data } = await api.post(`/children/${childId}/link-therapist`, {
        therapistEmail: therapistEmailInput.trim(),
      });
      setLinkStatus('✅ Therapist linked successfully');
      setTherapistEmailInput('');
      setShowLinkInput(false);
      setChildren((prev) => prev.map((c) => (c._id === childId ? data.child : c)));
      setSelectedChild((prev) => (prev && prev._id === childId ? data.child : prev));
    } catch (err) {
      setLinkStatus(err.response?.data?.message || 'No therapist found with that email');
    } finally {
      setLinkingTherapist(false);
    }
  }

  useEffect(() => {
    if (selectedChild) {
      loadSummary(selectedChild._id);
      fetchSessions(selectedChild._id);
      loadStreak(selectedChild._id);
      loadWeek(selectedChild._id);
      loadAllSessions(selectedChild._id);
      loadGoals(selectedChild._id);
      loadTherapyPlan(selectedChild._id);
    } else {
      setSummary(null);
      setSessions([]);
      setStreak(0);
      setWeekActiveDates([]);
      setAllSessions([]);
      setGoals([]);
      setTherapyPlan(null);
    }
  }, [selectedChild]);

  async function loadChildren() {
    setLoadingChildren(true);
    try {
      const { data } = await api.get('/children');
      setChildren(data);
      if (data.length > 0) {
        setSelectedChild(data[0]);
      }
    } finally {
      setLoadingChildren(false);
    }
  }

  async function loadSummary(childId) {
    setLoadingSummary(true);
    try {
      const { data } = await api.get(`/dashboard/summary/${childId}`);
      setSummary(data);
    } finally {
      setLoadingSummary(false);
    }
  }

  async function fetchSessions(childId) {
    try {
      const { data } = await api.get(`/sessions/child/${childId}`);
      setSessions(data.slice(0, 5).reverse());
    } catch {
      setSessions([]);
    }
  }

  async function loadStreak(childId) {
    setLoadingStreak(true);
    try {
      const { data } = await api.get(`/children/${childId}/streak`);
      setStreak(data.currentStreak ?? 0);
    } catch {
      setStreak(0);
    } finally {
      setLoadingStreak(false);
    }
  }

  async function loadWeek(childId) {
    setLoadingWeek(true);
    try {
      const { data } = await api.get(`/sessions/child/${childId}/week`);
      setWeekActiveDates(data.activeDates || []);
    } catch {
      setWeekActiveDates([]);
    } finally {
      setLoadingWeek(false);
    }
  }

  async function loadAllSessions(childId) {
    setLoadingAllSessions(true);
    try {
      const { data } = await api.get('/sessions', { params: { childId } });
      setAllSessions(data);
    } catch {
      setAllSessions([]);
    } finally {
      setLoadingAllSessions(false);
    }
  }

  async function loadGoals(childId) {
    setLoadingGoals(true);
    try {
      const { data } = await api.get(`/goals/${childId}`);
      setGoals(data);
    } catch {
      setGoals([]);
    } finally {
      setLoadingGoals(false);
    }
  }

  async function loadTherapyPlan(childId) {
    setLoadingTherapyPlan(true);
    try {
      const { data } = await api.get(`/children/${childId}/therapy-plan`);
      setTherapyPlan(data);
    } catch {
      setTherapyPlan(null);
    } finally {
      setLoadingTherapyPlan(false);
    }
  }

  function handleChildAdded(child) {
    setChildren((prev) => [child, ...prev]);
    setSelectedChild(child);
  }

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 via-white to-white">
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="text-xl font-bold text-primary-600">MitraMove</div>
        <div className="flex items-center gap-4">
          <Link
            to="/about"
            className="text-sm text-gray-500 hover:text-primary-600 transition"
          >
            ℹ️ About
          </Link>
          <span className="text-sm text-gray-600">{user?.name}</span>
          <button className="btn-secondary" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </nav>

      <div className="px-10 pt-6 space-y-3">
        <h1 className="text-xl font-semibold text-gray-800">
          Welcome back, {user?.name}! 👋
        </h1>

        {unreadMessages.length > 0 && (
          <div className="bg-gradient-to-r from-purple-100 to-blue-100 border border-purple-200 rounded-xl px-5 py-3 flex items-center justify-between">
            <span className="text-sm font-medium text-purple-800">
              💬 New message from your therapist
            </span>
            <button className="btn-secondary text-sm" onClick={() => setShowMessageModal(true)}>
              View
            </button>
          </div>
        )}
      </div>

      <div className="px-10 py-6 flex flex-col md:flex-row gap-6">
        <div className="flex items-start flex-shrink-0">
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-primary-600 hover:border-primary-200 transition flex-shrink-0"
            aria-label={sidebarOpen ? 'Collapse children panel' : 'Expand children panel'}
          >
            {sidebarOpen ? '←' : '→'}
          </button>

          <div
            className="overflow-hidden transition-[width] duration-300 ease-in-out"
            style={{ width: sidebarOpen ? '208px' : '0px' }}
          >
            <div className="w-[208px] space-y-3 pl-3">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold text-gray-700">Children</h2>
                <button
                  className="btn-secondary text-xs px-3 py-1.5"
                  onClick={() => setShowAddModal(true)}
                >
                  + Add
                </button>
              </div>

              {loadingChildren && <p className="text-sm text-gray-400">Loading...</p>}

              {!loadingChildren && children.length === 0 && (
                <p className="text-sm text-gray-400">No children yet. Add one to get started.</p>
              )}

              {children.map((child) => (
                <button
                  key={child._id}
                  onClick={() => {
                    setSelectedChild(child);
                    setShowLinkInput(false);
                    setLinkStatus('');
                    setTherapistEmailInput('');
                  }}
                  className={`card w-full text-left transition hover:shadow-md hover:border-primary-200 ${
                    selectedChild?._id === child._id ? 'ring-2 ring-primary-400' : ''
                  }`}
                >
                  <p className="font-semibold text-gray-800">{child.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Age {child.ageGroup} &middot; {child.preferredInteraction}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {child.instructionStyle} &middot; {child.assistanceLevel}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {!selectedChild && !loadingChildren && (
            <div className="card text-center py-16">
              <p className="text-gray-500">Add a child to see their dashboard here.</p>
            </div>
          )}

          {selectedChild && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-800">{selectedChild.name}</h1>
                  <p className="text-sm text-gray-500">Age {selectedChild.ageGroup}</p>

                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500">
                      Therapist:{' '}
                      {selectedChild.therapistId
                        ? selectedChild.therapistId.name
                        : 'Not linked'}
                    </span>
                    <button
                      className="text-xs font-medium text-primary-600 hover:underline"
                      onClick={() => {
                        setShowLinkInput((prev) => !prev);
                        setLinkStatus('');
                      }}
                    >
                      {selectedChild.therapistId ? 'Change Therapist' : 'Link Therapist'}
                    </button>
                  </div>

                  {showLinkInput && (
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="email"
                        className="input-field text-xs py-1.5 w-56"
                        placeholder="Enter therapist's email address"
                        value={therapistEmailInput}
                        onChange={(e) => setTherapistEmailInput(e.target.value)}
                      />
                      <button
                        className="btn-primary text-xs px-3 py-1.5"
                        disabled={linkingTherapist}
                        onClick={() => handleLinkTherapist(selectedChild._id)}
                      >
                        {linkingTherapist ? 'Linking...' : 'Link'}
                      </button>
                    </div>
                  )}

                  {linkStatus && <p className="text-xs text-gray-600 mt-1">{linkStatus}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="btn-primary"
                    onClick={() => navigate('/play', { state: { child: selectedChild } })}
                  >
                    ▶ Play Now
                  </button>
                  <button
                    className="btn-secondary border-blue-300 text-blue-600 hover:bg-blue-50"
                    onClick={() => navigate('/aac', { state: { child: selectedChild } })}
                  >
                    💬 Communication Board
                  </button>
                  <button
                    className="btn-secondary border-purple-300 text-purple-600 hover:bg-purple-50"
                    onClick={() =>
                      navigate(`/analytics/${selectedChild._id}`, {
                        state: { child: selectedChild },
                      })
                    }
                  >
                    📊 View Analytics
                  </button>
                </div>
              </div>

              {loadingSummary && <p className="text-sm text-gray-400">Loading summary...</p>}

              {summary && (
                <>
                  {loadingWeek ? (
                    <div className="card">
                      <p className="text-sm text-gray-400">Loading this week...</p>
                    </div>
                  ) : (
                    <WeeklyCalendar activeDates={weekActiveDates} />
                  )}

                  <AIInsightCard childId={selectedChild._id} />

                  <ImprovementPlan childId={selectedChild._id} />

                  {goals.length > 0 && <TherapistGoalsCard goals={goals} />}

                  {therapyPlan?.currentFocus?.trim() && (
                    <TherapyPlanCard plan={therapyPlan} />
                  )}

                  {loadingAllSessions ? (
                    <div className="card w-full">
                      <p className="text-sm text-gray-400">Loading game stats...</p>
                    </div>
                  ) : (
                    <>
                      <DirectionStrengthCard sessions={allSessions} />
                      <FavouriteGameCard sessions={allSessions} />
                      <AchievementBadges
                        totalSessions={summary.totalSessions}
                        avgAccuracy={summary.avgAccuracy}
                        streak={streak}
                        sessions={allSessions}
                      />
                    </>
                  )}

                  <TherapyMinutesCard childId={selectedChild._id} />

                  {summary.totalSessions > 0 && (
                    <div className="card w-full">
                      <p className="font-bold text-gray-800 mb-3">Recent Performance</p>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart
                          data={sessions.map((session, idx) => ({
                            name: `Session ${idx + 1}`,
                            accuracy: session.performance?.accuracy || 0,
                          }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                          <Tooltip formatter={(value) => [`${value.toFixed(1)}%`, 'Accuracy']} />
                          <Bar dataKey="accuracy" fill="#16a34a" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  <div className="card flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-700 mb-2">
                        Calibration Status
                      </p>
                      {selectedChild.calibrationProfile?.calibrated ? (
                        <span className="text-sm text-primary-600 font-medium">
                          ✅ Calibrated
                          {selectedChild.calibrationProfile?.calibratedAt && (
                            <span className="text-gray-400 font-normal">
                              {' '}
                              on{' '}
                              {new Date(
                                selectedChild.calibrationProfile.calibratedAt
                              ).toLocaleDateString()}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-sm text-accent-600 font-medium">
                          ⚠️ Not calibrated yet
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="btn-secondary text-sm"
                        onClick={() =>
                          navigate('/play', {
                            state: { child: selectedChild, startCalibration: true },
                          })
                        }
                      >
                        Run Calibration
                      </button>
                      <button
                        className="btn-secondary text-sm"
                        onClick={() =>
                          navigate('/record', { state: { child: selectedChild } })
                        }
                      >
                        Record Gestures
                      </button>
                    </div>
                  </div>

                  {summary.totalSessions === 0 ? (
                    <div className="card text-center py-16">
                      <p className="text-gray-500 mb-4">
                        No sessions yet for {selectedChild.name}.
                      </p>
                      <button
                        className="btn-primary"
                        onClick={() => navigate('/play', { state: { child: selectedChild } })}
                      >
                        Start First Session
                      </button>
                    </div>
                  ) : (
                    <div className="card">
                      <p className="text-sm font-semibold text-gray-700 mb-3">Recent Sessions</p>
                      <div className="space-y-2">
                        {summary.recentSessions.map((session) => (
                          <div
                            key={session._id}
                            className="flex items-center justify-between text-sm border-b border-gray-100 pb-2"
                          >
                            <span className="text-gray-700 capitalize">{session.module}</span>
                            {session.module === 'fish' ? (
                              <span className="text-gray-500">
                                🐠 {session.performance?.attempts || 0} eaten &middot; Level{' '}
                                {session.performance?.difficultyReached || 1}
                              </span>
                            ) : (
                              <span className="text-gray-500">
                                {session.performance?.accuracy?.toFixed(1) || 0}% accuracy
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <AddChildModal onClose={() => setShowAddModal(false)} onChildAdded={handleChildAdded} />
      )}

      {showMessageModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">💬 Messages from your therapist</h2>
              <button
                className="text-gray-400 hover:text-gray-600"
                onClick={() => setShowMessageModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto">
              {unreadMessages.map((msg) => (
                <div key={msg._id} className="border border-gray-100 rounded-xl p-3">
                  <p className="text-sm text-gray-800">{msg.message}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {msg.fromId?.name || 'Therapist'} &middot;{' '}
                    {new Date(msg.createdAt).toLocaleString()}
                  </p>
                  <button
                    className="btn-secondary text-xs px-3 py-1.5 mt-2"
                    onClick={() => markMessageRead(msg._id)}
                  >
                    Mark as Read
                  </button>
                </div>
              ))}

              {unreadMessages.length === 0 && (
                <p className="text-sm text-gray-400">No unread messages.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const PARENT_GAME_META = {
  fish: { emoji: '🐠', label: 'Fish Adventure' },
  flower: { emoji: '🌸', label: 'Flower Garden' },
  aac: { emoji: '💬', label: 'Communication Board' },
};

function TherapyPlanCard({ plan }) {
  const games = plan.recommendedGames || [];

  return (
    <div className="card w-full">
      <p className="font-bold text-gray-800">📋 Therapy Plan</p>
      <p className="text-xs text-gray-500 mb-4">From your therapist</p>

      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1">Current Focus</p>
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
            <p className="text-sm text-gray-700">&ldquo;{plan.currentFocus}&rdquo;</p>
          </div>
        </div>

        {games.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Recommended Games</p>
            <div className="flex flex-wrap gap-2">
              {games
                .filter((g) => PARENT_GAME_META[g])
                .map((g) => (
                  <span
                    key={g}
                    className="inline-flex items-center gap-1 text-xs font-medium bg-primary-50 text-primary-700 border border-primary-200 rounded-full px-3 py-1"
                  >
                    {PARENT_GAME_META[g].emoji} {PARENT_GAME_META[g].label}
                  </span>
                ))}
            </div>
          </div>
        )}

        <p className="text-sm text-gray-600">
          🗓️ Recommended: {plan.sessionFrequency || 3} sessions per week
        </p>

        {plan.reviewDate && (
          <p className="text-sm text-gray-600">
            📅 Next review:{' '}
            {new Date(plan.reviewDate).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        )}

        {plan.notes?.trim() && (
          <p className="text-sm text-gray-500 italic">💬 {plan.notes}</p>
        )}
      </div>
    </div>
  );
}

function formatGoalValue(value, type) {
  const rounded = Math.round(value || 0);
  if (type === 'sessions') return `${rounded} sessions`;
  if (type === 'level') return `${rounded}/5`;
  return `${rounded}%`;
}

function TherapistGoalsCard({ goals }) {
  const active = goals.filter((g) => g.status === 'active');
  const completed = goals.filter((g) => g.status === 'completed');
  const expired = goals.filter((g) => g.status === 'expired');

  return (
    <div className="card w-full">
      <p className="font-bold text-gray-800">🎯 Therapist Goals</p>
      <p className="text-xs text-gray-500 mb-4">Goals set by your therapist</p>
      <div className="space-y-3">
        {active.map((goal) => (
          <ParentGoalCard key={goal._id} goal={goal} />
        ))}
        {completed.map((goal) => (
          <ParentGoalCard key={goal._id} goal={goal} />
        ))}
        {expired.map((goal) => (
          <ParentGoalCard key={goal._id} goal={goal} />
        ))}
      </div>
    </div>
  );
}

function ParentGoalCard({ goal }) {
  if (goal.status === 'completed') {
    return (
      <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3">
        <p className="text-sm font-semibold text-primary-700">✅ {goal.title} — Goal Achieved!</p>
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
  const barColor = progress > 75 ? '#16a34a' : progress >= 50 ? '#eab308' : '#f97316';
  const borderColor =
    progress > 75 ? 'border-primary-200' : progress >= 50 ? 'border-yellow-200' : 'border-orange-200';

  return (
    <div className={`rounded-xl border ${borderColor} px-4 py-3 space-y-2`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">{goal.title}</p>
        <span className="text-sm font-semibold" style={{ color: barColor }}>
          {Math.round(progress)}% complete
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
          {new Date(goal.deadline).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      </div>
    </div>
  );
}

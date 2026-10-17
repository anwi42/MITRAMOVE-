import { useEffect, useState } from 'react';

const AI_SERVICE_URL = 'http://localhost:8000';

export default function ImprovementPlan({ childId }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!childId) {
      setPlan(null);
      return undefined;
    }

    let cancelled = false;

    async function loadPlan() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${AI_SERVICE_URL}/improvement-plan/${childId}`);
        if (!response.ok) {
          throw new Error(`AI service responded with ${response.status}`);
        }
        const data = await response.json();
        if (!cancelled) setPlan(data);
      } catch (err) {
        if (!cancelled) setError('AI improvement plan unavailable');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPlan();

    return () => {
      cancelled = true;
    };
  }, [childId]);

  if (loading) {
    return (
      <div className="card w-full">
        <p className="text-sm text-gray-400">Generating plan...</p>
      </div>
    );
  }

  // If the AI service isn't reachable, hide the card entirely rather
  // than showing a broken/error state on the dashboard.
  if (error || !plan) {
    return null;
  }

  const steps = plan.steps || [];
  const visibleSteps = expanded ? steps : steps.slice(0, 2);
  const remaining = steps.length - 2;

  return (
    <div className="card w-full">
      <p className="font-semibold text-gray-800">🤖 Weekly Improvement Tips</p>
      <p className="text-xs text-gray-400 mt-1">Based on your last sessions &middot; Updated today</p>

      {steps.length === 0 ? (
        <p className="text-sm text-gray-600 mt-3">
          🌟 Great job! No improvements needed this week.
        </p>
      ) : (
        <>
          <div className="mt-3">
            {visibleSteps.map((step, idx) => (
              <div key={step.priority}>
                <div className="flex items-start gap-3 py-3">
                  <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {step.icon} {step.title}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">{step.description}</p>
                  </div>
                </div>
                {idx < visibleSteps.length - 1 && <div className="border-t border-gray-100" />}
              </div>
            ))}
          </div>

          {steps.length > 2 && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="text-sm text-primary-600 font-medium hover:underline mt-2"
            >
              {expanded
                ? 'Show less ↑'
                : `View full plan → (${remaining} more step${remaining === 1 ? '' : 's'})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

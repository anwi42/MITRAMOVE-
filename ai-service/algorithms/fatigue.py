import numpy as np

MAX_SESSION_SECONDS = 1200.0  # 20 minutes
FATIGUE_THRESHOLD = 0.6


class FatigueDetector:
    """Combines reaction-time trend, accuracy drop and session length
    into a single fatigue score between 0 and 1."""

    def __init__(self, threshold=FATIGUE_THRESHOLD, max_session_seconds=MAX_SESSION_SECONDS):
        self.threshold = threshold
        self.max_session_seconds = max_session_seconds

    def _reaction_time_trend_score(self, reaction_times):
        if not reaction_times or len(reaction_times) < 2:
            return 0.0

        y = np.array(reaction_times, dtype=float)
        x = np.arange(len(y))
        slope, _ = np.polyfit(x, y, 1)

        baseline = np.mean(y) if np.mean(y) != 0 else 1.0
        normalized_slope = slope / baseline

        # Squash into 0-1: positive slope (slowing down) -> higher fatigue.
        score = 1.0 / (1.0 + np.exp(-10 * normalized_slope))
        return float(np.clip(score, 0.0, 1.0))

    def _accuracy_drop_score(self, accuracy_history):
        if not accuracy_history or len(accuracy_history) < 2:
            return 0.0

        y = np.array(accuracy_history, dtype=float)
        midpoint = len(y) // 2
        first_half_mean = np.mean(y[:midpoint]) if midpoint > 0 else y[0]
        second_half_mean = np.mean(y[midpoint:])

        drop = first_half_mean - second_half_mean
        # Accuracy may arrive as 0-1 or 0-100; normalize using the scale
        # implied by the first-half mean.
        normalized_drop = drop / 100.0 if first_half_mean > 1.0 else drop

        return float(np.clip(normalized_drop, 0.0, 1.0))

    def _duration_score(self, session_duration_sec):
        if not session_duration_sec or session_duration_sec <= 0:
            return 0.0
        return float(np.clip(session_duration_sec / self.max_session_seconds, 0.0, 1.0))

    def detect(self, reaction_times, accuracy_history, session_duration_sec):
        reaction_score = self._reaction_time_trend_score(reaction_times)
        accuracy_score = self._accuracy_drop_score(accuracy_history)
        duration_score = self._duration_score(session_duration_sec)

        fatigue_score = (0.4 * reaction_score) + (0.4 * accuracy_score) + (0.2 * duration_score)
        fatigue_score = float(np.clip(fatigue_score, 0.0, 1.0))

        is_fatigued = fatigue_score >= self.threshold

        if fatigue_score >= 0.8:
            suggestion = "Strong signs of fatigue detected. End the session and take a break now."
        elif fatigue_score >= self.threshold:
            suggestion = "Signs of fatigue detected. Consider taking a short break."
        elif fatigue_score >= 0.4:
            suggestion = "Mild fatigue signs. Keep an eye on reaction times."
        else:
            suggestion = "No significant fatigue detected. Good to continue."

        return fatigue_score, is_fatigued, suggestion

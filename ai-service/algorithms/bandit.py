import numpy as np

DIFFICULTY_LEVELS = [1, 2, 3, 4, 5]


class ThompsonSamplingBandit:
    """Thompson Sampling bandit over discrete difficulty levels 1-5.

    Each level keeps a Beta(alpha, beta) distribution representing how
    rewarding that level has been for a given child. Weights are plain
    dicts so they can be stored directly in MongoDB.
    """

    def __init__(self, levels=None):
        self.levels = levels or DIFFICULTY_LEVELS

    def default_weights(self):
        return {str(level): {"alpha": 1.0, "beta": 1.0} for level in self.levels}

    def _reward(self, result):
        score = float(result.get("score", 0) or 0)
        duration_sec = float(result.get("duration_sec", 0) or 0)
        completed = bool(result.get("completed", False))

        normalized_score = max(0.0, min(score / 100.0, 1.0))
        completion_bonus = 1.0 if completed else 0.0
        duration_penalty = min(duration_sec / 300.0, 0.3) if duration_sec > 0 else 0.0

        reward = 0.6 * normalized_score + 0.3 * completion_bonus - duration_penalty
        return max(0.0, min(reward, 1.0))

    def update(self, weights, session_results):
        """Update alpha/beta for every level present in session_results."""
        for result in session_results:
            level_key = str(result.get("level"))
            if level_key not in weights:
                weights[level_key] = {"alpha": 1.0, "beta": 1.0}

            reward = self._reward(result)
            weights[level_key]["alpha"] += reward
            weights[level_key]["beta"] += 1.0 - reward

        return weights

    def recommend(self, weights):
        """Sample from each level's Beta distribution and pick the best."""
        samples = {}
        for level in self.levels:
            params = weights.get(str(level), {"alpha": 1.0, "beta": 1.0})
            alpha = max(float(params.get("alpha", 1.0)), 1e-6)
            beta = max(float(params.get("beta", 1.0)), 1e-6)
            samples[level] = np.random.beta(alpha, beta)

        recommended_level = max(samples, key=samples.get)
        total = sum(samples.values())
        confidence = samples[recommended_level] / total if total > 0 else 0.0

        return int(recommended_level), float(confidence)

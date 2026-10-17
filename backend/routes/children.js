const express = require('express');
const Child = require('../models/Child');
const Session = require('../models/Session');
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

router.use(verifyToken);

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function computeTrend(sessionsDesc) {
  if (sessionsDesc.length < 2) return 'stable';

  const avg = (arr) =>
    arr.reduce((sum, s) => sum + (s.performance?.accuracy || 0), 0) / arr.length;

  const last3 = sessionsDesc.slice(0, 3);
  const prev3 = sessionsDesc.slice(3, 6);
  if (prev3.length === 0) return 'stable';

  const diff = avg(last3) - avg(prev3);
  if (diff > 5) return 'up';
  if (diff < -5) return 'down';
  return 'stable';
}

router.post('/', async (req, res) => {
  try {
    const { name, ageGroup, preferredInteraction } = req.body;

    const child = await Child.create({
      parentId: req.user.id,
      name,
      ageGroup,
      preferredInteraction,
    });

    res.status(201).json(child);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create child', error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const children = await Child.find({ parentId: req.user.id })
      .sort({ createdAt: -1 })
      .populate('therapistId', 'name email');
    res.json(children);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch children', error: err.message });
  }
});

router.get('/therapist', async (req, res) => {
  try {
    if (req.user.role !== 'therapist') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const children = await Child.find({ therapistId: req.user.id }).sort({ createdAt: -1 });

    const results = await Promise.all(
      children.map(async (child) => {
        const sessions = await Session.find({ childId: child._id }).sort({ createdAt: -1 });
        const sessionCount = sessions.length;
        const lastSession = sessionCount > 0 ? sessions[0].createdAt : null;
        const avgAccuracy =
          sessionCount > 0
            ? sessions.reduce((sum, s) => sum + (s.performance?.accuracy || 0), 0) / sessionCount
            : 0;
        const currentLevel =
          sessionCount > 0
            ? Math.max(...sessions.map((s) => s.performance?.difficultyReached || 0))
            : 0;

        return {
          _id: child._id,
          parentId: child.parentId,
          name: child.name,
          age: child.ageGroup,
          lastSession,
          avgAccuracy,
          currentLevel,
          sessionCount,
          trend: computeTrend(sessions),
          recommendedSessionsPerWeek: child.recommendedSessionsPerWeek,
        };
      })
    );

    res.json(results);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch therapist children', error: err.message });
  }
});

router.get('/alerts/therapist', async (req, res) => {
  try {
    if (req.user.role !== 'therapist') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const children = await Child.find({ therapistId: req.user.id });
    const alerts = [];

    for (const child of children) {
      const sessions = await Session.find({ childId: child._id }).sort({ createdAt: -1 });
      if (sessions.length === 0) continue;

      const childInfo = { _id: child._id, name: child.name, age: child.ageGroup };

      const daysSinceLastSession = Math.floor(
        (Date.now() - new Date(sessions[0].createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceLastSession >= 5) {
        alerts.push({
          child: childInfo,
          alertType: 'no_session',
          alertLevel: 'red',
          message: `No session in ${daysSinceLastSession} days`,
        });
      }

      if (computeTrend(sessions) === 'down') {
        alerts.push({
          child: childInfo,
          alertType: 'declining',
          alertLevel: 'yellow',
          message: 'Accuracy declining',
        });
      }

      const lastLevel = sessions[0].performance?.difficultyReached || 0;
      const priorSessions = sessions.slice(1);
      const priorMaxLevel =
        priorSessions.length > 0
          ? Math.max(...priorSessions.map((s) => s.performance?.difficultyReached || 0))
          : 0;
      if (lastLevel > priorMaxLevel) {
        alerts.push({
          child: childInfo,
          alertType: 'milestone',
          alertLevel: 'green',
          message: `Reached Level ${lastLevel}!`,
        });
      }
    }

    res.json(alerts);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch alerts', error: err.message });
  }
});

router.post('/:childId/link-therapist', async (req, res) => {
  try {
    const { therapistEmail } = req.body;
    if (!therapistEmail) {
      return res.status(400).json({ message: 'therapistEmail is required' });
    }

    const child = await Child.findById(req.params.childId);
    if (!child) {
      return res.status(404).json({ message: 'Child not found' });
    }
    if (child.parentId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const therapist = await User.findOne({
      email: therapistEmail.toLowerCase(),
      role: 'therapist',
    });
    if (!therapist) {
      return res.status(404).json({ message: 'No therapist found with that email' });
    }

    child.therapistId = therapist._id;
    await child.save();

    const updatedChild = await Child.findById(child._id).populate('therapistId', 'name email');

    res.json({ message: 'Therapist linked successfully', child: updatedChild });
  } catch (err) {
    res.status(500).json({ message: 'Failed to link therapist', error: err.message });
  }
});

router.get('/:childId/therapy-plan', async (req, res) => {
  try {
    const child = await Child.findById(req.params.childId);
    if (!child) {
      return res.status(404).json({ message: 'Child not found' });
    }

    const isParent = child.parentId.toString() === req.user.id;
    const isLinkedTherapist = child.therapistId && child.therapistId.toString() === req.user.id;
    if (!isParent && !isLinkedTherapist) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    res.json(child.therapyPlan || {});
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch therapy plan', error: err.message });
  }
});

router.post('/:childId/therapy-plan', async (req, res) => {
  try {
    const child = await Child.findById(req.params.childId);
    if (!child) {
      return res.status(404).json({ message: 'Child not found' });
    }
    if (!child.therapistId || child.therapistId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { currentFocus, recommendedGames, sessionFrequency, notes, startDate, reviewDate } =
      req.body;

    child.therapyPlan = {
      startDate: startDate ?? child.therapyPlan?.startDate,
      reviewDate: reviewDate ?? child.therapyPlan?.reviewDate,
      currentFocus: currentFocus ?? child.therapyPlan?.currentFocus ?? '',
      recommendedGames: recommendedGames ?? child.therapyPlan?.recommendedGames ?? [],
      sessionFrequency: sessionFrequency ?? child.therapyPlan?.sessionFrequency ?? 3,
      notes: notes ?? child.therapyPlan?.notes ?? '',
      lastUpdated: new Date(),
    };

    if (sessionFrequency !== undefined) {
      child.recommendedSessionsPerWeek = sessionFrequency;
    }

    await child.save();

    res.json(child.therapyPlan);
  } catch (err) {
    res.status(500).json({ message: 'Failed to save therapy plan', error: err.message });
  }
});

router.get('/:childId/streak', async (req, res) => {
  try {
    const child = await Child.findById(req.params.childId);
    if (!child) {
      return res.status(404).json({ message: 'Child not found' });
    }
    if (child.parentId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const sessions = await Session.find({ childId: req.params.childId }).sort({ createdAt: -1 });
    const activeDates = new Set(sessions.map((s) => formatDateKey(new Date(s.createdAt))));

    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    if (!activeDates.has(formatDateKey(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }

    let currentStreak = 0;
    while (activeDates.has(formatDateKey(cursor))) {
      currentStreak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    res.json({ currentStreak });
  } catch (err) {
    res.status(500).json({ message: 'Failed to compute streak', error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const child = await Child.findById(req.params.id);
    if (!child) {
      return res.status(404).json({ message: 'Child not found' });
    }
    if (child.parentId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    res.json(child);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch child', error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const child = await Child.findById(req.params.id);
    if (!child) {
      return res.status(404).json({ message: 'Child not found' });
    }
    if (child.parentId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { calibrationProfile, ...rest } = req.body;

    Object.assign(child, rest);

    if (calibrationProfile) {
      Object.assign(child.calibrationProfile, calibrationProfile);
      if (calibrationProfile.calibrated) {
        child.calibrationProfile.calibratedAt = new Date();
      }
    }

    await child.save();

    res.json(child);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update child', error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const child = await Child.findById(req.params.id);
    if (!child) {
      return res.status(404).json({ message: 'Child not found' });
    }
    if (child.parentId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await child.deleteOne();
    res.json({ message: 'Child deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete child', error: err.message });
  }
});

module.exports = router;

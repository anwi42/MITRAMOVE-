const express = require('express');
const Goal = require('../models/Goal');
const Child = require('../models/Child');
const Session = require('../models/Session');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

router.use(verifyToken);

function overallDirectionAccuracy(sessions) {
  let totalHits = 0;
  let totalAttempts = 0;

  sessions.forEach((session) => {
    const stats = session.directionStats;
    if (!stats) return;
    ['LEFT', 'RIGHT', 'UP', 'DOWN'].forEach((direction) => {
      const d = stats[direction];
      if (!d) return;
      totalHits += d.hits || 0;
      totalAttempts += d.attempts || 0;
    });
  });

  return totalAttempts > 0 ? (totalHits / totalAttempts) * 100 : 0;
}

function computeCurrentValue(type, sessions) {
  switch (type) {
    case 'accuracy':
      return sessions.length > 0
        ? sessions.reduce((sum, s) => sum + (s.performance?.accuracy || 0), 0) / sessions.length
        : 0;
    case 'sessions':
      return sessions.length;
    case 'level':
      return sessions.length > 0
        ? Math.max(...sessions.map((s) => s.performance?.difficultyReached || 0))
        : 0;
    case 'direction':
      return overallDirectionAccuracy(sessions);
    default:
      return 0;
  }
}

router.post('/', async (req, res) => {
  try {
    if (req.user.role !== 'therapist') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { childId, title, type, targetValue, deadline } = req.body;
    if (!childId || !title || !type || targetValue === undefined || !deadline) {
      return res
        .status(400)
        .json({ message: 'childId, title, type, targetValue, and deadline are required' });
    }

    const child = await Child.findById(childId);
    if (!child || !child.therapistId || child.therapistId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const goal = await Goal.create({
      childId,
      therapistId: req.user.id,
      title,
      type,
      targetValue,
      deadline,
    });

    res.status(201).json(goal);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create goal', error: err.message });
  }
});

router.get('/:childId', async (req, res) => {
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

    const goals = await Goal.find({ childId: req.params.childId }).sort({ createdAt: -1 });
    const sessions = await Session.find({ childId: req.params.childId });

    const results = await Promise.all(
      goals.map(async (goal) => {
        const currentValue = computeCurrentValue(goal.type, sessions);
        const progress = Math.min((currentValue / goal.targetValue) * 100, 100);

        let status = goal.status;
        if (status === 'active') {
          if (currentValue >= goal.targetValue) {
            status = 'completed';
          } else if (new Date(goal.deadline) < new Date()) {
            status = 'expired';
          }
        }

        if (status !== goal.status) {
          goal.status = status;
          await goal.save();
        }

        return {
          ...goal.toObject(),
          currentValue,
          progress,
        };
      })
    );

    res.json(results);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch goals', error: err.message });
  }
});

router.patch('/:goalId', async (req, res) => {
  try {
    const { status } = req.body;

    const goal = await Goal.findById(req.params.goalId);
    if (!goal) {
      return res.status(404).json({ message: 'Goal not found' });
    }
    if (goal.therapistId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (status) {
      goal.status = status;
      await goal.save();
    }

    res.json(goal);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update goal', error: err.message });
  }
});

module.exports = router;

const express = require('express');
const Session = require('../models/Session');
const Child = require('../models/Child');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

router.use(verifyToken);

async function fetchRecommendedLevel(childId, session) {
  try {
    const response = await fetch(`${AI_SERVICE_URL}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        child_id: childId.toString(),
        session_results: [
          {
            level: session.performance?.difficultyReached || 1,
            score: session.performance?.accuracy || 0,
            duration_sec: session.duration || 0,
            completed: (session.performance?.successRate || 0) >= 0.5,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`AI service responded with status ${response.status}`);
    }

    const data = await response.json();
    return typeof data.recommended_level === 'number' ? data.recommended_level : null;
  } catch (err) {
    console.error('Failed to fetch recommendation from AI service', err.message);
    return null;
  }
}

router.post('/', async (req, res) => {
  try {
    const { childId } = req.body;

    const child = await Child.findById(childId);
    if (!child) {
      return res.status(404).json({ message: 'Child not found' });
    }
    if (child.parentId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const session = await Session.create(req.body);

    child.sessionCount += 1;
    await child.save();

    const recommendedLevel = await fetchRecommendedLevel(childId, session);
    if (recommendedLevel !== null) {
      session.recommendedLevel = recommendedLevel;
      await session.save();
    }

    res.status(201).json(session);
  } catch (err) {
    res.status(500).json({ message: 'Failed to save session', error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { childId } = req.query;
    if (!childId) {
      return res.status(400).json({ message: 'childId query parameter is required' });
    }

    const child = await Child.findById(childId);
    if (!child) {
      return res.status(404).json({ message: 'Child not found' });
    }
    const isParent = child.parentId.toString() === req.user.id;
    const isTherapist = child.therapistId?.toString() === req.user.id;
    if (!isParent && !isTherapist) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const sessions = await Session.find({ childId }).sort({ createdAt: -1 }).limit(20);
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch sessions', error: err.message });
  }
});

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMondayOfWeek(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay();
  const diff = day === 0 ? 6 : day - 1;
  result.setDate(result.getDate() - diff);
  return result;
}

router.get('/child/:childId/week', async (req, res) => {
  try {
    const child = await Child.findById(req.params.childId);
    if (!child) {
      return res.status(404).json({ message: 'Child not found' });
    }
    const isParent = child.parentId.toString() === req.user.id;
    const isTherapist = child.therapistId?.toString() === req.user.id;
    if (!isParent && !isTherapist) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const monday = getMondayOfWeek(new Date());

    const sessions = await Session.find({
      childId: req.params.childId,
      createdAt: { $gte: monday },
    });

    const activeDates = [...new Set(sessions.map((s) => formatDateKey(new Date(s.createdAt))))].sort();

    res.json({ activeDates });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch week sessions', error: err.message });
  }
});

router.get('/child/:childId/monthly-minutes', async (req, res) => {
  try {
    const child = await Child.findById(req.params.childId);
    if (!child) {
      return res.status(404).json({ message: 'Child not found' });
    }
    const isParent = child.parentId.toString() === req.user.id;
    const isTherapist = child.therapistId?.toString() === req.user.id;
    if (!isParent && !isTherapist) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const sessions = await Session.find({
      childId: req.params.childId,
      createdAt: { $gte: monthStart },
    });

    const totalSeconds = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    const minutesThisMonth = Math.round(totalSeconds / 60);
    const monthlyGoal = 200;
    const percentage = Math.round((minutesThisMonth / monthlyGoal) * 100);

    res.json({
      minutesThisMonth,
      monthlyGoal,
      percentage,
      sessionsThisMonth: sessions.length,
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch monthly minutes', error: err.message });
  }
});

router.get('/child/:childId', async (req, res) => {
  try {
    const child = await Child.findById(req.params.childId);
    if (!child) {
      return res.status(404).json({ message: 'Child not found' });
    }
    const isParent = child.parentId.toString() === req.user.id;
    const isTherapist = child.therapistId?.toString() === req.user.id;
    if (!isParent && !isTherapist) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const sessions = await Session.find({ childId: req.params.childId }).sort({ createdAt: -1 });
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch sessions', error: err.message });
  }
});

router.post('/:sessionId/notes', async (req, res) => {
  try {
    const { note } = req.body;

    const session = await Session.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    const child = await Child.findById(session.childId);
    if (!child || !child.therapistId || child.therapistId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    session.therapistNotes = note;
    await session.save();

    res.json(session);
  } catch (err) {
    res.status(500).json({ message: 'Failed to save note', error: err.message });
  }
});

module.exports = router;

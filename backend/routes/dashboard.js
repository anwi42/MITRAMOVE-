const express = require('express');
const Session = require('../models/Session');
const Child = require('../models/Child');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

router.use(verifyToken);

router.get('/summary/:childId', async (req, res) => {
  try {
    const child = await Child.findById(req.params.childId);
    if (!child) {
      return res.status(404).json({ message: 'Child not found' });
    }
    if (child.parentId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const sessions = await Session.find({ childId: req.params.childId }).sort({ createdAt: -1 });

    const totalSessions = sessions.length;

    const avgAccuracy =
      totalSessions > 0
        ? sessions.reduce((sum, s) => sum + (s.performance?.accuracy || 0), 0) / totalSessions
        : 0;

    const avgParticipationScore =
      totalSessions > 0
        ? sessions.reduce((sum, s) => sum + (s.participationScore?.total || 0), 0) / totalSessions
        : 0;

    const recentSessions = sessions.slice(0, 5);

    res.json({
      child,
      totalSessions,
      avgAccuracy,
      avgParticipationScore,
      recentSessions,
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to build dashboard summary', error: err.message });
  }
});

module.exports = router;

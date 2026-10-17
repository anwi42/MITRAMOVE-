const express = require('express');
const Message = require('../models/Message');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

router.use(verifyToken);

router.post('/', async (req, res) => {
  try {
    const { toId, childId, message } = req.body;
    if (!toId || !message) {
      return res.status(400).json({ message: 'toId and message are required' });
    }

    const newMessage = await Message.create({
      fromId: req.user.id,
      toId,
      childId: childId || null,
      message,
    });

    res.status(201).json(newMessage);
  } catch (err) {
    res.status(500).json({ message: 'Failed to send message', error: err.message });
  }
});

router.get('/parent', async (req, res) => {
  try {
    const messages = await Message.find({ toId: req.user.id })
      .populate('fromId', 'name email role')
      .sort({ createdAt: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch messages', error: err.message });
  }
});

router.get('/therapist/:childId', async (req, res) => {
  try {
    const messages = await Message.find({ fromId: req.user.id, childId: req.params.childId })
      .sort({ createdAt: -1 })
      .limit(3);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch messages', error: err.message });
  }
});

router.patch('/:messageId/read', async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }
    if (message.toId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    message.isRead = true;
    await message.save();

    res.json(message);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update message', error: err.message });
  }
});

module.exports = router;

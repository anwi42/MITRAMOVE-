const mongoose = require('mongoose');

const DirectionStatSchema = new mongoose.Schema(
  {
    attempts: { type: Number, default: 0 },
    hits: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
  },
  { _id: false }
);

const DirectionStatsSchema = new mongoose.Schema(
  {
    LEFT: { type: DirectionStatSchema, default: () => ({}) },
    RIGHT: { type: DirectionStatSchema, default: () => ({}) },
    UP: { type: DirectionStatSchema, default: () => ({}) },
    DOWN: { type: DirectionStatSchema, default: () => ({}) },
  },
  { _id: false }
);

const PerformanceSchema = new mongoose.Schema(
  {
    accuracy: { type: Number, default: 0 },
    responseTime: { type: Number, default: 0 },
    attempts: { type: Number, default: 0 },
    successRate: { type: Number, default: 0 },
    gestureConfidence: { type: Number, default: 0 },
    difficultyReached: { type: Number, default: 0 },
  },
  { _id: false }
);

const ParticipationScoreSchema = new mongoose.Schema(
  {
    initiationRate: { type: Number, default: 0 },
    persistenceRate: { type: Number, default: 0 },
    generalizationScore: { type: Number, default: 0 },
    communicationFreq: { type: Number, default: 0 },
    adaptationVelocity: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false }
);

const SessionSchema = new mongoose.Schema(
  {
    childId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Child',
      required: true,
    },
    module: {
      type: String,
      enum: ['flower', 'aac', 'fish'],
      required: true,
    },
    duration: {
      type: Number,
      default: 0,
    },
    fatigueEvents: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    difficultyLog: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    performance: {
      type: PerformanceSchema,
      default: () => ({}),
    },
    participationScore: {
      type: ParticipationScoreSchema,
      default: () => ({}),
    },
    recommendedLevel: {
      type: Number,
      default: null,
    },
    directionStats: {
      type: DirectionStatsSchema,
      default: () => ({}),
    },
    therapistNotes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Session', SessionSchema);

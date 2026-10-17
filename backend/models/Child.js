const mongoose = require('mongoose');

const CalibrationProfileSchema = new mongoose.Schema(
  {
    rest_x: { type: Number, default: 0 },
    rest_y: { type: Number, default: 0 },
    drift_x: { type: Number, default: 0 },
    drift_y: { type: Number, default: 0 },
    left: { type: Number, default: 0 },
    right: { type: Number, default: 0 },
    up: { type: Number, default: 0 },
    down: { type: Number, default: 0 },
    calibrated: { type: Boolean, default: false },
    calibratedAt: { type: Date, default: null },
  },
  { _id: false }
);

const TherapyPlanSchema = new mongoose.Schema(
  {
    startDate: { type: Date },
    reviewDate: { type: Date },
    currentFocus: { type: String, default: '' },
    recommendedGames: { type: [String], default: [] },
    sessionFrequency: { type: Number, default: 3 },
    notes: { type: String, default: '' },
    lastUpdated: { type: Date },
  },
  { _id: false }
);

const ChildSchema = new mongoose.Schema(
  {
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    therapistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    ageGroup: {
      type: String,
      enum: ['3-5', '6-8', '9-12'],
      required: true,
    },
    preferredInteraction: {
      type: String,
      enum: ['webcam', 'mouse', 'mixed'],
      default: 'mixed',
    },
    instructionStyle: {
      type: String,
      enum: ['text+icons', 'audio+icons', 'icons only'],
      default: 'text+icons',
    },
    assistanceLevel: {
      type: String,
      enum: ['independent', 'with parent', 'with therapist'],
      default: 'independent',
    },
    calibrationProfile: {
      type: CalibrationProfileSchema,
      default: () => ({}),
    },
    banditWeights: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    vocabularyGraph: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    sessionCount: {
      type: Number,
      default: 0,
    },
    therapyPlan: {
      type: TherapyPlanSchema,
      default: () => ({}),
    },
    recommendedSessionsPerWeek: {
      type: Number,
      default: 3,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Child', ChildSchema);

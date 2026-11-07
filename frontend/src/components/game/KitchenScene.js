import Phaser from 'phaser';

const WALL_COLOR = 0xfff8dc;
const COUNTER_COLOR = 0x8d5524;
const COUNTER_TOP_COLOR = 0xa9703e;
const CABINET_COLOR = 0x6b4423;
const WINDOW_COLOR = 0xbae6fd;

const ITEM_TYPES = ['cup', 'bowl', 'bottle'];
const ITEM_COLORS = { cup: 0xf87171, bowl: 0x60a5fa, bottle: 0x34d399 };

const DIFFICULTY_SETTINGS = {
  1: { reachTimeoutMs: 8000, holdDurationMs: 1000, graspTimeoutMs: 7000, carryTimeoutMs: 6000 },
  2: { reachTimeoutMs: 6800, holdDurationMs: 900, graspTimeoutMs: 6200, carryTimeoutMs: 5200 },
  3: { reachTimeoutMs: 5600, holdDurationMs: 800, graspTimeoutMs: 5400, carryTimeoutMs: 4400 },
  4: { reachTimeoutMs: 4400, holdDurationMs: 700, graspTimeoutMs: 4600, carryTimeoutMs: 3600 },
  5: { reachTimeoutMs: 3500, holdDurationMs: 600, graspTimeoutMs: 3800, carryTimeoutMs: 3000 },
};

const REACH_SPAWN_MARGIN = 100;
const CARRY_DISTANCE = 180;
const CARRY_MOVE_DURATION_MS = 350;
const ROUND_SCORE = 10;
const NEXT_ROUND_DELAY_MS = 900;
const PHASE_RESET_DELAY_MS = 700;
const FATIGUE_SLOW_STREAK = 3;
const FATIGUE_COOLDOWN_ROUNDS = 3;
const FATIGUE_MULTIPLIER = 1.5;

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values) {
  if (values.length === 0) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - avg) ** 2)));
}

export default class KitchenScene extends Phaser.Scene {
  constructor() {
    super({ key: 'KitchenScene' });
    this.gameConfig = {};
  }

  init(data) {
    this.gameConfig = data || {};
  }

  create() {
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor(WALL_COLOR);

    this.difficultyLevel = this.gameConfig.difficultyLevel || 1;
    this.gameOver = false;
    this.score = 0;

    this.phaseStats = {
      reach: { attempts: 0, successes: 0 },
      grasp: { attempts: 0, successes: 0 },
      carry: { attempts: 0, successes: 0 },
    };

    this.currentGesture = null;
    this.phaseTimeoutTimer = null;
    this.holdStabilitySamples = [];
    this.roundDurations = [];
    this.fatigueEvents = [];
    this.slowStreak = 0;
    this.roundIndex = 0;
    this.lastFatigueRound = -FATIGUE_COOLDOWN_ROUNDS;

    this.createKitchen(width, height);

    this.progressBarBg = this.add.rectangle(width / 2, height - 110, 200, 16, 0xe5e7eb);
    this.progressBarFill = this.add.rectangle(width / 2 - 100, height - 110, 0, 16, 0x16a34a).setOrigin(0, 0.5);
    this.progressBarBg.setVisible(false);
    this.progressBarFill.setVisible(false);

    this.phaseText = this.add.text(width / 2, height - 30, '', {
      fontSize: '20px',
      fontFamily: 'sans-serif',
      color: '#5b3a1e',
      fontStyle: 'bold',
    });
    this.phaseText.setOrigin(0.5, 0.5);

    this.startRound();
  }

  setGestureData(gesture, hand, landmarks) {
    this.currentGesture = gesture;
    this.lastWrist = landmarks && landmarks[0] ? { x: landmarks[0].x, y: landmarks[0].y } : null;

    if (typeof this.gameConfig.onGestureDetected === 'function') {
      this.gameConfig.onGestureDetected(gesture);
    }
  }

  update(time, delta) {
    if (this.gameOver) return;

    if (this.phase === 'GRASP') {
      this.updateGraspPhase(delta);
    } else if (this.phase === 'CARRY') {
      this.updateCarryPhase();
    } else if (this.phase === 'REACH') {
      this.updateReachPhase();
    }
  }

  // ---- Decoration ----

  createKitchen(width, height) {
    this.add.rectangle(width / 2, height * 0.3, width, height * 0.6, WINDOW_COLOR, 0.4);
    this.add.rectangle(width * 0.2, height * 0.18, 120, 80, CABINET_COLOR);
    this.add.rectangle(width * 0.8, height * 0.18, 120, 80, CABINET_COLOR);

    const counterY = height - 170;
    this.add.rectangle(width / 2, counterY + 40, width, 110, COUNTER_COLOR);
    this.add.rectangle(width / 2, counterY, width, 14, COUNTER_TOP_COLOR);
    this.counterY = counterY - 20;
  }

  // ---- Round / item setup ----

  getDifficultySettings() {
    return DIFFICULTY_SETTINGS[this.difficultyLevel] || DIFFICULTY_SETTINGS[1];
  }

  startRound() {
    if (this.gameOver) return;

    this.itemType = Phaser.Utils.Array.GetRandom(ITEM_TYPES);
    this.reachDirection = Phaser.Utils.Array.GetRandom(['LEFT', 'RIGHT', 'UP', 'DOWN']);
    this.carryDirection = Phaser.Utils.Array.GetRandom(['LEFT', 'RIGHT']);
    this.roundStartTime = this.time.now;
    this.roundIndex += 1;

    this.enterReachPhase();
  }

  checkFatigue(roundDuration) {
    const baselineSamples = this.roundDurations.slice(0, 2);
    const baseline =
      baselineSamples.length > 0
        ? baselineSamples.reduce((a, b) => a + b, 0) / baselineSamples.length
        : roundDuration;

    if (roundDuration > baseline * FATIGUE_MULTIPLIER) {
      this.slowStreak += 1;
    } else {
      this.slowStreak = 0;
    }

    if (
      this.slowStreak >= FATIGUE_SLOW_STREAK &&
      this.roundIndex - this.lastFatigueRound >= FATIGUE_COOLDOWN_ROUNDS
    ) {
      this.lastFatigueRound = this.roundIndex;
      this.slowStreak = 0;

      const event = { atRound: this.roundIndex, timestamp: Date.now(), roundDuration, baseline };
      this.fatigueEvents.push(event);

      if (typeof this.gameConfig.onFatigueDetected === 'function') {
        this.gameConfig.onFatigueDetected(event);
      }
    }
  }

  // ---- Phase: REACH ----

  enterReachPhase() {
    const { width, height } = this.scale;

    this.phase = 'REACH';
    this.phaseStats.reach.attempts += 1;
    this.currentGesture = null;
    this.updatePhaseLabel();

    let x;
    let y;
    if (this.reachDirection === 'LEFT') {
      x = REACH_SPAWN_MARGIN;
      y = this.counterY;
    } else if (this.reachDirection === 'RIGHT') {
      x = width - REACH_SPAWN_MARGIN;
      y = this.counterY;
    } else if (this.reachDirection === 'UP') {
      x = width / 2;
      y = this.counterY - 60;
    } else {
      x = width / 2;
      y = this.counterY + 25;
    }

    this.item = this.buildItem(x, y, this.itemType);
    this.itemHomeX = width / 2;

    this.schedulePhaseTimeout(this.getDifficultySettings().reachTimeoutMs, () => this.handlePhaseTimeout());
  }

  updateReachPhase() {
    if (this.currentGesture && this.currentGesture === this.reachDirection) {
      this.completeReachPhase();
    }
  }

  completeReachPhase() {
    this.clearPhaseTimeout();
    this.phaseStats.reach.successes += 1;

    this.tweens.add({
      targets: this.item,
      x: this.itemHomeX,
      y: this.counterY,
      duration: 350,
      ease: 'Sine.easeOut',
      onComplete: () => this.enterGraspPhase(),
    });
  }

  // ---- Phase: GRASP ----

  enterGraspPhase() {
    this.phase = 'GRASP';
    this.phaseStats.grasp.attempts += 1;
    this.currentGesture = null;
    this.updatePhaseLabel();

    this.holdElapsedMs = 0;
    this.holdWristSamplesX = [];
    this.holdWristSamplesY = [];

    this.progressBarBg.setVisible(true);
    this.progressBarFill.setVisible(true);
    this.progressBarFill.width = 0;

    this.schedulePhaseTimeout(this.getDifficultySettings().graspTimeoutMs, () => this.handlePhaseTimeout());
  }

  updateGraspPhase(delta) {
    const { holdDurationMs } = this.getDifficultySettings();

    if (this.currentGesture === 'HOLD') {
      this.holdElapsedMs += delta;
      if (this.lastWrist) {
        this.holdWristSamplesX.push(this.lastWrist.x);
        this.holdWristSamplesY.push(this.lastWrist.y);
      }
    } else {
      this.holdElapsedMs = 0;
      this.holdWristSamplesX = [];
      this.holdWristSamplesY = [];
    }

    const fraction = Phaser.Math.Clamp(this.holdElapsedMs / holdDurationMs, 0, 1);
    this.progressBarFill.width = 200 * fraction;

    if (this.holdElapsedMs >= holdDurationMs) {
      this.completeGraspPhase();
    }
  }

  completeGraspPhase() {
    this.clearPhaseTimeout();
    this.phaseStats.grasp.successes += 1;
    this.recordHoldStability(this.holdWristSamplesX, this.holdWristSamplesY);

    this.progressBarBg.setVisible(false);
    this.progressBarFill.setVisible(false);

    this.enterCarryPhase();
  }

  // ---- Phase: CARRY ----

  enterCarryPhase() {
    const { width } = this.scale;

    this.phase = 'CARRY';
    this.phaseStats.carry.attempts += 1;
    this.currentGesture = null;
    this.updatePhaseLabel();
    this.carryMoving = false;

    this.carryTargetX =
      this.carryDirection === 'LEFT'
        ? width / 2 + CARRY_DISTANCE
        : width / 2 - CARRY_DISTANCE;

    this.schedulePhaseTimeout(this.getDifficultySettings().carryTimeoutMs, () => this.handlePhaseTimeout());
  }

  updateCarryPhase() {
    if (this.carryMoving) return;
    if (this.currentGesture && this.currentGesture === this.carryDirection) {
      this.completeCarryPhase();
    }
  }

  completeCarryPhase() {
    this.clearPhaseTimeout();
    this.carryMoving = true;

    this.tweens.add({
      targets: this.item,
      x: this.carryTargetX,
      duration: CARRY_MOVE_DURATION_MS,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.carryMoving = false;
        this.phaseStats.carry.successes += 1;

        this.tweens.add({
          targets: this.item,
          scaleX: 1.15,
          scaleY: 1.15,
          duration: 180,
          yoyo: true,
        });

        this.completeRound();
      },
    });
  }

  // ---- Round completion / failure ----

  completeRound() {
    this.score += ROUND_SCORE;
    this.phase = 'COMPLETE';
    this.updatePhaseLabel();

    const roundDuration = this.time.now - this.roundStartTime;
    this.checkFatigue(roundDuration);
    this.roundDurations.push(roundDuration);

    if (typeof this.gameConfig.onScoreUpdate === 'function') {
      this.gameConfig.onScoreUpdate({ score: this.score });
    }

    const item = this.item;
    this.item = null;

    this.time.delayedCall(NEXT_ROUND_DELAY_MS, () => {
      if (item) item.destroy();
      this.startRound();
    });
  }

  handlePhaseTimeout() {
    this.phaseTimeoutTimer = null;

    this.progressBarBg.setVisible(false);
    this.progressBarFill.setVisible(false);

    const item = this.item;
    this.item = null;
    this.phase = 'FAILED';
    this.updatePhaseLabel();

    this.time.delayedCall(PHASE_RESET_DELAY_MS, () => {
      if (item) item.destroy();
      this.startRound();
    });
  }

  schedulePhaseTimeout(delayMs, callback) {
    this.clearPhaseTimeout();
    this.phaseTimeoutTimer = this.time.delayedCall(delayMs, callback);
  }

  clearPhaseTimeout() {
    if (this.phaseTimeoutTimer) {
      this.phaseTimeoutTimer.remove();
      this.phaseTimeoutTimer = null;
    }
  }

  recordHoldStability(samplesX, samplesY) {
    if (samplesX.length < 2) return;

    const driftX = stdDev(samplesX);
    const driftY = stdDev(samplesY);
    const drift = Math.hypot(driftX, driftY);
    const stability = Phaser.Math.Clamp(1 - drift * 20, 0, 1);

    this.holdStabilitySamples.push(stability);
  }

  // ---- Visuals ----

  buildItem(x, y, type) {
    const container = this.add.container(x, y);
    const color = ITEM_COLORS[type];

    if (type === 'cup') {
      const body = this.add.rectangle(0, 0, 36, 40, color);
      const handle = this.add.circle(22, 0, 10, color).setStrokeStyle(4, color);
      container.add([body, handle]);
    } else if (type === 'bowl') {
      const body = this.add.ellipse(0, 6, 56, 30, color);
      const rim = this.add.ellipse(0, -6, 56, 16, color, 0.6);
      container.add([body, rim]);
    } else {
      const body = this.add.rectangle(0, 4, 24, 46, color);
      const neck = this.add.rectangle(0, -26, 10, 16, color);
      container.add([body, neck]);
    }

    return container;
  }

  updatePhaseLabel() {
    const labels = {
      REACH: `1️⃣ Reach toward the ${this.itemType} (${this.reachDirection})`,
      GRASP: '2️⃣ Hold still to grip it',
      CARRY: `3️⃣ Carry it ${this.carryDirection}`,
      COMPLETE: '✅ Placed it!',
      FAILED: '⏱️ Let\'s try again',
    };
    this.phaseText.setText(labels[this.phase] || '');
  }

  // ---- Lifecycle ----

  stopGame() {
    if (this.gameOver) return;
    this.gameOver = true;

    this.clearPhaseTimeout();

    const roundsAttempted = this.phaseStats.reach.attempts;
    const roundsCompleted = this.phaseStats.carry.successes;

    const totalGestureAttempts = Object.values(this.phaseStats).reduce(
      (sum, phase) => sum + phase.attempts,
      0
    );
    const totalGestureSuccesses = Object.values(this.phaseStats).reduce(
      (sum, phase) => sum + phase.successes,
      0
    );
    const accuracy =
      totalGestureAttempts > 0 ? (totalGestureSuccesses / totalGestureAttempts) * 100 : 0;

    const avgHoldStability =
      this.holdStabilitySamples.length > 0
        ? this.holdStabilitySamples.reduce((a, b) => a + b, 0) / this.holdStabilitySamples.length
        : 0;

    const sessionData = {
      performance: {
        accuracy,
        attempts: roundsAttempted,
        hits: roundsCompleted,
        misses: roundsAttempted - roundsCompleted,
        difficultyReached: this.difficultyLevel,
      },
      phaseStats: this.phaseStats,
      movementQuality: {
        avgHoldStability,
      },
      fatigueEvents: this.fatigueEvents,
      score: this.score,
    };

    if (typeof this.gameConfig.onSessionUpdate === 'function') {
      this.gameConfig.onSessionUpdate(sessionData);
    }
  }
}

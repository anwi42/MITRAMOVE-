import Phaser from 'phaser';

const DIFFICULTY_SETTINGS = {
  1: { size: 150, timeLimitMs: 6000 },
  2: { size: 120, timeLimitMs: 5000 },
  3: { size: 100, timeLimitMs: 4000 },
  4: { size: 80, timeLimitMs: 3000 },
  5: { size: 60, timeLimitMs: 2500 },
};

const PETAL_COLORS = [0xec4899, 0xa855f7, 0xec4899, 0xa855f7, 0xec4899, 0xa855f7];
const PETAL_BLOOM_COLORS = [0xf472b6, 0xc084fc, 0xf472b6, 0xc084fc, 0xf472b6, 0xc084fc];
const WILT_GREY = 0x9ca3af;
const STEM_COLOR = 0x2e7d32;
const CENTER_COLOR = 0xfacc15;
const BACKGROUND_COLOR = 0xe8f5e9;
const RING_COLOR = 0xef4444;
const EDGE_MARGIN = 120;
const LEAF_COUNT = 14;
const FLOWERS_PER_DIFFICULTY_CHECK = 10;
const FLOWER_VISUAL_SCALE = 0.6;

export default class FlowerScene extends Phaser.Scene {
  constructor() {
    super({ key: 'FlowerScene' });
    this.gameConfig = {};
  }

  init(data) {
    this.gameConfig = data || {};
  }

  create() {
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);

    this.gameOver = false;
    this.hits = 0;
    this.misses = 0;
    this.totalAttempts = 0;
    this.difficulty = this.gameConfig.difficulty || 1;
    this.difficultyLog = [];
    this.flowersSinceCheck = 0;
    this.hitsSinceCheck = 0;

    this.currentFlower = null;
    this.currentFlowerState = null;
    this.flowerSpawnTime = 0;
    this.currentTimeLimit = 0;

    this.ringGraphics = this.add.graphics();

    this.createLeaves(width, height);

    const gameDurationMs = (this.gameConfig.gameDuration || 60) * 1000;
    this.time.delayedCall(gameDurationMs, () => this.endGame());

    this.spawnFlower();
  }

  createLeaves(width, height) {
    this.leaves = [];
    const colors = [0x66bb6a, 0x81c784, 0xa5d6a7];

    for (let i = 0; i < LEAF_COUNT; i++) {
      const leaf = this.add.circle(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(-height, height),
        Phaser.Math.Between(3, 7),
        colors[Phaser.Math.Between(0, colors.length - 1)],
        Phaser.Math.FloatBetween(0.4, 0.8)
      );
      leaf.speed = Phaser.Math.FloatBetween(10, 30);
      this.leaves.push(leaf);
    }
  }

  update(time, delta) {
    this.updateLeaves(delta);

    if (this.gameOver || !this.currentFlower || this.currentFlowerState !== 'waiting') {
      return;
    }

    const elapsed = time - this.flowerSpawnTime;
    const fraction = Phaser.Math.Clamp(1 - elapsed / this.currentTimeLimit, 0, 1);
    this.drawTimerRing(this.currentFlower.x, this.currentFlower.y, fraction);

    if (elapsed >= this.currentTimeLimit) {
      this.handleMiss();
    }
  }

  updateLeaves(delta) {
    const { width, height } = this.scale;
    this.leaves.forEach((leaf) => {
      leaf.y += leaf.speed * (delta / 1000);
      if (leaf.y > height + 10) {
        leaf.y = -10;
        leaf.x = Phaser.Math.Between(0, width);
      }
    });
  }

  drawTimerRing(x, y, fraction) {
    this.ringGraphics.clear();
    if (fraction <= 0) return;

    const radius = this.currentSize * 0.62;
    this.ringGraphics.lineStyle(5, RING_COLOR, 1);
    this.ringGraphics.beginPath();
    this.ringGraphics.arc(
      x,
      y,
      radius,
      Phaser.Math.DegToRad(-90),
      Phaser.Math.DegToRad(-90 + 360 * fraction),
      false
    );
    this.ringGraphics.strokePath();
  }

  getDifficultySettings() {
    return DIFFICULTY_SETTINGS[this.difficulty] || DIFFICULTY_SETTINGS[1];
  }

  spawnFlower() {
    if (this.gameOver) return;

    const { width, height } = this.scale;
    const { size, timeLimitMs } = this.getDifficultySettings();

    const x = Phaser.Math.Between(EDGE_MARGIN, Math.max(EDGE_MARGIN, width - EDGE_MARGIN));
    const y = Phaser.Math.Between(EDGE_MARGIN, Math.max(EDGE_MARGIN, height - EDGE_MARGIN));

    const container = this.buildFlower(x, y, size);
    container.setScale(FLOWER_VISUAL_SCALE);

    container.setInteractive(
      new Phaser.Geom.Circle(0, 0, size * 1.3),
      Phaser.Geom.Circle.Contains
    );
    container.on('pointerdown', () => this.handleHit());

    this.currentFlower = container;
    this.currentFlowerState = 'waiting';
    this.flowerSpawnTime = this.time.now;
    this.currentTimeLimit = timeLimitMs;
    this.currentSize = size * FLOWER_VISUAL_SCALE;
  }

  buildFlower(x, y, size) {
    const container = this.add.container(x, y);

    const stem = this.add.rectangle(0, size / 2, size * 0.12, size * 0.6, STEM_COLOR);

    const petals = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const px = Math.cos(angle) * size * 0.35;
      const py = Math.sin(angle) * size * 0.35;
      const petal = this.add.circle(px, py, size * 0.28, PETAL_COLORS[i]);
      petals.push(petal);
    }

    const center = this.add.circle(0, 0, size * 0.22, CENTER_COLOR);

    container.add([stem, ...petals, center]);
    container.petals = petals;
    container.stemObj = stem;
    container.centerObj = center;

    return container;
  }

  handleHit() {
    if (!this.currentFlower || this.currentFlowerState !== 'waiting') return;

    const responseTime = this.time.now - this.flowerSpawnTime;
    this.currentFlowerState = 'animating';
    this.ringGraphics.clear();

    this.hits += 1;
    this.totalAttempts += 1;
    this.lastOutcomeHit = true;

    if (typeof this.gameConfig.onHit === 'function') {
      this.gameConfig.onHit(responseTime);
    }

    const flower = this.currentFlower;
    flower.petals.forEach((petal, i) => petal.setFillStyle(PETAL_BLOOM_COLORS[i]));

    this.tweens.add({
      targets: flower,
      scaleX: 1.35,
      scaleY: 1.35,
      duration: 600,
      ease: 'Back.Out',
      yoyo: true,
      onComplete: () => {
        flower.destroy();
        this.finishFlower();
      },
    });
  }

  handleGestureSelect() {
    if (!this.currentFlower || this.currentFlowerState !== 'waiting') return;
    this.handleHit();
  }

  handleMiss() {
    if (!this.currentFlower || this.currentFlowerState !== 'waiting') return;

    this.currentFlowerState = 'animating';
    this.ringGraphics.clear();

    this.misses += 1;
    this.totalAttempts += 1;
    this.lastOutcomeHit = false;

    if (typeof this.gameConfig.onMiss === 'function') {
      this.gameConfig.onMiss();
    }

    const flower = this.currentFlower;
    flower.petals.forEach((petal) => petal.setFillStyle(WILT_GREY));
    flower.centerObj.setFillStyle(WILT_GREY);

    this.tweens.add({
      targets: flower,
      angle: 20,
      y: flower.y + 15,
      alpha: 0.4,
      duration: 300,
      ease: 'Sine.easeIn',
      onComplete: () => {
        flower.destroy();
        this.finishFlower();
      },
    });
  }

  finishFlower() {
    this.currentFlower = null;
    this.currentFlowerState = null;

    this.checkDifficultyAdjustment();

    if (this.gameOver) return;

    this.time.delayedCall(1500, () => this.spawnFlower());
  }

  checkDifficultyAdjustment() {
    this.flowersSinceCheck += 1;

    if (this.lastOutcomeHit) {
      this.hitsSinceCheck += 1;
    }

    if (this.flowersSinceCheck >= FLOWERS_PER_DIFFICULTY_CHECK) {
      const accuracy = this.hitsSinceCheck / this.flowersSinceCheck;
      const previousDifficulty = this.difficulty;

      if (accuracy > 0.8 && this.difficulty < 5) {
        this.difficulty += 1;
      } else if (accuracy < 0.5 && this.difficulty > 1) {
        this.difficulty -= 1;
      }

      if (this.difficulty !== previousDifficulty) {
        this.difficultyLog.push({
          atAttempt: this.totalAttempts,
          from: previousDifficulty,
          to: this.difficulty,
          accuracy,
        });

        if (typeof this.gameConfig.onDifficultyChange === 'function') {
          this.gameConfig.onDifficultyChange(this.difficulty);
        }
      }

      this.flowersSinceCheck = 0;
      this.hitsSinceCheck = 0;
    }
  }

  endGame() {
    if (this.gameOver) return;
    this.gameOver = true;

    this.ringGraphics.clear();

    if (this.currentFlower) {
      this.currentFlower.destroy();
      this.currentFlower = null;
    }

    if (typeof this.gameConfig.onGameEnd === 'function') {
      this.gameConfig.onGameEnd();
    }
  }
}

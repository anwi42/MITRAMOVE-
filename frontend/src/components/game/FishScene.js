import Phaser from 'phaser';

const BACKGROUND_COLOR = 0x1a6ba0;
const FISH_BODY_COLOR = 0xff8c42;
const FISH_ACCENT_COLOR = 0xffa05c;
const FISH_EYE_COLOR = 0xffffff;
const FISH_MARGIN = 50;
const LERP_FACTOR = 0.08;
const DIRECTION_STEP = 500;

const FOOD_COLOR = 0xff9f1c;
const FOOD_RADIUS = 22;
const FOOD_SPAWN_MARGIN = 80;
const FOOD_EAT_DISTANCE = 60;
const FOOD_REAPPEAR_DELAY_MS = 1000;
const FOOD_REMINDER_DELAY_MS = 5000;
const FOOD_TIME_LIMIT_MS = 15000;
const FOOD_TIMEOUT_FADE_COLOR = 0x9ca3af;
const FOOD_TIMEOUT_FADE_DURATION_MS = 500;

const BUBBLE_COUNT = 18;
const SEAWEED_BLADES_PER_CLUSTER = 4;

const JELLYFISH_COLOR = 0xd8b4fe;
const JELLYFISH_SPAWN_INTERVAL_MS = 8000;
const JELLYFISH_SPEED = 40;
const JELLYFISH_COLLISION_DISTANCE = 50;
const JELLYFISH_PENALTY = 5;
const FOOD_SCORE = 10;

export default class FishScene extends Phaser.Scene {
  constructor() {
    super({ key: 'FishScene' });
    this.gameConfig = {};
  }

  init(data) {
    this.gameConfig = data || {};
  }

  create() {
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);

    this.level = this.gameConfig.level || 1;
    this.gameOver = false;
    this.score = 0;
    this.foodEaten = 0;
    this.responseTimes = [];
    this.direction = { x: 0, y: 0 };
    this.facing = 1;
    this.jellyfishList = [];
    this.food = null;
    this.foodSide = null;
    this.foodSpawnTime = 0;
    this.foodReminderTimer = null;
    this.foodTimeoutTimer = null;
    this.jellyfishSpawnEvent = null;

    this.directionStats = {
      LEFT: { attempts: 0, hits: 0 },
      RIGHT: { attempts: 0, hits: 0 },
      UP: { attempts: 0, hits: 0 },
      DOWN: { attempts: 0, hits: 0 },
    };

    this.createSeaweed(width, height);
    this.createBubbles(width, height);

    this.fish = this.buildFish(width / 2, height / 2);

    this.spawnFood();

    if (this.level === 2) {
      this.jellyfishSpawnEvent = this.time.addEvent({
        delay: JELLYFISH_SPAWN_INTERVAL_MS,
        loop: true,
        callback: () => this.spawnJellyfish(),
      });
    }
  }

  setDirection(x, y) {
    this.direction = { x, y };
  }

  update(time, delta) {
    this.updateBubbles(delta);

    if (this.gameOver) return;

    this.updateFishPosition();
    this.checkFoodProximity();

    if (this.level === 2) {
      this.updateJellyfish(delta);
      this.checkJellyfishCollision();
    }
  }

  // ---- Fish ----

  buildFish(x, y) {
    const container = this.add.container(x, y);

    const tail = this.add.triangle(-40, 0, 0, -16, 0, 16, -20, 0, FISH_ACCENT_COLOR);
    const body = this.add.ellipse(0, 0, 80, 40, FISH_BODY_COLOR);
    const eyeTop = this.add.circle(26, -8, 5, FISH_EYE_COLOR);
    const eyeBottom = this.add.circle(26, 8, 5, FISH_EYE_COLOR);

    container.add([tail, body, eyeTop, eyeBottom]);

    return container;
  }

  updateFishPosition() {
    const { width, height } = this.scale;
    const minX = FISH_MARGIN;
    const maxX = width - FISH_MARGIN;
    const minY = FISH_MARGIN;
    const maxY = height - FISH_MARGIN;

    const targetX = Phaser.Math.Clamp(this.fish.x + this.direction.x * DIRECTION_STEP, minX, maxX);
    const targetY = Phaser.Math.Clamp(this.fish.y + this.direction.y * DIRECTION_STEP, minY, maxY);

    this.fish.x = Phaser.Math.Clamp(
      this.fish.x + (targetX - this.fish.x) * LERP_FACTOR,
      minX,
      maxX
    );
    this.fish.y = Phaser.Math.Clamp(
      this.fish.y + (targetY - this.fish.y) * LERP_FACTOR,
      minY,
      maxY
    );

    if (this.direction.x < 0) this.facing = -1;
    else if (this.direction.x > 0) this.facing = 1;
    this.fish.scaleX = this.facing;
  }

  // ---- Decoration ----

  createBubbles(width, height) {
    this.bubbles = [];
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      const bubble = this.add.circle(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        Phaser.Math.Between(3, 8),
        0xffffff,
        Phaser.Math.FloatBetween(0.25, 0.6)
      );
      bubble.speed = Phaser.Math.FloatBetween(15, 35);
      this.bubbles.push(bubble);
    }
  }

  updateBubbles(delta) {
    const { width, height } = this.scale;
    this.bubbles.forEach((bubble) => {
      bubble.y -= bubble.speed * (delta / 1000);
      if (bubble.y < -10) {
        bubble.y = height + 10;
        bubble.x = Phaser.Math.Between(0, width);
      }
    });
  }

  createSeaweed(width, height) {
    this.createSeaweedCluster(36, height);
    this.createSeaweedCluster(width - 36, height);
  }

  createSeaweedCluster(x, baseY) {
    for (let i = 0; i < SEAWEED_BLADES_PER_CLUSTER; i++) {
      const offsetX = (i - SEAWEED_BLADES_PER_CLUSTER / 2) * 10;
      const bladeHeight = Phaser.Math.Between(50, 100);
      const blade = this.add.rectangle(
        x + offsetX,
        baseY - bladeHeight / 2,
        8,
        bladeHeight,
        0x2f855a,
        0.85
      );
      blade.setAngle(Phaser.Math.Between(-8, 8));
    }
  }

  // ---- Food ----

  spawnFood() {
    if (this.gameOver) return;

    const { width, height } = this.scale;
    const side = Phaser.Utils.Array.GetRandom(['LEFT', 'RIGHT', 'UP', 'DOWN']);

    let x;
    let y;
    if (side === 'LEFT') {
      x = FOOD_SPAWN_MARGIN;
      y = Phaser.Math.Between(FOOD_SPAWN_MARGIN, height - FOOD_SPAWN_MARGIN);
    } else if (side === 'RIGHT') {
      x = width - FOOD_SPAWN_MARGIN;
      y = Phaser.Math.Between(FOOD_SPAWN_MARGIN, height - FOOD_SPAWN_MARGIN);
    } else if (side === 'UP') {
      x = Phaser.Math.Between(FOOD_SPAWN_MARGIN, width - FOOD_SPAWN_MARGIN);
      y = FOOD_SPAWN_MARGIN;
    } else {
      x = Phaser.Math.Between(FOOD_SPAWN_MARGIN, width - FOOD_SPAWN_MARGIN);
      y = height - FOOD_SPAWN_MARGIN;
    }

    this.food = this.buildFood(x, y);
    this.foodSide = side;
    this.foodSpawnTime = this.time.now;

    if (typeof this.gameConfig.onFoodSpawn === 'function') {
      this.gameConfig.onFoodSpawn(side);
    }

    this.foodReminderTimer = this.time.delayedCall(FOOD_REMINDER_DELAY_MS, () => {
      if (this.food && typeof this.gameConfig.onFoodReminder === 'function') {
        this.gameConfig.onFoodReminder(side);
      }
    });

    this.foodTimeoutTimer = this.time.delayedCall(FOOD_TIME_LIMIT_MS, () => {
      this.handleFoodTimeout(side);
    });
  }

  buildFood(x, y) {
    const container = this.add.container(x, y);

    const glow = this.add.circle(0, 0, FOOD_RADIUS * 1.6, FOOD_COLOR, 0.25);
    const core = this.add.circle(0, 0, FOOD_RADIUS, FOOD_COLOR);
    const sparkle = this.add.circle(
      -FOOD_RADIUS * 0.3,
      -FOOD_RADIUS * 0.3,
      FOOD_RADIUS * 0.25,
      0xffffff,
      0.9
    );

    container.add([glow, core, sparkle]);

    this.tweens.add({
      targets: glow,
      scaleX: 1.3,
      scaleY: 1.3,
      alpha: 0.1,
      duration: 800,
      yoyo: true,
      repeat: -1,
    });

    return container;
  }

  checkFoodProximity() {
    if (!this.food) return;

    const distance = Phaser.Math.Distance.Between(this.fish.x, this.fish.y, this.food.x, this.food.y);
    if (distance <= FOOD_EAT_DISTANCE) {
      this.eatFood();
    }
  }

  eatFood() {
    const responseTime = this.time.now - this.foodSpawnTime;
    this.responseTimes.push(responseTime);
    this.foodEaten += 1;
    this.score += FOOD_SCORE;

    if (this.foodSide) {
      this.directionStats[this.foodSide].attempts += 1;
      this.directionStats[this.foodSide].hits += 1;
    }

    if (this.foodReminderTimer) {
      this.foodReminderTimer.remove();
      this.foodReminderTimer = null;
    }
    if (this.foodTimeoutTimer) {
      this.foodTimeoutTimer.remove();
      this.foodTimeoutTimer = null;
    }

    this.spawnBubblePop(this.food.x, this.food.y);
    this.food.destroy();
    this.food = null;
    this.foodSide = null;

    if (typeof this.gameConfig.onFoodEaten === 'function') {
      this.gameConfig.onFoodEaten(this.foodEaten);
    }

    this.time.delayedCall(FOOD_REAPPEAR_DELAY_MS, () => this.spawnFood());
  }

  handleFoodTimeout() {
    if (!this.food || this.gameOver) return;

    if (this.foodSide) {
      this.directionStats[this.foodSide].attempts += 1;
    }

    if (this.foodReminderTimer) {
      this.foodReminderTimer.remove();
      this.foodReminderTimer = null;
    }
    this.foodTimeoutTimer = null;

    const expiredFood = this.food;
    this.food = null;
    this.foodSide = null;

    this.fadeOutFood(expiredFood);
  }

  fadeOutFood(foodContainer) {
    foodContainer.list.forEach((child) => {
      if (typeof child.setFillStyle === 'function') {
        child.setFillStyle(FOOD_TIMEOUT_FADE_COLOR);
      }
    });

    this.tweens.add({
      targets: foodContainer,
      scaleX: 1.3,
      scaleY: 1.3,
      alpha: 0,
      duration: FOOD_TIMEOUT_FADE_DURATION_MS,
      onComplete: () => {
        foodContainer.destroy();
        this.spawnFood();
      },
    });
  }

  spawnBubblePop(x, y) {
    for (let i = 0; i < 6; i++) {
      const particle = this.add.circle(x, y, Phaser.Math.Between(3, 7), 0xffffff, 0.8);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist = Phaser.Math.Between(20, 50);

      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        duration: 500,
        onComplete: () => particle.destroy(),
      });
    }
  }

  // ---- Jellyfish (Level 2 only) ----

  spawnJellyfish() {
    if (this.gameOver || this.level !== 2) return;

    const { width, height } = this.scale;
    const edge = Phaser.Utils.Array.GetRandom(['left', 'right', 'top', 'bottom']);

    let x;
    let y;
    let vx = 0;
    let vy = 0;

    if (edge === 'left') {
      x = -30;
      y = Phaser.Math.Between(60, height - 60);
      vx = JELLYFISH_SPEED;
    } else if (edge === 'right') {
      x = width + 30;
      y = Phaser.Math.Between(60, height - 60);
      vx = -JELLYFISH_SPEED;
    } else if (edge === 'top') {
      x = Phaser.Math.Between(60, width - 60);
      y = -30;
      vy = JELLYFISH_SPEED;
    } else {
      x = Phaser.Math.Between(60, width - 60);
      y = height + 30;
      vy = -JELLYFISH_SPEED;
    }

    const jelly = this.buildJellyfish(x, y);
    jelly.vx = vx;
    jelly.vy = vy;
    this.jellyfishList.push(jelly);
  }

  buildJellyfish(x, y) {
    const container = this.add.container(x, y);
    const bell = this.add.ellipse(0, 0, 50, 36, JELLYFISH_COLOR, 0.85);

    const tentacles = [];
    for (let i = 0; i < 4; i++) {
      const offsetX = (i - 1.5) * 12;
      const tentacle = this.add.rectangle(offsetX, 24, 4, 26, JELLYFISH_COLOR, 0.7);
      tentacles.push(tentacle);
    }

    container.add([bell, ...tentacles]);

    this.tweens.add({
      targets: tentacles,
      scaleY: 1.3,
      duration: 500,
      yoyo: true,
      repeat: -1,
    });

    return container;
  }

  updateJellyfish(delta) {
    const { width, height } = this.scale;
    const dt = delta / 1000;

    this.jellyfishList = this.jellyfishList.filter((jelly) => {
      jelly.x += jelly.vx * dt;
      jelly.y += jelly.vy * dt;

      const outOfBounds =
        jelly.x < -60 || jelly.x > width + 60 || jelly.y < -60 || jelly.y > height + 60;

      if (outOfBounds) {
        jelly.destroy();
        return false;
      }
      return true;
    });
  }

  checkJellyfishCollision() {
    for (const jelly of this.jellyfishList) {
      const distance = Phaser.Math.Distance.Between(this.fish.x, this.fish.y, jelly.x, jelly.y);
      if (distance <= JELLYFISH_COLLISION_DISTANCE) {
        this.handleJellyfishHit(jelly);
        break;
      }
    }
  }

  handleJellyfishHit(jelly) {
    this.score = Math.max(0, this.score - JELLYFISH_PENALTY);
    this.jellyfishList = this.jellyfishList.filter((j) => j !== jelly);
    jelly.destroy();
    this.wobbleFish();
  }

  wobbleFish() {
    this.tweens.add({
      targets: this.fish,
      angle: { from: -15, to: 15 },
      duration: 80,
      yoyo: true,
      repeat: 5,
      onComplete: () => {
        this.fish.angle = 0;
      },
    });
  }

  // ---- Lifecycle ----

  stopGame() {
    if (this.gameOver) return;
    this.gameOver = true;

    if (this.jellyfishSpawnEvent) {
      this.jellyfishSpawnEvent.remove();
      this.jellyfishSpawnEvent = null;
    }
    if (this.foodReminderTimer) {
      this.foodReminderTimer.remove();
      this.foodReminderTimer = null;
    }
    if (this.foodTimeoutTimer) {
      this.foodTimeoutTimer.remove();
      this.foodTimeoutTimer = null;
    }

    const avgResponseTime =
      this.responseTimes.length > 0
        ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
        : 0;

    Object.keys(this.directionStats).forEach((direction) => {
      const stats = this.directionStats[direction];
      stats.accuracy = stats.attempts > 0 ? (stats.hits / stats.attempts) * 100 : 0;
    });

    if (typeof this.gameConfig.onGameEnd === 'function') {
      this.gameConfig.onGameEnd({
        foodEaten: this.foodEaten,
        avgResponseTime,
        score: this.score,
        directionStats: this.directionStats,
      });
    }
  }
}

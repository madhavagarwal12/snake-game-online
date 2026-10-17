import { ARENA_CONFIG, SKINS } from "./config";
import { FoodPellet, LeaderboardEntry, Snake, SnakeSegment } from "./types";

const BOT_NAMES = [
  "ViperKing", "ShadowFang", "NeonStrike", "CobraKai", "Glither",
  "SnekLord", "Python3", "Venom", "ApexPredator", "Constrictor",
  "Noodle", "DangerRope", "Spaghetti", "Hydra", "BlackMamba",
  "Titanoboa", "Rattler", "Basilisk", "Ouroboros", "Anaconda",
  "SpeedySnek", "GhostSnake", "Solaris", "Draco", "Echo"
];

const PELLET_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"];

export class GameEngine {
  public snakes: Map<number, Snake> = new Map();
  public foods: Map<number, FoodPellet> = new Map();
  public playerSnakeId: number = 1;
  public nextId: number = 2;
  public nextFoodId: number = 1;
  public isRunning: boolean = false;
  
  // Spatial Grid
  private foodGrid: Map<string, number[]> = new Map();
  private cellSize: number = ARENA_CONFIG.GRID_CELL_SIZE;
  
  // Callbacks
  public onPlayerDeath?: (stats: { length: number; kills: number; coins: number; survivedTime: number; rank: number }) => void;
  public onLeaderboardUpdate?: (leaderboard: LeaderboardEntry[], playerRank: number) => void;
  
  private lastLeaderboardTime: number = 0;
  
  constructor() {
    this.reset();
  }

  public reset(playerName: string = "Player", playerSkin: string = "classic_green") {
    this.snakes.clear();
    this.foods.clear();
    this.foodGrid.clear();
    this.nextId = 2;
    this.nextFoodId = 1;

    // 1. Spawn Food
    for (let i = 0; i < ARENA_CONFIG.FOOD_COUNT; i++) {
      this.spawnRandomFood();
    }

    // 2. Spawn Player
    this.playerSnakeId = 1;
    this.spawnSnake(this.playerSnakeId, playerName, false, playerSkin);

    // 3. Spawn Bots
    for (let i = 0; i < ARENA_CONFIG.BOT_COUNT; i++) {
      const name = BOT_NAMES[i % BOT_NAMES.length];
      const skinKeys = Object.keys(SKINS);
      const skin = skinKeys[Math.floor(Math.random() * skinKeys.length)];
      this.spawnSnake(this.nextId++, name, true, skin);
    }

    this.isRunning = true;
  }

  public spawnSnake(id: number, name: string, isBot: boolean, skinId: string): Snake {
    // Spawn away from walls
    const margin = 200;
    const x = margin + Math.random() * (ARENA_CONFIG.MAP_SIZE - margin * 2);
    const y = margin + Math.random() * (ARENA_CONFIG.MAP_SIZE - margin * 2);
    const angle = Math.random() * Math.PI * 2;

    const segments: SnakeSegment[] = [];
    for (let i = 0; i < ARENA_CONFIG.INITIAL_LENGTH; i++) {
      segments.push({
        x: x - Math.cos(angle) * (i * ARENA_CONFIG.SEGMENT_SPACING),
        y: y - Math.sin(angle) * (i * ARENA_CONFIG.SEGMENT_SPACING),
      });
    }

    const snake: Snake = {
      id,
      name,
      isBot,
      skinId,
      head: { x, y },
      angle,
      targetAngle: angle,
      speed: ARENA_CONFIG.BASE_SPEED,
      isBoosting: false,
      segments,
      length: ARENA_CONFIG.INITIAL_LENGTH,
      isAlive: true,
      invulnerableUntil: Date.now() + ARENA_CONFIG.SPAWN_INVULNERABILITY_SEC * 1000,
      kills: 0,
      coinsEarned: 0,
      survivedTime: 0,
      boostTimer: 0,
      aiTimer: 0,
      aiState: {
        wanderAngle: angle,
      },
    };

    this.snakes.set(id, snake);
    return snake;
  }

  public setPlayerInput(targetAngle: number, boost: boolean) {
    const player = this.snakes.get(this.playerSnakeId);
    if (!player || !player.isAlive) return;

    player.targetAngle = targetAngle;
    player.isBoosting = boost && player.length > ARENA_CONFIG.MIN_BOOST_LENGTH;
    if (player.isBoosting) {
      player.invulnerableUntil = 0; // PRD: Boost immediately ends invulnerability
    }
  }

  public update(dt: number) {
    if (!this.isRunning) return;

    const now = Date.now();

    // 1. Update Snakes
    for (const snake of this.snakes.values()) {
      if (!snake.isAlive) continue;

      snake.survivedTime += dt;

      // Update AI for bots
      if (snake.isBot) {
        this.updateBotAI(snake, dt, now);
      }

      // Turn clamping (PRD §6.1: ~4.5 rad/s)
      let diff = snake.targetAngle - snake.angle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      const maxTurn = ARENA_CONFIG.MAX_TURN_RATE * dt;
      const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
      snake.angle += turn;

      // Boost calculation
      if (snake.isBoosting && snake.length > ARENA_CONFIG.MIN_BOOST_LENGTH) {
        snake.speed = ARENA_CONFIG.BOOST_SPEED;
        snake.length -= ARENA_CONFIG.BOOST_COST_PER_SEC * dt;
        snake.boostTimer += dt;

        // Drop pellet on boost
        if (snake.boostTimer >= ARENA_CONFIG.BOOST_PELLET_INTERVAL) {
          snake.boostTimer = 0;
          const tail = snake.segments[snake.segments.length - 1];
          if (tail) {
            this.spawnPelletAt(tail.x, tail.y, 1, "#f59e0b", false);
          }
        }
      } else {
        snake.speed = ARENA_CONFIG.BASE_SPEED;
        snake.isBoosting = false;
      }

      // Move Head
      snake.head.x += Math.cos(snake.angle) * snake.speed * dt;
      snake.head.y += Math.sin(snake.angle) * snake.speed * dt;

      // Check Wall Collision (PRD §6.6: Wall = death, no wraparound)
      if (
        snake.head.x < 0 ||
        snake.head.x > ARENA_CONFIG.MAP_SIZE ||
        snake.head.y < 0 ||
        snake.head.y > ARENA_CONFIG.MAP_SIZE
      ) {
        this.killSnake(snake, null);
        continue;
      }

      // Update Body Segments
      this.updateSnakeBody(snake);

      // Check Food Collection
      this.checkFoodEaten(snake);
    }

    // 2. Snake vs Snake Collisions (PRD §6.6)
    this.checkSnakeCollisions(now);

    // 3. Maintain Bot Population
    let liveBots = 0;
    for (const s of this.snakes.values()) {
      if (s.isBot && s.isAlive) liveBots++;
    }
    if (liveBots < ARENA_CONFIG.BOT_COUNT) {
      const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
      const skinKeys = Object.keys(SKINS);
      const skin = skinKeys[Math.floor(Math.random() * skinKeys.length)];
      this.spawnSnake(this.nextId++, name, true, skin);
    }

    // 4. Replenish Food
    while (this.foods.size < ARENA_CONFIG.FOOD_COUNT) {
      this.spawnRandomFood();
    }

    // 5. Update Leaderboard (2 Hz / twice per second)
    if (now - this.lastLeaderboardTime > 500) {
      this.lastLeaderboardTime = now;
      this.computeLeaderboard();
    }
  }

  private updateSnakeBody(snake: Snake) {
    const spacing = ARENA_CONFIG.SEGMENT_SPACING;
    const requiredSegments = Math.max(ARENA_CONFIG.INITIAL_LENGTH, Math.floor(snake.length));

    // Head is segment 0
    let prev = snake.head;
    const newSegments: SnakeSegment[] = [{ x: prev.x, y: prev.y }];

    for (let i = 1; i < snake.segments.length; i++) {
      const current = snake.segments[i];
      const dx = current.x - prev.x;
      const dy = current.y - prev.y;
      const dist = Math.hypot(dx, dy);

      if (dist > spacing) {
        const factor = spacing / dist;
        current.x = prev.x + dx * factor;
        current.y = prev.y + dy * factor;
      }
      newSegments.push({ x: current.x, y: current.y });
      prev = current;
    }

    // Add segments if snake grew
    while (newSegments.length < requiredSegments) {
      const last = newSegments[newSegments.length - 1];
      newSegments.push({ x: last.x, y: last.y });
    }

    // Truncate segments if snake shrank
    if (newSegments.length > requiredSegments) {
      newSegments.length = requiredSegments;
    }

    snake.segments = newSegments;
  }

  private checkFoodEaten(snake: Snake) {
    const head = snake.head;
    const eatRadius = ARENA_CONFIG.HEAD_RADIUS + 12;

    const cellX = Math.floor(head.x / this.cellSize);
    const cellY = Math.floor(head.y / this.cellSize);

    for (let cx = cellX - 1; cx <= cellX + 1; cx++) {
      for (let cy = cellY - 1; cy <= cellY + 1; cy++) {
        const key = `${cx},${cy}`;
        const foodIds = this.foodGrid.get(key);
        if (!foodIds) continue;

        for (let i = foodIds.length - 1; i >= 0; i--) {
          const fid = foodIds[i];
          const food = this.foods.get(fid);
          if (!food) continue;

          const distSq = (food.x - head.x) ** 2 + (food.y - head.y) ** 2;
          if (distSq < eatRadius * eatRadius) {
            // Eat food
            snake.length += food.value * 0.35;
            if (food.isLoot) {
              snake.coinsEarned += Math.max(1, Math.floor(food.value * 0.2));
            }
            this.removeFood(fid, key);
          }
        }
      }
    }
  }

  private checkSnakeCollisions(now: number) {
    const liveSnakes = Array.from(this.snakes.values()).filter((s) => s.isAlive);

    for (let i = 0; i < liveSnakes.length; i++) {
      const a = liveSnakes[i];
      if (!a.isAlive) continue;

      const aInvulnerable = now < a.invulnerableUntil;

      // 1. Head-to-Head with other snakes (PRD §6.6: longer snake survives, equal both die)
      for (let j = i + 1; j < liveSnakes.length; j++) {
        const b = liveSnakes[j];
        if (!b.isAlive) continue;

        const bInvulnerable = now < b.invulnerableUntil;
        if (aInvulnerable || bInvulnerable) continue;

        const headDistSq = (a.head.x - b.head.x) ** 2 + (a.head.y - b.head.y) ** 2;
        const minDist = ARENA_CONFIG.HEAD_RADIUS * 2;

        if (headDistSq < minDist * minDist) {
          if (a.length > b.length) {
            a.kills++;
            this.killSnake(b, a);
          } else if (b.length > a.length) {
            b.kills++;
            this.killSnake(a, b);
          } else {
            // Equal: both die
            this.killSnake(a, null);
            this.killSnake(b, null);
          }
        }
      }

      if (!a.isAlive || aInvulnerable) continue;

      // 2. Head into other snake's body (PRD §6.6: moving head dies)
      for (const other of liveSnakes) {
        if (!other.isAlive || other.id === a.id) continue;
        if (now < other.invulnerableUntil) continue; // Passes through invulnerable

        const hitRadius = ARENA_CONFIG.HEAD_RADIUS + ARENA_CONFIG.BODY_RADIUS - 3;
        const hitRadiusSq = hitRadius * hitRadius;

        for (let sIdx = 1; sIdx < other.segments.length; sIdx++) {
          const seg = other.segments[sIdx];
          const distSq = (a.head.x - seg.x) ** 2 + (a.head.y - seg.y) ** 2;
          if (distSq < hitRadiusSq) {
            other.kills++;
            this.killSnake(a, other);
            break;
          }
        }

        if (!a.isAlive) break;
      }
    }
  }

  private killSnake(victim: Snake, killer: Snake | null) {
    if (!victim.isAlive) return;
    victim.isAlive = false;

    // PRD §6.6: Loot on death - Every 3rd segment becomes an orb, capped at <= 60
    const dropEvery = 3;
    let dropped = 0;
    for (let i = 0; i < victim.segments.length && dropped < 60; i += dropEvery) {
      const seg = victim.segments[i];
      const orbValue = Math.min(5, Math.max(1, Math.floor(victim.length / 10)));
      this.spawnPelletAt(seg.x, seg.y, orbValue, "#eab308", true);
      dropped++;
    }

    // If killer is player or victim is player, trigger stats
    if (killer && killer.id === this.playerSnakeId) {
      killer.coinsEarned += 10;
    }

    if (victim.id === this.playerSnakeId) {
      const rank = this.getPlayerRank();
      if (this.onPlayerDeath) {
        this.onPlayerDeath({
          length: Math.floor(victim.length),
          kills: victim.kills,
          coins: victim.coinsEarned + Math.min(20, Math.floor(victim.survivedTime / 30)),
          survivedTime: Math.floor(victim.survivedTime),
          rank,
        });
      }
    }
  }

  private updateBotAI(bot: Snake, dt: number, now: number) {
    bot.aiTimer += dt;
    if (bot.aiTimer < 0.15) return; // PRD §6.4: Bot logic runs at ~5 Hz
    bot.aiTimer = 0;

    const head = bot.head;
    const margin = 200;

    // 1. Boundary Avoidance
    if (
      head.x < margin ||
      head.x > ARENA_CONFIG.MAP_SIZE - margin ||
      head.y < margin ||
      head.y > ARENA_CONFIG.MAP_SIZE - margin
    ) {
      const centerAngle = Math.atan2(
        ARENA_CONFIG.MAP_SIZE / 2 - head.y,
        ARENA_CONFIG.MAP_SIZE / 2 - head.x
      );
      bot.targetAngle = centerAngle;
      bot.isBoosting = false;
      return;
    }

    // 2. Obstacle / Snake Avoidance (look ahead)
    const lookAheadDist = bot.isBoosting ? 140 : 80;
    const probeX = head.x + Math.cos(bot.angle) * lookAheadDist;
    const probeY = head.y + Math.sin(bot.angle) * lookAheadDist;

    let obstacleDetected = false;
    let steerAwayAngle = bot.angle;

    for (const other of this.snakes.values()) {
      if (!other.isAlive || other.id === bot.id) continue;
      for (const seg of other.segments) {
        const dSq = (probeX - seg.x) ** 2 + (probeY - seg.y) ** 2;
        if (dSq < (ARENA_CONFIG.BODY_RADIUS + 30) ** 2) {
          obstacleDetected = true;
          // Turn perpendicular to avoid collision
          steerAwayAngle = bot.angle + (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 2);
          break;
        }
      }
      if (obstacleDetected) break;
    }

    if (obstacleDetected) {
      bot.targetAngle = steerAwayAngle;
      bot.isBoosting = false;
      return;
    }

    // 3. Search for nearby food
    let nearestFood: FoodPellet | null = null;
    let minFoodDistSq = 250 ** 2;

    const cellX = Math.floor(head.x / this.cellSize);
    const cellY = Math.floor(head.y / this.cellSize);

    for (let cx = cellX - 1; cx <= cellX + 1; cx++) {
      for (let cy = cellY - 1; cy <= cellY + 1; cy++) {
        const key = `${cx},${cy}`;
        const foodIds = this.foodGrid.get(key);
        if (!foodIds) continue;
        for (const fid of foodIds) {
          const f = this.foods.get(fid);
          if (!f) continue;
          const dSq = (head.x - f.x) ** 2 + (head.y - f.y) ** 2;
          if (dSq < minFoodDistSq) {
            minFoodDistSq = dSq;
            nearestFood = f;
          }
        }
      }
    }

    if (nearestFood) {
      const foodAngle = Math.atan2(nearestFood.y - head.y, nearestFood.x - head.x);
      bot.targetAngle = foodAngle;
      // Boost if it's large loot orb
      bot.isBoosting = nearestFood.isLoot && bot.length > 25 && Math.random() < 0.25;
      return;
    }

    // 4. Wander smoothly
    if (Math.random() < 0.08) {
      bot.targetAngle = bot.angle + (Math.random() - 0.5) * 1.2;
      bot.isBoosting = bot.length > 30 && Math.random() < 0.05;
    }
  }

  private spawnRandomFood() {
    const margin = 50;
    const x = margin + Math.random() * (ARENA_CONFIG.MAP_SIZE - margin * 2);
    const y = margin + Math.random() * (ARENA_CONFIG.MAP_SIZE - margin * 2);
    const color = PELLET_COLORS[Math.floor(Math.random() * PELLET_COLORS.length)];
    this.spawnPelletAt(x, y, 1, color, false);
  }

  private spawnPelletAt(x: number, y: number, value: number, color: string, isLoot: boolean) {
    const id = this.nextFoodId++;
    const pellet: FoodPellet = {
      id,
      x: Math.max(20, Math.min(ARENA_CONFIG.MAP_SIZE - 20, x)),
      y: Math.max(20, Math.min(ARENA_CONFIG.MAP_SIZE - 20, y)),
      radius: isLoot ? 5 + Math.min(4, value) : 3.5,
      color,
      value,
      isLoot,
    };

    this.foods.set(id, pellet);

    const cellX = Math.floor(pellet.x / this.cellSize);
    const cellY = Math.floor(pellet.y / this.cellSize);
    const key = `${cellX},${cellY}`;

    let list = this.foodGrid.get(key);
    if (!list) {
      list = [];
      this.foodGrid.set(key, list);
    }
    list.push(id);
  }

  private removeFood(id: number, key: string) {
    this.foods.delete(id);
    const list = this.foodGrid.get(key);
    if (list) {
      const idx = list.indexOf(id);
      if (idx !== -1) list.splice(idx, 1);
    }
  }

  private computeLeaderboard() {
    const all = Array.from(this.snakes.values())
      .filter((s) => s.isAlive)
      .sort((a, b) => b.length - a.length);

    let playerRank = 1;
    const top5: LeaderboardEntry[] = [];

    for (let i = 0; i < all.length; i++) {
      const s = all[i];
      if (s.id === this.playerSnakeId) {
        playerRank = i + 1;
      }
      if (i < 5) {
        top5.push({
          rank: i + 1,
          id: s.id,
          name: s.name,
          score: Math.floor(s.length * 10),
          isPlayer: s.id === this.playerSnakeId,
        });
      }
    }

    if (this.onLeaderboardUpdate) {
      this.onLeaderboardUpdate(top5, playerRank);
    }
  }

  public getPlayerRank(): number {
    const all = Array.from(this.snakes.values())
      .filter((s) => s.isAlive)
      .sort((a, b) => b.length - a.length);
    const idx = all.findIndex((s) => s.id === this.playerSnakeId);
    return idx !== -1 ? idx + 1 : all.length + 1;
  }
}

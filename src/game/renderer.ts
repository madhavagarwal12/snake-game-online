import { ARENA_CONFIG, SKINS, SkinDefinition } from "./config";
import { GameEngine } from "./engine";
import { Snake } from "./types";

export class GameRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private cameraX: number = 0;
  private cameraY: number = 0;
  private zoom: number = 1.0;
  
  // Minimap canvas cache
  private minimapCanvas: HTMLCanvasElement;
  private minimapCtx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Could not get 2D canvas context");
    this.ctx = ctx;

    this.minimapCanvas = document.createElement("canvas");
    this.minimapCanvas.width = ARENA_CONFIG.MINIMAP_SIZE;
    this.minimapCanvas.height = ARENA_CONFIG.MINIMAP_SIZE;
    const mCtx = this.minimapCanvas.getContext("2d");
    if (!mCtx) throw new Error("Could not get minimap context");
    this.minimapCtx = mCtx;
  }

  public resize(width: number, height: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  public render(engine: GameEngine, width: number, height: number) {
    const ctx = this.ctx;
    const now = Date.now();
    const player = engine.snakes.get(engine.playerSnakeId);

    // 1. Camera interpolation and dynamic zoom
    if (player && player.isAlive) {
      this.cameraX += (player.head.x - this.cameraX) * 0.15;
      this.cameraY += (player.head.y - this.cameraY) * 0.15;

      // Dynamic zoom-out as snake grows (further slight zoom-out when boosting for sensation of speed)
      const boostZoomOffset = player.isBoosting ? 0.04 : 0;
      const targetZoom = Math.max(
        0.58,
        1.0 - Math.min(0.42, (player.length - ARENA_CONFIG.INITIAL_LENGTH) * 0.0009) - boostZoomOffset
      );
      this.zoom += (targetZoom - this.zoom) * 0.06;
    }

    // Clear background
    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.cameraX, -this.cameraY);

    // Viewport bounds for culling
    const halfW = (width / 2) / this.zoom;
    const halfH = (height / 2) / this.zoom;
    const viewLeft = this.cameraX - halfW;
    const viewRight = this.cameraX + halfW;
    const viewTop = this.cameraY - halfH;
    const viewBottom = this.cameraY + halfH;

    // 2. Arena Grid
    this.drawBackgroundGrid(ctx, viewLeft, viewRight, viewTop, viewBottom);

    // 3. Danger Map Border
    this.drawDangerBorder(ctx);

    // 4. Food Pellets
    this.drawFood(ctx, engine, viewLeft, viewRight, viewTop, viewBottom);

    // 5. Snakes with size scaling and boost effects
    const topSnakeId = this.getTopSnakeId(engine);
    for (const snake of engine.snakes.values()) {
      if (!snake.isAlive) continue;
      this.drawSnake(ctx, engine, snake, now, snake.id === topSnakeId);
    }

    ctx.restore();

    // 6. Minimap
    this.drawMinimap(ctx, engine, player, topSnakeId, height);
  }

  private drawBackgroundGrid(
    ctx: CanvasRenderingContext2D,
    vLeft: number,
    vRight: number,
    vTop: number,
    vBottom: number
  ) {
    const gridSize = 60;
    const startX = Math.floor(Math.max(0, vLeft) / gridSize) * gridSize;
    const endX = Math.min(ARENA_CONFIG.MAP_SIZE, vRight);
    const startY = Math.floor(Math.max(0, vTop) / gridSize) * gridSize;
    const endY = Math.min(ARENA_CONFIG.MAP_SIZE, vBottom);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = startX; x <= endX; x += gridSize) {
      ctx.moveTo(x, Math.max(0, vTop));
      ctx.lineTo(x, Math.min(ARENA_CONFIG.MAP_SIZE, vBottom));
    }
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.moveTo(Math.max(0, vLeft), y);
      ctx.lineTo(Math.min(ARENA_CONFIG.MAP_SIZE, vRight), y);
    }
    ctx.stroke();
  }

  private drawDangerBorder(ctx: CanvasRenderingContext2D) {
    const mapSize = ARENA_CONFIG.MAP_SIZE;

    ctx.save();
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 8;
    ctx.shadowColor = "#ef4444";
    ctx.shadowBlur = 15;
    ctx.strokeRect(0, 0, mapSize, mapSize);

    ctx.beginPath();
    ctx.setLineDash([12, 12]);
    ctx.strokeStyle = "rgba(239, 68, 68, 0.5)";
    ctx.lineWidth = 2;
    ctx.shadowBlur = 0;
    const dangerMargin = 60;
    ctx.strokeRect(dangerMargin, dangerMargin, mapSize - dangerMargin * 2, mapSize - dangerMargin * 2);
    ctx.restore();
  }

  private drawFood(
    ctx: CanvasRenderingContext2D,
    engine: GameEngine,
    vLeft: number,
    vRight: number,
    vTop: number,
    vBottom: number
  ) {
    const margin = 20;

    for (const food of engine.foods.values()) {
      if (
        food.x < vLeft - margin ||
        food.x > vRight + margin ||
        food.y < vTop - margin ||
        food.y > vBottom + margin
      ) {
        continue;
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(food.x, food.y, food.radius, 0, Math.PI * 2);

      if (food.isLoot) {
        ctx.fillStyle = "#fbbf24";
        ctx.shadowColor = "#f59e0b";
        ctx.shadowBlur = 10;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(food.x, food.y, food.radius * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      } else {
        ctx.fillStyle = food.color;
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawSnake(
    ctx: CanvasRenderingContext2D,
    engine: GameEngine,
    snake: Snake,
    now: number,
    isTopSnake: boolean
  ) {
    const skin: SkinDefinition = SKINS[snake.skinId] || SKINS.classic_green;
    const isInvulnerable = now < snake.invulnerableUntil;
    const bodyRadius = engine.getSnakeRadius(snake.length);
    const headRadius = bodyRadius + 2.5;

    ctx.save();

    if (isInvulnerable) {
      ctx.globalAlpha = 0.55 + Math.sin(now * 0.01) * 0.25;
    }

    const segs = snake.segments;

    // 0. Boost flame / trail effect on tail
    if (snake.isBoosting && segs.length > 2) {
      const tail = segs[segs.length - 1];
      const prevTail = segs[segs.length - 2];
      const tailAngle = Math.atan2(tail.y - prevTail.y, tail.x - prevTail.x);

      ctx.save();
      ctx.beginPath();
      ctx.arc(
        tail.x + Math.cos(tailAngle) * bodyRadius * 0.8,
        tail.y + Math.sin(tailAngle) * bodyRadius * 0.8,
        bodyRadius * (0.8 + Math.random() * 0.4),
        0,
        Math.PI * 2
      );
      ctx.fillStyle = "#f59e0b";
      ctx.shadowColor = "#f97316";
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.restore();
    }

    // 1. Draw Body Segments (tail to neck)
    for (let i = segs.length - 1; i >= 1; i--) {
      const seg = segs[i];
      const isAlt = i % 2 === 0;

      // Segments taper slightly toward the tail tip
      const segmentRadius = Math.max(
        bodyRadius * 0.65,
        bodyRadius * Math.min(1.0, 0.65 + (i / segs.length) * 0.35)
      );

      ctx.beginPath();
      ctx.arc(seg.x, seg.y, segmentRadius, 0, Math.PI * 2);

      if (skin.pattern === "striped") {
        ctx.fillStyle = isAlt ? skin.primaryColor : skin.secondaryColor;
      } else if (skin.pattern === "gradient") {
        const factor = i / segs.length;
        ctx.fillStyle = factor > 0.5 ? skin.primaryColor : skin.secondaryColor;
      } else if (skin.pattern === "sparkle") {
        ctx.fillStyle = isAlt ? skin.primaryColor : "#ffffff";
      } else {
        ctx.fillStyle = skin.primaryColor;
      }

      ctx.fill();

      // Border outline for 3D rounded appearance
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
      ctx.stroke();
    }

    // 2. Draw Head
    const head = snake.head;

    if (snake.isBoosting) {
      // Glow aura around head when boosting
      ctx.save();
      ctx.beginPath();
      ctx.arc(head.x, head.y, headRadius + 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(245, 158, 11, 0.35)";
      ctx.fill();
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(head.x, head.y, headRadius, 0, Math.PI * 2);
    ctx.fillStyle = skin.primaryColor;
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.stroke();

    // 3. Eyes facing movement angle
    const eyeDist = headRadius * 0.45;
    const eyeForward = headRadius * 0.45;
    const eyeRadius = Math.max(3.2, headRadius * 0.25);
    const pupilRadius = eyeRadius * 0.55;

    const leftEyeX = head.x + Math.cos(snake.angle + 0.65) * eyeDist + Math.cos(snake.angle) * eyeForward;
    const leftEyeY = head.y + Math.sin(snake.angle + 0.65) * eyeDist + Math.sin(snake.angle) * eyeForward;
    const rightEyeX = head.x + Math.cos(snake.angle - 0.65) * eyeDist + Math.cos(snake.angle) * eyeForward;
    const rightEyeY = head.y + Math.sin(snake.angle - 0.65) * eyeDist + Math.sin(snake.angle) * eyeForward;

    // Eyeballs
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(leftEyeX, leftEyeY, eyeRadius, 0, Math.PI * 2);
    ctx.arc(rightEyeX, rightEyeY, eyeRadius, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    ctx.fillStyle = skin.eyeColor || "#000000";
    ctx.beginPath();
    ctx.arc(leftEyeX + Math.cos(snake.angle) * pupilRadius, leftEyeY + Math.sin(snake.angle) * pupilRadius, pupilRadius, 0, Math.PI * 2);
    ctx.arc(rightEyeX + Math.cos(snake.angle) * pupilRadius, rightEyeY + Math.sin(snake.angle) * pupilRadius, pupilRadius, 0, Math.PI * 2);
    ctx.fill();

    // 4. Crown on #1 Snake!
    if (isTopSnake) {
      this.drawCrown(ctx, head.x, head.y - headRadius - 6);
    }

    // 5. Nickname Label
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 4;
    ctx.fillText(snake.name, head.x, head.y - headRadius - (isTopSnake ? 18 : 9));

    ctx.restore();
  }

  private drawCrown(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.save();
    ctx.fillStyle = "#facc15";
    ctx.strokeStyle = "#ca8a04";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 10, y + 4);
    ctx.lineTo(x - 10, y - 4);
    ctx.lineTo(x - 4, y);
    ctx.lineTo(x, y - 8);
    ctx.lineTo(x + 4, y);
    ctx.lineTo(x + 10, y - 4);
    ctx.lineTo(x + 10, y + 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(x, y - 4, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawMinimap(
    ctx: CanvasRenderingContext2D,
    engine: GameEngine,
    player: Snake | undefined,
    topSnakeId: number | null,
    screenHeight: number
  ) {
    const size = ARENA_CONFIG.MINIMAP_SIZE;
    const padding = 16;
    const x = padding;
    const y = screenHeight - size - padding;
    const scale = size / ARENA_CONFIG.MAP_SIZE;

    const mCtx = this.minimapCtx;
    mCtx.clearRect(0, 0, size, size);

    mCtx.fillStyle = "rgba(15, 23, 42, 0.85)";
    mCtx.fillRect(0, 0, size, size);

    mCtx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    mCtx.lineWidth = 1.5;
    mCtx.strokeRect(0, 0, size, size);

    for (const s of engine.snakes.values()) {
      if (!s.isAlive) continue;
      const dotX = s.head.x * scale;
      const dotY = s.head.y * scale;

      if (s.id === engine.playerSnakeId) {
        mCtx.fillStyle = "#10b981";
        mCtx.beginPath();
        mCtx.arc(dotX, dotY, 4, 0, Math.PI * 2);
        mCtx.fill();
      } else if (s.id === topSnakeId) {
        mCtx.fillStyle = "#facc15";
        mCtx.beginPath();
        mCtx.arc(dotX, dotY, 3.5, 0, Math.PI * 2);
        mCtx.fill();
      } else {
        // Larger bots get slightly larger minimap dots
        const dotRadius = s.length > 150 ? 2.5 : 1.5;
        mCtx.fillStyle = s.length > 150 ? "rgba(244, 63, 94, 0.7)" : "rgba(255, 255, 255, 0.4)";
        mCtx.beginPath();
        mCtx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
        mCtx.fill();
      }
    }

    ctx.drawImage(this.minimapCanvas, x, y);
  }

  private getTopSnakeId(engine: GameEngine): number | null {
    let topId: number | null = null;
    let maxLength = -1;
    for (const s of engine.snakes.values()) {
      if (s.isAlive && s.length > maxLength) {
        maxLength = s.length;
        topId = s.id;
      }
    }
    return topId;
  }
}

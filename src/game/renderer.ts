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
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // PRD §9.4: Cap DPR at 2
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  public render(engine: GameEngine, width: number, height: number) {
    const ctx = this.ctx;
    const now = Date.now();
    const player = engine.snakes.get(engine.playerSnakeId);

    // 1. Update Camera position & zoom (PRD §9.3)
    if (player && player.isAlive) {
      // Smooth camera interpolation
      const targetX = player.head.x;
      const targetY = player.head.y;
      this.cameraX += (targetX - this.cameraX) * 0.15;
      this.cameraY += (targetY - this.cameraY) * 0.15;

      // Dynamic zoom-out as snake grows
      const targetZoom = Math.max(
        0.65,
        1.0 - Math.min(0.35, (player.length - ARENA_CONFIG.INITIAL_LENGTH) * 0.001)
      );
      this.zoom += (targetZoom - this.zoom) * 0.05;
    } else {
      this.zoom = 1.0;
    }

    // Clear background
    ctx.fillStyle = "#090d16"; // Dark slate space
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    // Center camera on screen
    ctx.translate(width / 2, height / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.cameraX, -this.cameraY);

    // Visible viewport bounds in world coords for culling
    const halfW = (width / 2) / this.zoom;
    const halfH = (height / 2) / this.zoom;
    const viewLeft = this.cameraX - halfW;
    const viewRight = this.cameraX + halfW;
    const viewTop = this.cameraY - halfH;
    const viewBottom = this.cameraY + halfH;

    // 2. Draw Arena Grid & Background Tiles
    this.drawBackgroundGrid(ctx, viewLeft, viewRight, viewTop, viewBottom);

    // 3. Draw Dotted Danger Map Border (PRD §9.3)
    this.drawDangerBorder(ctx);

    // 4. Draw Food Pellets (Viewport culled)
    this.drawFood(ctx, engine, viewLeft, viewRight, viewTop, viewBottom);

    // 5. Draw Snakes (Viewport culled)
    const topSnakeId = this.getTopSnakeId(engine);
    for (const snake of engine.snakes.values()) {
      if (!snake.isAlive) continue;
      this.drawSnake(ctx, snake, now, snake.id === topSnakeId);
    }

    ctx.restore();

    // 6. Draw Minimap in bottom-left corner (PRD §9.5)
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

    ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
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

    // Outer boundary line
    ctx.save();
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 8;
    ctx.shadowColor = "#ef4444";
    ctx.shadowBlur = 15;
    ctx.strokeRect(0, 0, mapSize, mapSize);

    // Inner danger warning line (dashed)
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
      // Culling
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
        // Glowing gold loot orb
        ctx.fillStyle = "#fbbf24";
        ctx.shadowColor = "#f59e0b";
        ctx.shadowBlur = 8;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(food.x, food.y, food.radius * 0.5, 0, Math.PI * 2);
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
    snake: Snake,
    now: number,
    isTopSnake: boolean
  ) {
    const skin: SkinDefinition = SKINS[snake.skinId] || SKINS.classic_green;
    const isInvulnerable = now < snake.invulnerableUntil;

    ctx.save();

    if (isInvulnerable) {
      // Shimmering alpha for invulnerable snakes
      ctx.globalAlpha = 0.55 + Math.sin(now * 0.01) * 0.25;
    }

    // 1. Draw Body Segments (from tail to neck)
    const bodyRadius = ARENA_CONFIG.BODY_RADIUS;
    const segs = snake.segments;

    for (let i = segs.length - 1; i >= 1; i--) {
      const seg = segs[i];
      const isAlt = i % 2 === 0;

      ctx.beginPath();
      ctx.arc(seg.x, seg.y, bodyRadius, 0, Math.PI * 2);

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

      // Border outline for depth
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
      ctx.stroke();
    }

    // 2. Draw Head
    const head = snake.head;
    const headRadius = ARENA_CONFIG.HEAD_RADIUS;

    ctx.beginPath();
    ctx.arc(head.x, head.y, headRadius, 0, Math.PI * 2);
    ctx.fillStyle = skin.primaryColor;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.stroke();

    // 3. Eyes facing movement angle
    const eyeDist = 6;
    const eyeForward = 6;
    const leftEyeX = head.x + Math.cos(snake.angle + 0.6) * eyeDist + Math.cos(snake.angle) * eyeForward;
    const leftEyeY = head.y + Math.sin(snake.angle + 0.6) * eyeDist + Math.sin(snake.angle) * eyeForward;
    const rightEyeX = head.x + Math.cos(snake.angle - 0.6) * eyeDist + Math.cos(snake.angle) * eyeForward;
    const rightEyeY = head.y + Math.sin(snake.angle - 0.6) * eyeDist + Math.sin(snake.angle) * eyeForward;

    // Eyeballs
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(leftEyeX, leftEyeY, 3.5, 0, Math.PI * 2);
    ctx.arc(rightEyeX, rightEyeY, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    ctx.fillStyle = skin.eyeColor || "#000000";
    ctx.beginPath();
    ctx.arc(leftEyeX + Math.cos(snake.angle) * 1.5, leftEyeY + Math.sin(snake.angle) * 1.5, 1.8, 0, Math.PI * 2);
    ctx.arc(rightEyeX + Math.cos(snake.angle) * 1.5, rightEyeY + Math.sin(snake.angle) * 1.5, 1.8, 0, Math.PI * 2);
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
    ctx.fillText(snake.name, head.x, head.y - headRadius - (isTopSnake ? 16 : 8));

    ctx.restore();
  }

  private drawCrown(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.save();
    ctx.fillStyle = "#facc15"; // Gold
    ctx.strokeStyle = "#ca8a04";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 9, y + 4);
    ctx.lineTo(x - 9, y - 4);
    ctx.lineTo(x - 4, y);
    ctx.lineTo(x, y - 8);
    ctx.lineTo(x + 4, y);
    ctx.lineTo(x + 9, y - 4);
    ctx.lineTo(x + 9, y + 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Crown jewels
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(x, y - 4, 1.5, 0, Math.PI * 2);
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

    // Background
    mCtx.fillStyle = "rgba(15, 23, 42, 0.85)";
    mCtx.fillRect(0, 0, size, size);

    // Border
    mCtx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    mCtx.lineWidth = 1.5;
    mCtx.strokeRect(0, 0, size, size);

    // Draw snake dots
    for (const s of engine.snakes.values()) {
      if (!s.isAlive) continue;
      const dotX = s.head.x * scale;
      const dotY = s.head.y * scale;

      if (s.id === engine.playerSnakeId) {
        // Player is large bright green dot
        mCtx.fillStyle = "#10b981";
        mCtx.beginPath();
        mCtx.arc(dotX, dotY, 3.5, 0, Math.PI * 2);
        mCtx.fill();
      } else if (s.id === topSnakeId) {
        // #1 is gold dot
        mCtx.fillStyle = "#facc15";
        mCtx.beginPath();
        mCtx.arc(dotX, dotY, 3, 0, Math.PI * 2);
        mCtx.fill();
      } else {
        // Bots are small subtle dots
        mCtx.fillStyle = "rgba(255, 255, 255, 0.4)";
        mCtx.beginPath();
        mCtx.arc(dotX, dotY, 1.5, 0, Math.PI * 2);
        mCtx.fill();
      }
    }

    // Render minimap to main canvas
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

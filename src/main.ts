import { type Pos } from "./engine/types";
import {
  clearPath,
  initGame,
  stepSimulation,
  tryAppendPath,
  type GameState,
} from "./engine/game";
import { buildLevel } from "./levels/loader";
import { getTodayLevelFromSupabase } from "./levels/daily";
import {
  submitRun,
  getPlayerId,
  getBestScoreFromStorage,
  setBestScoreInStorage,
  hasRunInDatabase,
} from "./supabase/api";
import { showSuccessPopup, hideSuccessPopup } from "./popup";
import type { LevelData } from "./levels/level.schema";
import { validateLevelData } from "./levels/validate";
import { solveLevel } from "./engine/solver";
import { pathImagesLoaded, renderPath, renderPathArrow } from "./paths";
import { TILE_SIZE } from "./config/constants";
import "./style.css";

// load sprites
const floorOpen = new Image();
floorOpen.src = "/src/assets/floor_open.png";

const drinkA = new Image();
drinkA.src = "/src/assets/drink_a.png";

const drinkB = new Image();
drinkB.src = "/src/assets/drink_b.png";

const drinkPressed = new Image();
drinkPressed.src = "/src/assets/drink_pressed.png";

const glorboSpriteSheet = new Image();
glorboSpriteSheet.src = "/src/assets/glorbo_sprite_sheet.png";

const hoverSprite = new Image();
hoverSprite.src = "/src/assets/hover.png";

const hoverNopeSprite = new Image();
hoverNopeSprite.src = "/src/assets/hover_nope.png";

const hoverYepSprite = new Image();
hoverYepSprite.src = "/src/assets/hover_yep.png";

const customerA = new Image();
customerA.src = "/src/assets/customer_a.png";

const customerB = new Image();
customerB.src = "/src/assets/customer_b.png";

const customerC = new Image();
customerC.src = "/src/assets/customer_c.png";

const standHere = new Image();
standHere.src = "/src/assets/stand_here.png";

const drinkAItem = new Image();
drinkAItem.src = "/src/assets/drink_a_item.png";

const drinkBItem = new Image();
drinkBItem.src = "/src/assets/drink_b_item.png";

// images have to load :(
const imagesLoaded = Promise.all([
  new Promise<void>((resolve) => {
    floorOpen.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    drinkA.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    drinkB.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    drinkPressed.onload = () => resolve();
  }),
  pathImagesLoaded,
  new Promise<void>((resolve) => {
    glorboSpriteSheet.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    hoverSprite.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    hoverNopeSprite.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    hoverYepSprite.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    customerA.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    customerB.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    customerC.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    standHere.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    drinkAItem.onload = () => resolve();
  }),
  new Promise<void>((resolve) => {
    drinkBItem.onload = () => resolve();
  }),
]);

function inBounds(levelW: number, levelH: number, p: Pos): boolean {
  return p.x >= 0 && p.x < levelW && p.y >= 0 && p.y < levelH;
}

// quadrant: 2 = bottom-left (animation 1 after drink), 3 = bottom-right (animation 2 after drink)
function getCustomerIconDataUrl(customerSprite: HTMLImageElement, quadrant: 2 | 3 = 2): string {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const spriteWidth = customerSprite.width / 2;
  const spriteHeight = customerSprite.height / 2;
  canvas.width = spriteWidth;
  canvas.height = spriteHeight;

  const sourceX = quadrant === 2 ? 0 : spriteWidth;
  const sourceY = spriteHeight;

  ctx.drawImage(
    customerSprite,
    sourceX,
    sourceY,
    spriteWidth,
    spriteHeight,
    0,
    0,
    spriteWidth,
    spriteHeight,
  );

  return canvas.toDataURL();
}

function getGlorboIcon(glorboSprite: HTMLImageElement): string {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const spriteSheetWidth = glorboSprite.width;
  const spriteSheetHeight = glorboSprite.height;
  const spriteWidth = spriteSheetWidth / 3;
  const spriteHeight = spriteSheetHeight / 2;

  canvas.width = spriteWidth;
  canvas.height = spriteHeight;

  ctx.drawImage(
    glorboSprite,
    0,
    0,
    spriteWidth,
    spriteHeight,
    0,
    0,
    spriteWidth,
    spriteHeight,
  );

  return canvas.toDataURL();
}

function getTilePos(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
): Pos | null {
  const rect = canvas.getBoundingClientRect();
  const canvasX = x - rect.left;
  const canvasY = y - rect.top;

  const tileX = Math.floor(canvasX / TILE_SIZE);
  const tileY = Math.floor(canvasY / TILE_SIZE);

  return { x: tileX, y: tileY };
}

class GameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: GameState;
  private isDrawing: boolean = false;
  private simInterval: number | null = null;
  private animationFrame: number = 0;
  private animationInterval: number | null = null;
  private tempCanvas: HTMLCanvasElement;
  private tempCtx: CanvasRenderingContext2D;
  private hoverTile: Pos | null = null;

  private uiMode: "play" | "build" = "play";
  private onBuildTileClick: ((pos: Pos) => void) | null = null;
  private onSuccess: ((moves: number) => void) | null = null;
  private successHandled: boolean = false;
  private currentLevelId: string | null = null;

  // avoid build mode spamming paint calls on same tile
  private lastBuildPaintKey: string | null = null;

  constructor(canvas: HTMLCanvasElement, state: GameState) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2d context");
    this.ctx = ctx;
    this.state = state;

    // create temporary canvas for sprite tinting
    this.tempCanvas = document.createElement("canvas");
    this.tempCanvas.width = TILE_SIZE;
    this.tempCanvas.height = TILE_SIZE;
    const tempCtx = this.tempCanvas.getContext("2d");
    if (!tempCtx) throw new Error("Could not get 2d context for temp canvas");
    this.tempCtx = tempCtx;

    this.setupCanvas();
    this.setupEventListeners();
    this.startSimulation();
    this.startAnimation();
  }

  private startAnimation() {
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
    }

    // animate path by switching between normal and alt sprites
    this.animationInterval = window.setInterval(() => {
      this.animationFrame = (this.animationFrame + 1) % 2;
      this.render();
    }, 500); // switch every 500ms
  }

  public destroy() {
    if (this.simInterval) {
      clearInterval(this.simInterval);
    }
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
    }
  }

  private setupCanvas() {
    const level = this.state.level;

    const scale = 4;
    const baseCanvasWidth = level.width * TILE_SIZE;
    const baseCanvasHeight = level.height * TILE_SIZE;

    this.canvas.width = baseCanvasWidth * scale;
    this.canvas.height = baseCanvasHeight * scale;

    this.canvas.style.width = `${this.canvas.width / scale}px`;
    this.canvas.style.height = `${this.canvas.height / scale}px`;

    this.ctx.scale(scale, scale);

    this.ctx.imageSmoothingEnabled = false;
    this.tempCtx.imageSmoothingEnabled = false;
  }

  private setupEventListeners() {
    this.canvas.addEventListener("mousedown", (e) => this.handlePointerDown(e));
    this.canvas.addEventListener("mousemove", (e) => {
      this.handlePointerMove(e);
      this.handleHover(e);
    });
    this.canvas.addEventListener("mouseup", () => this.stopDrawing());
    this.canvas.addEventListener("mouseleave", () => {
      this.stopDrawing();
      this.hoverTile = null;
      this.render();
    });

    // touch svreen support
    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.handlePointerDown({
        clientX: touch.clientX,
        clientY: touch.clientY,
      });
    });
    this.canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.handlePointerMove({
        clientX: touch.clientX,
        clientY: touch.clientY,
      });
    });
    this.canvas.addEventListener("touchend", () => this.stopDrawing());
  }

  private handlePointerDown(e: { clientX: number; clientY: number }) {
    if (this.state.status !== "idle") return;
    const pos = getTilePos(this.canvas, e.clientX, e.clientY);
    if (!pos) return;

    if (this.uiMode === "build") {
      if (!inBounds(this.state.level.width, this.state.level.height, pos))
        return;
      this.isDrawing = true;
      this.lastBuildPaintKey = null;

      this.onBuildTileClick?.(pos);
      this.lastBuildPaintKey = `${pos.x},${pos.y}`;
      return;
    }

    const last =
      this.state.path[this.state.path.length - 1] ?? this.state.level.start;
    if (pos.x !== last.x || pos.y !== last.y) return;

    this.isDrawing = true;
  }

  private handlePointerMove(e: { clientX: number; clientY: number }) {
    if (this.uiMode === "build") {
      if (!this.isDrawing) return;
      if (this.state.status !== "idle") return;

      const pos = getTilePos(this.canvas, e.clientX, e.clientY);
      if (!pos) return;
      if (!inBounds(this.state.level.width, this.state.level.height, pos))
        return;

      const key = `${pos.x},${pos.y}`;
      if (this.lastBuildPaintKey === key) return;
      this.lastBuildPaintKey = key;

      // repaintttt
      this.onBuildTileClick?.(pos);
      return;
    }

    if (!this.isDrawing) return;
    if (this.state.status !== "idle") return;

    const pos = getTilePos(this.canvas, e.clientX, e.clientY);
    if (!pos) return;
    if (!inBounds(this.state.level.width, this.state.level.height, pos)) return;

    this.state = tryAppendPath(this.state, pos);
    this.render();
    this.updateUI();
  }

  private stopDrawing() {
    this.isDrawing = false;
    this.lastBuildPaintKey = null;
  }

  private handleHover(e: { clientX: number; clientY: number }) {
    const pos = getTilePos(this.canvas, e.clientX, e.clientY);
    if (pos && inBounds(this.state.level.width, this.state.level.height, pos)) {
      if (this.hoverTile?.x !== pos.x || this.hoverTile?.y !== pos.y) {
        this.hoverTile = pos;
        this.render();
      }

      if (this.uiMode === "build") {
        this.canvas.style.cursor = "crosshair";
        return;
      }

      // grab cursor on path that you can grab from
      const lastPathTile = this.state.path[this.state.path.length - 1];
      const isLastPathTile =
        lastPathTile && pos.x === lastPathTile.x && pos.y === lastPathTile.y;

      // TODO: SPRITE CHANGE!! make it green or something when u can grab on it
      if (isLastPathTile) {
        this.canvas.style.cursor = this.isDrawing ? "grabbing" : "grab";
      } else {
        this.canvas.style.cursor = "default";
      }
    } else {
      if (this.hoverTile !== null) {
        this.hoverTile = null;
        this.render();
      }
      this.canvas.style.cursor = "default";
    }
  }

  public setUIMode(mode: "play" | "build") {
    this.uiMode = mode;
    this.isDrawing = false;
    this.lastBuildPaintKey = null;
    if (this.uiMode === "build") {
      // stop sim while editing
      if (this.simInterval) {
        clearInterval(this.simInterval);
        this.simInterval = null;
      }
    }
    this.render();
    this.updateUI();
  }

  public setOnBuildTileClick(handler: ((pos: Pos) => void) | null) {
    this.onBuildTileClick = handler;
  }

  public setOnSuccess(handler: ((moves: number) => void) | null) {
    this.onSuccess = handler;
  }

  public setLevelId(levelId: string | null) {
    this.currentLevelId = levelId;
  }

  public getState(): GameState {
    return this.state;
  }

  public setState(newState: GameState) {
    this.state = newState;
    // reset success on reset
    if (newState.status !== "success") {
      this.successHandled = false;
    }
    this.render();
    this.updateUI();
    this.startSimulation();
  }

  public updateBestScoreDisplay() {
    this.updateUI();
  }

  private startSimulation() {
    if (this.uiMode === "build") return;
    if (this.simInterval) {
      clearInterval(this.simInterval);
      this.simInterval = null;
    }

    if (this.state.status !== "running") return;

    this.simInterval = window.setInterval(() => {
      this.state = stepSimulation(this.state);
      this.render();
      this.updateUI();

      if (this.state.status !== "running") {
        if (this.simInterval) {
          clearInterval(this.simInterval);
          this.simInterval = null;
        }
        if (this.state.status === "failed") {
          this.showFailurePopup();
        } else if (this.state.status === "success" && this.onSuccess && !this.successHandled) {
          this.successHandled = true;
          this.onSuccess(this.state.stepsTaken);
        }
      }
    }, 250);
  }

  public render() {
    const { level, glorboPos } = this.state;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // draw floor for all tiles
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        ctx.drawImage(floorOpen, px, py, TILE_SIZE, TILE_SIZE);
      }
    }

    // draw walls
    ctx.fillStyle = "#333";
    for (const wallKey of level.walls) {
      const [x, y] = wallKey.split(",").map(Number);
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }

    // draw drink stations
    for (const [key, drink] of Object.entries(level.drinkStations)) {
      const [x, y] = key.split(",").map(Number);
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;

      // check if glorbo is on this drink station
      const isGlorboOnStation = glorboPos.x === x && glorboPos.y === y;

      if (drink === "D1") {
        // use pressed sprite if glorbo is on it, otherwise normal sprite
        const spriteToUse = isGlorboOnStation ? drinkPressed : drinkA;
        ctx.drawImage(spriteToUse, px, py, TILE_SIZE, TILE_SIZE);
      } else if (drink === "D2") {
        // use pressed sprite if glorbo is on it, otherwise normal sprite
        const spriteToUse = isGlorboOnStation ? drinkPressed : drinkB;
        ctx.drawImage(spriteToUse, px, py, TILE_SIZE, TILE_SIZE);
      }
    }

    // serve boxes
    for (const [key] of Object.entries(level.standHere)) {
      const [x, y] = key.split(",").map(Number);
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;

      const standWidth = standHere.width;
      const standHeight = standHere.height;
      const frameWidth = standWidth / 2;
      const frameIndex = this.animationFrame % 2;

      ctx.drawImage(
        standHere,
        frameIndex * frameWidth,
        0,
        frameWidth,
        standHeight,
        px,
        py,
        TILE_SIZE,
        TILE_SIZE,
      );
    }

    // draw customers
    for (const [key, customerId] of Object.entries(level.customers)) {
      const [x, y] = key.split(",").map(Number);
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;

      // Ok wait is there a better way to do this or are we just gonna have a million diff customers in this
      // big ahh if statement...... yandev core
      let customerSprite: HTMLImageElement;
      if (customerId === "A") customerSprite = customerA;
      else if (customerId === "B") customerSprite = customerB;
      else if (customerId === "C") customerSprite = customerC;
      else continue;

      // check if customer is served
      const isServed = this.state.served[customerId];

      // sprite is split into 4 quadrants:
      // top-left (0,0): animation 1 before drink
      // top-right (1,0): animation 2 before drink
      // bottom-left (0,1): animation 1 after drink
      // bottom-right (1,1): animation 2 after drink
      const spriteWidth = customerSprite.width / 2;
      const spriteHeight = customerSprite.height / 2;

      const frameIndex = this.animationFrame % 2; // 0 or 1 for animation frame
      const sourceX = frameIndex * spriteWidth;
      const sourceY = isServed ? spriteHeight : 0; // top half if not served, bottom half if served

      ctx.drawImage(
        customerSprite,
        sourceX,
        sourceY,
        spriteWidth,
        spriteHeight,
        px,
        py,
        TILE_SIZE,
        TILE_SIZE,
      );
    }

    if (this.uiMode === "play") {
      // draw path with directional sprites and gradient overlay
      renderPath(ctx, this.tempCtx, this.state, this.animationFrame);

      // draw path arrow on the last tile (current point user is on)
      renderPathArrow(ctx, this.state, this.animationFrame);
    }

    // draw glorbo (on top of path)
    const gx = glorboPos.x * TILE_SIZE;
    const gy = glorboPos.y * TILE_SIZE;

    // determine which sprite to use based on inventory count
    const drinkCount = this.state.inventory.length;
    const spriteIndex = Math.min(drinkCount, 2); // 0, 1, or 2

    const spriteSheetWidth = glorboSpriteSheet.width;
    const spriteSheetHeight = glorboSpriteSheet.height;
    const spriteWidth = spriteSheetWidth / 3;
    const spriteHeight = spriteSheetHeight / 2; // 2 rows
    const sourceY = this.animationFrame * spriteHeight; // 0 for static, spriteHeight for animation

    // draw the appropriate sprite from the sprite sheet
    ctx.drawImage(
      glorboSpriteSheet,
      spriteIndex * spriteWidth,
      sourceY,
      spriteWidth,
      spriteHeight, // source rectangle
      gx,
      gy,
      TILE_SIZE,
      TILE_SIZE, // destination rectangle
    );

    // draw hover sprite on hovered tile (only during idle state)
    if (this.state.status === "idle" && this.hoverTile) {
      const hx = this.hoverTile.x * TILE_SIZE;
      const hy = this.hoverTile.y * TILE_SIZE;

      let spriteToUse = hoverSprite;
      if (this.uiMode === "play") {
        // check if tile is unwalkable (wall or customer)
        const hoverKey = `${this.hoverTile.x},${this.hoverTile.y}`;
        const isUnwalkable =
          this.state.level.walls.has(hoverKey) ||
          this.state.level.customers[hoverKey];

        // check if hovering over the last path tile (where you can grab from)
        const lastPathTile = this.state.path[this.state.path.length - 1];
        const isLastPathTile =
          lastPathTile &&
          this.hoverTile.x === lastPathTile.x &&
          this.hoverTile.y === lastPathTile.y;

        spriteToUse = isLastPathTile
          ? hoverYepSprite
          : isUnwalkable
            ? hoverNopeSprite
            : hoverSprite;
      }

      // hover sprite has 2 frames split in half horizontally
      const hoverWidth = spriteToUse.width;
      const hoverHeight = spriteToUse.height;
      const frameWidth = hoverWidth / 2;
      // stay on second frame (index 1) when dragging, otherwise animate
      const frameIndex = this.isDrawing ? 1 : this.animationFrame % 2;

      // draw the appropriate frame
      ctx.drawImage(
        spriteToUse,
        frameIndex * frameWidth,
        0,
        frameWidth,
        hoverHeight, // source rectangle
        hx,
        hy,
        TILE_SIZE,
        TILE_SIZE, // destination rectangle
      );
    }
  }

  public updateUI() {
    const stepsEl = document.getElementById("steps");
    const messageEl = document.getElementById("message");
    const bestScoreEl = document.getElementById("best-score");
    const pathEl = document.getElementById("path");
    const inventoryEl = document.getElementById("inventory");
    const runButton = document.getElementById("run-btn") as HTMLButtonElement;
    const retryButton = document.getElementById(
      "retry-btn",
    ) as HTMLButtonElement;

    if (stepsEl) stepsEl.textContent = `steps: ${this.state.stepsTaken}`;
    if (messageEl) messageEl.textContent = this.state.message || "";

    // always show best score if available
    if (bestScoreEl && this.currentLevelId) {
      const bestScore = getBestScoreFromStorage(this.currentLevelId);
      if (bestScore !== null) {
        bestScoreEl.textContent = `best: ${bestScore}`;
        bestScoreEl.style.display = "block";
      } else {
        bestScoreEl.style.display = "none";
      }
    } else if (bestScoreEl && !this.currentLevelId) {
      bestScoreEl.style.display = "none";
    }

    if (pathEl) {
      const pathLabel = this.state.path
        .map((p) => `(${p.x},${p.y})`)
        .join(" → ");
      pathEl.textContent = `ur path: ${pathLabel}`;
    }

    if (inventoryEl) {
      const inventory = this.state.inventory;
      if (inventory.length === 0) {
        inventoryEl.innerHTML = `in hand: (empty)`;
      } else {
        const drinkImages = inventory
          .map((drinkId) => {
            const imageSrc = drinkId === "D1" ? drinkAItem.src : drinkBItem.src;
            return `<img src="${imageSrc}" alt="${drinkId}" class="inventory-drink-icon" />`;
          })
          .join("");
        inventoryEl.innerHTML = `in hand: ${drinkImages}`;
      }
    }

    this.updateOrdersDisplay();

    if (runButton) {
      runButton.disabled =
        this.uiMode === "build" || this.state.status !== "idle";
    }

    if (retryButton) {
      retryButton.disabled =
        this.uiMode === "build" || this.state.status === "running";
    }
  }

  private showFailurePopup() {
    const popup = document.getElementById("failure-popup");
    if (popup) {
      popup.style.display = "flex";
    }
  }

  public hideFailurePopup() {
    const popup = document.getElementById("failure-popup");
    if (popup) {
      popup.style.display = "none";
    }
  }

  private updateOrdersDisplay() {
    const ordersEl = document.getElementById("orders");
    if (!ordersEl) return;

    const { level, served } = this.state;
    const entries = Object.entries(level.orders);
    entries.sort(([a], [b]) => a.localeCompare(b));

    const getCustomerSprite = (customerId: string): HTMLImageElement | null => {
      if (customerId === "A") return customerA;
      if (customerId === "B") return customerB;
      if (customerId === "C") return customerC;
      return null;
    };

    const getDrinkItemImage = (drinkId: string): string => {
      if (drinkId === "D1") return drinkAItem.src;
      if (drinkId === "D2") return drinkBItem.src;
      return "";
    };

    const ordersHTML = entries
      .map(([customerId, drinks], index) => {
        const customerSprite = getCustomerSprite(customerId);
        const isServed = served[customerId as keyof typeof served] || false;
        const quadrant: 2 | 3 = isServed ? 3 : 2;
        const customerIconUrl = customerSprite
          ? getCustomerIconDataUrl(customerSprite, quadrant)
          : "";

        const drinkImages = drinks
          .map(
            (drinkId) =>
              `<img src="${getDrinkItemImage(drinkId)}" alt="${drinkId}" class="drink-item-icon" />`,
          )
          .join("");

        const servedClass = isServed ? "order-served" : "";

        return `
        <li class="order-item ${servedClass}" data-customer-id="${customerId}">
          <div class="order-header">order #${index + 1}</div>
          <div class="order-row">
            <img src="${customerIconUrl}" alt="${customerId}" class="customer-icon" />
            <div class="drink-items">${drinkImages}</div>
          </div>
        </li>
      `;
      })
      .join("");

    ordersEl.innerHTML = ordersHTML;
  }
}

// initialize game
async function init() {
  await imagesLoaded;

  // builder tool icons
  const startIcon = document.getElementById(
    "builder-start-icon",
  ) as HTMLImageElement | null;
  const b1 = document.getElementById(
    "builder-cust1-icon",
  ) as HTMLImageElement | null;
  const b2 = document.getElementById(
    "builder-cust2-icon",
  ) as HTMLImageElement | null;
  const b3 = document.getElementById(
    "builder-cust3-icon",
  ) as HTMLImageElement | null;
  if (startIcon) startIcon.src = getGlorboIcon(glorboSpriteSheet);
  if (b1) b1.src = getCustomerIconDataUrl(customerA, 2);
  if (b2) b2.src = getCustomerIconDataUrl(customerB, 2);
  if (b3) b3.src = getCustomerIconDataUrl(customerC, 2);

  const { levelData, levelId } = await getTodayLevelFromSupabase();

  const level = buildLevel(levelData);
  const state = initGame(level);

  let currentLevelData: LevelData = JSON.parse(
    JSON.stringify(levelData),
  ) as LevelData;
  
  // store level ID for submitting runs
  let currentLevelId: string | null = levelId;

  // setup day text
  const dayTextEl = document.getElementById("day-text");
  if (dayTextEl) {
    // extract day number from
    const dayMatch = levelData.id.match(/day-(\d+)/);
    const dayNumber = dayMatch ? parseInt(dayMatch[1], 10) : 1;
    dayTextEl.textContent = `day ${dayNumber}`;
  }

  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
  if (!canvas) throw new Error("no canvas found");

  const renderer = new GameRenderer(canvas, state);
  renderer.setLevelId(currentLevelId);

  // extract day number for popup
  const dayMatch = levelData.id.match(/day-(\d+)/);
  const dayNumber = dayMatch ? parseInt(dayMatch[1], 10) : 1;

  // submit run and show top score
  renderer.setOnSuccess(async (moves: number) => {
    if (!currentLevelId) {
      // no level id => can't submit
      return;
    }

    try {
      const playerId = getPlayerId();
      const storedBest = getBestScoreFromStorage(currentLevelId);
      const isNewBest = storedBest === null || moves < storedBest;
      
      // check if player already has a run in database for this level
      const hasExistingRun = await hasRunInDatabase(currentLevelId, playerId);

      // only save to database if this is the first run
      if (!hasExistingRun) {
        await submitRun(currentLevelId, playerId, moves, true);
      }

      // update localStorage if it's a new best (for display purposes)
      if (isNewBest) {
        setBestScoreInStorage(currentLevelId, moves);
        // update UI to show new best score
        renderer.updateBestScoreDisplay();
      }

      // show success popup only on first play
      if (!hasExistingRun) {
        showSuccessPopup(dayNumber, moves, currentLevelId);
      }
    } catch (error) {
      console.error("Error submitting run:", error);
      // still show popup even if API call fails
      showSuccessPopup(dayNumber, moves, currentLevelId);
    }
  });

  // builder mode starts based off the day's level
  type BuilderTool =  "erase" | "wall" | "start" | "d1" | "d2" | "cust1" | "cust2" | "cust3";
  let builderMode = false;
  let builderData: LevelData = JSON.parse(
    JSON.stringify(currentLevelData),
  ) as LevelData;
  let builderTool: BuilderTool = "wall";

  const builderButton = document.getElementById(
    "builder-btn",
  ) as HTMLButtonElement | null;
  const builderPanel = document.getElementById(
    "builder-panel",
  ) as HTMLDivElement | null;
  const builderStatusEl = document.getElementById(
    "builder-status",
  ) as HTMLDivElement | null;
  const toolButtons = Array.from(
    document.querySelectorAll(".builder-tool-btn"),
  ) as HTMLButtonElement[];
  const checkBtn = document.getElementById(
    "builder-check-btn",
  ) as HTMLButtonElement | null;
  const sidebarOrdersEl = document.getElementById(
    "orders",
  ) as HTMLUListElement | null;

  const setBuilderStatus = (text: string) => {
    if (builderStatusEl) builderStatusEl.textContent = text;
  };

  const applyToolActiveUI = () => {
    for (const btn of toolButtons) {
      const tool = btn.dataset.tool as BuilderTool | undefined;
      btn.classList.toggle("builder-tool-active", tool === builderTool);
    }
  };

  const normalizeOrders = () => {
    // ensure every customer has at least drink 1
    builderData.orders = {
      A: builderData.orders?.A?.length
        ? builderData.orders.A.slice(0, 2)
        : ["D1"],
      B: builderData.orders?.B?.length
        ? builderData.orders.B.slice(0, 2)
        : ["D1"],
      C: builderData.orders?.C?.length
        ? builderData.orders.C.slice(0, 2)
        : ["D1"],
    };
  };

  const rebuildPreview = () => {
    normalizeOrders();
    renderer.setState(initGame(buildLevel(builderData)));
    if (builderMode) {
      renderBuilderOrdersInSidebar();
    }
  };

  const renderBuilderOrdersInSidebar = () => {
    if (!sidebarOrdersEl) return;
    normalizeOrders();

    // replace normal orders list w button ver... idk if i like this approach but whatever

    const drinkIconSrc = (drink: "D1" | "D2") =>
      drink === "D1"
        ? "/src/assets/drink_a_item.png"
        : "/src/assets/drink_b_item.png";

    const renderDrinkButtonContent = (value: "D1" | "D2" | "") => {
      if (value === "") {
        const placeholder = document.createElement("div");
        placeholder.className = "builder-none-placeholder";
        placeholder.setAttribute("aria-hidden", "true");
        return placeholder;
      }
      const img = document.createElement("img");
      img.src = drinkIconSrc(value);
      img.alt = value;
      img.className = "drink-item-icon";
      return img;
    };

    const makeDrinkButton = (
      value: "D1" | "D2" | "",
      allowNone: boolean,
      onPick: (v: "D1" | "D2" | "") => void,
    ) => {
      const btn = document.createElement("button");
      btn.className = "game-button builder-drink-btn";
      btn.type = "button";
      btn.ariaLabel = "pick drink";

      const setValue = (v: "D1" | "D2" | "") => {
        btn.innerHTML = "";
        btn.appendChild(renderDrinkButtonContent(v));
      };

      setValue(value);

      btn.addEventListener("click", () => {
        if (allowNone) {
          // cycle none -> D1 -> D2 -> none
          const next = value === "" ? "D1" : value === "D1" ? "D2" : "";
          value = next;
          setValue(value);
          onPick(value);
        } else {
          const next = value === "D1" ? "D2" : "D1";
          value = next;
          setValue(value);
          onPick(value);
        }
      });

      return btn;
    };

    const getCustomerSprite = (customerId: string): HTMLImageElement | null => {
      if (customerId === "A") return customerA;
      if (customerId === "B") return customerB;
      if (customerId === "C") return customerC;
      return null;
    };

    sidebarOrdersEl.innerHTML = "";

    for (const id of ["A", "B", "C"] as const) {
      const li = document.createElement("li");
      li.className = "order-item";

      const header = document.createElement("div");
      header.className = "order-header";
      header.textContent = `order #${id}`;

      const row = document.createElement("div");
      row.className = "order-row";

      const sprite = getCustomerSprite(id);
      const iconUrl = sprite ? getCustomerIconDataUrl(sprite, 2) : "";
      const icon = document.createElement("img");
      icon.src = iconUrl;
      icon.alt = id;
      icon.className = "customer-icon";

      const drinks = document.createElement("div");
      drinks.className = "drink-items";

      const first = builderData.orders[id][0] ?? "D1";
      const second = builderData.orders[id][1] ?? "";

      let a = first as "D1" | "D2";
      let b = second as "D1" | "D2" | "";

      const commit = () => {
        // write to builder data and rebuild preview
        builderData.orders[id] = b ? [a, b] : [a];
        rebuildPreview();
        setBuilderStatus("edited! check again");
      };

      const btn1 = makeDrinkButton(a, false, (v) => {
        a = v as "D1" | "D2";
        commit();
      });
      const btn2 = makeDrinkButton(b, true, (v) => {
        b = v;
        commit();
      });

      drinks.appendChild(btn1);
      drinks.appendChild(btn2);

      row.appendChild(icon);
      row.appendChild(drinks);

      li.appendChild(header);
      li.appendChild(row);

      sidebarOrdersEl.appendChild(li);
    }
  };

  const posKey = (p: Pos) => `${p.x},${p.y}`;
  const removeAt = (p: Pos) => {
    const key = posKey(p);
    builderData.walls = builderData.walls.filter(
      (w) => `${w.x},${w.y}` !== key,
    );
    builderData.drinkStations = builderData.drinkStations.filter(
      (d) => `${d.x},${d.y}` !== key,
    );
    builderData.customers = builderData.customers.filter(
      (c) => `${c.x},${c.y}` !== key,
    );
  };

  const toggleWallAt = (p: Pos) => {
    const key = posKey(p);
    if (key === posKey(builderData.start)) {
      setBuilderStatus("start tile can’t be a wall");
      return;
    }
    const has = builderData.walls.some((w) => `${w.x},${w.y}` === key);
    if (has)
      builderData.walls = builderData.walls.filter(
        (w) => `${w.x},${w.y}` !== key,
      );
    else {
      removeAt(p);
      builderData.walls = [...builderData.walls, { x: p.x, y: p.y }];
    }
  };

  const setStartAt = (p: Pos) => {
    removeAt(p);
    builderData.start = { x: p.x, y: p.y };
  };

  const setDrinkAt = (p: Pos, drink: "D1" | "D2") => {
    const key = posKey(p);
    if (key === posKey(builderData.start)) {
      // allow start to overlap station (pickup immediately)
    }
    // remove wall/customer; station can overwrite station
    builderData.walls = builderData.walls.filter(
      (w) => `${w.x},${w.y}` !== key,
    );
    builderData.customers = builderData.customers.filter(
      (c) => `${c.x},${c.y}` !== key,
    );
    builderData.drinkStations = builderData.drinkStations.filter(
      (d) => `${d.x},${d.y}` !== key,
    );
    builderData.drinkStations = [
      ...builderData.drinkStations,
      { x: p.x, y: p.y, drink },
    ];
  };

  const setCustomerAt = (p: Pos, id: "A" | "B" | "C") => {
    const key = posKey(p);
    if (key === posKey(builderData.start)) {
      setBuilderStatus("can't place a customer on start");
      return;
    }
    // remove wall/station at tile
    builderData.walls = builderData.walls.filter(
      (w) => `${w.x},${w.y}` !== key,
    );
    builderData.drinkStations = builderData.drinkStations.filter(
      (d) => `${d.x},${d.y}` !== key,
    );

    // if clicking same customer, toggle standHere
    const existingHere = builderData.customers.find(
      (c) => `${c.x},${c.y}` === key,
    );
    if (existingHere && existingHere.id === id) {
      existingHere.standHere =
        existingHere.standHere === "left" ? "right" : "left";
      return;
    }

    // remove any other customer at tile
    builderData.customers = builderData.customers.filter(
      (c) => `${c.x},${c.y}` !== key,
    );
    // ensure unique per id
    builderData.customers = builderData.customers.filter((c) => c.id !== id);
    builderData.customers = [
      ...builderData.customers,
      { x: p.x, y: p.y, id, standHere: "left" },
    ];
  };

  const handleBuildTileClick = (p: Pos) => {
    if (!builderMode) return;
    if (!inBounds(builderData.width, builderData.height, p)) return;

    switch (builderTool) {
      case "erase":
        removeAt(p);
        break;
      case "wall":
        toggleWallAt(p);
        break;
      case "start":
        setStartAt(p);
        break;
      case "d1":
        setDrinkAt(p, "D1");
        break;
      case "d2":
        setDrinkAt(p, "D2");
        break;
      case "cust1":
        setCustomerAt(p, "A");
        break;
      case "cust2":
        setCustomerAt(p, "B");
        break;
      case "cust3":
        setCustomerAt(p, "C");
        break;
    }

    rebuildPreview();
    setBuilderStatus("edited! check again");
  };

  for (const btn of toolButtons) {
    btn.addEventListener("click", () => {
      const tool = btn.dataset.tool as BuilderTool | undefined;
      if (!tool) return;
      builderTool = tool;
      applyToolActiveUI();
    });
  }

  const checkSolvableNow = () => {
    // first validate for quick immediate errors. Then bfs algo (slowerish)
    const validation = validateLevelData(builderData);
    if (!validation.ok) {
      setBuilderStatus(`invalid:\n${validation.errors.join("\n")}`);
      return;
    }

    const built = buildLevel(builderData);
    const solved = solveLevel(built);
    if (solved.solvable) {
      setBuilderStatus(`solvable! (searched ${solved.visitedStates} states)`);
    } else {
      setBuilderStatus(
        `not solvable (searched ${solved.visitedStates} states)`,
      );
    }
  };

  if (checkBtn) {
    checkBtn.addEventListener("click", () => {
      if (!builderMode) return;
      checkSolvableNow();
    });
  }

  const enterBuilderMode = () => {
    builderMode = true;
    builderData = JSON.parse(JSON.stringify(currentLevelData)) as LevelData;
    builderTool = "wall";

    renderer.hideFailurePopup();
    renderer.setUIMode("build");
    renderer.setOnBuildTileClick(handleBuildTileClick);

    if (builderPanel) builderPanel.style.display = "block";
    applyToolActiveUI();
    renderBuilderOrdersInSidebar();
    rebuildPreview();
    setBuilderStatus("builder mode. click tiles to edit");
  };

  const exitBuilderMode = () => {
    builderMode = false;
    renderer.setOnBuildTileClick(null);
    renderer.setUIMode("play");
    if (builderPanel) builderPanel.style.display = "none";

    // keep playing the level you just built if leave
    currentLevelData = JSON.parse(JSON.stringify(builderData)) as LevelData;
    renderer.setState(initGame(buildLevel(currentLevelData)));

    const dayTextEl2 = document.getElementById("day-text");
    if (dayTextEl2) dayTextEl2.textContent = "your level";
  };

  if (builderButton) {
    builderButton.addEventListener("click", () => {
      if (builderMode) exitBuilderMode();
      else enterBuilderMode();
    });
  }

  // setup buttons
  const runButton = document.getElementById("run-btn");
  const retryButton = document.getElementById("retry-btn");

  if (runButton) {
    runButton.addEventListener("click", () => {
      const currentState = renderer.getState();
      if (currentState.status !== "idle") return;
      renderer.hideFailurePopup();
      const newState = {
        ...currentState,
        status: "running" as const,
        message: "running...",
      };
      renderer.setState(newState);
    });
  }

  if (retryButton) {
    retryButton.addEventListener("click", () => {
      const currentState = renderer.getState();
      if (currentState.status === "running") return;
      renderer.hideFailurePopup();
      const newState = clearPath(currentState);
      renderer.setState(newState);
    });
  }

  // setup popup retry button
  const popupRetryButton = document.getElementById("popup-retry-btn");
  if (popupRetryButton) {
    popupRetryButton.addEventListener("click", () => {
      renderer.hideFailurePopup();
      const currentState = renderer.getState();
      const newState = clearPath(currentState);
      renderer.setState(newState);
    });
  }

  // setup success popup close button
  const successPopupCloseBtn = document.getElementById("success-popup-close-btn");
  if (successPopupCloseBtn) {
    successPopupCloseBtn.addEventListener("click", () => {
      hideSuccessPopup();
    });
  }

  // initial render and orders display
  renderer.render();
  renderer.updateUI();
}

init().catch(console.error);

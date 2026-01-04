import { type Pos } from "./engine/types";
import {
  clearPath,
  initGame,
  stepSimulation,
  tryAppendPath,
  type GameState,
} from "./engine/game";
import { buildLevel } from "./levels/loader";
import { getDailyLevelData } from "./levels/daily";
import { pathImagesLoaded, renderPath, renderPathArrow } from "./paths";
import "./style.css";

const TILE_SIZE = 32; // 16x16 pixel art scaled 2x for pixel-perfect rendering

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

const customerA = new Image();
customerA.src = "/src/assets/customer_a.png";

const customerB = new Image();
customerB.src = "/src/assets/customer_b.png";

const customerC = new Image();
customerC.src = "/src/assets/customer_c.png";

const standHere = new Image();
standHere.src = "/src/assets/stand_here.png";

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
]);

function inBounds(levelW: number, levelH: number, p: Pos): boolean {
  return p.x >= 0 && p.x < levelW && p.y >= 0 && p.y < levelH;
}

function getTilePos(canvas: HTMLCanvasElement, x: number, y: number): Pos | null {
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
    this.canvas.width = level.width * TILE_SIZE;
    this.canvas.height = level.height * TILE_SIZE;
    this.canvas.style.width = `${this.canvas.width}px`;
    this.canvas.style.height = `${this.canvas.height}px`;
    
    // disable image smoothing for crisp pixel art
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
      this.handlePointerDown({ clientX: touch.clientX, clientY: touch.clientY });
    });
    this.canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.handlePointerMove({ clientX: touch.clientX, clientY: touch.clientY });
    });
    this.canvas.addEventListener("touchend", () => this.stopDrawing());
  }

  private handlePointerDown(e: { clientX: number; clientY: number }) {
    if (this.state.status !== "idle") return;
    const pos = getTilePos(this.canvas, e.clientX, e.clientY);
    if (!pos) return;
    
    const last = this.state.path[this.state.path.length - 1] ?? this.state.level.start;
    if (pos.x !== last.x || pos.y !== last.y) return;
    
    this.isDrawing = true;
  }

  private handlePointerMove(e: { clientX: number; clientY: number }) {
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
  }

  private handleHover(e: { clientX: number; clientY: number }) {
    const pos = getTilePos(this.canvas, e.clientX, e.clientY);
    if (pos && inBounds(this.state.level.width, this.state.level.height, pos)) {
      if (this.hoverTile?.x !== pos.x || this.hoverTile?.y !== pos.y) {
        this.hoverTile = pos;
        this.render();
      }
    } else {
      if (this.hoverTile !== null) {
        this.hoverTile = null;
        this.render();
      }
    }
  }

  public getState(): GameState {
    return this.state;
  }

  public setState(newState: GameState) {
    this.state = newState;
    this.render();
    this.updateUI();
    this.startSimulation();
  }

  private startSimulation() {
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
        frameIndex * frameWidth, 0, frameWidth, standHeight,
        px, py, TILE_SIZE, TILE_SIZE
      );
    }
    
    // draw customers
    for (const [key, customerId] of Object.entries(level.customers)) {
      const [x, y] = key.split(",").map(Number);
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;
      
      // Ok wait is there a better way to do this or are we just gonna have a million diff customers in this
      // big ahh if statement......
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
        sourceX, sourceY, spriteWidth, spriteHeight,
        px, py, TILE_SIZE, TILE_SIZE
      );
    }
    
    // draw path with directional sprites and gradient overlay
    renderPath(ctx, this.tempCtx, this.state, this.animationFrame);
    
    // draw path arrow on the last tile (current point user is on)
    renderPathArrow(ctx, this.state, this.animationFrame);
    
    // draw glorbo (on top of path)
    const gx = glorboPos.x * TILE_SIZE;
    const gy = glorboPos.y * TILE_SIZE;
    
    // determine which sprite to use based on inventory count
    const drinkCount = this.state.inventory.length;
    const spriteIndex = Math.min(drinkCount, 2); // 0, 1, or 2
    
    // sprite sheet is divided into 3 equal parts horizontally
    const spriteSheetWidth = glorboSpriteSheet.width;
    const spriteSheetHeight = glorboSpriteSheet.height;
    const spriteWidth = spriteSheetWidth / 3;
    
    // draw the appropriate third of the sprite sheet
    ctx.drawImage(
      glorboSpriteSheet,
      spriteIndex * spriteWidth, 0, spriteWidth, spriteSheetHeight, // source rectangle
      gx, gy, TILE_SIZE, TILE_SIZE // destination rectangle
    );
    
    // draw hover sprite on hovered tile (only during idle state)
    if (this.state.status === "idle" && this.hoverTile) {
      const hx = this.hoverTile.x * TILE_SIZE;
      const hy = this.hoverTile.y * TILE_SIZE;
      
      // check if tile is unwalkable (wall or customer)
      const hoverKey = `${this.hoverTile.x},${this.hoverTile.y}`;
      const isUnwalkable = this.state.level.walls.has(hoverKey) || 
                          this.state.level.customers[hoverKey];
      
      // use hover_nope for unwalkable tiles, hover for walkable tiles
      const spriteToUse = isUnwalkable ? hoverNopeSprite : hoverSprite;
      
      // hover sprite has 2 frames split in half horizontally
      const hoverWidth = spriteToUse.width;
      const hoverHeight = spriteToUse.height;
      const frameWidth = hoverWidth / 2;
      // stay on second frame (index 1) when dragging, otherwise animate
      const frameIndex = this.isDrawing ? 1 : (this.animationFrame % 2);
      
      // draw the appropriate frame
      ctx.drawImage(
        spriteToUse,
        frameIndex * frameWidth, 0, frameWidth, hoverHeight, // source rectangle
        hx, hy, TILE_SIZE, TILE_SIZE // destination rectangle
      );
    }
  }

  public updateUI() {
    const stepsEl = document.getElementById("steps");
    const messageEl = document.getElementById("message");
    const pathEl = document.getElementById("path");
    const inventoryEl = document.getElementById("inventory");
    const servedEl = document.getElementById("served");
    const runButton = document.getElementById("run-btn") as HTMLButtonElement;
    const retryButton = document.getElementById("retry-btn") as HTMLButtonElement;
    
    if (stepsEl) stepsEl.textContent = `steps: ${this.state.stepsTaken}`;
    if (messageEl) messageEl.textContent = this.state.message || "";
    
    if (pathEl) {
      const pathLabel = this.state.path.map((p) => `(${p.x},${p.y})`).join(" → ");
      pathEl.textContent = `ur path: ${pathLabel}`;
    }
    
    if (inventoryEl) {
      inventoryEl.textContent = `in hand: ${this.state.inventory.join(", ") || "(empty)"}`;
    }
    
    if (servedEl) {
      const entries = Object.entries(this.state.served).map(
        ([k, v]) => `${k}:${v ? "✅" : "❌"}`
      );
      servedEl.textContent = `served: ${entries.join("  ")}`;
    }
    
    if (runButton) {
      runButton.disabled = this.state.status !== "idle";
    }
    
    if (retryButton) {
      retryButton.disabled = this.state.status === "running";
    }
  }
}

// initialize game
async function init() {
  await imagesLoaded;
  
  const level = buildLevel(getDailyLevelData());
  const state = initGame(level);
  
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
  if (!canvas) throw new Error("no canvas found");
  
  const renderer = new GameRenderer(canvas, state);
  
  // setup buttons
  const runButton = document.getElementById("run-btn");
  const retryButton = document.getElementById("retry-btn");
  
  if (runButton) {
    runButton.addEventListener("click", () => {
      const currentState = renderer.getState();
      if (currentState.status !== "idle") return;
      const newState = { ...currentState, status: "running" as const, message: "Running..." };
      renderer.setState(newState);
    });
  }
  
  if (retryButton) {
    retryButton.addEventListener("click", () => {
      const currentState = renderer.getState();
      if (currentState.status === "running") return;
      const newState = clearPath(currentState);
      renderer.setState(newState);
    });
  }
  
  // setup orders display
  const ordersEl = document.getElementById("orders");
  if (ordersEl) {
    const entries = Object.entries(level.orders);
    entries.sort(([a], [b]) => a.localeCompare(b));
    const ordersList = entries.map(([customerId, drinks]) => {
      const label = drinks.length ? drinks.join(" + ") : "(none)";
      return `${customerId} → ${label}`;
    });
    ordersEl.innerHTML = ordersList.map((line) => `<li>${line}</li>`).join("");
  }
  
  // initial render
  renderer.render();
  renderer.updateUI();
}

init().catch(console.error);

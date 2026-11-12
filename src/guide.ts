import type { GameState } from './engine/game';
import { findDrops, type Drop } from './engine/simulate';
import { solveLevel } from './engine/solver';
import { keyOf, type CustomerId, type DrinkId, type Pos } from './engine/types';
import { TILE_SIZE } from './config/constants';
import {
  getHoverLabel,
  isOrdersCalloutOpen,
  setChecklistProgress,
  evaluateChecklist,
  setHoverLabel,
  showCursorTooltip,
  type TutorialLesson,
} from './tutorial';

// in-game guidance layered on top of the renderer:
//   every level: "thanks!" pops, customer <-> order and item <-> station linking, wrong-input tooltips, failure details
//   tutorial only: ghost path, glorbo / goal highlight, checklist, "you'll drop this" preview

export type GuideRenderer = {
  getState(): GameState;
  isDrawingPath(): boolean;
  requestRender(): void;
  setOverlayRenderer(
    fn: ((ctx: CanvasRenderingContext2D, state: GameState, animFrame: number) => void) | null
  ): void;
  setOnUIUpdate(fn: ((state: GameState) => void) | null): void;
  setOnInputRejected(
    fn: ((kind: 'start' | 'blocked', clientX: number, clientY: number) => void) | null
  ): void;
  setOnHover(fn: ((pos: Pos | null, clientX: number, clientY: number) => void) | null): void;
};

export type GuideDeps = {
  renderer: GuideRenderer;
  canvas: HTMLCanvasElement;
  customerIcon: (id: CustomerId) => string; // image url
  itemIcon: (id: DrinkId) => string; // image url
};

const HIGHLIGHT = '#ffffff';
const DANGER = '#ff4d6d';
const GHOST_STEP_MS = 160;

let deps: GuideDeps | null = null;
let lesson: TutorialLesson | null = null; // null outside the tutorial
let ghostPath: Pos[] = [];
let ghostTimer: number | null = null;
let linkedCustomer: CustomerId | null = null;
let linkedItem: DrinkId | null = null; // hovered order item or station

let prevStatus: GameState['status'] | null = null;
let prevRemaining: Record<string, number> = {};
let prevPathKey = '';
let drops: Drop[] = [];

const bubbleLayer = (): HTMLElement => {
  let el = document.getElementById('guide-bubbles');
  if (!el) {
    el = document.createElement('div');
    el.id = 'guide-bubbles';
    document.body.appendChild(el);
  }
  return el;
};

// ── simulation helpers ──

// ── positioning ──

function tileToClient(state: GameState, pos: Pos): { x: number; top: number } | null {
  if (!deps) return null;
  const rect = deps.canvas.getBoundingClientRect();
  const tw = rect.width / state.level.width;
  const th = rect.height / state.level.height;
  return { x: rect.left + (pos.x + 0.5) * tw, top: rect.top + pos.y * th };
}

function placeBubble(el: HTMLElement, state: GameState, pos: Pos) {
  const p = tileToClient(state, pos);
  if (!p) return;
  el.style.left = `${p.x + window.scrollX}px`;
  el.style.top = `${p.top + window.scrollY}px`;
}

function iconImg(src: string, alt: string): string {
  return `<img class="guide-icon" src="${src}" alt="${alt}" />`;
}

// ── drop preview bubbles (tutorial) ──

function renderDropBubbles(state: GameState) {
  const layer = bubbleLayer();
  layer.querySelectorAll('.guide-bubble--drop').forEach((el) => el.remove());
  if (!deps) return;
  for (const drop of drops) {
    const el = document.createElement('div');
    el.className = 'guide-bubble guide-bubble--drop';
    el.innerHTML = `drops ${iconImg(deps.itemIcon(drop.item), drop.item)}`;
    layer.appendChild(el);
    placeBubble(el, state, drop.pos);
    (el as HTMLElement & { _pos?: Pos })._pos = drop.pos;
  }
}

function repositionBubbles() {
  if (!deps) return;
  const state = deps.renderer.getState();
  bubbleLayer()
    .querySelectorAll<HTMLElement & { _pos?: Pos }>('.guide-bubble')
    .forEach((el) => {
      if (el._pos) placeBubble(el, state, el._pos);
    });
}

// ── item bubbles: the order's icon over every station that has it ──

function renderItemBubbles() {
  const layer = bubbleLayer();
  layer.querySelectorAll('.guide-bubble--item').forEach((el) => el.remove());
  if (!deps || !linkedItem) return;
  const state = deps.renderer.getState();
  for (const [key, id] of Object.entries(state.level.drinkStations)) {
    if (id !== linkedItem) continue;
    const el = document.createElement('div') as HTMLElement & { _pos?: Pos };
    el.className = 'guide-bubble guide-bubble--item';
    el.innerHTML = iconImg(deps.itemIcon(id), id);
    el._pos = keyToPos(key);
    layer.appendChild(el);
    placeBubble(el, state, el._pos);
  }
}

// ── "thanks!" pops (every level) ──

function popThanks(state: GameState, customerId: CustomerId) {
  const key = Object.entries(state.level.customers).find(([, id]) => id === customerId)?.[0];
  if (!key) return;
  const [x, y] = key.split(',').map(Number);
  const el = document.createElement('div') as HTMLElement & { _pos?: Pos };
  el.className = 'guide-bubble guide-bubble--thanks';
  el.textContent = 'thanks!';
  el._pos = { x, y };
  bubbleLayer().appendChild(el);
  placeBubble(el, state, el._pos);
  window.setTimeout(() => el.remove(), 1200);
}

// ── failure details (every level) ──

function fillFailureDetails(state: GameState) {
  const el = document.getElementById('failure-details');
  if (!el || !deps) return;

  const lines: string[] = [];
  for (const [id, remaining] of Object.entries(state.remainingOrders) as [
    CustomerId,
    DrinkId[],
  ][]) {
    if (!remaining.length || !state.level.orders[id]) continue;
    const items = remaining.map((d) => iconImg(deps!.itemIcon(d), d)).join('');
    lines.push(
      `<div class="failure-line">${iconImg(deps.customerIcon(id), id)} still wants ${items}</div>`
    );
  }
  const dropped = findDrops(state, state.path);
  if (dropped.length) {
    const items = dropped.map((d) => iconImg(deps!.itemIcon(d.item), d.item)).join('');
    lines.push(`<div class="failure-line">you dropped ${items}</div>`);
  }
  el.innerHTML = lines.join('');
}

function clearFailureDetails() {
  const el = document.getElementById('failure-details');
  if (el) el.innerHTML = '';
}

// ── customer <-> order linking (every level) ──

function applyOrderLink() {
  document.querySelectorAll<HTMLElement>('#orders .order-item').forEach((li) => {
    li.classList.toggle('is-linked', li.dataset.customerId === linkedCustomer);
  });
  document.querySelectorAll<HTMLElement>('#orders .drink-item-icon').forEach((img) => {
    img.classList.toggle('is-item-linked', !!linkedItem && img.dataset.drinkId === linkedItem);
  });
}

// order item <-> station on the board
function setLinkedItem(id: DrinkId | null) {
  if (id === linkedItem) return;
  linkedItem = id;
  applyOrderLink();
  renderItemBubbles();
  deps?.renderer.requestRender();
}

function setLinkedCustomer(id: CustomerId | null) {
  if (id === linkedCustomer) return;
  linkedCustomer = id;
  applyOrderLink();
  deps?.renderer.requestRender();
}

// ── canvas overlay ──

// every outline is LINE_PX screen pixels thick no matter how big the board is drawn.
// "pulse" steps the outline outward by its own width instead of making it thicker.
const LINE_PX = 3;

function strokeTile(ctx: CanvasRenderingContext2D, pos: Pos, color: string, pulse: boolean) {
  const state = deps?.renderer.getState();
  const rect = deps?.canvas.getBoundingClientRect();
  const unitsPerPx =
    state && rect && rect.width > 0 ? (state.level.width * TILE_SIZE) / rect.width : 1;
  const w = LINE_PX * unitsPerPx;
  const inset = pulse ? 0 : w;
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.strokeRect(
    pos.x * TILE_SIZE + inset + w / 2,
    pos.y * TILE_SIZE + inset + w / 2,
    TILE_SIZE - 2 * inset - w,
    TILE_SIZE - 2 * inset - w
  );
}

function ghostVisible(state: GameState): boolean {
  return (
    !!lesson?.ghostPath &&
    !isOrdersCalloutOpen() &&
    ghostPath.length > 1 &&
    state.status === 'idle' &&
    state.path.length <= 1 &&
    !deps?.renderer.isDrawingPath()
  );
}

function drawOverlay(ctx: CanvasRenderingContext2D, state: GameState, animFrame: number) {
  const thick = animFrame === 1;

  // ghost path: dots appear one tile at a time, hold, then start over
  if (ghostVisible(state)) {
    const cycle = ghostPath.length + 4;
    const shown = Math.floor(performance.now() / GHOST_STEP_MS) % cycle;
    ctx.fillStyle = HIGHLIGHT;
    for (let i = 1; i < Math.min(shown + 1, ghostPath.length); i++) {
      const p = ghostPath[i];
      const size = 8;
      ctx.fillRect(
        p.x * TILE_SIZE + TILE_SIZE / 2 - size / 2,
        p.y * TILE_SIZE + TILE_SIZE / 2 - size / 2,
        size,
        size
      );
    }
  }

  // checklist goal (glorbo first, then the tea, then the sparkle)
  if (lesson && state.status === 'idle' && !isOrdersCalloutOpen()) {
    const { goal } = evaluateChecklist(lesson, state);
    if (goal) strokeTile(ctx, goal, HIGHLIGHT, thick);
  }

  // tiles where the drawn path would knock something out of your hands
  if (lesson && state.status === 'idle') {
    for (const drop of drops) strokeTile(ctx, drop.pos, DANGER, thick);
  }

  // hovered customer / order card: outline the customer and their spot
  if (linkedCustomer) {
    for (const [key, id] of Object.entries(state.level.customers)) {
      if (id === linkedCustomer) strokeTile(ctx, keyToPos(key), HIGHLIGHT, thick);
    }
    for (const [key, id] of Object.entries(state.level.standHere)) {
      if (id === linkedCustomer) strokeTile(ctx, keyToPos(key), HIGHLIGHT, thick);
    }
  }

  // hovered order item or station: outline every station that has it
  if (linkedItem) {
    for (const [key, id] of Object.entries(state.level.drinkStations)) {
      if (id === linkedItem) strokeTile(ctx, keyToPos(key), HIGHLIGHT, thick);
    }
  }
}

const keyToPos = (key: string): Pos => {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
};

function syncGhostTimer() {
  const state = deps?.renderer.getState();
  const want = !!state && ghostVisible(state);
  if (want && ghostTimer === null) {
    ghostTimer = window.setInterval(() => deps?.renderer.requestRender(), GHOST_STEP_MS);
  } else if (!want && ghostTimer !== null) {
    window.clearInterval(ghostTimer);
    ghostTimer = null;
    deps?.renderer.requestRender();
  }
}

// ── state updates ──

function onUpdate(state: GameState) {
  const remaining: Record<string, number> = {};
  for (const [id, items] of Object.entries(state.remainingOrders)) remaining[id] = items.length;

  // someone just got their whole order
  if (state.status === 'running' || state.status === 'success') {
    for (const [id, count] of Object.entries(remaining)) {
      if (count === 0 && (prevRemaining[id] ?? 0) > 0) popThanks(state, id as CustomerId);
    }
  }

  if (state.status === 'failed' && prevStatus !== 'failed') fillFailureDetails(state);
  if (state.status === 'idle' && prevStatus !== 'idle') clearFailureDetails();

  // recompute the drop preview when the drawn path changes (tutorial only)
  const pathKey = state.status + '|' + state.path.map(keyOf).join(' ');
  if (pathKey !== prevPathKey) {
    prevPathKey = pathKey;
    drops = lesson && state.status === 'idle' ? findDrops(state, state.path) : [];
    renderDropBubbles(state);
  }

  if (lesson) setChecklistProgress(evaluateChecklist(lesson, state));

  applyOrderLink();
  syncGhostTimer();

  prevStatus = state.status;
  prevRemaining = remaining;
}

// ── public api ──

export function initGuide(d: GuideDeps): void {
  deps = d;
  const { renderer } = d;

  renderer.setOverlayRenderer(drawOverlay);
  renderer.setOnUIUpdate(onUpdate);

  renderer.setOnInputRejected((kind, x, y) => {
    const state = renderer.getState();
    if (kind === 'blocked') showCursorTooltip("can't walk there", x, y);
    else if (state.path.length <= 1) showCursorTooltip('drag from glorbo!', x, y);
    else showCursorTooltip('drag from the end of your path!', x, y);
  });

  renderer.setOnHover((pos, x, y) => {
    const state = renderer.getState();
    const id = pos ? (state.level.customers[keyOf(pos)] as CustomerId | undefined) : undefined;
    setLinkedCustomer(id ?? null);
    const item = pos ? (state.level.drinkStations[keyOf(pos)] as DrinkId | undefined) : undefined;
    setLinkedItem(item ?? null);

    if (lesson?.hoverLabels && pos) setHoverLabel(getHoverLabel(state, pos), x, y);
    else setHoverLabel(null, x, y);
  });

  // hovering an order card lights up that customer on the board
  const ordersEl = document.getElementById('orders');
  ordersEl?.addEventListener('mouseover', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('.order-item');
    setLinkedCustomer((li?.dataset.customerId as CustomerId | undefined) ?? null);
    const img = (e.target as HTMLElement).closest<HTMLElement>('.drink-item-icon');
    setLinkedItem((img?.dataset.drinkId as DrinkId | undefined) ?? null);
  });
  ordersEl?.addEventListener('mouseleave', () => {
    setLinkedCustomer(null);
    setLinkedItem(null);
  });

  window.addEventListener('resize', repositionBubbles);
  window.addEventListener('scroll', repositionBubbles, { passive: true });
}

// call whenever the level changes; pass the lesson in the tutorial, null otherwise
export function setGuideLesson(next: TutorialLesson | null): void {
  lesson = next;
  ghostPath = [];
  if (next?.ghostPath && deps) {
    const result = solveLevel(deps.renderer.getState().level);
    if (result.solvable) ghostPath = result.path;
  }
  prevPathKey = '';
  prevStatus = null;
  linkedCustomer = null;
  linkedItem = null;
  bubbleLayer().innerHTML = '';
  if (deps) onUpdate(deps.renderer.getState());
  deps?.renderer.requestRender();
}

// re-run the guide after something outside the game state changed (e.g. the orders callout closed)
export function refreshGuide(): void {
  if (!deps) return;
  onUpdate(deps.renderer.getState());
  deps.renderer.requestRender();
}

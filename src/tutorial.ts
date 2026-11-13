import type { LevelData } from './levels/level.schema';
import type { GameState } from './engine/game';
import { findDrops, simulatePath } from './engine/simulate';
import {
  keyOf,
  samePos,
  type CustomerId,
  type DrinkId,
  type Level,
  type Pos,
} from './engine/types';
import { CUSTOMERS, DRINKS } from './config/items';
import { borderWalls, findKeyWithValue, posOfKey } from './util/grid';
import { setDisplayById } from './ui/dom';
import { GLORBO_SHEET, spriteIcon } from './ui/icons';

// playable tutorial at /tutorial. each lesson is a tiny level that teaches one rule

// what a checklist item can ask about the drawn path (played through the real engine)
export type ChecklistCtx = {
  state: GameState;
  visited: (drink: DrinkId) => boolean; // path steps on that station
  served: (id: CustomerId) => boolean; // that customer ends up with their whole order
  dropped: boolean; // something gets knocked out of your hands
};

export type ChecklistItem = {
  label: string; // html allowed
  done: (c: ChecklistCtx) => boolean;
  tile?: (level: Level) => Pos | null; // outlined on the board while this is the current goal
};

export type TutorialLesson = {
  title: string;
  note?: string; // one short line above the checklist, html allowed
  checklist: ChecklistItem[];
  failText: string; // hint line in the failure popup
  showPar?: boolean; // compare against the solver's optimal
  pointAtOrders?: boolean; // show the "this is a customer's order" callout
  hoverLabels?: boolean; // hovering glorbo / stations / customers says what they are
  ghostPath?: boolean; // animate the solution path until the player starts drawing
  data: LevelData;
};

// orders only list the customers present in the lesson; the engine treats missing ones as served
type LessonLevel = Omit<LevelData, 'walls' | 'orders' | 'width' | 'height'> & {
  width?: number;
  height?: number;
  orders: Partial<LevelData['orders']>;
};

// lessons default to an 8x6 room
function lessonLevel({ id, width = 8, height = 6, ...level }: LessonLevel): LevelData {
  return {
    id,
    width,
    height,
    ...level,
    walls: borderWalls(width, height),
    orders: level.orders as LevelData['orders'],
  };
}

// ── inline icons ──

// glorbo's first frame from the sprite sheet, same crop the how-to-play popup uses
const GLORBO_ICON = spriteIcon(GLORBO_SHEET, '300%', '200%', 'glorbo');

// a station as it looks on the board
const stationIcon = (drink: DrinkId, alt: string) =>
  spriteIcon(DRINKS[drink].spritePath, '100%', '100%', alt, true);

const STATION_ICONS: Record<DrinkId, string> = {
  D1: stationIcon('D1', 'purple tea'),
  D2: stationIcon('D2', 'orange drink'),
  F1: stationIcon('F1', 'food'),
  F2: stationIcon('F2', 'food'),
  F3: stationIcon('F3', 'food'),
};

// customer's waiting frame (top-left of their 2x2 sheet)
const customerIcon = (id: CustomerId) =>
  spriteIcon(CUSTOMERS[id].spritePath, '200%', '200%', 'customer');

// the sparkly stand-here tile (first frame of its 2-frame sheet)
const STAND_SPOT_ICON = spriteIcon('/img/stand_here.png', '200%', '100%', 'sparkly spot');

const hl = (t: string) => `<span class='tutorial-hl'>${t}</span>`;

// ── checklist building blocks ──

const tileWith =
  <V>(pick: (level: Level) => Record<string, V>, value: V) =>
  (level: Level): Pos | null => {
    const key = findKeyWithValue(pick(level), value);
    return key ? posOfKey(key) : null;
  };

const stationTile = (drink: DrinkId) => tileWith((l) => l.drinkStations, drink);

const spotTile = (id: CustomerId) => tileWith((l) => l.standHere, id);

const grab = (drink: DrinkId): ChecklistItem => ({
  label: `grab ${STATION_ICONS[drink]}`,
  done: (c) => c.visited(drink),
  tile: stationTile(drink),
});

const serve = (id: CustomerId): ChecklistItem => ({
  label: `serve ${customerIcon(id)}`,
  done: (c) => c.served(id),
  tile: spotTile(id),
});

const endOnSparkle = (id: CustomerId): ChecklistItem => ({
  ...serve(id),
  label: `end on the sparkle ${STAND_SPOT_ICON}`,
});

const serveWithoutHint = (id: CustomerId): ChecklistItem => ({ ...serve(id), tile: undefined });

const pressRun: ChecklistItem = {
  label: `press ${hl('run')}`,
  done: (c) => c.state.status === 'success',
};

// ── lessons ──

export const TUTORIAL_LESSONS: TutorialLesson[] = [
  {
    title: 'your first order',
    checklist: [
      {
        label: `drag from glorbo ${GLORBO_ICON}`,
        done: (c) => c.state.path.length > 1,
      },
      { ...grab('D1'), label: `walk over the tea ${STATION_ICONS.D1}` },
      endOnSparkle('A'),
      pressRun,
    ],
    failText: 'grab the tea, then end on the sparkle.',
    pointAtOrders: true,
    hoverLabels: true,
    ghostPath: true,
    data: lessonLevel({
      id: 'tutorial-1',
      start: { x: 1, y: 2 },
      obstacles: [{ x: 3, y: 4, type: 'plant_a' }],
      drinkStations: [{ x: 3, y: 2, drink: 'D1' }],
      customers: [{ x: 6, y: 2, id: 'A', standHere: 'left' }],
      orders: { A: ['D1'] },
    }),
  },
  {
    title: 'two items',
    note: `this order has ${hl('2 items')}.`,
    checklist: [grab('D2'), grab('F1'), endOnSparkle('A'), pressRun],
    failText: 'grab both items first.',
    data: lessonLevel({
      id: 'tutorial-2',
      start: { x: 1, y: 1 },
      obstacles: [{ x: 4, y: 2, type: 'plant_b' }],
      drinkStations: [
        { x: 3, y: 1, drink: 'D2' },
        { x: 2, y: 3, drink: 'F1' },
      ],
      customers: [{ x: 6, y: 3, id: 'A', standHere: 'left' }],
      orders: { A: ['D2', 'F1'] },
    }),
  },
  {
    title: 'hands full',
    note: `you can hold ${hl('2 things')}. a 3rd drops the ${hl('oldest')}.`,
    checklist: [grab('F1'), grab('D1'), endOnSparkle('A'), pressRun],
    failText: 'a 3rd item drops the oldest.',
    data: lessonLevel({
      id: 'tutorial-3',
      start: { x: 1, y: 2 },
      obstacles: [{ x: 3, y: 4, type: 'stool' }],
      drinkStations: [
        { x: 2, y: 2, drink: 'F1' },
        { x: 3, y: 2, drink: 'D2' },
        { x: 4, y: 2, drink: 'D1' },
      ],
      customers: [{ x: 6, y: 2, id: 'A', standHere: 'left' }],
      orders: { A: ['F1', 'D1'] },
    }),
  },
  {
    title: 'serve multiple customers',
    note: `${hl('walk past')} a sparkle ${STAND_SPOT_ICON} to serve.`,
    checklist: [grab('D1'), grab('F2'), serve('B'), serve('A'), pressRun],
    failText: 'walk through both sparkles.',
    data: lessonLevel({
      id: 'tutorial-4',
      start: { x: 1, y: 2 },
      obstacles: [{ x: 3, y: 1, type: 'plant_a' }],
      drinkStations: [
        { x: 2, y: 2, drink: 'D1' },
        { x: 2, y: 3, drink: 'F2' },
      ],
      customers: [
        { x: 6, y: 2, id: 'A', standHere: 'left' },
        { x: 4, y: 4, id: 'B', standHere: 'up' },
      ],
      orders: { A: ['D1'], B: ['F2'] },
    }),
  },
  {
    title: 'fewest steps',
    note: `use as ${hl('few steps')} as you can.`,
    // no tile hints here: this one is the real test
    checklist: [serveWithoutHint('A'), serveWithoutHint('B'), serveWithoutHint('C'), pressRun],
    failText: '2 items max. walk past sparkles to serve.',
    showPar: true,
    data: lessonLevel({
      id: 'tutorial-5',
      width: 9,
      height: 6,
      start: { x: 1, y: 1 },
      obstacles: [
        { x: 3, y: 2, type: 'plant_a' },
        { x: 3, y: 3, type: 'table_single' },
      ],
      drinkStations: [
        { x: 4, y: 1, drink: 'D1' },
        { x: 1, y: 4, drink: 'F3' },
        { x: 5, y: 3, drink: 'F2' },
      ],
      customers: [
        { x: 7, y: 1, id: 'A', standHere: 'left' },
        { x: 7, y: 3, id: 'B', standHere: 'left' },
        { x: 7, y: 4, id: 'C', standHere: 'left' },
      ],
      orders: { A: ['D1'], B: ['F2'], C: ['F3', 'F2'] },
    }),
  },
];

// ── checklist evaluation ──

export type ChecklistStatus = { done: boolean[]; current: number; goal: Pos | null };

export function evaluateChecklist(lesson: TutorialLesson, state: GameState): ChecklistStatus {
  const { level, path } = state;
  const final = simulatePath(state, path);
  const visitedKeys = new Set(path.slice(1).map(keyOf));
  const ctx: ChecklistCtx = {
    state,
    visited: (drink) =>
      Object.entries(level.drinkStations).some(([k, d]) => d === drink && visitedKeys.has(k)),
    served: (id) => (final.remainingOrders[id]?.length ?? 0) === 0,
    dropped: findDrops(state, path).length > 0,
  };
  const done = lesson.checklist.map((item) => item.done(ctx));
  const current = done.indexOf(false);
  const goal = current >= 0 ? (lesson.checklist[current].tile?.(level) ?? null) : null;
  return { done, current, goal };
}

export function isTutorialRoute(): boolean {
  return window.location.pathname.replace(/\/+$/, '') === '/tutorial';
}

// ?lesson=3 jumps to lesson 3 (1-based), handy for testing and for coming back later
export function getLessonIndexFromUrl(): number {
  const raw = new URLSearchParams(window.location.search).get('lesson');
  const n = raw ? parseInt(raw, 10) : 1;
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 1), TUTORIAL_LESSONS.length) - 1;
}

export function setLessonInUrl(index: number): void {
  const url = `/tutorial?lesson=${index + 1}`;
  if (window.location.pathname + window.location.search !== url) {
    history.replaceState(null, '', url);
  }
}

export function showTutorialBanner(index: number, par?: number): void {
  const banner = document.getElementById('tutorial-banner');
  const lesson = TUTORIAL_LESSONS[index];
  if (!banner || !lesson) return;

  const parHTML =
    lesson.showPar && par !== undefined
      ? `<div class="tutorial-banner-par">par: ${par} steps</div>`
      : '';

  // one rectangle per lesson: purple up to and including the current one, grey after
  const progressHTML = TUTORIAL_LESSONS.map(
    (_, i) => `<span class="tutorial-progress-step${i <= index ? ' is-done' : ''}"></span>`
  ).join('');

  const noteHTML = lesson.note ? `<p class="tutorial-banner-text">${lesson.note}</p>` : '';
  const bodyHTML =
    noteHTML +
    `<ul class="tutorial-checklist">${lesson.checklist
      .map(
        (item) => `<li><span class="tutorial-check" aria-hidden="true"></span>${item.label}</li>`
      )
      .join('')}</ul>`;

  banner.innerHTML =
    `<div class="tutorial-banner-progress" aria-label="lesson ${index + 1} of ${TUTORIAL_LESSONS.length}">${progressHTML}</div>` +
    `<div class="tutorial-banner-title">${lesson.title}</div>` +
    bodyHTML +
    parHTML;
  banner.style.display = '';
}

// lesson checklist: tick done items, mark the first unfinished one as the current goal
let lastChecklistStatus: ChecklistStatus | null = null;

export function setChecklistProgress(status: ChecklistStatus): void {
  lastChecklistStatus = status;
  // while the orders callout is up nothing is "current": the board is locked, so step 1 stays grey
  const current = isOrdersCalloutOpen() ? -1 : status.current;
  document
    .querySelectorAll<HTMLElement>('#tutorial-banner .tutorial-checklist li')
    .forEach((li, i) => {
      li.classList.toggle('is-done', status.done[i] === true);
      li.classList.toggle('is-current', i === current);
    });
}

export function hideTutorialBanner(): void {
  setDisplayById('tutorial-banner', 'none');
}

const DEFAULT_FAILURE_MESSAGE = 'not everyone got served.';

export function setFailureMessage(text: string | null): void {
  const el = document.querySelector('#failure-popup .popup-message');
  if (el) el.textContent = text ?? DEFAULT_FAILURE_MESSAGE;
}

type TutorialSuccessOptions = {
  index: number;
  moves: number;
  par?: number;
  onNext: () => void;
  onRetry: () => void;
};

export function showTutorialSuccess(opts: TutorialSuccessOptions): void {
  const popup = document.getElementById('tutorial-popup');
  const messageEl = document.getElementById('tutorial-popup-message');
  const nextBtn = document.getElementById('tutorial-popup-next-btn') as HTMLButtonElement | null;
  const retryBtn = document.getElementById('tutorial-popup-retry-btn') as HTMLButtonElement | null;
  if (!popup || !messageEl || !nextBtn || !retryBtn) return;

  const isLast = opts.index >= TUTORIAL_LESSONS.length - 1;
  const lesson = TUTORIAL_LESSONS[opts.index];

  let message = 'nice!';
  if (lesson?.showPar && opts.par !== undefined) {
    message =
      opts.moves <= opts.par
        ? `${opts.moves} steps. you hit par!`
        : `${opts.moves} steps. par is ${opts.par}.`;
  }
  if (isLast) message += "<br/>you're ready!";
  messageEl.innerHTML = message;

  nextBtn.textContent = isLast ? 'play' : 'next lesson';
  retryBtn.style.display = lesson?.showPar ? '' : 'none';

  const closeThen = (fn: () => void) => () => {
    hideTutorialSuccess();
    fn();
  };
  nextBtn.onclick = closeThen(opts.onNext);
  retryBtn.onclick = closeThen(opts.onRetry);

  popup.style.display = 'flex';
  const content = popup.querySelector<HTMLElement>('.popup-content');
  if (content) burstConfetti(content);
}

// pixel confetti + stars that pop out of the top of the popup
const CONFETTI_COLORS = ['var(--primary-color)', '#ffd23f', '#ff8fd0', '#5ce1e6', '#ffffff'];

function burstConfetti(container: HTMLElement): void {
  container.querySelectorAll('.confetti').forEach((el) => el.remove());
  const count = 22;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');
    const star = i % 3 === 0;
    el.className = star ? 'confetti confetti--star' : 'confetti';
    // spread across a fan above the popup, snapped to 4px so it stays pixel-y
    const angle = Math.PI * (0.1 + 0.8 * (i / (count - 1))) + (Math.random() - 0.5) * 0.3;
    const dist = 70 + Math.random() * 70;
    const snap = (n: number) => Math.round(n / 4) * 4;
    el.style.setProperty('--dx', `${snap(Math.cos(angle) * dist * 1.6)}px`);
    el.style.setProperty('--dy', `${snap(-Math.sin(angle) * dist)}px`);
    el.style.left = `${snap(10 + Math.random() * 80)}%`;
    el.style.color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    el.style.animationDelay = `${Math.floor(Math.random() * 3) * 80}ms`;
    container.appendChild(el);
  }
  window.setTimeout(
    () => container.querySelectorAll('.confetti').forEach((el) => el.remove()),
    1400
  );
}

export function hideTutorialSuccess(): void {
  setDisplayById('tutorial-popup', 'none');
}

// callout that points at the orders list until the player presses ok

let ordersCallout: HTMLDivElement | null = null;
let ordersCalloutDismissed = false;
let ordersCalloutObserver: ResizeObserver | null = null;

// one ok per page; drawing unlocks after the last one
type CalloutPage = { text: string; target: 'orders' | 'hands' };
const ORDERS_CALLOUT_PAGES: CalloutPage[] = [
  { text: "this is a customer's order!", target: 'orders' },
  {
    text: `these are your hands. walk over an item to pick it up and it shows up here!`,
    target: 'hands',
  },
  {
    text: `grab the ${hl('purple tea')} ${STATION_ICONS.D1} and bring it to them ${customerIcon('A')}`,
    target: 'orders',
  },
];
let calloutPage = 0;

const SPOTLIGHT: Record<CalloutPage['target'], { id: string; cls: string }> = {
  orders: { id: 'orders', cls: 'orders-spotlight' },
  hands: { id: 'inventory', cls: 'hands-spotlight' },
};

// stepped loop: grab tea, grab food, hand off the tea, hand off the food
const TEA = DRINKS.D1.itemSpritePath;
const FOOD = DRINKS.F1.itemSpritePath;
const HANDS_DEMO_FRAMES: (string | null)[][] = [
  [null, null],
  [TEA, null],
  [TEA, FOOD],
  [null, FOOD],
  [null, null],
];
const HANDS_DEMO_STEP_MS = 700;
let handsDemoTimer: number | null = null;
let handsDemoFrame = 0;

function renderHandsDemo(prev: (string | null)[], next: (string | null)[]): void {
  next.forEach((src, i) => {
    const slot = document.getElementById(`inventory-slot-${i}`);
    if (!slot) return;
    if (!src) {
      slot.innerHTML = '';
      return;
    }
    if (prev[i] === src && slot.querySelector('img')) return;
    slot.innerHTML = `<img src="${src}" alt="" class="inventory-drink-icon hands-demo-pop" />`;
  });
}

function syncHandsDemo(): void {
  const want = !!ordersCallout && ORDERS_CALLOUT_PAGES[calloutPage]?.target === 'hands';
  if (want && handsDemoTimer === null) {
    handsDemoFrame = 0;
    handsDemoTimer = window.setInterval(() => {
      const prev = HANDS_DEMO_FRAMES[handsDemoFrame];
      handsDemoFrame = (handsDemoFrame + 1) % HANDS_DEMO_FRAMES.length;
      renderHandsDemo(prev, HANDS_DEMO_FRAMES[handsDemoFrame]);
    }, HANDS_DEMO_STEP_MS);
  } else if (!want && handsDemoTimer !== null) {
    window.clearInterval(handsDemoTimer);
    handsDemoTimer = null;
    renderHandsDemo([], [null, null]); // the real inventory is empty before the first run
  }
}

function calloutTarget(): HTMLElement | null {
  const page = ORDERS_CALLOUT_PAGES[calloutPage];
  if (!page) return null;
  if (page.target === 'hands') return document.getElementById('inventory-slot-1');
  const ordersEl = document.getElementById('orders');
  return (ordersEl?.querySelector('.order-item') as HTMLElement | null) ?? ordersEl;
}

function applySpotlight(): void {
  const page = ORDERS_CALLOUT_PAGES[calloutPage];
  for (const [key, { id, cls }] of Object.entries(SPOTLIGHT)) {
    document.getElementById(id)?.classList.toggle(cls, !!ordersCallout && page?.target === key);
  }
}

function positionOrdersCallout(): void {
  const target = calloutTarget();
  if (!ordersCallout || !target) return;
  const rect = target.getBoundingClientRect();
  const box = ordersCallout.getBoundingClientRect();
  const gap = 14;
  const el = ordersCallout;
  el.classList.remove('orders-callout--left', 'orders-callout--right', 'orders-callout--above');

  const placeSide = (left: number, cls: string) => {
    const top = Math.min(
      Math.max(8, rect.top + rect.height / 2 - box.height / 2),
      window.innerHeight - box.height - 8
    );
    const arrowTop = Math.min(Math.max(16, rect.top + rect.height / 2 - top), box.height - 16);
    el.style.top = `${top + window.scrollY}px`;
    el.style.left = `${left + window.scrollX}px`;
    el.style.setProperty('--arrow-top', `${arrowTop}px`);
    el.classList.add(cls);
  };

  // desktop: orders get it on their left (over the board), hands on their right
  const page = ORDERS_CALLOUT_PAGES[calloutPage];
  if (page?.target === 'orders') {
    const left = rect.left - gap - box.width;
    if (left >= 8) return placeSide(left, 'orders-callout--left');
  } else {
    const left = rect.right + gap;
    if (left + box.width <= window.innerWidth - 8) return placeSide(left, 'orders-callout--right');
  }

  // otherwise below the target if it fits on screen, else above it
  const fitsBelow = rect.bottom + gap + box.height <= window.innerHeight;
  const top = fitsBelow ? rect.bottom + gap : rect.top - gap - box.height;
  const left = Math.min(
    Math.max(8, rect.left + rect.width / 2 - box.width / 2),
    window.innerWidth - box.width - 8
  );
  const arrowLeft = Math.min(Math.max(16, rect.left + 32 - left), box.width - 16);
  el.style.top = `${top + window.scrollY}px`;
  el.style.left = `${left + window.scrollX}px`;
  el.style.setProperty('--arrow-left', `${arrowLeft}px`);
  el.classList.toggle('orders-callout--above', !fitsBelow);
}

// returns true if the callout is (now) showing, so the caller can lock drawing until ok
export function showOrdersCallout(onDismiss?: () => void): boolean {
  if (ordersCalloutDismissed) return false;
  if (ordersCallout) return true;
  if (!document.getElementById('orders')) return false;

  document.getElementById('game-canvas')?.classList.add('is-locked'); // grey board until ok

  ordersCallout = document.createElement('div');
  ordersCallout.className = 'orders-callout';
  ordersCallout.setAttribute('role', 'dialog');
  ordersCallout.innerHTML =
    `<p class="orders-callout-text"></p>` +
    `<button type="button" class="game-button orders-callout-ok">ok</button>`;
  const textEl = ordersCallout.querySelector<HTMLElement>('.orders-callout-text')!;
  calloutPage = 0;
  textEl.innerHTML = ORDERS_CALLOUT_PAGES[calloutPage].text;
  syncHandsDemo();
  ordersCallout.querySelector('button')?.addEventListener('click', () => {
    calloutPage++;
    if (calloutPage < ORDERS_CALLOUT_PAGES.length) {
      textEl.innerHTML = ORDERS_CALLOUT_PAGES[calloutPage].text;
      applySpotlight();
      syncHandsDemo();
      positionOrdersCallout(); // new target, and the text can change the box height
      return;
    }
    ordersCalloutDismissed = true;
    hideOrdersCallout();
    onDismiss?.();
  });
  document.body.appendChild(ordersCallout);

  applySpotlight();
  positionOrdersCallout();
  window.addEventListener('resize', positionOrdersCallout);
  window.addEventListener('scroll', positionOrdersCallout, { passive: true });
  ordersCalloutObserver = new ResizeObserver(positionOrdersCallout);
  ordersCalloutObserver.observe(document.body);
  if (lastChecklistStatus) setChecklistProgress(lastChecklistStatus); // grey out step 1
  return true;
}

// shake the callout when someone tries to draw before pressing ok
export function nudgeOrdersCallout(): void {
  if (!ordersCallout) return;
  ordersCallout.classList.remove('is-nudging');
  void ordersCallout.offsetWidth; // restart the animation
  ordersCallout.classList.add('is-nudging');
}

export function hideOrdersCallout(): void {
  for (const { id, cls } of Object.values(SPOTLIGHT))
    document.getElementById(id)?.classList.remove(cls);
  document.getElementById('game-canvas')?.classList.remove('is-locked');
  window.removeEventListener('resize', positionOrdersCallout);
  window.removeEventListener('scroll', positionOrdersCallout);
  ordersCalloutObserver?.disconnect();
  ordersCalloutObserver = null;
  ordersCallout?.remove();
  ordersCallout = null;
  syncHandsDemo();
  // board just unlocked: light up step 1
  if (lastChecklistStatus) setChecklistProgress(lastChecklistStatus);
}

export function isOrdersCalloutOpen(): boolean {
  return ordersCallout !== null;
}

// little tooltip that sticks to the cursor for a moment (e.g. drawing before pressing ok)

let cursorTooltip: HTMLDivElement | null = null;
let cursorTooltipTimer: number | null = null; // set while a timed message is showing

function moveCursorTooltip(clientX: number, clientY: number): void {
  if (!cursorTooltip) return;
  // up and to the right of the pointer so a finger or cursor doesn't cover it
  const box = cursorTooltip.getBoundingClientRect();
  const left = Math.min(clientX + 14, window.innerWidth - box.width - 8);
  const top = Math.max(8, clientY - box.height - 10);
  cursorTooltip.style.left = `${left}px`;
  cursorTooltip.style.top = `${top}px`;
}

function onCursorTooltipMove(e: MouseEvent): void {
  moveCursorTooltip(e.clientX, e.clientY);
}

function setCursorTooltipText(text: string, clientX: number, clientY: number): void {
  if (!cursorTooltip) {
    cursorTooltip = document.createElement('div');
    cursorTooltip.className = 'cursor-tooltip';
    cursorTooltip.setAttribute('role', 'status');
    document.body.appendChild(cursorTooltip);
    window.addEventListener('mousemove', onCursorTooltipMove);
  }
  cursorTooltip.textContent = text;
  moveCursorTooltip(clientX, clientY);
}

export function showCursorTooltip(text: string, clientX: number, clientY: number): void {
  setCursorTooltipText(text, clientX, clientY);

  if (cursorTooltipTimer !== null) window.clearTimeout(cursorTooltipTimer);
  cursorTooltipTimer = window.setTimeout(hideCursorTooltip, 1500);
}

export function hideCursorTooltip(): void {
  if (cursorTooltipTimer !== null) window.clearTimeout(cursorTooltipTimer);
  cursorTooltipTimer = null;
  window.removeEventListener('mousemove', onCursorTooltipMove);
  cursorTooltip?.remove();
  cursorTooltip = null;
}

// hover labels share the cursor tooltip, but a timed message (like "look at your order!") wins

const DRINK_LABELS: Partial<Record<DrinkId, string>> = {
  D1: 'purple tea',
};

export function getHoverLabel(state: GameState, pos: Pos): string | null {
  const key = keyOf(pos);
  if (samePos(pos, state.glorboPos)) return 'this is glorbo!';
  if (state.level.customers[key]) return 'this is your customer!';
  const drink = state.level.drinkStations[key];
  if (drink && DRINK_LABELS[drink]) return `this is ${DRINK_LABELS[drink]}!`;
  return null;
}

export function setHoverLabel(text: string | null, clientX: number, clientY: number): void {
  if (cursorTooltipTimer !== null) return;
  if (!text) {
    hideCursorTooltip();
    return;
  }
  setCursorTooltipText(text, clientX, clientY);
}

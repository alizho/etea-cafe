import {
  keyOf,
  samePos,
  type CustomerId,
  type DrinkId,
  type ObstacleId,
  type Pos,
} from '../engine/types';
import type { LevelData } from '../levels/level.schema';
import {
  getDecorWidth,
  isWallDecorType,
  PLACEABLE_DECOR,
  WALL_DECOR_TYPES,
  type DecorKind,
} from '../config/items';
import { clamp, inBounds, isBorderTile, pairAdjacent, parseKey, uniqueSorted } from '../util/grid';

export type Status = (text: string) => void;
export type StandDir = LevelData['customers'][number]['standHere'];
type ObstacleTile = { x: number; y: number; type: ObstacleId };

export const MIN_BUILDER_SIZE = 6;
export const MAX_BUILDER_SIZE = 12;

const STAND_DIRS: StandDir[] = ['left', 'up', 'right', 'down'];

const standPosFor = (p: Pos, dir: StandDir): Pos => {
  if (dir === 'left') return { x: p.x - 1, y: p.y };
  if (dir === 'right') return { x: p.x + 1, y: p.y };
  if (dir === 'up') return { x: p.x, y: p.y - 1 };
  return { x: p.x, y: p.y + 1 };
};

const inLevel = (d: LevelData, p: Pos) => inBounds(d.width, d.height, p);
export const onBorder = (d: LevelData, p: Pos) => isBorderTile(d.width, d.height, p);
const isStart = (d: LevelData, p: Pos) => keyOf(p) === keyOf(d.start);
// top wall row, minus the corners
const isTopWallSlot = (d: LevelData, p: Pos) => p.y === 0 && p.x > 0 && p.x < d.width - 1;

export const hasWallAt = (d: LevelData, p: Pos) => d.walls.some((w) => samePos(w, p));
const hasCustomerAt = (d: LevelData, p: Pos) => d.customers.some((c) => samePos(c, p));
export const obstacleAt = (d: LevelData, p: Pos) => d.obstacles.find((o) => samePos(o, p));
export const stationAt = (d: LevelData, p: Pos) => d.drinkStations.find((s) => samePos(s, p));
export const customerAt = (d: LevelData, p: Pos) => d.customers.find((c) => samePos(c, p));

const without = <T extends Pos>(list: T[], keys: Set<string>) =>
  list.filter((item) => !keys.has(keyOf(item)));

/** clears every layer on keys; true if anything was removed */
function clearTiles(d: LevelData, keys: Set<string>): boolean {
  const count = () =>
    d.walls.length + d.drinkStations.length + d.customers.length + d.obstacles.length;
  const before = count();
  d.walls = without(d.walls, keys);
  d.drinkStations = without(d.drinkStations, keys);
  d.customers = without(d.customers, keys);
  d.obstacles = without(d.obstacles, keys);
  return count() !== before;
}

export function normalizeOrders(d: LevelData) {
  // ensure every customer has at least drink 1
  d.orders = {
    A: d.orders?.A?.length ? d.orders.A.slice(0, 2) : ['D1'],
    B: d.orders?.B?.length ? d.orders.B.slice(0, 2) : ['D1'],
    C: d.orders?.C?.length ? d.orders.C.slice(0, 2) : ['D1'],
  };
}

function normalizeObstacles(d: LevelData) {
  const startKey = keyOf(d.start);

  // special case for wall decor (top row only)
  const topBorderWallDecor: ObstacleTile[] = [];
  const topBorderWallDecorSet = new Set<string>();

  const byKey = new Map<string, ObstacleId>();
  for (const o of d.obstacles) {
    const p = { x: o.x, y: o.y };
    if (!inLevel(d, p)) continue;
    const key = keyOf(p);
    if (onBorder(d, p)) {
      if (isTopWallSlot(d, p) && isWallDecorType(o.type)) {
        if (key !== startKey && !topBorderWallDecorSet.has(key)) {
          topBorderWallDecorSet.add(key);
          topBorderWallDecor.push({ x: p.x, y: p.y, type: o.type });
        }
      }
      continue;
    }
    if (key === startKey) continue;
    byKey.set(key, o.type);
  }

  const keep = new Set<string>();

  // plant_two pairs
  const plantTwoXsByRow = new Map<number, number[]>();
  for (const [key, type] of byKey.entries()) {
    if (type !== 'plant_two') continue;
    const [x, y] = parseKey(key);
    const xs = plantTwoXsByRow.get(y) ?? [];
    xs.push(x);
    plantTwoXsByRow.set(y, xs);
  }

  for (const [y, xs] of plantTwoXsByRow.entries()) {
    for (const [x, x2] of pairAdjacent(uniqueSorted(xs))) {
      keep.add(`${x},${y}`);
      keep.add(`${x2},${y}`);
    }
  }

  // chungus tables
  for (const [key, type] of byKey.entries()) {
    if (type !== 'table_l') continue;
    const [x, y] = parseKey(key);
    const midKey = `${x + 1},${y}`;
    const rightKey = `${x + 2},${y}`;
    if (byKey.get(midKey) === 'table_m' && byKey.get(rightKey) === 'table_r') {
      keep.add(key);
      keep.add(midKey);
      keep.add(rightKey);
    }
  }

  // 1x1 stuff (keep anything not part of a multi-tile group or wall decor)
  for (const [key, type] of byKey.entries()) {
    if (
      type !== 'plant_two' &&
      type !== 'table_l' &&
      type !== 'table_m' &&
      type !== 'table_r' &&
      !isWallDecorType(type)
    ) {
      keep.add(key);
    }
  }

  const interior = Array.from(keep).map((key) => {
    const [x, y] = parseKey(key);
    return { x, y, type: byKey.get(key) as ObstacleId };
  });

  const filteredTopBorderWallDecor: ObstacleTile[] = [];
  const doubleWindowXsByType = new Map<ObstacleId, number[]>();

  for (const o of topBorderWallDecor) {
    if (o.type === 'window_double_a' || o.type === 'window_double_b') {
      const xs = doubleWindowXsByType.get(o.type) ?? [];
      xs.push(o.x);
      doubleWindowXsByType.set(o.type, xs);
    } else {
      filteredTopBorderWallDecor.push(o);
    }
  }

  for (const [type, xs] of doubleWindowXsByType.entries()) {
    for (const [x, x2] of pairAdjacent(uniqueSorted(xs))) {
      filteredTopBorderWallDecor.push({ x, y: 0, type });
      filteredTopBorderWallDecor.push({ x: x2, y: 0, type });
    }
  }

  d.obstacles = [...interior, ...filteredTopBorderWallDecor];
}

const isValidStandTile = (d: LevelData, p: Pos): boolean => {
  if (!inLevel(d, p)) return false;
  if (onBorder(d, p)) return false;
  if (hasWallAt(d, p)) return false;
  if (hasCustomerAt(d, p)) return false;
  if (obstacleAt(d, p)) return false;
  return true;
};

export function enforceBorderWalls(d: LevelData) {
  const w = d.width;
  const h = d.height;
  if (w < 3 || h < 3) return;

  // clamp start into the interior so it can't overlap borders or be outside
  d.start = {
    x: clamp(d.start.x, 1, w - 2),
    y: clamp(d.start.y, 1, h - 2),
  };

  const startKey = keyOf(d.start);

  // remove Anything that would overlap
  d.drinkStations = d.drinkStations.filter((s) => keyOf(s) !== startKey && !onBorder(d, s));
  d.customers = d.customers.filter((c) => keyOf(c) !== startKey && !onBorder(d, c));
  d.obstacles = d.obstacles.filter((o) => {
    if (keyOf(o) === startKey) return false;
    if (!onBorder(d, o)) return true;
    return isWallDecorType(o.type) && isTopWallSlot(d, o);
  });

  const wallSet = new Set(d.walls.map(keyOf));

  for (let x = 0; x < w; x++) {
    wallSet.add(`${x},0`);
    wallSet.add(`${x},${h - 1}`);
  }
  for (let y = 0; y < h; y++) {
    wallSet.add(`0,${y}`);
    wallSet.add(`${w - 1},${y}`);
  }

  wallSet.delete(startKey);

  d.walls = Array.from(wallSet).map((key) => {
    const [x, y] = parseKey(key);
    return { x, y };
  });

  normalizeObstacles(d);
}

export function getObstacleGroupAt(d: LevelData, p: Pos): Pos[] {
  const o = obstacleAt(d, p);
  if (!o) return [p];
  const type = o.type;

  if (type === 'plant_two' || type === 'window_double_a' || type === 'window_double_b') {
    const xs = d.obstacles
      .filter((ob) => ob.type === type && ob.y === p.y)
      .map((ob) => ob.x)
      .sort((a, b) => a - b);
    const pair = pairAdjacent(xs).find(([x, x2]) => p.x === x || p.x === x2);
    if (!pair) return [p];
    return [
      { x: pair[0], y: p.y },
      { x: pair[1], y: p.y },
    ];
  }

  if (type === 'table_l') return [p, { x: p.x + 1, y: p.y }, { x: p.x + 2, y: p.y }];
  if (type === 'table_m') return [{ x: p.x - 1, y: p.y }, p, { x: p.x + 1, y: p.y }];
  if (type === 'table_r') return [{ x: p.x - 2, y: p.y }, { x: p.x - 1, y: p.y }, p];

  return [p];
}

/** p's column offset within its decor group */
export function groupOffset(d: LevelData, p: Pos): number {
  const group = getObstacleGroupAt(d, p);
  const leftmost = group.reduce((min, cur) => (cur.x < min.x ? cur : min), group[0] ?? p);
  return p.x - leftmost.x;
}

export function removeObstacleGroup(d: LevelData, p: Pos) {
  const keys = new Set(getObstacleGroupAt(d, p).map(keyOf));
  d.obstacles = without(d.obstacles, keys);
}

export function removeAt(d: LevelData, p: Pos, status: Status): boolean {
  if (onBorder(d, p)) {
    status('border tiles are always walls');
    return false;
  }
  return clearTiles(d, new Set(getObstacleGroupAt(d, p).map(keyOf)));
}

function setObstacleTiles(d: LevelData, tiles: { p: Pos; type: ObstacleId }[]) {
  clearTiles(d, new Set(tiles.map((t) => keyOf(t.p))));
  d.obstacles = [...d.obstacles, ...tiles.map((t) => ({ x: t.p.x, y: t.p.y, type: t.type }))];
}

type DecorPlan = { ok: true; tiles: { p: Pos; type: ObstacleId }[] } | { ok: false; msg: string };

function planDecor(d: LevelData, p: Pos, kind: DecorKind): DecorPlan {
  const fail = (msg: string): DecorPlan => ({ ok: false, msg });
  if (!inLevel(d, p)) return fail('out of bounds');
  if (onBorder(d, p)) return fail('border tiles must be walls');
  if (isStart(d, p)) return fail('can’t place decor on start');
  if (isWallDecorType(kind as ObstacleId)) return fail('windows can only go on the top wall');

  if (kind !== 'plant_two' && kind !== 'table_triple') {
    return { ok: true, tiles: [{ p, type: kind }] };
  }

  const right = { x: p.x + 1, y: p.y };
  const extra = kind === 'plant_two' ? [right] : [right, { x: p.x + 2, y: p.y }];
  if (extra.some((q) => !inLevel(d, q))) return fail('not enough space');
  if (extra.some((q) => onBorder(d, q))) return fail('not enough space');
  if (extra.some((q) => isStart(d, q))) return fail('can’t place decor on start');

  if (kind === 'plant_two') {
    return {
      ok: true,
      tiles: [
        { p, type: 'plant_two' },
        { p: right, type: 'plant_two' },
      ],
    };
  }
  return {
    ok: true,
    tiles: [
      { p, type: 'table_l' },
      { p: extra[0], type: 'table_m' },
      { p: extra[1], type: 'table_r' },
    ],
  };
}

/** status null: fail silently */
export function setDecorAt(d: LevelData, p: Pos, kind: DecorKind, status: Status | null): boolean {
  const plan = planDecor(d, p, kind);
  if (!plan.ok) {
    status?.(plan.msg);
    return false;
  }
  setObstacleTiles(d, plan.tiles);
  normalizeObstacles(d);
  return true;
}

export function decorKindAt(d: LevelData, p: Pos): DecorKind | null {
  const o = obstacleAt(d, p);
  if (!o) return null;
  const t = o.type;
  if (t === 'table_l' || t === 'table_m' || t === 'table_r') return 'table_triple';
  return t;
}

function findPlaceableAnchor(d: LevelData, click: Pos, kind: DecorKind, preferredIndex: number) {
  const width = getDecorWidth(kind);
  const clampedPreferred = clamp(preferredIndex, 0, width - 1);

  const offsets = Array.from({ length: width }, (_, i) => i).sort(
    (a, b) => Math.abs(a - clampedPreferred) - Math.abs(b - clampedPreferred)
  );

  for (const offset of offsets) {
    const anchor = { x: click.x - offset, y: click.y };
    if (planDecor(d, anchor, kind).ok) return anchor;
  }
  return null;
}

export function cycleWallDecorAt(d: LevelData, p: Pos, status: Status) {
  if (!isTopWallSlot(d, p)) {
    status('wall items only go on the top wall (not corners)');
    return;
  }
  const currentType = obstacleAt(d, p)?.type;
  const currentIndex = currentType != null ? WALL_DECOR_TYPES.indexOf(currentType) : -1;

  const canPlaceWallDecorAt = (type: ObstacleId): boolean => {
    const width = getDecorWidth(type);

    if (width === 2 && p.x + 1 >= d.width - 1) return false;

    for (let i = 0; i < width; i++) {
      if (obstacleAt(d, { x: p.x + i, y: p.y })) return false;
    }
    return true;
  };

  if (currentType) removeObstacleGroup(d, p);

  const startIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % WALL_DECOR_TYPES.length;
  for (let i = 0; i < WALL_DECOR_TYPES.length; i++) {
    const candidate = WALL_DECOR_TYPES[(startIndex + i) % WALL_DECOR_TYPES.length];
    if (!canPlaceWallDecorAt(candidate)) continue;

    const added = [{ x: p.x, y: p.y, type: candidate }];
    if (getDecorWidth(candidate) === 2) added.push({ x: p.x + 1, y: p.y, type: candidate });
    d.obstacles = [...d.obstacles, ...added];
    return;
  }

  status('no wall decor fits here');
}

/** returns the tool's next default decor */
export function cycleDecorAt(
  d: LevelData,
  p: Pos,
  toolDefault: DecorKind,
  status: Status
): DecorKind {
  const decorCycle = PLACEABLE_DECOR;
  const currentKind = decorKindAt(d, p);

  // multi tile replacement
  const preferredIndex = currentKind ? groupOffset(d, p) : 0;

  let startIndex: number;
  if (currentKind) {
    const currentIndex = decorCycle.indexOf(currentKind);
    startIndex = currentIndex >= 0 ? (currentIndex + 1) % decorCycle.length : 0;
  } else {
    if (hasWallAt(d, p)) removeAt(d, p, status);
    startIndex = Math.max(0, decorCycle.indexOf(toolDefault));
  }

  for (let i = 0; i < decorCycle.length; i++) {
    const candidate = decorCycle[(startIndex + i) % decorCycle.length] ?? 'plant_a';
    const anchor = findPlaceableAnchor(d, p, candidate, preferredIndex);
    if (!anchor) continue;

    if (currentKind) removeAt(d, p, status);
    return setDecorAt(d, anchor, candidate, status) ? candidate : toolDefault;
  }

  status(currentKind ? 'no other decor fits here' : 'no decor fits here');
  return toolDefault;
}

export function setStartAt(d: LevelData, p: Pos, status: Status) {
  if (onBorder(d, p)) {
    status('start can’t be on the border');
    return;
  }
  removeAt(d, p, status);
  d.start = { x: p.x, y: p.y };
}

export function setDrinkAt(d: LevelData, p: Pos, drink: DrinkId, status: Status) {
  if (onBorder(d, p)) {
    status('border tiles are walls (can’t place here)');
    return;
  }
  // start may overlap a station (pickup immediately)
  removeAt(d, p, status);
  d.drinkStations = [...d.drinkStations, { x: p.x, y: p.y, drink }];
}

/** returns the tool's next default station */
export function cycleStationAt(
  d: LevelData,
  p: Pos,
  toolDefault: DrinkId,
  stationCycle: DrinkId[],
  status: Status
): DrinkId {
  const idx = d.drinkStations.findIndex((s) => samePos(s, p));
  if (idx < 0) {
    setDrinkAt(d, p, toolDefault, status);
    return toolDefault;
  }

  const current = d.drinkStations[idx]?.drink;
  const currentIndex = current ? stationCycle.indexOf(current) : -1;
  const next = stationCycle[(currentIndex + 1) % stationCycle.length] ?? 'D1';

  d.drinkStations[idx] = { x: p.x, y: p.y, drink: next };
  return next;
}

export function setCustomerAt(d: LevelData, p: Pos, id: CustomerId, status: Status) {
  if (onBorder(d, p)) {
    status('border tiles are walls (can’t place here)');
    return;
  }
  if (isStart(d, p)) {
    status("can't place a customer on start");
    return;
  }
  // if clicking same customer, toggle standHere
  const existingHere = customerAt(d, p);
  if (existingHere && existingHere.id === id) {
    const startIdx = STAND_DIRS.indexOf(existingHere.standHere);
    const baseIdx = startIdx >= 0 ? startIdx : 0;

    for (let i = 1; i <= STAND_DIRS.length; i++) {
      const next = STAND_DIRS[(baseIdx + i) % STAND_DIRS.length];
      if (isValidStandTile(d, standPosFor(existingHere, next))) {
        existingHere.standHere = next;
        return;
      }
    }

    status('no valid stand direction here');
    return;
  }

  // clears anything at p, including another customer
  removeAt(d, p, status);
  // ensure unique per id
  d.customers = d.customers.filter((c) => c.id !== id);

  const chosen = STAND_DIRS.find((dir) => isValidStandTile(d, standPosFor(p, dir)));
  if (!chosen) {
    status('customer needs a valid stand tile');
    return;
  }

  d.customers = [...d.customers, { x: p.x, y: p.y, id, standHere: chosen }];
}

export function resizeLevelData(d: LevelData, nextW: number, nextH: number) {
  const prevW = d.width;
  const prevH = d.height;

  d.width = nextW;
  d.height = nextH;

  const inB = (p: Pos) => inLevel(d, p);

  // erase previous border walls?
  d.walls = d.walls.filter((w) => !isBorderTile(prevW, prevH, w)).filter(inB);
  d.drinkStations = d.drinkStations.filter(inB);
  d.customers = d.customers.filter(inB);
  d.obstacles = d.obstacles.filter(inB);

  d.start = {
    x: clamp(d.start.x, 0, d.width - 1),
    y: clamp(d.start.y, 0, d.height - 1),
  };

  enforceBorderWalls(d);
}

import type { LevelData } from './levels/level.schema';
import type { DrinkId } from './engine/types';

const OBSTACLE_TYPES = [
  'plant_a',
  'plant_b',
  'plant_two',
  'table_single',
  'shelf_a',
  'shelf_b',
  'bookshelf',
  'stool',
  'chair_l',
  'chair_r',
  'table_l',
  'table_m',
  'table_r',
  'window_single_a',
  'window_double_a',
  'window_double_b',
  'cat',
] as const;

type ObstacleType = (typeof OBSTACLE_TYPES)[number];

const DRINKS = ['D1', 'D2', 'F1', 'F2', 'F3'] as const;

type DrinkType = (typeof DRINKS)[number];

const CUSTOMER_IDS = ['A', 'B', 'C'] as const;

type CustomerId = (typeof CUSTOMER_IDS)[number];

const STAND_DIRS = ['left', 'right', 'up', 'down'] as const;

type StandDir = (typeof STAND_DIRS)[number];

const idxOrThrow = (arr: readonly string[], v: string, what: string): number => {
  const idx = arr.indexOf(v);
  if (idx < 0) throw new Error(`invalid ${what}: ${v}`);
  return idx;
};

const clampInt = (n: number) => (Number.isFinite(n) ? Math.trunc(n) : 0);

function ensureOrders(data: LevelData): Record<CustomerId, DrinkId[]> {
  const o = data.orders ?? ({} as Record<CustomerId, DrinkId[]>);
  return {
    A: Array.isArray(o.A) && o.A.length ? (o.A.slice(0, 2) as DrinkId[]) : (['D1'] as DrinkId[]),
    B: Array.isArray(o.B) && o.B.length ? (o.B.slice(0, 2) as DrinkId[]) : (['D1'] as DrinkId[]),
    C: Array.isArray(o.C) && o.C.length ? (o.C.slice(0, 2) as DrinkId[]) : (['D1'] as DrinkId[]),
  };
}

function buildBorderWalls(width: number, height: number, start: { x: number; y: number }) {
  const walls: { x: number; y: number }[] = [];
  const startKey = `${start.x},${start.y}`;
  const seen = new Set<string>();

  for (let x = 0; x < width; x++) {
    const top = `${x},0`;
    const bot = `${x},${height - 1}`;
    if (top !== startKey && !seen.has(top)) {
      seen.add(top);
      walls.push({ x, y: 0 });
    }
    if (bot !== startKey && !seen.has(bot)) {
      seen.add(bot);
      walls.push({ x, y: height - 1 });
    }
  }

  for (let y = 0; y < height; y++) {
    const left = `0,${y}`;
    const right = `${width - 1},${y}`;
    if (left !== startKey && !seen.has(left)) {
      seen.add(left);
      walls.push({ x: 0, y });
    }
    if (right !== startKey && !seen.has(right)) {
      seen.add(right);
      walls.push({ x: width - 1, y });
    }
  }

  return walls;
}

class BitWriter {
  private bytes: number[] = [];
  private cur = 0;
  private bits = 0;

  write(value: number, bitCount: number) {
    let v = value >>> 0;
    for (let i = 0; i < bitCount; i++) {
      const bit = (v >>> i) & 1;
      this.cur |= bit << this.bits;
      this.bits++;
      if (this.bits === 8) {
        this.bytes.push(this.cur);
        this.cur = 0;
        this.bits = 0;
      }
    }
  }

  finish(): Uint8Array {
    if (this.bits > 0) {
      this.bytes.push(this.cur);
      this.cur = 0;
      this.bits = 0;
    }
    return new Uint8Array(this.bytes);
  }
}

class BitReader {
  private off = 0;
  private bit = 0;
  private bytes: Uint8Array;
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  read(bitCount: number): number | null {
    let out = 0;
    for (let i = 0; i < bitCount; i++) {
      if (this.off >= this.bytes.length) return null;
      const b = this.bytes[this.off] as number;
      const v = (b >>> this.bit) & 1;
      out |= v << i;
      this.bit++;
      if (this.bit === 8) {
        this.bit = 0;
        this.off++;
      }
    }
    return out >>> 0;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] as number);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(token: string): Uint8Array | null {
  if (!token) return null;
  const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '==='.slice((b64.length + 3) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    return null;
  }
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function deflateIfAvailable(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof (globalThis as any).CompressionStream !== 'function') return bytes;
  try {
    const cs = new (globalThis as any).CompressionStream('deflate');
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const stream = new Blob([copy.buffer]).stream().pipeThrough(cs);
    const buf = await new Response(stream).arrayBuffer();
    const out = new Uint8Array(buf);
    return out.length < bytes.length ? out : bytes;
  } catch {
    return bytes;
  }
}

async function inflateMaybe(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.length >= 2 && bytes[0] === 0x06) return bytes;
  if (typeof (globalThis as any).DecompressionStream !== 'function') return bytes;
  try {
    const ds = new (globalThis as any).DecompressionStream('deflate');
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const stream = new Blob([copy.buffer]).stream().pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    const out = new Uint8Array(buf);
    return out;
  } catch {
    return bytes;
  }
}

function posToIndex(x: number, y: number, w: number) {
  return y * w + x;
}

function indexToPos(idx: number, w: number) {
  const y = Math.floor(idx / w);
  const x = idx - y * w;
  return { x, y };
}

const GROUP_KINDS = [
  'plant_a',
  'plant_b',
  'shelf_a',
  'shelf_b',
  'bookshelf',
  'stool',
  'chair_l',
  'chair_r',
  'table_single',
  'plant_two',
  'table_triple',
  'window_single_a',
  'window_double_a',
  'window_double_b',
  'cat',
] as const;

type GroupKind = (typeof GROUP_KINDS)[number];

const GROUP_KIND_BITS_V6 = 4;

const groupKindToBits = (kind: GroupKind): number => {
  const idx = GROUP_KINDS.indexOf(kind);
  if (idx < 0) throw new Error(`unknown group kind: ${kind}`);
  return idx;
};

const bitsToGroupKind = (bits: number, maxIndex: number): GroupKind | null => {
  if (bits < 0 || bits > maxIndex) return null;
  return (GROUP_KINDS[bits] as GroupKind | undefined) ?? null;
};

function buildObstacleMap(level: LevelData): Map<string, ObstacleType> {
  const m = new Map<string, ObstacleType>();
  for (const o of level.obstacles ?? []) {
    m.set(`${clampInt(o.x)},${clampInt(o.y)}`, o.type as ObstacleType);
  }
  return m;
}

function groupedDecorFromLevel(level: LevelData): { idx: number; kind: GroupKind }[] {
  const w = clampInt(level.width);
  const h = clampInt(level.height);
  const map = buildObstacleMap(level);
  const used = new Set<string>();

  const keys = Array.from(map.keys())
    .map((k) => {
      const [x, y] = k.split(',').map(Number);
      return { x: x ?? 0, y: y ?? 0, k };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const out: { idx: number; kind: GroupKind }[] = [];

  for (const { x, y, k } of keys) {
    if (used.has(k)) continue;
    const t = map.get(k);
    if (!t) continue;

    if (t === 'table_l') {
      const midKey = `${x + 1},${y}`;
      const rightKey = `${x + 2},${y}`;
      if (map.get(midKey) === 'table_m' && map.get(rightKey) === 'table_r') {
        used.add(k);
        used.add(midKey);
        used.add(rightKey);
        out.push({ idx: posToIndex(x, y, w), kind: 'table_triple' });
        continue;
      }
      throw new Error('invalid table triple grouping');
    }

    if (t === 'plant_two') {
      const rightKey = `${x + 1},${y}`;

      if (map.get(rightKey) === 'plant_two') {
        used.add(k);
        used.add(rightKey);
        out.push({ idx: posToIndex(x, y, w), kind: 'plant_two' });
        continue;
      }
      throw new Error('invalid plant_two grouping');
    }

    if (t === 'table_m' || t === 'table_r') {
      throw new Error('unexpected ungrouped table tile');
    }

    used.add(k);

    if (
      t === 'plant_a' ||
      t === 'plant_b' ||
      t === 'shelf_a' ||
      t === 'shelf_b' ||
      t === 'bookshelf' ||
      t === 'stool' ||
      t === 'chair_l' ||
      t === 'chair_r' ||
      t === 'table_single' ||
      t === 'cat'
    ) {
      out.push({ idx: posToIndex(x, y, w), kind: t });
      continue;
    }

    if (t === 'window_single_a') {
      out.push({ idx: posToIndex(x, y, w), kind: 'window_single_a' });
      continue;
    }
    if (t === 'window_double_a') {
      const rightKey = `${x + 1},${y}`;
      if (map.get(rightKey) === 'window_double_a') {
        used.add(k);
        used.add(rightKey);
        out.push({ idx: posToIndex(x, y, w), kind: 'window_double_a' });
        continue;
      }
      throw new Error('invalid window_double_a grouping');
    }
    if (t === 'window_double_b') {
      const rightKey = `${x + 1},${y}`;
      if (map.get(rightKey) === 'window_double_b') {
        used.add(k);
        used.add(rightKey);
        out.push({ idx: posToIndex(x, y, w), kind: 'window_double_b' });
        continue;
      }
      throw new Error('invalid window_double_b grouping');
    }

    throw new Error(`unsupported obstacle type: ${t}`);
  }

  if (w <= 0 || h <= 0 || w > 32 || h > 32) throw new Error('invalid size');
  return out;
}

function bitsNeeded(n: number): number {
  if (!Number.isFinite(n) || n <= 1) return 1;
  return Math.ceil(Math.log2(n));
}

function assertCountFitsByte(count: number, what: string) {
  if (!Number.isFinite(count) || count < 0 || count > 255) {
    throw new Error(`${what} must fit in 0–255`);
  }
}

function encodeV6(level: LevelData): Uint8Array {
  const w = clampInt(level.width);
  const h = clampInt(level.height);

  if (w < 1 || w > 32 || h < 1 || h > 32) {
    throw new Error('share supports sizes 1–32 only');
  }

  const cellCount = w * h;
  if (cellCount < 1 || cellCount > 1024) {
    throw new Error('share supports up to 32×32 (1024) tiles');
  }

  const indexBits = bitsNeeded(cellCount);
  if (indexBits < 1 || indexBits > 16) {
    throw new Error('unsupported share index width');
  }

  const startX = clampInt(level.start?.x ?? 0);
  const startY = clampInt(level.start?.y ?? 0);
  const startIdx = posToIndex(startX, startY, w);
  if (startIdx < 0 || startIdx >= cellCount) {
    throw new Error('start is out of bounds');
  }

  const grouped = groupedDecorFromLevel(level);
  const stations = level.drinkStations ?? [];
  const customers = level.customers ?? [];

  assertCountFitsByte(grouped.length, 'grouped obstacles');
  assertCountFitsByte(stations.length, 'drink stations');

  const customerById = new Map<CustomerId, (typeof customers)[number]>();
  for (const c of customers) customerById.set(c.id as CustomerId, c);
  for (const id of CUSTOMER_IDS) {
    if (!customerById.get(id)) throw new Error(`missing customer ${id}`);
  }

  const orders = ensureOrders(level);

  const bw = new BitWriter();
  const header = new Uint8Array([0x06]);

  bw.write(w - 1, 5);
  bw.write(h - 1, 5);
  bw.write(indexBits - 1, 4);
  bw.write(startIdx, indexBits);

  bw.write(grouped.length, 8);
  for (const g of grouped) {
    if (g.idx < 0 || g.idx >= cellCount) throw new Error('obstacle out of bounds');
    bw.write(g.idx, indexBits);
    bw.write(groupKindToBits(g.kind), GROUP_KIND_BITS_V6);
  }

  bw.write(stations.length, 8);
  for (const s of stations) {
    const d = s.drink as DrinkType;
    const idx = posToIndex(clampInt(s.x), clampInt(s.y), w);
    if (idx < 0 || idx >= cellCount) throw new Error('drink station out of bounds');
    bw.write(idx, indexBits);
    bw.write(idxOrThrow(DRINKS, d, 'drink'), 3);
  }

  for (const id of CUSTOMER_IDS) {
    const c = customerById.get(id)!;
    const idx = posToIndex(clampInt(c.x), clampInt(c.y), w);
    if (idx < 0 || idx >= cellCount) throw new Error('customer out of bounds');
    bw.write(idx, indexBits);
    bw.write(idxOrThrow(STAND_DIRS, c.standHere as StandDir, 'stand'), 2);
  }

  for (const id of CUSTOMER_IDS) {
    const a = orders[id][0] ?? 'D1';
    const b = orders[id][1] ?? '';
    bw.write(idxOrThrow(DRINKS, a, 'order'), 3);
    bw.write(b ? 1 : 0, 1);
    if (b) bw.write(idxOrThrow(DRINKS, b, 'order'), 3);
  }

  const body = bw.finish();
  const out = new Uint8Array(header.length + body.length);
  out.set(header, 0);
  out.set(body, header.length);
  return out;
}

function decodeV6Bytes(bytes: Uint8Array): LevelData | null {
  if (bytes.length < 2 || bytes[0] !== 0x06) return null;
  const br = new BitReader(bytes.slice(1));

  const wMinus1 = br.read(5);
  const hMinus1 = br.read(5);
  const indexBitsMinus1 = br.read(4);
  if (wMinus1 === null || hMinus1 === null || indexBitsMinus1 === null) return null;

  const w = wMinus1 + 1;
  const h = hMinus1 + 1;
  const indexBits = indexBitsMinus1 + 1;

  if (w < 1 || w > 32 || h < 1 || h > 32) return null;
  if (indexBits < 1 || indexBits > 16) return null;

  const cellCount = w * h;
  if (cellCount < 1 || cellCount > 1024) return null;
  if (cellCount > 1 << Math.min(indexBits, 30)) {
    return null;
  }

  const startIdx = br.read(indexBits);
  if (startIdx === null || startIdx >= cellCount) return null;
  const start = indexToPos(startIdx, w);
  if (start.x < 0 || start.x >= w || start.y < 0 || start.y >= h) return null;

  const groupedCount = br.read(8);
  if (groupedCount === null) return null;

  const obstacles: LevelData['obstacles'] = [];
  const maxKindIndex = (1 << GROUP_KIND_BITS_V6) - 1;
  for (let i = 0; i < groupedCount; i++) {
    const idx = br.read(indexBits);
    const kindBits = br.read(GROUP_KIND_BITS_V6);
    if (idx === null || kindBits === null) return null;
    if (idx >= cellCount) return null;
    const kind = bitsToGroupKind(kindBits, maxKindIndex);
    if (!kind) return null;
    const p = indexToPos(idx, w);
    if (p.x < 0 || p.x >= w || p.y < 0 || p.y >= h) return null;

    if (kind === 'table_triple') {
      obstacles.push(
        { x: p.x, y: p.y, type: 'table_l' },
        { x: p.x + 1, y: p.y, type: 'table_m' },
        { x: p.x + 2, y: p.y, type: 'table_r' }
      );
    } else if (kind === 'plant_two') {
      obstacles.push(
        { x: p.x, y: p.y, type: 'plant_two' },
        { x: p.x + 1, y: p.y, type: 'plant_two' }
      );
    } else if (kind === 'window_double_a' || kind === 'window_double_b') {
      obstacles.push({ x: p.x, y: p.y, type: kind }, { x: p.x + 1, y: p.y, type: kind });
    } else {
      obstacles.push({ x: p.x, y: p.y, type: kind });
    }
  }

  const stCount = br.read(8);
  if (stCount === null) return null;
  const drinkStations: LevelData['drinkStations'] = [];
  for (let i = 0; i < stCount; i++) {
    const idx = br.read(indexBits);
    const dIdx = br.read(3);
    if (idx === null || dIdx === null) return null;
    if (idx >= cellCount) return null;
    const drink = DRINKS[dIdx];
    if (!drink) return null;
    const p = indexToPos(idx, w);
    drinkStations.push({ x: p.x, y: p.y, drink });
  }

  const customers: LevelData['customers'] = [];
  for (const id of CUSTOMER_IDS) {
    const idx = br.read(indexBits);
    const standIdx = br.read(2);
    if (idx === null || standIdx === null) return null;
    if (idx >= cellCount) return null;
    const standHere = STAND_DIRS[standIdx];
    if (!standHere) return null;
    const p = indexToPos(idx, w);
    customers.push({ x: p.x, y: p.y, id, standHere });
  }

  const orders: Record<CustomerId, DrinkId[]> = {
    A: ['D1'],
    B: ['D1'],
    C: ['D1'],
  };
  for (const id of CUSTOMER_IDS) {
    const aIdx = br.read(3);
    const has2 = br.read(1);
    if (aIdx === null || has2 === null) return null;
    const a = (DRINKS[aIdx] ?? 'D1') as DrinkId;
    if (has2) {
      const bIdx = br.read(3);
      if (bIdx === null) return null;
      const b = (DRINKS[bIdx] ?? 'D1') as DrinkId;
      orders[id] = [a, b];
    } else {
      orders[id] = [a];
    }
  }

  const walls = buildBorderWalls(w, h, start);
  return {
    id: 'shared',
    width: w,
    height: h,
    start,
    walls,
    obstacles,
    drinkStations,
    customers,
    orders,
  };
}

export async function encodeLevelShareToken(level: LevelData): Promise<string> {
  const raw = encodeV6(level);
  const maybeCompressed = await deflateIfAvailable(raw);
  return `~${bytesToBase64Url(maybeCompressed)}`;
}

export async function decodeLevelShareToken(token: string): Promise<LevelData | null> {
  if (!token) return null;

  if (!token.startsWith('~')) return null;
  const b = base64UrlToBytes(token.slice(1));
  if (!b) return null;
  const maybeInflated = await inflateMaybe(b);

  const looksRaw = maybeInflated[0] === 0x06;
  const raw = looksRaw ? maybeInflated : b;
  if (raw[0] === 0x06) return decodeV6Bytes(raw);
  return null;
}

export function getShareTokenFromUrlHash(): string | null {
  const raw = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (!raw) return null;
  return raw;
}

export function makeShareUrlFromToken(token: string): string {
  return `${window.location.origin}${window.location.pathname}#${token}`;
}

import type { LevelData } from './levels/level.schema';
import type { CustomerId, DrinkId, ObstacleId } from './engine/types';
import { borderWalls } from './util/grid';

// wire format: the index of each entry is what goes in the token, so never reorder these

const DRINKS: readonly DrinkId[] = ['D1', 'D2', 'F1', 'F2', 'F3'];

const CUSTOMER_IDS: readonly CustomerId[] = ['A', 'B', 'C'];

const STAND_DIRS = ['left', 'right', 'up', 'down'] as const;

type StandDir = (typeof STAND_DIRS)[number];

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
const V6_HEADER = 0x06;

// multi-tile decor: the tiles it covers left to right, and the error when they don't line up
const MULTI_TILE_GROUPS: { kind: GroupKind; tiles: ObstacleId[]; error: string }[] = [
  {
    kind: 'table_triple',
    tiles: ['table_l', 'table_m', 'table_r'],
    error: 'invalid table triple grouping',
  },
  { kind: 'plant_two', tiles: ['plant_two', 'plant_two'], error: 'invalid plant_two grouping' },
  {
    kind: 'window_double_a',
    tiles: ['window_double_a', 'window_double_a'],
    error: 'invalid window_double_a grouping',
  },
  {
    kind: 'window_double_b',
    tiles: ['window_double_b', 'window_double_b'],
    error: 'invalid window_double_b grouping',
  },
];

const GROUP_BY_FIRST_TILE = new Map(MULTI_TILE_GROUPS.map((g) => [g.tiles[0], g]));
const TILES_BY_GROUP = new Map(MULTI_TILE_GROUPS.map((g) => [g.kind, g.tiles]));

const SINGLE_TILE_KINDS = new Set<string>([
  'plant_a',
  'plant_b',
  'shelf_a',
  'shelf_b',
  'bookshelf',
  'stool',
  'chair_l',
  'chair_r',
  'table_single',
  'cat',
  'window_single_a',
]);

const idxOrThrow = (arr: readonly string[], v: string, what: string): number => {
  const idx = arr.indexOf(v);
  if (idx < 0) throw new Error(`invalid ${what}: ${v}`);
  return idx;
};

const clampInt = (n: number) => (Number.isFinite(n) ? Math.trunc(n) : 0);

function ensureOrders(data: LevelData): Record<CustomerId, DrinkId[]> {
  const o = data.orders ?? ({} as Record<CustomerId, DrinkId[]>);
  const orderFor = (id: CustomerId): DrinkId[] => {
    const list = o[id];
    return Array.isArray(list) && list.length ? list.slice(0, 2) : ['D1'];
  };
  return { A: orderFor('A'), B: orderFor('B'), C: orderFor('C') };
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

async function pipeBytes(bytes: Uint8Array, transform: TransformStream): Promise<Uint8Array> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const stream = new Blob([copy.buffer]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deflateIfAvailable(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof (globalThis as any).CompressionStream !== 'function') return bytes;
  try {
    const out = await pipeBytes(bytes, new (globalThis as any).CompressionStream('deflate'));
    return out.length < bytes.length ? out : bytes;
  } catch {
    return bytes;
  }
}

async function inflateMaybe(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.length >= 2 && bytes[0] === V6_HEADER) return bytes;
  if (typeof (globalThis as any).DecompressionStream !== 'function') return bytes;
  try {
    return await pipeBytes(bytes, new (globalThis as any).DecompressionStream('deflate'));
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

function buildObstacleMap(level: LevelData): Map<string, ObstacleId> {
  const m = new Map<string, ObstacleId>();
  for (const o of level.obstacles ?? []) {
    m.set(`${clampInt(o.x)},${clampInt(o.y)}`, o.type);
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

    const group = GROUP_BY_FIRST_TILE.get(t);
    if (group) {
      const tileKeys = group.tiles.map((_, i) => `${x + i},${y}`);
      if (!group.tiles.every((tile, i) => i === 0 || map.get(tileKeys[i]) === tile)) {
        throw new Error(group.error);
      }
      for (const key of tileKeys) used.add(key);
      out.push({ idx: posToIndex(x, y, w), kind: group.kind });
      continue;
    }

    if (t === 'table_m' || t === 'table_r') {
      throw new Error('unexpected ungrouped table tile');
    }
    if (!SINGLE_TILE_KINDS.has(t)) throw new Error(`unsupported obstacle type: ${t}`);

    used.add(k);
    out.push({ idx: posToIndex(x, y, w), kind: t as GroupKind });
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
  for (const c of customers) customerById.set(c.id, c);
  for (const id of CUSTOMER_IDS) {
    if (!customerById.get(id)) throw new Error(`missing customer ${id}`);
  }

  const orders = ensureOrders(level);

  const bw = new BitWriter();

  // a tile index followed by a code from one of the wire tables
  const writeTile = (idx: number, what: string, code: number, codeBits: number) => {
    if (idx < 0 || idx >= cellCount) throw new Error(`${what} out of bounds`);
    bw.write(idx, indexBits);
    bw.write(code, codeBits);
  };
  const tileIndex = (p: { x: number; y: number }) => posToIndex(clampInt(p.x), clampInt(p.y), w);

  bw.write(w - 1, 5);
  bw.write(h - 1, 5);
  bw.write(indexBits - 1, 4);
  bw.write(startIdx, indexBits);

  bw.write(grouped.length, 8);
  for (const g of grouped) {
    writeTile(g.idx, 'obstacle', idxOrThrow(GROUP_KINDS, g.kind, 'group kind'), GROUP_KIND_BITS_V6);
  }

  bw.write(stations.length, 8);
  for (const s of stations) {
    writeTile(tileIndex(s), 'drink station', idxOrThrow(DRINKS, s.drink, 'drink'), 3);
  }

  for (const id of CUSTOMER_IDS) {
    const c = customerById.get(id)!;
    writeTile(
      tileIndex(c),
      'customer',
      idxOrThrow(STAND_DIRS, c.standHere as StandDir, 'stand'),
      2
    );
  }

  for (const id of CUSTOMER_IDS) {
    const a = orders[id][0] ?? 'D1';
    const b = orders[id][1] ?? '';
    bw.write(idxOrThrow(DRINKS, a, 'order'), 3);
    bw.write(b ? 1 : 0, 1);
    if (b) bw.write(idxOrThrow(DRINKS, b, 'order'), 3);
  }

  const body = bw.finish();
  const out = new Uint8Array(1 + body.length);
  out[0] = V6_HEADER;
  out.set(body, 1);
  return out;
}

function decodeV6Bytes(bytes: Uint8Array): LevelData | null {
  if (bytes.length < 2 || bytes[0] !== V6_HEADER) return null;
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

  // a tile index plus a code into one of the wire tables; null on bad data
  const readTile = <T>(table: readonly T[], codeBits: number) => {
    const idx = br.read(indexBits);
    const code = br.read(codeBits);
    if (idx === null || code === null || idx >= cellCount) return null;
    const value = table[code];
    if (value === undefined) return null;
    return { ...indexToPos(idx, w), value };
  };

  const groupedCount = br.read(8);
  if (groupedCount === null) return null;

  const obstacles: LevelData['obstacles'] = [];
  for (let i = 0; i < groupedCount; i++) {
    const t = readTile(GROUP_KINDS, GROUP_KIND_BITS_V6);
    if (!t) return null;
    const tiles = TILES_BY_GROUP.get(t.value) ?? [t.value as ObstacleId];
    tiles.forEach((type, dx) => obstacles.push({ x: t.x + dx, y: t.y, type }));
  }

  const stCount = br.read(8);
  if (stCount === null) return null;
  const drinkStations: LevelData['drinkStations'] = [];
  for (let i = 0; i < stCount; i++) {
    const t = readTile(DRINKS, 3);
    if (!t) return null;
    drinkStations.push({ x: t.x, y: t.y, drink: t.value });
  }

  const customers: LevelData['customers'] = [];
  for (const id of CUSTOMER_IDS) {
    const t = readTile(STAND_DIRS, 2);
    if (!t) return null;
    customers.push({ x: t.x, y: t.y, id, standHere: t.value });
  }

  const orders = {} as Record<CustomerId, DrinkId[]>;
  for (const id of CUSTOMER_IDS) {
    const aIdx = br.read(3);
    const has2 = br.read(1);
    if (aIdx === null || has2 === null) return null;
    const a = DRINKS[aIdx] ?? 'D1';
    if (has2) {
      const bIdx = br.read(3);
      if (bIdx === null) return null;
      orders[id] = [a, DRINKS[bIdx] ?? 'D1'];
    } else {
      orders[id] = [a];
    }
  }

  return {
    id: 'shared',
    width: w,
    height: h,
    start,
    walls: borderWalls(w, h, start),
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
  return decodeV6Bytes(maybeInflated[0] === V6_HEADER ? maybeInflated : b);
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

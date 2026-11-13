import type { Pos } from '../engine/types';

export const posOfKey = (key: string): Pos => {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
};

export function keysWithValue<V>(record: Record<string, V>, value: V): string[] {
  return Object.keys(record).filter((k) => record[k] === value);
}

export function findKeyWithValue<V>(record: Record<string, V>, value: V): string | undefined {
  return Object.keys(record).find((k) => record[k] === value);
}

// edge tiles in order: top/bottom per column, then left/right per row, no repeats
export function borderWalls(width: number, height: number, except?: Pos): Pos[] {
  const walls: Pos[] = [];
  const seen = new Set<string>(except ? [`${except.x},${except.y}`] : []);
  const add = (x: number, y: number) => {
    const key = `${x},${y}`;
    if (seen.has(key)) return;
    seen.add(key);
    walls.push({ x, y });
  };
  for (let x = 0; x < width; x++) {
    add(x, 0);
    add(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    add(0, y);
    add(width - 1, y);
  }
  return walls;
}

export function inBounds(levelW: number, levelH: number, p: Pos): boolean {
  return p.x >= 0 && p.x < levelW && p.y >= 0 && p.y < levelH;
}

export const isBorderTile = (w: number, h: number, p: Pos) =>
  p.x === 0 || p.y === 0 || p.x === w - 1 || p.y === h - 1;

export const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

export const parseKey = (key: string): [number, number] =>
  key.split(',').map(Number) as [number, number];

export const uniqueSorted = (xs: number[]): number[] =>
  Array.from(new Set(xs)).sort((a, b) => a - b);

// greedy pairs of x, x+1 in a sorted list
export function pairAdjacent(sortedXs: number[]): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < sortedXs.length - 1; ) {
    const x = sortedXs[i]!;
    const x2 = sortedXs[i + 1]!;
    if (x2 === x + 1) {
      pairs.push([x, x2]);
      i += 2;
    } else {
      i += 1;
    }
  }
  return pairs;
}

export const cloneLevel = <T>(data: T): T => JSON.parse(JSON.stringify(data)) as T;

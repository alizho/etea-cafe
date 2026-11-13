import {
  allServed,
  initRemainingOrders,
  isWalkable,
  resolveTile,
  tileHasEffect,
  type Hands,
} from './rules';
import { keyOf, type Level, type Pos } from './types';

// solver using bfs so ppl can't publish impossible levels lol
// each state is tile + hands (inv and remaining orders), both as ints

export type SolveResult =
  | { solvable: true; path: Pos[]; visitedStates: number }
  | { solvable: false; visitedStates: number };

export function solveLevel(level: Level, opts?: { maxVisited?: number }): SolveResult {
  // bfs, cap states in case of impossible levels
  const maxVisited = opts?.maxVisited ?? 50_000;
  const { width, height } = level;
  const tiles = width * height;

  const tileKeys: string[] = [];
  const effect = new Uint8Array(tiles);
  const walkable = new Uint8Array(tiles);
  for (let t = 0; t < tiles; t++) {
    const key = keyOf({ x: t % width, y: Math.floor(t / width) });
    tileKeys.push(key);
    walkable[t] = isWalkable(level, key) ? 1 : 0;
    effect[t] = walkable[t] && tileHasEffect(level, key) ? 1 : 0;
  }

  // 4 slots per tile in +x, -x, +y, -y order, -1 = blocked
  const neighbors = new Int32Array(tiles * 4).fill(-1);
  for (let t = 0; t < tiles; t++) {
    const x = t % width;
    if (x + 1 < width && walkable[t + 1]) neighbors[t * 4] = t + 1;
    if (x > 0 && walkable[t - 1]) neighbors[t * 4 + 1] = t - 1;
    if (t + width < tiles && walkable[t + width]) neighbors[t * 4 + 2] = t + width;
    if (t >= width && walkable[t - width]) neighbors[t * 4 + 3] = t - width;
  }

  // hand states get small ids; needs sorted since order doesn't matter
  const hands: Hands[] = [];
  const handIds = new Map<string, number>();
  const seen: Uint8Array[] = [];
  const done: boolean[] = [];
  const moves: Int32Array[] = [];

  const intern = (h: Hands): number => {
    const key = `${h.inv.join()}|${Object.values(h.remaining)
      .map((needs) => [...needs].sort().join())
      .join('|')}`;
    let id = handIds.get(key);
    if (id === undefined) {
      id = hands.length;
      handIds.set(key, id);
      hands.push(h);
      seen.push(new Uint8Array(tiles));
      done.push(allServed(h.remaining));
      moves.push(new Int32Array(tiles));
    }
    return id;
  };

  const move = (tile: number, hand: number): number => {
    if (!effect[tile]) return hand;
    // stored as id + 1 so 0 means unknown
    const known = moves[hand][tile];
    if (known) return known - 1;
    const h = hands[hand];
    const next = intern(resolveTile(level, tileKeys[tile], h.inv, h.remaining));
    moves[hand][tile] = next + 1;
    return next;
  };

  const qTile: number[] = [level.start.y * width + level.start.x];
  const qHand: number[] = [intern({ inv: [], remaining: initRemainingOrders(level) })];
  const qPrev: number[] = [-1];
  seen[qHand[0]][qTile[0]] = 1;

  for (let head = 0; head < qTile.length; head++) {
    if (head >= maxVisited) return { solvable: false, visitedStates: head + 1 };

    const hand = qHand[head];
    if (done[hand]) {
      const path: Pos[] = [];
      for (let i = head; i >= 0; i = qPrev[i]) {
        const t = qTile[i];
        path.push({ x: t % width, y: Math.floor(t / width) });
      }
      path.reverse();
      return { solvable: true, path, visitedStates: head + 1 };
    }

    const base = qTile[head] * 4;
    for (let i = base; i < base + 4; i++) {
      const n = neighbors[i];
      if (n < 0) continue;
      const h = move(n, hand);
      if (seen[h][n]) continue;
      seen[h][n] = 1;
      qTile.push(n);
      qHand.push(h);
      qPrev.push(head);
    }
  }

  return { solvable: false, visitedStates: qTile.length };
}

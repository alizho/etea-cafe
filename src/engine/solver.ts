import { keyOf, type CustomerId, type DrinkId, type Level, type Pos } from "./types";

// solver using bfs so ppl can't publish impossible levels lol
// each state is pos, inv, and remaining orders

type Inv = DrinkId[];

function pickDrink(inv: Inv, drink: DrinkId): Inv {
  const next = [...inv];
  if (next.length >= 2) next.shift();
  next.push(drink);
  return next;
}

function canServe(inv: Inv, needs: DrinkId[]): boolean {
  const counts: Record<DrinkId, number> = {
    D1: 0,
    D2: 0,
    F1: 0,
    F2: 0,
    F3: 0,
  };
  for (const d of inv) counts[d]++;

  for (const need of needs) {
    if (counts[need] <= 0) return false;
    counts[need]--;
  }
  return true;
}

function removeServed(inv: Inv, needs: DrinkId[]): Inv {
  const remaining = [...inv];
  for (const need of needs) {
    const idx = remaining.indexOf(need);
    if (idx >= 0) remaining.splice(idx, 1);
  }
  return remaining;
}

function serveSome(inv: Inv, remainingNeeds: DrinkId[]): { inv: Inv; remainingNeeds: DrinkId[]; servedAny: boolean } {
  let nextInv = [...inv];
  let nextNeeds = [...remainingNeeds];
  let servedAny = false;

  for (const d of inv) {
    const needIdx = nextNeeds.indexOf(d);
    if (needIdx < 0) continue;

    const invIdx = nextInv.indexOf(d);
    if (invIdx < 0) continue;

    nextInv.splice(invIdx, 1);
    nextNeeds.splice(needIdx, 1);
    servedAny = true;
  }

  return { inv: nextInv, remainingNeeds: nextNeeds, servedAny };
}

function invKey(inv: Inv): string {
  return inv.join("");
}

const CUSTOMER_IDS: CustomerId[] = ["A", "B", "C"];

type RemainingOrders = Record<CustomerId, DrinkId[]>;

function normalizeNeeds(needs: DrinkId[]): string {
  return [...needs].sort().join(",");
}

function remainingKey(remaining: RemainingOrders): string {
  return CUSTOMER_IDS.map((id) => `${id}:${normalizeNeeds(remaining[id] ?? [])}`).join("|");
}

export type SolveResult =
  | { solvable: true; path: Pos[]; visitedStates: number }
  | { solvable: false; visitedStates: number };

export function solveLevel(level: Level, opts?: { maxVisited?: number }): SolveResult {
  // bfs, cap states in case of impossible levels
  const maxVisited = opts?.maxVisited ?? 50_000;

  type Node = {
    pos: Pos;
    inv: Inv;
    remaining: RemainingOrders;
    prev?: string;
  };

  const start: Node = {
    pos: level.start,
    inv: [],
    remaining: {
      A: [...(level.orders.A ?? [])],
      B: [...(level.orders.B ?? [])],
      C: [...(level.orders.C ?? [])],
    },
  };

  const encode = (n: Node) => `${n.pos.x},${n.pos.y}|${invKey(n.inv)}|${remainingKey(n.remaining)}`;

  const q: Node[] = [start];
  const visited = new Set<string>();
  const parent = new Map<string, { prev: string | null; pos: Pos }>();

  const startKey = encode(start);
  visited.add(startKey);
  parent.set(startKey, { prev: null, pos: start.pos });

  let visitedCount = 0;

  const neighbors = (p: Pos): Pos[] => [
    { x: p.x + 1, y: p.y },
    { x: p.x - 1, y: p.y },
    { x: p.x, y: p.y + 1 },
    { x: p.x, y: p.y - 1 },
  ];

  const inBounds = (p: Pos) => p.x >= 0 && p.x < level.width && p.y >= 0 && p.y < level.height;

  while (q.length) {
    const cur = q.shift()!;
    visitedCount++;
    if (visitedCount > maxVisited) {
      return { solvable: false, visitedStates: visitedCount };
    }

    const allServed = CUSTOMER_IDS.every((id) => (cur.remaining[id]?.length ?? 0) === 0);
    if (allServed) {
      const curKey = encode(cur);
      const path: Pos[] = [];
      let k: string | null = curKey;
      while (k) {
        const p = parent.get(k);
        if (!p) break;
        path.push(p.pos);
        k = p.prev;
      }
      path.reverse();
      return { solvable: true, path, visitedStates: visitedCount };
    }

    for (const nextPos of neighbors(cur.pos)) {
      if (!inBounds(nextPos)) continue;
      const posKey = keyOf(nextPos);
      if (level.walls.has(posKey)) continue;
      if (level.customers[posKey]) continue;
      if (level.obstacles[posKey]) continue;

      let inv = cur.inv;
      let remaining = cur.remaining;

      // pickup on station, drop oldest
      const stationDrink = level.drinkStations[posKey];
      if (stationDrink) inv = pickDrink(inv, stationDrink);

      // serve once per customer if current inventory contains (some of) order
      const customerId = level.standHere[posKey] as CustomerId | undefined;
      if (customerId) {
        const needs = remaining[customerId] ?? [];
        if (needs.length > 0) {
          if (canServe(inv, needs)) {
            inv = removeServed(inv, needs);
            remaining = { ...remaining, [customerId]: [] };
          } else {
            const res = serveSome(inv, needs);
            if (res.servedAny) {
              inv = res.inv;
              remaining = { ...remaining, [customerId]: res.remainingNeeds };
            }
          }
        }
      }

      const node: Node = { pos: nextPos, inv, remaining };
      const nodeKey = encode(node);
      if (visited.has(nodeKey)) continue;
      visited.add(nodeKey);
      parent.set(nodeKey, { prev: encode(cur), pos: nextPos });
      q.push(node);
    }
  }

  return { solvable: false, visitedStates: visitedCount };
}

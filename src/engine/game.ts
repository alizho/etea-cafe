import { keyOf, manhattan1, type CustomerId, type DrinkId, type Level, type Pos } from "./types";

export type SimStatus = "idle" | "running" | "success" | "failed";

export type GameState = {
  level: Level;

  // list of visited tiles 
  path: Pos[];

  status: SimStatus;
  stepIndex: number; // what we doing next
  stepsTaken: number;

  glorboPos: Pos;

  // queue max 2 drop oldest
  inventory: DrinkId[];

  // remaining items per customer lawl
  remainingOrders: Record<CustomerId, DrinkId[]>;
  message?: string;
};

function initRemainingOrders(level: Level): Record<CustomerId, DrinkId[]> {
  return {
    A: [...(level.orders.A ?? [])],
    B: [...(level.orders.B ?? [])],
    C: [...(level.orders.C ?? [])],
  };
}

export function initGame(level: Level): GameState {
  return {
    level,
    path: [level.start],
    status: "idle",
    stepIndex: 0,
    stepsTaken: 0,
    glorboPos: level.start,
    inventory: [],
    remainingOrders: initRemainingOrders(level),
    message: "---",
  };
}

export function canAppendToPath(state: GameState, next: Pos): boolean {
  const last = state.path[state.path.length - 1];
  if (!last) return false;
  if (!manhattan1(last, next)) return false; // "orthagonically"
  if (state.level.walls.has(keyOf(next))) return false;
  // can't step on customers
  if (state.level.customers[keyOf(next)]) return false;
  // can't step on obstacles
  if (state.level.obstacles[keyOf(next)]) return false;
  return true; // allow revisits
}

export function tryAppendPath(state: GameState, next: Pos): GameState {
  if (state.status !== "idle") return state;
  if (!canAppendToPath(state, next)) return state;
  return { ...state, path: [...state.path, next] };
}

export function clearPath(state: GameState): GameState {
  const fresh = initGame(state.level);
  return { ...fresh, message: "try a new path" };
}

function pickDrink(inv: DrinkId[], drink: DrinkId): DrinkId[] {
  const next = [...inv];
  if (next.length >= 2) next.shift();
  next.push(drink);
  return next;
}

function canServe(inv: DrinkId[], needs: DrinkId[]): boolean {
  const counts: Record<DrinkId, number> = { D1: 0, D2: 0, F1: 0, F2: 0, F3: 0 };
  for (const d of inv) counts[d]++;

  for (const need of needs) {
    if (counts[need] <= 0) return false;
    counts[need]--;
  }
  return true;
}

function removeServed(inv: DrinkId[], needs: DrinkId[]): DrinkId[] {
  const remaining = [...inv];
  for (const need of needs) {
    const idx = remaining.indexOf(need);
    if (idx >= 0) remaining.splice(idx, 1);
  }
  return remaining;
}

function serveSome(inv: DrinkId[], remainingNeeds: DrinkId[]): { inv: DrinkId[]; remainingNeeds: DrinkId[]; servedAny: boolean } {
  let nextInv = [...inv];
  let nextNeeds = [...remainingNeeds];
  let servedAny = false;

  // any items in inventory that are in order
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

export function stepSimulation(state: GameState): GameState {
  if (state.status !== "running") return state;

  const nextIndex = state.stepIndex + 1;
  if (nextIndex >= state.path.length) {
    const allServed = Object.values(state.remainingOrders).every((needs) => needs.length === 0);
    return {
      ...state,
      status: allServed ? "success" : "failed",
      message: allServed
        ? `nice! steps: ${state.stepsTaken}`
        : "customers unhappy",
    };
  }

  const nextPos = state.path[nextIndex];
  const posKey = keyOf(nextPos);

  // can't step on walls, customers, or obstacles (but floor still shows under customers)
  if (state.level.walls.has(posKey) || state.level.customers[posKey] || state.level.obstacles[posKey]) {
    return {
      ...state,
      stepIndex: nextIndex,
      stepsTaken: state.stepsTaken + 1,
    };
  }

  let inventory = state.inventory;
  let remainingOrders = state.remainingOrders;

  const customerId = state.level.standHere[posKey] as CustomerId | undefined;

  const tryServeAtTile = () => {
    if (!customerId) return;
    const needs = remainingOrders[customerId] ?? [];
    if (needs.length === 0) return;

    // first check if we can fully serve
    if (canServe(inventory, needs)) {
      inventory = removeServed(inventory, needs);
      remainingOrders = { ...remainingOrders, [customerId]: [] };
      return;
    }

    // orrrr serve what we can
    const res = serveSome(inventory, needs);
    if (res.servedAny) {
      inventory = res.inv;
      remainingOrders = { ...remainingOrders, [customerId]: res.remainingNeeds };
    }
  };

  //if stand tile overlaps station, serve first
  tryServeAtTile();

  // pickup
  const stationDrink = state.level.drinkStations[posKey];
  if (stationDrink) {
    inventory = pickDrink(inventory, stationDrink);
  }

  // try serving again
  tryServeAtTile();

  const allServedNow = Object.values(remainingOrders).every((needs) => needs.length === 0);

  return {
    ...state,
    glorboPos: nextPos,
    stepIndex: nextIndex,
    stepsTaken: state.stepsTaken + 1,
    inventory,
    remainingOrders,
    status: allServedNow ? "success" : state.status,
    message: allServedNow ? "success!" : state.message,
  };
}

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

  served: Record<CustomerId, boolean>;
  message?: string;
};

function initServed(level: Level): Record<CustomerId, boolean> {
  const served: Record<CustomerId, boolean> = { "A": false, "B": false, "C": false };
  for (const id of Object.keys(level.orders) as CustomerId[]) {
    served[id] = false;
  }
  return served;
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
    served: initServed(level),
    message: "yea",
  };
}

export function canAppendToPath(state: GameState, next: Pos): boolean {
  const last = state.path[state.path.length - 1];
  if (!last) return false;
  if (!manhattan1(last, next)) return false; // "orthagonically"
  if (state.level.walls.has(keyOf(next))) return false;
  // can't step on customers
  if (state.level.customers[keyOf(next)]) return false;
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
  const counts: Record<DrinkId, number> = { D1: 0, D2: 0 };
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

export function stepSimulation(state: GameState): GameState {
  if (state.status !== "running") return state;

  const nextIndex = state.stepIndex + 1;
  if (nextIndex >= state.path.length) {
    const allServed = Object.values(state.served).every(Boolean);
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

  // can't step on walls or customers (but floor still shows under customers)
  if (state.level.walls.has(posKey) || state.level.customers[posKey]) {
    return {
      ...state,
      stepIndex: nextIndex,
      stepsTaken: state.stepsTaken + 1,
    };
  }

  let inventory = state.inventory;

  // pickup
  const stationDrink = state.level.drinkStations[posKey];
  if (stationDrink) {
    inventory = pickDrink(inventory, stationDrink);
  }

  // serve customer when standing on standHere tile
  const customerId = state.level.standHere[posKey] as CustomerId | undefined;
  let served = state.served;
  if (customerId && !served[customerId]) {
    const needs = state.level.orders[customerId];
    if (needs && canServe(inventory, needs)) {
      inventory = removeServed(inventory, needs);
      served = { ...served, [customerId]: true };
    }
  }

  const allServedNow = Object.values(served).every(Boolean);

  return {
    ...state,
    glorboPos: nextPos,
    stepIndex: nextIndex,
    stepsTaken: state.stepsTaken + 1,
    inventory,
    served,
    status: allServedNow ? "success" : state.status,
    message: allServedNow ? `success! steps: ${state.stepsTaken + 1}` : state.message,
  };
}

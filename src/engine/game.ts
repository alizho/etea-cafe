import { allServed, initRemainingOrders, isWalkable, resolveTile } from './rules';
import { keyOf, manhattan1, type CustomerId, type DrinkId, type Level, type Pos } from './types';

export type SimStatus = 'idle' | 'running' | 'success' | 'failed';

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

export function initGame(level: Level): GameState {
  return {
    level,
    path: [level.start],
    status: 'idle',
    stepIndex: 0,
    stepsTaken: 0,
    glorboPos: level.start,
    inventory: [],
    remainingOrders: initRemainingOrders(level),
    message: '---',
  };
}

export function canAppendToPath(state: GameState, next: Pos): boolean {
  const last = state.path[state.path.length - 1];
  if (!last) return false;
  if (!manhattan1(last, next)) return false; // "orthagonically"
  return isWalkable(state.level, keyOf(next)); // allow revisits
}

export function tryAppendPath(state: GameState, next: Pos): GameState {
  if (state.status !== 'idle') return state;
  if (!canAppendToPath(state, next)) return state;
  return { ...state, path: [...state.path, next] };
}

export function clearPath(state: GameState): GameState {
  const fresh = initGame(state.level);
  return { ...fresh, message: 'try a new path' };
}

export function stepSimulation(state: GameState): GameState {
  if (state.status !== 'running') return state;

  const nextIndex = state.stepIndex + 1;
  if (nextIndex >= state.path.length) {
    const done = allServed(state.remainingOrders);
    return {
      ...state,
      status: done ? 'success' : 'failed',
      message: done ? `nice! steps: ${state.stepsTaken}` : 'customers unhappy',
    };
  }

  const nextPos = state.path[nextIndex];
  const posKey = keyOf(nextPos);

  // blocked tiles still cost a step (but floor still shows under customers)
  if (!isWalkable(state.level, posKey)) {
    return {
      ...state,
      stepIndex: nextIndex,
      stepsTaken: state.stepsTaken + 1,
    };
  }

  const { inv, remaining } = resolveTile(
    state.level,
    posKey,
    state.inventory,
    state.remainingOrders
  );
  const allServedNow = allServed(remaining);

  return {
    ...state,
    glorboPos: nextPos,
    stepIndex: nextIndex,
    stepsTaken: state.stepsTaken + 1,
    inventory: inv,
    remainingOrders: remaining,
    status: allServedNow ? 'success' : state.status,
    message: allServedNow ? 'success!' : state.message,
  };
}

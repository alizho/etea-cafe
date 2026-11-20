import { initGame, stepSimulation, type GameState } from './game';
import type { CustomerId, DrinkId, Pos } from './types';

// helpers that play a drawn path through the real engine without touching the live game

export type Drop = { pos: Pos; item: DrinkId };

function run(
  state: GameState,
  path: Pos[],
  onStep?: (before: GameState, after: GameState) => void
): GameState {
  let sim: GameState = { ...initGame(state.level), path, status: 'running' };
  while (sim.status === 'running') {
    const before = sim;
    sim = stepSimulation(sim);
    if (sim.stepIndex === before.stepIndex) break;
    onStep?.(before, sim);
  }
  return sim;
}

// multiset difference, removing first matches
function without(items: DrinkId[], remove: DrinkId[]): DrinkId[] {
  const left = [...items];
  for (const d of remove) {
    const i = left.indexOf(d);
    if (i >= 0) left.splice(i, 1);
  }
  return left;
}

// final state after running the whole path (stops early on success, like the real run)
export function simulatePath(state: GameState, path: Pos[]): GameState {
  return run(state, path);
}

// run a path through the real engine and record every time something got knocked out of your hands
export function findDrops(state: GameState, path: Pos[]): Drop[] {
  const found: Drop[] = [];
  run(state, path, (before, after) => {
    // items that left your hands this step and weren't served = dropped
    let left = without(before.inventory, after.inventory);
    for (const id of Object.keys(before.remainingOrders) as CustomerId[]) {
      left = without(left, without(before.remainingOrders[id], after.remainingOrders[id]));
    }
    for (const item of left) found.push({ pos: after.glorboPos, item });
  });
  return found;
}

// drops that explain a failed run: stuff a waiting customer needed and you don't have anymore
// skips on-purpose drops (junk, a spare a spill took)
export function neededDrops(
  drops: Drop[],
  remaining: Record<CustomerId, DrinkId[]>,
  holding: DrinkId[] = []
): Drop[] {
  const stillNeeded = Object.values(remaining).flat();
  for (const d of holding) {
    const i = stillNeeded.indexOf(d);
    if (i >= 0) stillNeeded.splice(i, 1); // still in your hands, so dropping a copy didn't cost you
  }
  return drops.filter((d) => {
    const i = stillNeeded.indexOf(d.item);
    if (i < 0) return false;
    stillNeeded.splice(i, 1); // one drop per missing item
    return true;
  });
}

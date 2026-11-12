import { initGame, stepSimulation, type GameState } from './game';
import type { CustomerId, DrinkId, Pos } from './types';

// helpers that play a drawn path through the real engine without touching the live game

export type Drop = { pos: Pos; item: DrinkId };

// final state after running the whole path (stops early on success, like the real run)
export function simulatePath(state: GameState, path: Pos[]): GameState {
  let sim: GameState = { ...initGame(state.level), path, status: 'running' };
  while (sim.status === 'running') {
    const before = sim.stepIndex;
    sim = stepSimulation(sim);
    if (sim.stepIndex === before) break;
  }
  return sim;
}

// run a path through the real engine and record every time something got knocked out of your hands
export function findDrops(state: GameState, path: Pos[]): Drop[] {
  let sim: GameState = { ...initGame(state.level), path, status: 'running' };
  const found: Drop[] = [];

  while (sim.status === 'running') {
    const before = sim;
    sim = stepSimulation(sim);
    if (sim.stepIndex === before.stepIndex) break;

    // items that left your hands this step and weren't served = dropped
    const left = [...before.inventory];
    for (const d of sim.inventory) {
      const i = left.indexOf(d);
      if (i >= 0) left.splice(i, 1);
    }
    for (const id of Object.keys(before.remainingOrders) as CustomerId[]) {
      const served = [...before.remainingOrders[id]];
      for (const d of sim.remainingOrders[id]) {
        const i = served.indexOf(d);
        if (i >= 0) served.splice(i, 1);
      }
      for (const d of served) {
        const i = left.indexOf(d);
        if (i >= 0) left.splice(i, 1);
      }
    }
    for (const item of left) found.push({ pos: sim.glorboPos, item });
  }
  return found;
}

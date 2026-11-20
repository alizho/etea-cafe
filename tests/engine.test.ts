import { describe, expect, it } from 'vitest';
import { buildLevel } from '../src/levels/loader';
import * as cur from '../src/engine/game';
import * as curSim from '../src/engine/simulate';
import * as old from './legacy/game';
import * as oldSim from './legacy/simulate';
import { randomLevel, rng } from './gen';
import type { Pos } from '../src/engine/types';

function randomPath(seed: number, level: ReturnType<typeof buildLevel>): Pos[] {
  const r = rng(seed * 7 + 3);
  let st = old.initGame(level);
  const len = Math.floor(r() * 45);
  for (let i = 0; i < len; i++) {
    const last = st.path[st.path.length - 1];
    const d = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ][Math.floor(r() * 4)];
    st = old.tryAppendPath(st, { x: last.x + d[0], y: last.y + d[1] });
  }
  return st.path;
}

const pick = (s: cur.GameState | old.GameState) => ({
  status: s.status,
  stepsTaken: s.stepsTaken,
  stepIndex: s.stepIndex,
  glorboPos: s.glorboPos,
  inventory: s.inventory,
  remainingOrders: s.remainingOrders,
  message: s.message,
});

describe('engine matches legacy behavior', () => {
  it('random paths on random levels', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const level = buildLevel(randomLevel(seed));
      for (let k = 0; k < 8; k++) {
        const path = randomPath(seed * 100 + k, level);
        const a = old.initGame(level);
        const b = cur.initGame(level);
        expect(pick(curSim.simulatePath(b, path))).toEqual(pick(oldSim.simulatePath(a, path)));
        expect(curSim.findDrops(b, path)).toEqual(oldSim.findDrops(a, path));
        let sa: old.GameState = { ...old.initGame(level), path, status: 'running' };
        let sb: cur.GameState = { ...cur.initGame(level), path, status: 'running' };
        for (let i = 0; i < path.length + 2; i++) {
          sa = old.stepSimulation(sa);
          sb = cur.stepSimulation(sb);
          expect(pick(sb)).toEqual(pick(sa));
        }
      }
    }
  });

  it('path editing matches', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const level = buildLevel(randomLevel(seed));
      const r = rng(seed);
      let a = old.initGame(level);
      let b = cur.initGame(level);
      for (let i = 0; i < 30; i++) {
        const p = { x: Math.floor(r() * level.width), y: Math.floor(r() * level.height) };
        expect(cur.canAppendToPath(b, p)).toBe(old.canAppendToPath(a, p));
        a = old.tryAppendPath(a, p);
        b = cur.tryAppendPath(b, p);
        expect(b.path).toEqual(a.path);
      }
      expect(pick(cur.clearPath(b))).toEqual(pick(old.clearPath(a)));
    }
  });
});

describe('neededDrops', () => {
  const at = { x: 0, y: 0 };
  it('keeps only drops a waiting customer still needs, once per missing item', () => {
    const drops = [
      { pos: at, item: 'D2' as const }, // junk: nobody wants it
      { pos: at, item: 'D1' as const }, // A still wants a tea
      { pos: at, item: 'D1' as const }, // a 2nd tea, but only one is missing
    ];
    const remaining = { A: ['D1' as const], B: [], C: [] };
    expect(curSim.neededDrops(drops, remaining).map((d) => d.item)).toEqual(['D1']);
  });

  it('skips a dropped item when you still hold a copy', () => {
    const drops = [{ pos: at, item: 'D1' as const }]; // the spare tea a spill took
    const remaining = { A: ['D1' as const], B: [], C: [] };
    expect(curSim.neededDrops(drops, remaining, ['D1'])).toEqual([]);
  });

  it('shows nothing when everyone is served', () => {
    const drops = [{ pos: at, item: 'F1' as const }];
    expect(curSim.neededDrops(drops, { A: [], B: [], C: [] })).toEqual([]);
  });
});

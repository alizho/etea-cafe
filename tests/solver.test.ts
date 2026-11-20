// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import levels from '../src/levels/levels.json';
import type { LevelData } from '../src/levels/level.schema';
import { buildLevel } from '../src/levels/loader';
import { solveLevel } from '../src/engine/solver';
import { solveLevel as oldSolve } from './legacy/solver';
import { simulatePath } from '../src/engine/simulate';
import { initGame } from '../src/engine/game';
import { TUTORIAL_LESSONS } from '../src/tutorial';
import { randomLevel } from './gen';

// the legacy solver predates spills, so spill levels get their own test below
const named: LevelData[] = [
  ...(levels as unknown as LevelData[]),
  ...TUTORIAL_LESSONS.map((l) => l.data),
].filter((d) => !d.spills?.length);

function check(data: LevelData) {
  const level = buildLevel(data);
  const a = oldSolve(level);
  const b = solveLevel(level);
  expect(b.solvable, data.id).toBe(a.solvable);
  if (a.solvable && b.solvable) {
    expect(b.path.length, data.id).toBe(a.path.length);
    expect(b.path[0]).toEqual(level.start);
    const end = simulatePath(initGame(level), b.path);
    expect(end.status, data.id).toBe('success');
    expect(end.stepsTaken).toBe(b.path.length - 1);
  }
  return { a, b };
}

describe('solver', () => {
  it('shipped + tutorial levels: same optimal length as legacy', () => {
    for (const d of named) {
      const { a, b } = check(d);
      console.log(
        d.id,
        a.solvable ? a.path.length - 1 : 'unsolvable',
        'visited',
        a.visitedStates,
        '->',
        b.visitedStates
      );
    }
  });

  it('spills: only the oldest item is dropped', () => {
    const data = TUTORIAL_LESSONS.find((l) => l.data.id === 'tutorial-spill')!.data;
    // tea at (2,3), then food at (3,3), then the spill at (4,3)
    const level = buildLevel({
      ...data,
      drinkStations: [...data.drinkStations, { x: 3, y: 3, drink: 'F1' }],
    });
    const path = [1, 2, 3, 4].map((x) => ({ x, y: 3 }));
    const end = simulatePath({ ...initGame(level), path }, path);
    expect(end.inventory).toEqual(['F1']);
  });

  it('spills: walking through with one item fails, a spare item gets you through', () => {
    const data = TUTORIAL_LESSONS.find((l) => l.data.id === 'tutorial-spill')!.data;
    const level = buildLevel(data);

    // straight line (start -> tea -> through the spill -> sparkle) fails
    const straight = [1, 2, 3, 4, 5, 6].map((x) => ({ x, y: 3 }));
    expect(simulatePath(initGame(level), straight).status).toBe('failed');

    // going around the spill column works (9 steps)
    const around = [
      [1, 3],
      [2, 3],
      [3, 3],
      [3, 2],
      [3, 1],
      [4, 1],
      [5, 1],
      [5, 2],
      [5, 3],
      [6, 3],
    ].map(([x, y]) => ({ x, y }));
    expect(simulatePath(initGame(level), around).status).toBe('success');

    // but grabbing a 2nd tea first lets the spill take the spare: 7 steps
    const r = solveLevel(level);
    expect(r.solvable && r.path.length - 1).toBe(7);
    if (r.solvable) {
      expect(r.path.some((p) => level.spills.has(`${p.x},${p.y}`))).toBe(true);
      expect(simulatePath(initGame(level), r.path).status).toBe('success');
    }
  });

  it('day-001 optimal is 25 moves', () => {
    const r = solveLevel(buildLevel((levels as unknown as LevelData[])[0]));
    expect(r.solvable && r.path.length - 1).toBe(25);
  });

  it('random levels: same solvability and optimal length', () => {
    let solvable = 0;
    for (let seed = 1; seed <= 600; seed++) if (check(randomLevel(seed)).a.solvable) solvable++;
    console.log('random solvable', solvable, '/ 600');
    expect(solvable).toBeGreaterThan(100);
  });

  it('respects maxVisited cap on huge search', () => {
    const r = solveLevel(buildLevel(randomLevel(5)), { maxVisited: 1 });
    expect(r.visitedStates).toBeLessThanOrEqual(2);
  });

  it('speed', () => {
    const lvls = named
      .concat(Array.from({ length: 300 }, (_, i) => randomLevel(i + 1)))
      .map(buildLevel);
    const time = (f: typeof solveLevel) => {
      const t = performance.now();
      for (let rep = 0; rep < 3; rep++) for (const l of lvls) f(l);
      return performance.now() - t;
    };
    time(oldSolve);
    time(solveLevel);
    const to = time(oldSolve);
    const tn = time(solveLevel);
    console.log(
      `solver legacy ${to.toFixed(0)}ms  new ${tn.toFixed(0)}ms  (${(to / tn).toFixed(2)}x)`
    );
  });
});

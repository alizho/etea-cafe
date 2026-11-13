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

const named: LevelData[] = [
  ...(levels as unknown as LevelData[]),
  ...TUTORIAL_LESSONS.map((l) => l.data),
];

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
      console.log(d.id, a.solvable ? a.path.length - 1 : 'unsolvable', 'visited', a.visitedStates, '->', b.visitedStates);
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
    const lvls = named.concat(Array.from({ length: 300 }, (_, i) => randomLevel(i + 1))).map(buildLevel);
    const time = (f: typeof solveLevel) => {
      const t = performance.now();
      for (let rep = 0; rep < 3; rep++) for (const l of lvls) f(l);
      return performance.now() - t;
    };
    time(oldSolve);
    time(solveLevel);
    const to = time(oldSolve);
    const tn = time(solveLevel);
    console.log(`solver legacy ${to.toFixed(0)}ms  new ${tn.toFixed(0)}ms  (${(to / tn).toFixed(2)}x)`);
  });
});

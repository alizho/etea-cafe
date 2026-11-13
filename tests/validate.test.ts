import { expect, it } from 'vitest';
import levels from '../src/levels/levels.json';
import type { LevelData } from '../src/levels/level.schema';
import { validateLevelData } from '../src/levels/validate';
import { buildLevel } from '../src/levels/loader';
import { randomLevel } from './gen';

it('validate + buildLevel snapshot', () => {
  const all = [...(levels as unknown as LevelData[]), ...Array.from({ length: 150 }, (_, i) => randomLevel(i + 1))];
  const out = all.map((d) => {
    const l = buildLevel(d);
    return { id: d.id, v: validateLevelData(d), level: { ...l, walls: [...l.walls].sort() } };
  });
  expect(out).toMatchSnapshot();
});

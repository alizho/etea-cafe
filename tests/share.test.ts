import { describe, expect, it } from 'vitest';
import levels from '../src/levels/levels.json';
import type { LevelData } from '../src/levels/level.schema';
import * as cur from '../src/share';
import * as old from './legacy/share';
import { randomLevel } from './gen';

const all: LevelData[] = [
  ...(levels as unknown as LevelData[]),
  ...Array.from({ length: 200 }, (_, i) => randomLevel(i + 1)),
];

describe('share tokens stay compatible', () => {
  it('encode produces identical tokens and decode identical data', async () => {
    for (const d of all) {
      let oldTok: string | null = null;
      let oldErr: unknown = null;
      try {
        oldTok = await old.encodeLevelShareToken(d);
      } catch (e) {
        oldErr = e;
      }
      if (oldErr) {
        await expect(cur.encodeLevelShareToken(d)).rejects.toThrow();
        continue;
      }
      expect(await cur.encodeLevelShareToken(d), d.id).toBe(oldTok);
      expect(await cur.decodeLevelShareToken(oldTok!)).toEqual(await old.decodeLevelShareToken(oldTok!));
    }
  });

  it('garbage tokens', async () => {
    for (const t of ['', 'abc', '!!!!', 'AAAAAAAAAA', 'zzzz-_zz']) {
      expect(await cur.decodeLevelShareToken(t)).toEqual(await old.decodeLevelShareToken(t));
    }
  });
});

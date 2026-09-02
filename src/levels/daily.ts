import levels from './levels.json';
import type { LevelData } from './level.schema';
import { getTodayDateEST, getLevelHistory, getLevelByDate } from '../supabase/api';

export function getDailyLevelData(): LevelData {
  const all = levels as unknown as LevelData[];
  if (all.length === 0) {
    throw new Error('erm awkward');
  }

  // est date hehehehe
  const estDate = getTodayDateEST(); // "YYYY-MM-DD"
  const [year, month, day] = estDate.split('-').map(Number);
  const estDay = Date.UTC(year, month - 1, day);
  const dayIndex = Math.floor(estDay / 86_400_000);
  const idx = ((dayIndex % all.length) + all.length) % all.length;
  return all[idx];
}

export type LevelResult = {
  levelData: LevelData;
  levelId: string | null; // database level ID, null if using fallback
  date: string;
};

// Load the first published level, with levels.json as an offline fallback.
export async function getFirstLevelFromSupabase(): Promise<LevelResult> {
  try {
    const history = await getLevelHistory();
    const first = history[0];
    if (!first) throw new Error('no published levels');

    const level = await getLevelByDate(first.date);
    if (!level?.json) throw new Error('first level has no data');

    const jsonData = Array.isArray(level.json) ? level.json[0] : level.json;
    if (!jsonData) throw new Error('first level is empty');

    const levelData = jsonData as LevelData;
    console.log('loaded first level', levelData.id);
    return { levelData, levelId: level.id, date: first.date };
  } catch (error) {
    console.error('supabase error', error);
    const fallback = getDailyLevelData();
    return { levelData: fallback, levelId: null, date: getTodayDateEST() };
  }
}

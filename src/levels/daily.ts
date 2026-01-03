import levels from "./levels.json";
import type { LevelData } from "./level.schema";

export function getDailyLevelData(date: Date = new Date()): LevelData {
  const all = levels as unknown as LevelData[];
  if (all.length === 0) {
    throw new Error("erm awkward");
  }

  const utcDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const dayIndex = Math.floor(utcDay / 86_400_000);
  const idx = ((dayIndex % all.length) + all.length) % all.length;
  return all[idx];
}

// think abt later w supabase and alicia database stuff

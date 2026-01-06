import levels from "./levels.json";
import type { LevelData } from "./level.schema";
import { getTodayLevel } from "../supabase/api";

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

// get todays lvl with fallback to levels.json
export async function getTodayLevelFromSupabase(): Promise<LevelData> {
  try {
    const supabaseLevel = await getTodayLevel();

    console.log("Supabase response:", supabaseLevel);

    if (!supabaseLevel) {
      console.warn(
        "no lvl in supabase, using fallback",
      );
      const fallback = getDailyLevelData();
      return fallback;
    }

    if (!supabaseLevel.json) {
      console.warn("supabase lvl has no json, using fallback");
      const fallback = getDailyLevelData();
      return fallback;
    }

    // handle jsonb array response from supabase
    const jsonData = Array.isArray(supabaseLevel.json) 
      ? supabaseLevel.json[0] 
      : supabaseLevel.json;
    
    if (!jsonData) {
      console.warn("supabase lvl json is empty, using fallback");
      const fallback = getDailyLevelData();
      return fallback;
    }

    const levelData = jsonData as LevelData;
    console.log("loaded", levelData.id);
    return levelData;
  } catch (error) {
    console.error("supabase error", error);
    console.log("using fallback");
    const fallback = getDailyLevelData();
    console.log("loaded fallback", fallback.id);
    return fallback;
  }
}

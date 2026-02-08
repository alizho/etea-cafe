import levels from "./levels.json";
import type { LevelData } from "./level.schema";
import { getTodayLevel, getTodayDateEST } from "../supabase/api";

export function getDailyLevelData(): LevelData {
  const all = levels as unknown as LevelData[];
  if (all.length === 0) {
    throw new Error("erm awkward");
  }

  // est date hehehehe
  const estDate = getTodayDateEST(); // "YYYY-MM-DD"
  const [year, month, day] = estDate.split("-").map(Number);
  const estDay = Date.UTC(year, month - 1, day);
  const dayIndex = Math.floor(estDay / 86_400_000);
  const idx = ((dayIndex % all.length) + all.length) % all.length;
  return all[idx];
}

export type DailyLevelResult = {
  levelData: LevelData;
  levelId: string | null; // database level ID, null if using fallback
};

// get todays lvl with fallback to levels.json
export async function getTodayLevelFromSupabase(): Promise<DailyLevelResult> {
  try {
    const supabaseLevel = await getTodayLevel();

    console.log("Supabase response:", supabaseLevel);

    if (!supabaseLevel) {
      console.warn(
        "no lvl in supabase, using fallback",
      );
      const fallback = getDailyLevelData();
      return { levelData: fallback, levelId: null };
    }

    if (!supabaseLevel.json) {
      console.warn("supabase lvl has no json, using fallback");
      const fallback = getDailyLevelData();
      return { levelData: fallback, levelId: null };
    }

    // handle jsonb array response from supabase
    const jsonData = Array.isArray(supabaseLevel.json) 
      ? supabaseLevel.json[0] 
      : supabaseLevel.json;
    
    if (!jsonData) {
      console.warn("supabase lvl json is empty, using fallback");
      const fallback = getDailyLevelData();
      return { levelData: fallback, levelId: null };
    }

    const levelData = jsonData as LevelData;
    console.log("loaded", levelData.id);
    return { levelData, levelId: supabaseLevel.id };
  } catch (error) {
    console.error("supabase error", error);
    console.log("using fallback");
    const fallback = getDailyLevelData();
    console.log("loaded fallback", fallback.id);
    return { levelData: fallback, levelId: null };
  }
}

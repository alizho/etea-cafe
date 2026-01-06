import { supabase } from "./client";

export async function getLevelByDate(date: string) {
  const { data, error } = await supabase
    .from("levels")
    .select("id, json")
    .eq("date", date)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  // PGRST116 = no rows
  return data;
}

export async function getTodayLevel() {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  return getLevelByDate(today);
}

// um for previous levels?
export async function getLevelHistory(limit: number = 30) {
  const { data, error } = await supabase
    .from("levels")
    .select("id, date")
    .order("date", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}
export function getPlayerId(): string {
  let playerId = localStorage.getItem("playerId");
  if (!playerId) {
    playerId = crypto.randomUUID();
    localStorage.setItem("playerId", playerId);
  }
  return playerId;
}

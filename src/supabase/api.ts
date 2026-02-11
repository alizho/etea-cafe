import { supabase } from './client';

// returns today's date as YYYY-MM-DD in Eastern Time (America/New_York)
// handles EST/EDT daylight saving transitions automatically
export function getTodayDateEST(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date()); // "YYYY-MM-DD"
}

export async function getLevelByDate(date: string) {
  const today = getTodayDateEST();
  if (date > today) return null; // never expose future levels

  const { data, error } = await supabase
    .from('levels')
    .select('id, json')
    .eq('date', date)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  // PGRST116 = no rows
  return data;
}

export async function getTodayLevel() {
  const today = getTodayDateEST();
  return getLevelByDate(today);
}

// um for previous levels?
export async function getLevelHistory(limit: number = 30) {
  const { data, error } = await supabase
    .from('levels')
    .select('id, date')
    .order('date', { ascending: false })
    .limit(limit);

  if (error) throw error;
  const today = getTodayDateEST();
  return (data ?? []).filter((row) => row.date <= today);
}
export function getPlayerId(): string {
  let playerId = localStorage.getItem('playerId');
  if (!playerId) {
    playerId = crypto.randomUUID();
    localStorage.setItem('playerId', playerId);
  }
  return playerId;
}

// get best score from localStorage for a specific level
export function getBestScoreFromStorage(levelId: string): number | null {
  const key = `bestScore_${levelId}`;
  const stored = localStorage.getItem(key);
  return stored ? parseInt(stored, 10) : null;
}

// set best score in localStorage for a specific level
export function setBestScoreInStorage(levelId: string, moves: number): void {
  const key = `bestScore_${levelId}`;
  localStorage.setItem(key, moves.toString());
}

// check if player already has a run in the database for this level
export async function hasRunInDatabase(levelId: string, playerId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('runs')
    .select('id')
    .eq('level_id', levelId)
    .eq('player_anon_id', playerId)
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  // PGRST116 = no rows
  return data !== null;
}

export async function submitRun(
  levelId: string,
  playerId: string,
  moves: number,
  success: boolean
) {
  const { data, error } = await supabase
    .from('runs')
    .insert({
      level_id: levelId,
      player_anon_id: playerId,
      moves,
      success,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getTopScoreForLevel(
  levelId: string,
  playerId: string
): Promise<{ moves: number } | null> {
  const { data, error } = await supabase
    .from('runs')
    .select('moves')
    .eq('level_id', levelId)
    .eq('player_anon_id', playerId)
    .eq('success', true)
    .order('moves', { ascending: true })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  // PGRST116 = no rows
  return data;
}

// calculate percentile for a given score
export function calculatePercentile(score: number, allScores: number[]): number {
  if (allScores.length === 0) return 100;

  const betterScores = allScores.filter((s) => s < score).length;
  const percentile = (betterScores / allScores.length) * 100;
  return Math.round(percentile);
}

// get all scores for a level to calculate percentile
export async function getAllScoresForLevel(levelId: string): Promise<number[]> {
  const { data, error } = await supabase
    .from('runs')
    .select('moves')
    .eq('level_id', levelId)
    .eq('success', true)
    .order('moves', { ascending: true });

  if (error) throw error;
  return data?.map((r) => r.moves) || [];
}

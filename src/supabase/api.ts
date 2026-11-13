import { supabase } from './client';

// .single() reports "no rows" as error PGRST116; treat that as a null result
const NO_ROWS = 'PGRST116';

function dataOrNullIfNoRows<T>(res: { data: T; error: { code: string } | null }): T {
  if (res.error && res.error.code !== NO_ROWS) throw res.error;
  return res.data;
}

function dataOrThrow<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

const successfulRunMoves = (levelId: string) =>
  supabase.from('runs').select('moves').eq('level_id', levelId).eq('success', true);

const bestScoreKey = (levelId: string) => `bestScore_${levelId}`;

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

  return dataOrNullIfNoRows(
    await supabase.from('levels').select('id, json').eq('date', date).single()
  );
}

export async function getTodayLevel() {
  const today = getTodayDateEST();
  return getLevelByDate(today);
}

export async function getLevelHistory(limit: number = 1000) {
  const data = dataOrThrow(
    await supabase.from('levels').select('id, date').order('date', { ascending: true }).limit(limit)
  );
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
  const stored = localStorage.getItem(bestScoreKey(levelId));
  return stored ? parseInt(stored, 10) : null;
}

// set best score in localStorage for a specific level
export function setBestScoreInStorage(levelId: string, moves: number): void {
  localStorage.setItem(bestScoreKey(levelId), moves.toString());
}

// check if player already has a run in the database for this level
export async function hasRunInDatabase(levelId: string, playerId: string): Promise<boolean> {
  const data = dataOrNullIfNoRows(
    await supabase
      .from('runs')
      .select('id')
      .eq('level_id', levelId)
      .eq('player_anon_id', playerId)
      .limit(1)
      .single()
  );
  return data !== null;
}

export async function submitRun(
  levelId: string,
  playerId: string,
  moves: number,
  success: boolean
) {
  return dataOrThrow(
    await supabase
      .from('runs')
      .insert({
        level_id: levelId,
        player_anon_id: playerId,
        moves,
        success,
      })
      .select()
      .single()
  );
}

export async function getTopScoreForLevel(
  levelId: string,
  playerId: string
): Promise<{ moves: number } | null> {
  return dataOrNullIfNoRows(
    await successfulRunMoves(levelId)
      .eq('player_anon_id', playerId)
      .order('moves', { ascending: true })
      .limit(1)
      .single()
  );
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
  const data = dataOrThrow(await successfulRunMoves(levelId).order('moves', { ascending: true }));
  return data?.map((r) => r.moves) || [];
}

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

/**
 * The X API free tier allows a few hundred posts a month while the site
 * publishes far more articles than that, so posting is rationed: the monthly
 * budget is spread over the days left in the month rather than being burned
 * through in the first week.
 */
export const DEFAULT_MONTHLY_LIMIT = 450;

export interface QuotaState {
  /** YYYY-MM in JST. */
  month: string;
  monthCount: number;
  /** YYYY-MM-DD in JST. */
  day: string;
  dayCount: number;
}

export function emptyState(): QuotaState {
  return { month: '', monthCount: 0, day: '', dayCount: 0 };
}

/** Calendar day in JST, as YYYY-MM-DD. */
export function jstDay(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

/** Zeroes the counters that the given day has rolled past. */
export function rollOver(state: QuotaState, today: string): QuotaState {
  const month = today.slice(0, 7);
  return {
    month,
    monthCount: state.month === month ? state.monthCount : 0,
    day: today,
    dayCount: state.day === today ? state.dayCount : 0,
  };
}

function daysInMonth(today: string): number {
  const [year, month] = today.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Posts still allowed today: an even share of what is left in the monthly
 * budget across the days remaining, minus what today already used.
 */
export function dailyAllowance(
  state: QuotaState,
  today: string,
  monthlyLimit = DEFAULT_MONTHLY_LIMIT
): number {
  const current = rollOver(state, today);
  const monthRemaining = Math.max(0, monthlyLimit - current.monthCount);
  if (monthRemaining === 0) return 0;

  const daysLeft = daysInMonth(today) - Number(today.slice(8, 10)) + 1;
  const share = Math.ceil(monthRemaining / daysLeft);
  return Math.max(0, Math.min(share - current.dayCount, monthRemaining));
}

export function recordPost(state: QuotaState, today: string): QuotaState {
  const current = rollOver(state, today);
  return { ...current, monthCount: current.monthCount + 1, dayCount: current.dayCount + 1 };
}

export async function readQuota(path: string): Promise<QuotaState> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf-8'));
    return {
      month: String(parsed.month ?? ''),
      monthCount: Number(parsed.monthCount) || 0,
      day: String(parsed.day ?? ''),
      dayCount: Number(parsed.dayCount) || 0,
    };
  } catch {
    return emptyState();
  }
}

export async function writeQuota(path: string, state: QuotaState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

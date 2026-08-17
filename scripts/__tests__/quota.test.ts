import { describe, it, expect } from 'vitest';
import {
  dailyAllowance,
  emptyState,
  jstDay,
  recordPost,
  rollOver,
  type QuotaState,
} from '../quota';

function state(overrides: Partial<QuotaState> = {}): QuotaState {
  return { month: '2026-08', monthCount: 0, day: '2026-08-18', dayCount: 0, ...overrides };
}

describe('jstDay', () => {
  it('should use the JST calendar day, not UTC', () => {
    // 2026-08-18T16:30Z is already the 19th in JST (UTC+9).
    expect(jstDay(new Date('2026-08-18T16:30:00Z'))).toBe('2026-08-19');
  });
});

describe('rollOver', () => {
  it('should reset the day counter on a new day', () => {
    expect(rollOver(state({ dayCount: 7 }), '2026-08-19')).toEqual({
      month: '2026-08',
      monthCount: 0,
      day: '2026-08-19',
      dayCount: 0,
    });
  });

  it('should keep the month counter within the same month', () => {
    expect(rollOver(state({ monthCount: 120, dayCount: 7 }), '2026-08-19').monthCount).toBe(120);
  });

  it('should reset the month counter on a new month', () => {
    expect(rollOver(state({ monthCount: 120 }), '2026-09-01').monthCount).toBe(0);
  });

  it('should carry today over untouched', () => {
    expect(rollOver(state({ dayCount: 7 }), '2026-08-18').dayCount).toBe(7);
  });
});

describe('dailyAllowance', () => {
  it('should spread the budget over the days left in the month', () => {
    // 14 days left in August from the 18th, 450 unused -> ceil(450/14) = 33
    expect(dailyAllowance(state(), '2026-08-18', 450)).toBe(33);
  });

  it('should subtract what today already posted', () => {
    expect(dailyAllowance(state({ dayCount: 30 }), '2026-08-18', 450)).toBe(3);
  });

  it('should give the whole remainder on the last day of the month', () => {
    expect(dailyAllowance(state({ monthCount: 440 }), '2026-08-31', 450)).toBe(10);
  });

  it('should return 0 once the monthly budget is spent', () => {
    expect(dailyAllowance(state({ monthCount: 450 }), '2026-08-18', 450)).toBe(0);
  });

  it('should never go negative when today overshot its share', () => {
    expect(dailyAllowance(state({ dayCount: 999 }), '2026-08-18', 450)).toBe(0);
  });

  it('should start a new month with a full budget', () => {
    expect(dailyAllowance(state({ monthCount: 450 }), '2026-09-01', 450)).toBe(15);
  });

  it('should handle a fresh state file', () => {
    expect(dailyAllowance(emptyState(), '2026-08-18', 450)).toBe(33);
  });
});

describe('recordPost', () => {
  it('should increment both counters', () => {
    expect(recordPost(state({ monthCount: 5, dayCount: 2 }), '2026-08-18')).toEqual({
      month: '2026-08',
      monthCount: 6,
      day: '2026-08-18',
      dayCount: 3,
    });
  });

  it('should roll over before incrementing on a new day', () => {
    expect(recordPost(state({ monthCount: 5, dayCount: 2 }), '2026-08-19')).toEqual({
      month: '2026-08',
      monthCount: 6,
      day: '2026-08-19',
      dayCount: 1,
    });
  });
});

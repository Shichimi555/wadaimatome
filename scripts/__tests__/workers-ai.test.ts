import { describe, it, expect } from 'vitest';
import { neuronsUsed, isCapacityError } from '../workers-ai';

describe('neuronsUsed', () => {
  it('matches the measured cost of a real article', () => {
    // 福岡県議会: 3,667 in / 2,548 out came back at about 103 neurons.
    expect(Math.round(neuronsUsed(3667, 2548))).toBe(103);
  });

  it('is zero for no usage', () => {
    expect(neuronsUsed(0, 0)).toBe(0);
  });
});

describe('isCapacityError', () => {
  it('recognises the ways Workers AI says it is out', () => {
    expect(isCapacityError(new Error('Out of capacity (3040)'))).toBe(true);
    expect(isCapacityError(new Error('daily neuron quota exceeded'))).toBe(true);
    expect(isCapacityError(new Error('Workers AI request failed: HTTP 429'))).toBe(true);
    expect(isCapacityError(new Error('code 5035: upgrade required'))).toBe(true);
  });

  it('does not treat a bad response as a budget problem', () => {
    // Retiring the engine over one malformed answer would hand the whole batch
    // to Gemini and burn the smaller budget.
    expect(isCapacityError(new Error('No JSON found in Workers AI response'))).toBe(false);
    expect(isCapacityError(new Error('Workers AI request failed: HTTP 500'))).toBe(false);
  });
});

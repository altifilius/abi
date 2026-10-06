import { describe, expect, it } from 'bun:test';
import {
  ApiError,
  parseFundMatch,
  parseFundMatcherResponse,
  parseIdeaChatResponse,
} from '../services/api';

describe('API Contract Validation', () => {
  it('parses valid idea chat response', () => {
    const res = parseIdeaChatResponse({ reply: 'Hello from coach' });
    expect(res.reply).toBe('Hello from coach');
  });

  it('rejects invalid idea chat response', () => {
    expect(() => parseIdeaChatResponse(null)).toThrow(ApiError);
    expect(() => parseIdeaChatResponse({})).toThrow(ApiError);
    expect(() => parseIdeaChatResponse({ reply: 123 })).toThrow(ApiError);
  });

  it('parses valid fund match items', () => {
    const match = parseFundMatch({
      fundId: 'tubitak-1501',
      score: 85,
      rationale: 'Strong R&D match',
      eligibilityStatus: 'eligible',
    });
    expect(match.fundId).toBe('tubitak-1501');
    expect(match.score).toBe(85);
    expect(match.eligibilityStatus).toBe('eligible');
  });

  it('rejects invalid fund match scores and statuses', () => {
    expect(() =>
      parseFundMatch({
        fundId: 'tubitak-1501',
        score: 101, // > 100
        rationale: 'Out of range',
        eligibilityStatus: 'eligible',
      }),
    ).toThrow(ApiError);

    expect(() =>
      parseFundMatch({
        fundId: 'tubitak-1501',
        score: -5, // < 0
        rationale: 'Negative',
        eligibilityStatus: 'eligible',
      }),
    ).toThrow(ApiError);

    expect(() =>
      parseFundMatch({
        fundId: 'tubitak-1501',
        score: 80,
        rationale: 'Invalid status',
        eligibilityStatus: 'unknown',
      }),
    ).toThrow(ApiError);
  });

  it('parses valid fund matcher response envelope', () => {
    const res = parseFundMatcherResponse({
      matches: [
        {
          fundId: 'tubitak-1507',
          score: 75,
          rationale: 'SME early project',
          eligibilityStatus: 'conditional',
        },
      ],
    });
    expect(res.matches.length).toBe(1);
    expect(res.matches[0].fundId).toBe('tubitak-1507');
  });

  it('rejects malformed fund matcher envelopes', () => {
    expect(() => parseFundMatcherResponse({ matches: 'not an array' })).toThrow(ApiError);
    expect(() => parseFundMatcherResponse(null)).toThrow(ApiError);
  });
});

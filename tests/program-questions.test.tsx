import { describe, expect, it } from 'bun:test';
import { answerInputValue } from '../components/ProgramQuestions';

describe('Source answer input types', () => {
  it('keeps nested numeric facts numeric without losing top-level Decimal precision', () => {
    expect(answerInputValue('number', '1', true)).toBe(1);
    expect(answerInputValue('number', '0', true)).toBe(0);
    expect(answerInputValue('number', '0.25', true)).toBe(0.25);
    expect(answerInputValue('number', '9007199254740993.20')).toBe('9007199254740993.20');
  });
  it('clearing a fact is unknown, distinct from explicit false and zero', () => {
    for (const type of ['number', 'boolean', 'string', 'date'] as const)
      expect(answerInputValue(type, '', true)).toBeUndefined();
    expect(answerInputValue('boolean', 'false', true)).toBe(false);
    expect(answerInputValue('boolean', 'true', true)).toBe(true);
    expect(answerInputValue('number', '0', true)).toBe(0);
  });
});

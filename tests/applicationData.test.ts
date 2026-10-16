import { describe, expect, it } from 'bun:test';
import { applicationBudgetsEqual, canonicalApplicationData } from '../components/applicationData';
import type { Budget } from '../components/BudgetEditor';

const budget = (amount: string): Budget => ({
  currency: 'EUR',
  items: [{ id: 'cost', category: 'equipment', description: 'Equipment', amount }],
});

describe('Application saved-content identity', () => {
  it('ignores JSON property ordering without hiding edited text or attachment selection', () => {
    const saved = {
      sections: { title: 'Reviewed content', summary: 'Summary' },
      attachments: { proof: 'verified-original' },
      budget: budget('10.00'),
    };
    const reordered = {
      budget: budget('10.00'),
      attachments: { proof: 'verified-original' },
      sections: { summary: 'Summary', title: 'Reviewed content' },
    };
    expect(canonicalApplicationData(saved)).toBe(canonicalApplicationData(reordered));
    expect(
      canonicalApplicationData({
        ...saved,
        sections: { ...saved.sections, title: 'Unreviewed edit' },
      }),
    ).not.toBe(canonicalApplicationData(saved));
    expect(
      canonicalApplicationData({ ...saved, attachments: { proof: 'different-original' } }),
    ).not.toBe(canonicalApplicationData(saved));
  });
  it('retains ordered budget content for dirty detection and approval acknowledgment', () => {
    const first = budget('10.00').items[0];
    const second = { ...first, id: 'travel', category: 'travel' as const };
    expect(canonicalApplicationData({ ...budget('10.00'), items: [first, second] })).not.toBe(
      canonicalApplicationData({ ...budget('10.00'), items: [second, first] }),
    );
  });
});

describe('Application budget versus evaluation baseline', () => {
  it('uses exact cents rather than floating-point money at the supported upper bound', () => {
    expect(
      applicationBudgetsEqual(budget('999999999999999.01'), budget('999999999999999.0100')),
    ).toBe(true);
    expect(
      applicationBudgetsEqual(budget('999999999999999.01'), budget('999999999999999.02')),
    ).toBe(false);
    expect(applicationBudgetsEqual(budget('10.001'), budget('10.001'))).toBe(false);
  });
  it('ignores decimal padding and line order but never currency, category or description changes', () => {
    const first = budget('00010.10').items[0];
    const second = { ...first, id: 'other', category: 'services' as const, amount: '20.00' };
    const baseline: Budget = { currency: 'EUR', items: [first, second] };
    expect(
      applicationBudgetsEqual(
        { currency: 'EUR', items: [second, { ...first, amount: '10.100' }] },
        baseline,
      ),
    ).toBe(true);
    expect(applicationBudgetsEqual({ ...baseline, currency: 'USD' }, baseline)).toBe(false);
    expect(
      applicationBudgetsEqual(
        { ...baseline, items: [{ ...first, description: 'Changed expense' }, second] },
        baseline,
      ),
    ).toBe(false);
    expect(
      applicationBudgetsEqual(
        { ...baseline, items: [{ ...first, category: 'personnel' }, second] },
        baseline,
      ),
    ).toBe(false);
    expect(applicationBudgetsEqual(baseline, undefined)).toBe(false);
  });
});

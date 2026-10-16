import { describe, expect, it } from 'bun:test';
import { profileFieldValue, updateProfileField } from '../components/ProgramQuestions';
import { projectBudgetTotal } from '../components/ProjectBudget';
import { compareProjectSnapshots } from '../components/ProjectHistory';
import { mergeProfileProposal } from '../hooks/useIdeaChat';
import { reconcileProjectDraft } from '../hooks/useProjectState';
import type { Project } from '../types';

const base: Project = {
  id: 'project',
  workspace_id: 'workspace',
  title: 'Saved title',
  description: 'Saved draft',
  profile: {
    company: { country: 'TR', is_sme: true },
    extra: { source_answers: { qualified: false } },
    budget: {
      currency: 'TRY',
      items: [{ id: 'one', category: 'personnel', description: 'Research', amount: '0.10' }],
    },
  },
  revision: 2,
  confirmed_revision: 2,
  stage: 'idea',
};

describe('Project edits across authoritative revision changes', () => {
  it('preserves title, draft and extra answers together when server revision changes while dirty', () => {
    const draft = {
      ...base,
      title: 'My rename',
      description: 'My manual text',
      profile: updateProfileField(base.profile, 'extra.source_answers.qualified', true),
    };
    const incoming = {
      ...base,
      revision: 3,
      title: 'Another editor',
      description: 'New server text',
    };
    const result = reconcileProjectDraft(base, draft, incoming);
    expect(result.base.revision).toBe(2);
    expect(result.draft).toEqual(draft);
    expect(profileFieldValue(result.draft.profile, 'extra.source_answers.qualified')).toBe(true);
    expect(base.profile.extra).toEqual({ source_answers: { qualified: false } });
  });
  it('updates a clean draft from the server and never carries edits into a different project', () => {
    const incoming = { ...base, revision: 3, title: 'New server title' };
    expect(reconcileProjectDraft(base, base, incoming)).toEqual({
      base: incoming,
      draft: incoming,
    });
    const other = { ...incoming, id: 'other-project' };
    expect(reconcileProjectDraft(base, { ...base, description: 'Unsaved' }, other)).toEqual({
      base: other,
      draft: other,
    });
  });
  it('never rolls a clean saved revision back to an older parent snapshot', () => {
    const saved = {
      ...base,
      revision: 4,
      confirmed_revision: 4,
      description: 'Saved newest facts',
    };
    const previous = { ...base, revision: 3, confirmed_revision: null };
    expect(reconcileProjectDraft(saved, saved, previous)).toEqual({ base: saved, draft: saved });
  });
  it('a save acknowledgment adopts newer authoritative facts before confirmation', () => {
    const acknowledged = { ...base, revision: 3, confirmed_revision: null };
    const newer = { ...acknowledged, revision: 4, title: 'Another editor’s newest facts' };
    expect(reconcileProjectDraft(acknowledged, acknowledged, newer)).toEqual({
      base: newer,
      draft: newer,
    });
  });
  it('property ordering is not an unsaved edit and does not prevent refresh', () => {
    const reordered = {
      ...base,
      profile: {
        budget: base.profile.budget,
        extra: base.profile.extra,
        company: base.profile.company,
      },
    };
    const newer = { ...base, revision: 3, title: 'Current server facts' };
    expect(reconcileProjectDraft(base, reordered, newer)).toEqual({ base: newer, draft: newer });
  });
  it('an AI proposal cannot silently delete manual budget, unknown facts or explicit false', () => {
    const proposed = {
      company: { name: 'Proposed company' },
      budget: { currency: 'EUR', items: [] },
      extra: {},
    };
    const merged = mergeProfileProposal(base.profile, proposed);
    expect(merged.budget).toEqual(base.profile.budget);
    expect(merged.company).toEqual({ country: 'TR', is_sme: true, name: 'Proposed company' });
    expect(profileFieldValue(merged, 'extra.source_answers.qualified')).toBe(false);
  });
  it('clearing an answer means unknown and does not coerce false or Decimal strings', () => {
    const answered = updateProfileField(
      base.profile,
      'extra.source_answers.turnover',
      '9007199254740993.20',
    );
    expect(profileFieldValue(answered, 'extra.source_answers.turnover')).toBe(
      '9007199254740993.20',
    );
    const unknown = updateProfileField(answered, 'extra.source_answers.qualified', undefined);
    expect(profileFieldValue(unknown, 'extra.source_answers.qualified')).toBeUndefined();
    expect(profileFieldValue(base.profile, 'extra.source_answers.qualified')).toBe(false);
  });
  it('rejects unsafe paths rather than altering an object prototype', () => {
    expect(() => updateProfileField(base.profile, 'extra.__proto__.unsafe', true)).toThrow();
    expect(() => updateProfileField(base.profile, 'budget.total', '1')).toThrow();
  });
});

describe('Saved project budget and revision comparisons', () => {
  it('totals money exactly above Number precision and refuses invalid monetary input', () => {
    expect(
      projectBudgetTotal(Array.from({ length: 10 }, () => ({ amount: '999999999999999.10' }))),
    ).toBe('9999999999999991.00');
    expect(projectBudgetTotal([{ amount: '0.10' }, { amount: '0.20' }])).toBe('0.30');
    expect(projectBudgetTotal([{ amount: '10.100' }, { amount: '0.2000' }])).toBe('10.30');
    for (const amount of ['NaN', '-1.00', '1e3', '1.001', '1000000000000000.00', '1'.repeat(81)])
      expect(projectBudgetTotal([{ amount }])).toBeNull();
  });
  it('compares nested answers and removal without treating unknown as false', () => {
    expect(
      compareProjectSnapshots(
        { extra: { sme: false, evidence: 'https://example.org/proof' } },
        { extra: { evidence: 'https://example.org/proof' } },
      ),
    ).toEqual([{ field: 'extra.sme', before: false, after: undefined }]);
  });
});

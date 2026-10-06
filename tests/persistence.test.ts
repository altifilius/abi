import { describe, expect, it } from 'bun:test';
import { FUNDS } from '../constants';
import {
  INITIAL_PROJECT,
  mergePersistedProject,
  stripFileFromDocuments,
} from '../hooks/useProjectState';
import type { ProjectDocument, ProjectPersistedState } from '../types';

describe('Project State and Persistence Invariants', () => {
  it('strips File object before persistence', () => {
    const fakeFile = new File(['dummy'], 'sample.pdf', { type: 'application/pdf' });
    const docsWithFile: ProjectDocument[] = [
      {
        id: 'd1',
        name: 'Form',
        type: 'required',
        status: 'verified',
        file: fakeFile,
      },
    ];

    const stripped = stripFileFromDocuments(docsWithFile);
    expect(stripped.length).toBe(1);
    expect(stripped[0].id).toBe('d1');
    expect(stripped[0].status).toBe('verified');
    expect('file' in stripped[0]).toBe(false);
  });

  it('merges persisted state cleanly without mutating untouched initial properties', () => {
    const merged = mergePersistedProject(INITIAL_PROJECT, {
      version: 1,
      description: 'Persisted 1-Pager summary',
      matchedFunds: [
        {
          fundId: 'kosgeb-arge',
          score: 90,
          rationale: 'Good fit',
          eligibilityStatus: 'eligible',
        },
      ],
      documents: [
        {
          id: 'd1',
          name: 'Project Information Form (AGY100)',
          type: 'required',
          status: 'verified',
        },
      ],
    });

    expect(merged.id).toBe(INITIAL_PROJECT.id);
    expect(merged.title).toBe(INITIAL_PROJECT.title);
    expect(merged.description).toBe('Persisted 1-Pager summary');
    expect(merged.matchedFunds?.length).toBe(1);
    expect(merged.documents[0].status).toBe('verified');
  });

  it('preserves initial project when persisted state is null or corrupt', () => {
    const fromNull = mergePersistedProject(INITIAL_PROJECT, null);
    expect(fromNull).toEqual(INITIAL_PROJECT);

    const emptyState: ProjectPersistedState = { version: 1 };
    const fromEmpty = mergePersistedProject(INITIAL_PROJECT, emptyState);
    expect(fromEmpty.id).toBe(INITIAL_PROJECT.id);
  });

  it('loads valid funds from centralized data/funds.json', () => {
    expect(FUNDS.length).toBeGreaterThanOrEqual(4);
    for (const fund of FUNDS) {
      expect(fund.id).toBeDefined();
      expect(fund.code).toBeDefined();
      expect(fund.name).toBeDefined();
      expect(['TUBITAK', 'KOSGEB', 'EU']).toContain(fund.institution);
      expect(fund.maxBudget).toBeDefined();
      expect(fund.supportRate).toBeDefined();
    }
  });
});

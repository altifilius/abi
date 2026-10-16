import { afterEach, describe, expect, it } from 'bun:test';
import { loadPreferences, readLegacyImport, savePreferences } from '../services/persistence';

const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
function installStorage(values: Record<string, string> = {}) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values[key] ?? null,
      setItem: (key: string, value: string) => {
        values[key] = value;
      },
      removeItem: (key: string) => {
        delete values[key];
      },
    },
  });
  return values;
}
afterEach(() => {
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});
describe('Browser/server persistence boundary', () => {
  it('imports old names only and never trusts verified status or file objects', () => {
    installStorage({
      'abi.projectState': JSON.stringify({
        version: 1,
        description: 'Old draft',
        documents: [
          { name: 'report.pdf', status: 'verified', verified_by: 'fake', file: { secret: 'x' } },
        ],
        matchedFunds: [{ score: 100 }],
      }),
    });
    expect(readLegacyImport()).toEqual({
      description: 'Old draft',
      documents_metadata: [{ name: 'report.pdf' }],
    });
  });
  it('does not automatically turn old state into server/project preferences', () => {
    const values = installStorage({
      'abi.projectState': JSON.stringify({ version: 1, description: 'Old draft' }),
    });
    expect(loadPreferences()).toEqual({});
    expect(values['abi.preferences']).toBeUndefined();
  });
  it('persists browser appearance and selection without private project content', () => {
    const values = installStorage();
    savePreferences({ language: 'tr', theme: 'dark', workspaceId: 'w', projectId: 'p' });
    savePreferences({ tab: 'profile' });
    expect(loadPreferences()).toEqual({
      language: 'tr',
      theme: 'dark',
      workspaceId: 'w',
      projectId: 'p',
      tab: 'profile',
    });
    expect(values['abi.preferences']).not.toContain('description');
  });
  it('rejects malformed and unknown-version legacy state', () => {
    installStorage({ 'abi.projectState': '{broken' });
    expect(readLegacyImport()).toBeNull();
    installStorage({ 'abi.projectState': JSON.stringify({ version: 5, description: 'x' }) });
    expect(readLegacyImport()).toBeNull();
  });
});

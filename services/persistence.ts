export interface Preferences {
  language: 'tr' | 'en';
  theme: 'light' | 'dark';
  workspaceId?: string;
  projectId?: string;
  tab?: string;
}
const PREFERENCES_KEY = 'abi.preferences';
export function loadPreferences(): Partial<Preferences> {
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}
export function savePreferences(value: Partial<Preferences>) {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ ...loadPreferences(), ...value }));
  } catch {
    /* Browser storage may be disabled; server data is unaffected. */
  }
}
export interface LegacyImport {
  description: string;
  documents_metadata: { name: string }[];
}
export function readLegacyImport(): LegacyImport | null {
  try {
    const value = JSON.parse(localStorage.getItem('abi.projectState') || 'null');
    if (value?.version !== 1 || typeof value.description !== 'string') return null;
    return {
      description: value.description,
      documents_metadata: Array.isArray(value.documents)
        ? value.documents
            .filter(
              (x: unknown) =>
                x && typeof x === 'object' && 'name' in x && typeof x.name === 'string',
            )
            .map((x: { name: string }) => ({ name: x.name }))
        : [],
    };
  } catch {
    return null;
  }
}
export function removeLegacyImport() {
  localStorage.removeItem('abi.projectState');
}

import type { ProjectDocument, ProjectPersistedState } from '../types';

const STORAGE_KEY = 'abi.projectState';
const CURRENT_VERSION = 1;

const isBrowser = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined';

const sanitizeDocuments = (documents?: ProjectDocument[]) => {
  if (!Array.isArray(documents)) return undefined;
  return documents.map(({ id, name, type, status }) => ({ id, name, type, status }));
};

export function loadProjectState(): ProjectPersistedState | null {
  if (!isBrowser()) return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.version !== 'number' || parsed.version !== CURRENT_VERSION) {
      return null;
    }

    return parsed as ProjectPersistedState;
  } catch (error) {
    console.warn('Failed to load project state from localStorage', error);
    return null;
  }
}

export function saveProjectState(partial: Omit<ProjectPersistedState, 'version'>): void {
  if (!isBrowser()) return;

  try {
    const existingRaw = localStorage.getItem(STORAGE_KEY);
    let existing: ProjectPersistedState = { version: CURRENT_VERSION };

    if (existingRaw) {
      try {
        const parsed = JSON.parse(existingRaw);
        if (parsed && typeof parsed === 'object') {
          existing = {
            version: CURRENT_VERSION,
            ...parsed,
          };
        }
      } catch {
        // ignore corrupt existing data, overwrite
      }
    }

    const sanitizedDocuments = partial.documents
      ? sanitizeDocuments(partial.documents as ProjectDocument[])
      : existing.documents;

    const next: ProjectPersistedState = {
      ...existing,
      ...partial,
      documents: sanitizedDocuments,
      version: CURRENT_VERSION,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('Failed to save project state to localStorage', error);
  }
}

export function clearProjectState(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear project state from localStorage', error);
  }
}

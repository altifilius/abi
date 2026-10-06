import { useCallback, useState } from 'react';
import { loadProjectState, saveProjectState } from '../services/persistence';
import {
  type FundMatch,
  type Project,
  type ProjectDocument,
  type ProjectPersistedState,
  ProjectStage,
} from '../types';

export const INITIAL_PROJECT: Project = {
  id: 'proj_001',
  title: 'Untitled R&D Project',
  description: '',
  stage: ProjectStage.IDEA,
  documents: [
    { id: 'd1', name: 'Project Information Form (AGY100)', type: 'required', status: 'missing' },
    { id: 'd2', name: 'Proforma Invoices', type: 'required', status: 'missing' },
    { id: 'd3', name: 'Trade Registry Gazette', type: 'required', status: 'missing' },
    { id: 'd4', name: 'CVs of Personnel', type: 'optional', status: 'missing' },
  ],
  matchedFunds: [],
};

export const mergePersistedProject = (
  initial: Project,
  persisted: ProjectPersistedState | null,
): Project => {
  if (!persisted || typeof persisted !== 'object') return initial;

  const mergedDocuments = Array.isArray(persisted.documents)
    ? persisted.documents
    : initial.documents;

  const mergedMatches = Array.isArray(persisted.matchedFunds)
    ? persisted.matchedFunds
    : initial.matchedFunds;

  return {
    ...initial,
    description:
      typeof persisted.description === 'string' ? persisted.description : initial.description,
    documents: mergedDocuments,
    matchedFunds: mergedMatches,
  };
};

export const stripFileFromDocuments = (docs: ProjectDocument[]) =>
  docs.map(({ id, name, type, status }) => ({ id, name, type, status }));

export function useProjectState() {
  const [project, setProject] = useState<Project>(() => {
    const persisted = loadProjectState();
    return mergePersistedProject(INITIAL_PROJECT, persisted);
  });

  const updateDescription = useCallback((desc: string) => {
    setProject((prev) => {
      const next: Project = {
        ...prev,
        description: desc,
        stage: ProjectStage.DRAFTING,
      };
      saveProjectState({ description: next.description });
      return next;
    });
  }, []);

  const updateMatchedFunds = useCallback((matches: FundMatch[]) => {
    setProject((prev) => {
      const next: Project = {
        ...prev,
        matchedFunds: matches,
      };
      saveProjectState({ matchedFunds: next.matchedFunds });
      return next;
    });
  }, []);

  const uploadDocument = useCallback((docId: string, file: File) => {
    setProject((prev) => {
      const updatedDocuments: ProjectDocument[] = prev.documents.map((doc) =>
        doc.id === docId ? { ...doc, status: 'verified', file } : doc,
      );
      const next: Project = {
        ...prev,
        documents: updatedDocuments,
      };
      saveProjectState({ documents: stripFileFromDocuments(next.documents) });
      return next;
    });
  }, []);

  return {
    project,
    updateDescription,
    updateMatchedFunds,
    uploadDocument,
  };
}

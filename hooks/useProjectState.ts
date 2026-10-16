import { useEffect, useRef, useState } from 'react';
import { canonicalApplicationData } from '../components/applicationData';
import { useUnsavedChanges } from '../contexts/NavigationGuard';
import type { Profile, Project } from '../types';

export type ProjectChanges = Partial<Pick<Project, 'title' | 'description' | 'profile'>> & {
  confirm_profile?: boolean;
};
export type ProjectSave = (changes: ProjectChanges, expectedRevision?: number) => Promise<Project>;
export function projectContentEqual(a: Project, b: Project): boolean {
  return (
    a.title === b.title &&
    a.description === b.description &&
    canonicalApplicationData(a.profile) === canonicalApplicationData(b.profile)
  );
}
export function reconcileProjectDraft(
  base: Project,
  draft: Project,
  incoming: Project,
): { base: Project; draft: Project } {
  if (base.id === incoming.id && incoming.revision < base.revision) return { base, draft };
  if (base.id !== incoming.id || projectContentEqual(base, draft))
    return { base: incoming, draft: incoming };
  return { base, draft };
}
export function useProjectDraft(project: Project, initialProfile?: Profile) {
  const incoming = useRef(project);
  incoming.current = project;
  const [state, setState] = useState(() => ({
    base: project,
    draft: initialProfile ? { ...project, profile: initialProfile } : project,
  }));
  const dirty = !projectContentEqual(state.base, state.draft);
  const conflict =
    state.base.id === project.id && state.base.revision !== project.revision && dirty;
  useUnsavedChanges(dirty, () => setState({ base: project, draft: project }));
  useEffect(() => {
    setState((current) => reconcileProjectDraft(current.base, current.draft, project));
  }, [project]);
  return {
    base: state.base,
    draft: state.draft,
    dirty,
    conflict,
    setDraft: (draft: Project) => setState((current) => ({ ...current, draft })),
    discard: () => setState({ base: project, draft: project }),
    accept: (saved: Project) => setState(reconcileProjectDraft(saved, saved, incoming.current)),
  };
}

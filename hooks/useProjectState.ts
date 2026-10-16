import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../services/api';
import type { Project } from '../types';
export function useProjectState(projectId: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    setProject(null);
    setError('');
    if (projectId)
      api<Project>(`/projects/${projectId}`, { signal: active.signal })
        .then((value) => {
          if (!active.signal.aborted) setProject(value);
        })
        .catch((error) => {
          if (!active.signal.aborted) setError(errorMessage(error));
        });
    return () => active.abort();
  }, [projectId]);
  const reload = useCallback(async () => {
    const active = controller.current;
    if (!projectId || !active || active.signal.aborted) return;
    const value = await api<Project>(`/projects/${projectId}`, { signal: active.signal });
    if (!active.signal.aborted) setProject(value);
  }, [projectId]);
  const save = async (
    changes: Partial<Pick<Project, 'title' | 'description' | 'profile'>> & {
      confirm_profile?: boolean;
    },
  ) => {
    const active = controller.current;
    if (!project || !active || active.signal.aborted) throw new Error('Project is not loaded');
    const value = await api<Project>(`/projects/${project.id}`, {
      method: 'PATCH',
      json: { expected_revision: project.revision, ...changes },
      signal: active.signal,
    });
    if (!active.signal.aborted) setProject(value);
    return value;
  };
  return { project, error, reload, save };
}

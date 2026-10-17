import { useCallback, useEffect, useRef, useState } from 'react';
import { canonicalApplicationData } from '../components/applicationData';
import { useUnsavedChanges } from '../contexts/NavigationGuard';
import { ApiError, errorMessage } from '../services/api';
import {
  getReport,
  type ProjectReport,
  type ReportSection,
  reportContract,
  saveReport,
} from '../services/reports';

interface DraftSnapshot {
  base: ProjectReport;
  draft: ProjectReport;
}
export type ReportSaveState = 'loading' | 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict';
export interface ReportDraftController {
  base: ProjectReport | null;
  draft: ProjectReport | null;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  error: string;
  storageError: string;
  conflict: boolean;
  recovered: boolean;
  remote: ProjectReport | null;
  state: ReportSaveState;
  edit: (update: (report: ProjectReport) => ProjectReport) => void;
  setSection: (id: string, content: ReportSection['content']) => void;
  flush: (acknowledgeScope?: boolean) => Promise<ProjectReport | null>;
  accept: (report: ProjectReport) => boolean;
  pauseForScopeChange: () => void;
  fetchConflict: () => Promise<void>;
  keepLocal: () => void;
  discardLocal: () => void;
  retryLoad: () => void;
}

export function useReportDraft(
  actorId: string,
  workspaceId: string,
  projectId: string,
  reportId: string,
  editable: boolean,
): ReportDraftController {
  const key = `abi:report-draft:${actorId}:${workspaceId}:${projectId}:${reportId}`;
  const [base, setBase] = useState<ProjectReport | null>(null);
  const [draft, setDraft] = useState<ProjectReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [remote, setRemote] = useState<ProjectReport | null>(null);
  const [paused, setPaused] = useState(false);
  const mounted = useRef(true);
  const current = useRef({ base, draft, conflict, paused, editable });
  current.current = { base, draft, conflict, paused, editable };
  const pending = useRef<Promise<ProjectReport | null> | null>(null);
  const scopeGeneration = useRef(0);
  const loadRequest = useRef<AbortController | null>(null);
  const dirty = Boolean(
    base &&
      draft &&
      (base.title !== draft.title ||
        canonicalApplicationData(base.sections) !== canonicalApplicationData(draft.sections)),
  );

  const persist = useCallback(
    (snapshot: DraftSnapshot | null) => {
      try {
        if (snapshot) sessionStorage.setItem(key, JSON.stringify(snapshot));
        else sessionStorage.removeItem(key);
        setStorageError('');
      } catch (failure) {
        setStorageError(
          errorMessage(failure) ||
            'Browser draft storage is unavailable. Keep this page open until the report is saved.',
        );
      }
    },
    [key],
  );

  const loadReport = useCallback(() => {
    loadRequest.current?.abort();
    const controller = new AbortController();
    loadRequest.current = controller;
    setLoading(true);
    setError('');
    setBase(null);
    setDraft(null);
    setConflict(false);
    setRemote(null);
    setRecovered(false);
    setPaused(false);
    let cached: DraftSnapshot | null = null;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const value = JSON.parse(raw);
        const cachedBase = reportContract.safeParse(value.base);
        const cachedDraft = reportContract.safeParse(value.draft);
        if (
          cachedBase.success &&
          cachedDraft.success &&
          cachedBase.data.id === reportId &&
          cachedBase.data.project_id === projectId &&
          cachedBase.data.workspace_id === workspaceId &&
          cachedDraft.data.id === reportId &&
          cachedDraft.data.project_id === projectId &&
          cachedDraft.data.workspace_id === workspaceId
        ) {
          cached = { base: cachedBase.data, draft: cachedDraft.data };
          setBase(cached.base);
          setDraft(cached.draft);
          setRecovered(true);
        } else {
          setStorageError(
            'The browser contains an unreadable report draft. It has not been deleted.',
          );
          setPaused(true);
        }
      }
    } catch (failure) {
      setStorageError(errorMessage(failure));
    }
    getReport(reportId, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        if (value.project_id !== projectId || value.workspace_id !== workspaceId)
          throw new Error('This report does not belong to the current project.');
        if (cached) {
          const sameSavedContent =
            value.title === cached.draft.title &&
            canonicalApplicationData(value.sections) ===
              canonicalApplicationData(cached.draft.sections);
          if (sameSavedContent) {
            setBase(value);
            setDraft(value);
            persist(null);
          } else if (value.revision !== cached.base.revision) {
            setConflict(true);
            setRemote(value);
          } else {
            setBase(value);
            setDraft({ ...value, title: cached.draft.title, sections: cached.draft.sections });
          }
        } else {
          setBase(value);
          setDraft(value);
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted && failure.name !== 'AbortError') {
          setError(errorMessage(failure));
          setPaused(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, [key, projectId, reportId, workspaceId, persist]);

  useEffect(() => {
    mounted.current = true;
    loadReport();
    return () => {
      mounted.current = false;
      loadRequest.current?.abort();
    };
  }, [loadReport]);

  const edit = useCallback(
    (update: (report: ProjectReport) => ProjectReport) => {
      const value = current.current;
      if (!value.draft || !value.base || !value.editable || loading) return;
      const next = update(value.draft);
      current.current = { ...value, draft: next };
      setDraft(next);
      persist({ base: value.base, draft: next });
    },
    [persist, loading],
  );

  const flush = useCallback(
    async (acknowledgeScope = false): Promise<ProjectReport | null> => {
      if (pending.current) {
        await pending.current;
        if (!mounted.current) return null;
      }
      const value = current.current;
      if (!value.base || !value.draft || !value.editable || value.conflict || loading) return null;
      if (
        !acknowledgeScope &&
        value.base.title === value.draft.title &&
        canonicalApplicationData(value.base.sections) ===
          canonicalApplicationData(value.draft.sections)
      )
        return value.base;
      const submitted = value.draft;
      const original = value.base;
      const generation = scopeGeneration.current;
      setSaving(true);
      setError('');
      const operation = saveReport(reportId, {
        expected_revision: original.revision,
        sections: submitted.sections,
        title: submitted.title,
        ...(acknowledgeScope ? { acknowledge_scope: true } : {}),
      })
        .then((saved) => {
          if (!mounted.current) return saved;
          if (generation !== scopeGeneration.current) return null;
          const latest = current.current.draft;
          const unchanged =
            latest &&
            latest.title === submitted.title &&
            canonicalApplicationData(latest.sections) ===
              canonicalApplicationData(submitted.sections);
          const next =
            unchanged || !latest
              ? saved
              : { ...saved, title: latest.title, sections: latest.sections };
          current.current = { ...current.current, base: saved, draft: next, paused: false };
          setBase(saved);
          setDraft(next);
          setPaused(false);
          persist(unchanged ? null : { base: saved, draft: next });
          return saved;
        })
        .catch((failure) => {
          if (!mounted.current) return null;
          if (generation !== scopeGeneration.current) return null;
          setError(errorMessage(failure));
          setPaused(true);
          const stale = failure instanceof ApiError && failure.status === 409;
          current.current = { ...current.current, conflict: stale, paused: true };
          if (stale) setConflict(true);
          return null;
        })
        .finally(() => {
          pending.current = null;
          if (mounted.current) setSaving(false);
        });
      pending.current = operation;
      return operation;
    },
    [persist, reportId, loading],
  );

  useEffect(() => {
    if (!dirty || !editable || conflict || loading || saving || paused) return;
    if (
      !base ||
      !draft ||
      (base.title === draft.title &&
        canonicalApplicationData(base.sections) === canonicalApplicationData(draft.sections))
    )
      return;
    const timer = window.setTimeout(() => {
      void flush();
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [dirty, editable, conflict, loading, saving, paused, base, draft, flush]);

  useUnsavedChanges(dirty || saving, () => persist(null));

  const accept = useCallback(
    (value: ProjectReport) => {
      const latest = current.current;
      const locallyDirty =
        latest.base &&
        latest.draft &&
        (latest.base.title !== latest.draft.title ||
          canonicalApplicationData(latest.base.sections) !==
            canonicalApplicationData(latest.draft.sections));
      const matchesSaved =
        latest.draft &&
        latest.draft.title === value.title &&
        canonicalApplicationData(latest.draft.sections) ===
          canonicalApplicationData(value.sections);
      if (locallyDirty && !matchesSaved) {
        current.current = { ...latest, conflict: true, paused: true };
        setRemote(value);
        setConflict(true);
        setPaused(true);
        return false;
      }
      current.current = { ...latest, base: value, draft: value, conflict: false, paused: false };
      setBase(value);
      setDraft(value);
      setConflict(false);
      setRemote(null);
      setPaused(false);
      setError('');
      persist(null);
      return true;
    },
    [persist],
  );

  const pauseForScopeChange = useCallback(() => {
    current.current = { ...current.current, conflict: true, paused: true };
    scopeGeneration.current += 1;
    setConflict(true);
    setPaused(true);
  }, []);

  const fetchConflict = useCallback(async () => {
    setError('');
    try {
      const value = await getReport(reportId);
      if (mounted.current) {
        current.current = { ...current.current, conflict: true, paused: true };
        setConflict(true);
        setPaused(true);
        setRemote(value);
      }
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
    }
  }, [reportId]);

  const keepLocal = useCallback(() => {
    if (!remote || !current.current.draft) return;
    const next = {
      ...remote,
      title: current.current.draft.title,
      sections: current.current.draft.sections,
    };
    current.current = {
      ...current.current,
      base: remote,
      draft: next,
      conflict: false,
      paused: true,
    };
    setBase(remote);
    setDraft(next);
    setConflict(false);
    setRemote(null);
    setError('');
    setPaused(true);
    persist({ base: remote, draft: next });
  }, [persist, remote]);

  const discardLocal = useCallback(() => {
    if (!remote) return;
    current.current = {
      ...current.current,
      base: remote,
      draft: remote,
      conflict: false,
      paused: false,
    };
    setBase(remote);
    setDraft(remote);
    setConflict(false);
    setRemote(null);
    setError('');
    setPaused(false);
    persist(null);
  }, [persist, remote]);

  const setSection = useCallback(
    (id: string, content: ReportSection['content']) => {
      edit((report) => ({
        ...report,
        sections: report.sections.map((section) =>
          section.id === id ? { ...section, content } : section,
        ),
      }));
    },
    [edit],
  );

  const state: ReportSaveState = loading
    ? 'loading'
    : conflict
      ? 'conflict'
      : saving
        ? 'saving'
        : error
          ? 'error'
          : dirty
            ? 'unsaved'
            : 'saved';
  return {
    base,
    draft,
    loading,
    saving,
    dirty,
    error,
    storageError,
    conflict,
    recovered,
    remote,
    state,
    edit,
    setSection,
    flush,
    accept,
    pauseForScopeChange,
    fetchConflict,
    keepLocal,
    discardLocal,
    retryLoad: loadReport,
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import type { Workspace } from '../types';
import {
  buttonClass,
  errorText,
  inputClass,
  panelClass,
  SourceLink,
  timestamp,
  useEvidenceText,
} from './EvidenceUi';

interface IncorporationState {
  country: string;
  legal_form: 'AS' | 'LTD';
  checklist: Record<string, boolean>;
  steps: {
    key: string;
    title: string;
    title_en: string;
    description: string;
    description_en: string;
    source_url: string;
  }[];
  sources: { title: string; url: string }[];
  disclaimer: string;
  disclaimer_en: string;
  updated_at: string | null;
  updated_by: string | null;
}

export default function IncorporationGuide({ workspace }: { workspace: Workspace }) {
  const text = useEvidenceText();
  const [savedState, setSavedState] = useState<{
    workspaceId: string;
    value: IncorporationState;
  } | null>(null);
  const state = savedState?.workspaceId === workspace.id ? savedState.value : null;
  const scope = useRef<{ workspaceId: string; controller: AbortController } | null>(null);
  const loadRequest = useRef<AbortController | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const canEdit = ['owner', 'admin', 'reviewer', 'editor'].includes(workspace.role || '');

  const loadIncorporation = useCallback(async () => {
    const active = scope.current;
    if (active?.workspaceId !== workspace.id || active.controller.signal.aborted) return;
    loadRequest.current?.abort();
    setError('');
    if (workspace.country !== 'TR') {
      setSavedState(null);
      setBusy(false);
      return;
    }
    const request = new AbortController();
    loadRequest.current = request;
    setBusy(true);
    try {
      const data = await api<IncorporationState>(`/workspaces/${workspace.id}/incorporation`, {
        signal: request.signal,
      });
      if (!request.signal.aborted && !active.controller.signal.aborted)
        setSavedState({ workspaceId: workspace.id, value: data });
    } catch (reason) {
      if (!request.signal.aborted && !active.controller.signal.aborted) setError(errorText(reason));
    } finally {
      if (!request.signal.aborted && !active.controller.signal.aborted) setBusy(false);
    }
  }, [workspace.id, workspace.country]);

  useEffect(() => {
    const active = { workspaceId: workspace.id, controller: new AbortController() };
    scope.current = active;
    setSavedState(null);
    void loadIncorporation();
    return () => {
      active.controller.abort();
      loadRequest.current?.abort();
    };
  }, [workspace.id, loadIncorporation]);

  async function save(patch: { legal_form?: 'AS' | 'LTD'; checklist?: Record<string, boolean> }) {
    const active = scope.current;
    if (
      active?.workspaceId !== workspace.id ||
      active.controller.signal.aborted ||
      workspace.country !== 'TR' ||
      !canEdit
    )
      return;
    const signal = active.controller.signal;
    setBusy(true);
    setError('');
    try {
      const data = await api<IncorporationState>(`/workspaces/${workspace.id}/incorporation`, {
        method: 'PATCH',
        signal,
        json: patch,
      });
      if (!signal.aborted) setSavedState({ workspaceId: workspace.id, value: data });
    } catch (reason) {
      if (!signal.aborted) setError(errorText(reason));
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  return (
    <section className={panelClass}>
      <h2 className="text-xl font-semibold">
        {text('Türkiye şirket kuruluş rehberi', 'Türkiye incorporation guide')}
      </h2>
      <p>
        {text(
          'Resmî kaynaklara bağlı kişisel kontrol listesi. İşaretler kendi beyanınızdır; şirketin kurulduğunu veya resmî onayı kanıtlamaz. Otomatik tescil, randevu veya sahte takvim oluşturulmaz.',
          'An official-source-backed self-checklist. Check marks are your own declarations, not proof of incorporation or official approval. No automatic registration, appointment or fabricated calendar is created.',
        )}
      </p>
      {workspace.country !== 'TR' && (
        <Link to={`/w/${workspace.id}/workspace/info`}>
          {text('Çalışma alanı bilgileri', 'Workspace information')}
        </Link>
      )}
      {workspace.country !== 'TR' ? (
        <p>
          {text(
            'Bu rehber yalnızca Türkiye içindir. Ülkeyi çalışma alanı bilgileri bölümünden güncelleyebilirsiniz.',
            'This guide covers Türkiye only. You can update the country in workspace information.',
          )}
        </p>
      ) : (
        <>
          <p>
            {text(
              'Temel rehber ve kişisel kontrol listesi Free planında kullanılabilir. Ekip görevleri ve incelemeler Pro gerektirir.',
              'Basic guidance and self-checklist are available on Free. Team tasks and reviews require Pro.',
            )}
          </p>
          <button className={buttonClass} disabled={busy} onClick={() => void loadIncorporation()}>
            {text('Sunucudan yenile', 'Reload from server')}
          </button>
          {busy && <p role="status">{text('Kaydediliyor / yükleniyor…', 'Saving / loading…')}</p>}
          {error && <p role="alert">{error}</p>}
          {!canEdit && (
            <p>
              {text(
                'Salt okunur. Kontrol listesini güncellemek düzenleyici veya daha yüksek bir rol gerektirir.',
                'Read-only. Updating the checklist requires an editor or higher role.',
              )}
            </p>
          )}
          {state && (
            <>
              <label>
                {text('Şirket türü', 'Company form')}
                <select
                  className={inputClass}
                  value={state.legal_form}
                  disabled={busy || !canEdit}
                  onChange={(event) => save({ legal_form: event.target.value as 'AS' | 'LTD' })}
                >
                  <option value="LTD">
                    {text('Limited şirket (LTD)', 'Limited company (LTD)')}
                  </option>
                  <option value="AS">
                    {text('Anonim şirket (AŞ)', 'Joint-stock company (AŞ)')}
                  </option>
                </select>
              </label>
              <p>{text(state.disclaimer, state.disclaimer_en)}</p>
              <p>
                {text('Güncel kuruluş türü', 'Current incorporation form')}:{' '}
                {state.legal_form === 'AS'
                  ? text('Anonim şirket (AŞ)', 'Joint-stock company (AŞ)')
                  : text('Limited şirket (LTD)', 'Limited company (LTD)')}
              </p>
              {state.steps.map((step) => (
                <article key={step.key} className="border-t border-border-dark pt-4 space-y-2">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      disabled={busy || !canEdit}
                      checked={state.checklist[step.key] === true}
                      onChange={(event) =>
                        save({ checklist: { [step.key]: event.target.checked } })
                      }
                    />
                    <span className="font-semibold">{text(step.title, step.title_en)}</span>
                  </label>
                  <p>{text(step.description, step.description_en)}</p>
                  <SourceLink url={step.source_url}>
                    {text('Resmî dayanak', 'Official basis')}
                  </SourceLink>
                </article>
              ))}
              <p>
                {text('Son kayıt', 'Last saved')}: {timestamp(state.updated_at)} ·{' '}
                {text('Kaydeden', 'Saved by')}: {state.updated_by || '—'}
              </p>
              <h3 className="font-semibold">{text('Resmî kaynaklar', 'Official sources')}</h3>
              <ul className="space-y-2">
                {state.sources.map((source) => (
                  <li key={source.url}>
                    <SourceLink url={source.url}>{source.title}</SourceLink>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

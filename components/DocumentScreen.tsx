import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../services/api';
import type { Project, Workspace } from '../types';
import DocumentManager, { type StoredDocument } from './DocumentManager';
import {
  buttonClass,
  errorText,
  inputClass,
  panelClass,
  timestamp,
  useEvidenceText,
} from './EvidenceUi';

export interface DocumentScreenProps {
  workspace: Workspace;
  projects: Project[];
  onProjectChanged: () => Promise<void>;
  onUsage: () => Promise<void>;
}

export default function DocumentScreen({
  workspace,
  projects,
  onProjectChanged,
  onUsage,
}: DocumentScreenProps) {
  const text = useEvidenceText();
  const [params, setParams] = useSearchParams();
  const documentId = params.get('document') || '';
  const projectId = params.get('project') || '';
  const query = params.get('q') || '';
  const state = params.get('state') || '';
  const type = params.get('type') || '';
  const offset = Math.max(0, Number(params.get('offset')) || 0);
  const queryKey = `${workspace.id}:${projectId}:${query}:${state}:${type}:${offset}`;
  const detailKey = `${workspace.id}:${documentId}`;
  const [list, setList] = useState<{ key: string; documents: StoredDocument[] } | null>(null);
  const [selected, setSelected] = useState<{ key: string; document: StoredDocument } | null>(null);
  const [listError, setListError] = useState<{ key: string; message: string } | null>(null);
  const [detailError, setDetailError] = useState<{ key: string; message: string } | null>(null);
  const listScope = useRef<{ key: string; request: AbortController | null } | null>(null);
  const detailScope = useRef<{ key: string; request: AbortController | null } | null>(null);
  const route = useRef({ workspaceId: workspace.id, params, setParams });
  route.current = { workspaceId: workspace.id, params, setParams };
  const labels: Record<string, string> = {
    uploaded: text('Yüklendi — işlenmedi', 'Uploaded — not processed'),
    processed: text('İşlendi', 'Processed'),
    processing: text('İşleniyor', 'Processing'),
    review_required: text('İnceleme gerekli', 'Review required'),
    verified: text('Yetkili tarafından doğrulandı', 'Verified by reviewer'),
    failed: text('İşleme başarısız', 'Processing failed'),
  };
  const applicationLabels: Record<string, string> = {
    draft: text('Taslak', 'Draft'),
    review: text('İnceleme bekliyor', 'Awaiting review'),
    approved: text('Onaylandı', 'Approved'),
    exported: text('Paket dışa aktarıldı', 'Package exported'),
  };
  const documents = list?.key === queryKey ? list.documents : [];
  const current = selected?.key === detailKey ? selected.document : null;
  const currentProject = current
    ? projects.find((item) => item.id === current.project_id && item.workspace_id === workspace.id)
    : null;
  const uploadProject = projects.find(
    (item) => item.id === projectId && item.workspace_id === workspace.id,
  );
  const base = `/w/${workspace.id}/documents`;
  const closeParams = new URLSearchParams(params);
  closeParams.delete('document');

  const loadList = useCallback(() => {
    const active = listScope.current;
    if (active?.key !== queryKey) return;
    active.request?.abort();
    const controller = new AbortController();
    active.request = controller;
    setListError(null);
    const filters = new URLSearchParams({ limit: '100', offset: String(offset) });
    if (projectId) filters.set('project_id', projectId);
    if (query) filters.set('q', query);
    if (state) filters.set('state', state);
    if (type) filters.set('type', type);
    void api<StoredDocument[]>(`/workspaces/${workspace.id}/documents?${filters}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted && listScope.current === active)
          setList({ key: queryKey, documents: result });
      })
      .catch((reason) => {
        if (!controller.signal.aborted && listScope.current === active)
          setListError({ key: queryKey, message: errorText(reason) });
      });
  }, [workspace.id, offset, projectId, query, state, type, queryKey]);

  useEffect(() => {
    const active = { key: queryKey, request: null as AbortController | null };
    listScope.current = active;
    setList(null);
    loadList();
    return () => {
      active.request?.abort();
      if (listScope.current === active) listScope.current = null;
    };
  }, [queryKey, loadList]);

  const loadDetail = useCallback(
    (afterMutation = false) => {
      const active = detailScope.current;
      if (active?.key !== detailKey) return;
      active.request?.abort();
      setDetailError(null);
      if (!documentId) return;
      const controller = new AbortController();
      active.request = controller;
      void api<StoredDocument>(
        `/workspaces/${workspace.id}/documents/${encodeURIComponent(documentId)}`,
        { signal: controller.signal },
      )
        .then((document) => {
          if (!controller.signal.aborted && detailScope.current === active)
            setSelected({ key: detailKey, document });
        })
        .catch((reason) => {
          if (controller.signal.aborted || detailScope.current !== active) return;
          if (afterMutation && reason instanceof ApiError && reason.status === 404) {
            setSelected(null);
            const currentRoute = route.current;
            if (
              currentRoute.workspaceId === workspace.id &&
              currentRoute.params.get('document') === documentId
            ) {
              const next = new URLSearchParams(currentRoute.params);
              next.delete('document');
              currentRoute.setParams(next, { replace: true });
            }
          } else setDetailError({ key: detailKey, message: errorText(reason) });
        });
    },
    [workspace.id, documentId, detailKey],
  );

  useEffect(() => {
    const active = { key: detailKey, request: null as AbortController | null };
    detailScope.current = active;
    setSelected(null);
    loadDetail();
    return () => {
      active.request?.abort();
      if (detailScope.current === active) detailScope.current = null;
    };
  }, [detailKey, loadDetail]);

  const onDocumentsChanged = useCallback(() => {
    loadList();
    loadDetail(true);
  }, [loadList, loadDetail]);

  return (
    <div className="space-y-5">
      <section className={panelClass}>
        <h2 className="text-xl font-semibold">
          {text('Çalışma alanı belgeleri', 'Workspace documents')}
        </h2>
        <p>
          {text(
            'Yalnızca bu çalışma alanındaki yetkili olduğunuz özel belgeler listelenir. Orijinaller kimlik doğrulaması ile indirilir.',
            'Only private documents you may access in this workspace are listed. Originals require authenticated downloads.',
          )}
        </p>
        <form
          key={queryKey}
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const next = new URLSearchParams(params);
            for (const field of ['project', 'q', 'state', 'type']) {
              const value = String(form.get(field) || '').trim();
              if (value) next.set(field, value);
              else next.delete(field);
            }
            next.delete('offset');
            setParams(next);
          }}
        >
          <label>
            {text('Proje', 'Project')}
            <select name="project" className={inputClass} defaultValue={projectId}>
              <option value="">{text('Tüm projeler', 'All projects')}</option>
              {projects
                .filter((item) => item.workspace_id === workspace.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {text('Dosya adı ara', 'Search file names')}
            <input name="q" className={inputClass} defaultValue={query} maxLength={200} />
          </label>
          <label>
            {text('Durum', 'State')}
            <select name="state" className={inputClass} defaultValue={state}>
              <option value="">{text('Tümü', 'All')}</option>
              {Object.entries(labels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {text('Dosya türü', 'File type')}
            <select name="type" className={inputClass} defaultValue={type}>
              <option value="">{text('Tümü', 'All')}</option>
              <option value="application/pdf">PDF</option>
              <option value="application/vnd.openxmlformats-officedocument.wordprocessingml.document">
                DOCX
              </option>
              <option value="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
                XLSX
              </option>
              <option value="image/">{text('Taranmış görüntü', 'Scanned image')}</option>
            </select>
          </label>
          <button className={buttonClass}>{text('Filtrele', 'Filter')}</button>
        </form>
        {listError?.key === queryKey ? (
          <p role="alert">{listError.message}</p>
        ) : list?.key !== queryKey ? (
          <p role="status">{text('Belgeler yükleniyor…', 'Loading documents…')}</p>
        ) : documents.length === 0 ? (
          <p>
            {text('Bu filtrelerde kayıtlı belge yok.', 'No stored documents match these filters.')}
          </p>
        ) : (
          <ul className="space-y-3">
            {documents.map((document) => {
              const next = new URLSearchParams(params);
              next.set('document', document.id);
              return (
                <li className="border-t border-border-dark pt-3" key={document.id}>
                  <Link className="text-primary underline break-all" to={`${base}?${next}`}>
                    {document.original_name}
                  </Link>
                  <p>
                    {document.project_title ||
                      projects.find((item) => item.id === document.project_id)?.title ||
                      '—'}{' '}
                    · {labels[document.status] || document.status} · {document.mime} ·{' '}
                    {(document.size / 1024).toFixed(1)} KiB · {timestamp(document.created_at)}
                  </p>
                  {document.used_by?.map((application) => (
                    <p key={application.id}>
                      <Link
                        className="text-primary underline"
                        to={`/w/${workspace.id}/applications/${application.id}/documents`}
                      >
                        {application.call_title}
                      </Link>{' '}
                      · {applicationLabels[application.state] || application.state}
                    </p>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex gap-2">
          <button
            className={buttonClass}
            disabled={offset === 0}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set('offset', String(Math.max(0, offset - 100)));
              setParams(next);
            }}
          >
            {text('Önceki', 'Previous')}
          </button>
          <button
            className={buttonClass}
            disabled={documents.length < 100}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set('offset', String(offset + 100));
              setParams(next);
            }}
          >
            {text('Sonraki', 'Next')}
          </button>
        </div>
      </section>
      {documentId && (
        <section className="space-y-4">
          <Link className="text-primary underline" to={`${base}?${closeParams}`}>
            {text('Belge ayrıntısını kapat', 'Close document details')}
          </Link>
          {detailError?.key === detailKey ? (
            <p role="alert">{detailError.message}</p>
          ) : !current ? (
            <p role="status">{text('Belge ayrıntısı yükleniyor…', 'Loading document details…')}</p>
          ) : !currentProject ? (
            <p role="alert">
              {text(
                'Belgenin projesi bu çalışma alanında bulunamadı.',
                'The document project was not found in this workspace.',
              )}
            </p>
          ) : (
            <DocumentManager
              key={detailKey}
              workspace={workspace}
              project={currentProject}
              documentId={documentId}
              onProjectChanged={onProjectChanged}
              onUsage={onUsage}
              onDocumentsChanged={onDocumentsChanged}
            />
          )}
        </section>
      )}
      {!documentId && uploadProject && (
        <DocumentManager
          key={`${workspace.id}:${uploadProject.id}`}
          uploadOnly
          workspace={workspace}
          project={uploadProject}
          onDocumentsChanged={onDocumentsChanged}
          onProjectChanged={onProjectChanged}
          onUsage={onUsage}
        />
      )}
      {!documentId && !uploadProject && (
        <p>
          {text(
            'Yeni belge yüklemek için proje filtresinden bir proje seçin.',
            'Choose a project in the project filter to upload a new document.',
          )}
        </p>
      )}
    </div>
  );
}

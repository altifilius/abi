import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useUnsavedChanges } from '../contexts/NavigationGuard';
import { useI18n } from '../i18n';
import { ApiError, api, downloadFile, errorMessage } from '../services/api';
import { APPLICATION_SECTIONS, canEditWorkspace, canReviewWorkspace } from '../services/navigation';
import type { Application, Project, Workspace } from '../types';
import {
  type ApplicationCall,
  type ApplicationCheck,
  type ApplicationData,
  type ApplicationDocument,
  type ApplicationRecord,
  type ApplicationTemplate,
  applicationBudgetsEqual,
  canonicalApplicationData,
} from './applicationData';
import BudgetEditor from './BudgetEditor';

export default function ApplicationDetail({
  workspace,
  project,
  application,
  section,
  onChanged,
  onUsage,
}: {
  workspace: Workspace;
  project: Project;
  application: Application;
  section: string;
  onChanged: () => Promise<void>;
  onUsage: () => Promise<void>;
}) {
  const { text } = useI18n();
  const location = useLocation();
  const [current, setCurrent] = useState<ApplicationRecord>(application);
  const currentRef = useRef<ApplicationRecord>(application);
  currentRef.current = current;
  const [data, setData] = useState<ApplicationData>(application.data);
  const [responsibleId, setResponsibleId] = useState(application.responsible_id || '');
  const [members, setMembers] = useState<{ user_id: string; name: string; role: string }[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [call, setCall] = useState<ApplicationCall | null>(null);
  const [documents, setDocuments] = useState<ApplicationDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const documentsController = useRef<AbortController | null>(null);
  const sectionContainer = useRef<HTMLDivElement | null>(null);
  const [check, setCheck] = useState<{ result: ApplicationCheck; key: string } | null>(null);
  const [latest, setLatest] = useState<ApplicationRecord | null>(null);
  const [conflictReviewed, setConflictReviewed] = useState(false);
  const [languageAcknowledged, setLanguageAcknowledged] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const controller = useRef<AbortController | null>(null);
  const savedCanonical = canonicalApplicationData(current.data);
  const draftCanonical = canonicalApplicationData(data);
  const dirty =
    savedCanonical !== draftCanonical || responsibleId !== (current.responsible_id || '');
  const currentKey = `${current.id}:${current.revision}:${current.responsible_id || ''}:${savedCanonical}`;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const editable = workspace.plan === 'pro' && canEditWorkspace(workspace.role);
  const reviewer = workspace.plan === 'pro' && canReviewWorkspace(workspace.role);
  const readOnly = !editable;
  const template: ApplicationTemplate = current.template || {};
  const language = current.language || template.language || '';
  const base = `/w/${workspace.id}`;
  const appBase = `${base}/applications/${current.id}`;
  const checked =
    check?.key === currentKey &&
    check.result.application_revision === current.revision &&
    !dirty &&
    !latest;
  const ready = !!checked && !!check?.result.ready_for_review;
  const locked = dirty || busy || !!latest;
  useUnsavedChanges(dirty || notes.length > 0, () => {
    const value = latest || current;
    currentRef.current = value;
    setCurrent(value);
    setData(value.data);
    setResponsibleId(value.responsible_id || '');
    setLatest(null);
    setConflictReviewed(false);
    setLanguageAcknowledged(null);
    setCheck(null);
    setNotes('');
  });

  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    return () => active.abort();
  }, []);

  useEffect(() => {
    const saved = currentRef.current;
    if (application.id !== saved.id) return;
    // A parent refresh started before our successful save must not roll the editor back.
    if (application.revision < saved.revision) return;
    if (
      application.revision === saved.revision &&
      application.state === saved.state &&
      canonicalApplicationData(application.data) === canonicalApplicationData(saved.data) &&
      application.responsible_id === saved.responsible_id &&
      application.responsible_name === saved.responsible_name
    )
      return;
    if (dirtyRef.current) {
      setLatest(application);
      setConflictReviewed(false);
    } else {
      currentRef.current = application;
      setCurrent(application);
      setData(application.data);
      setResponsibleId(application.responsible_id || '');
      setLatest(null);
      setCheck(null);
      setLanguageAcknowledged(null);
    }
  }, [application]);

  useEffect(() => {
    const active = new AbortController();
    setMembersLoading(true);
    api<{ user_id: string; name: string; role: string }[]>(`/workspaces/${workspace.id}/members`, {
      signal: active.signal,
    })
      .then((value) => {
        if (!active.signal.aborted) setMembers(value);
      })
      .catch((reason) => {
        if (!active.signal.aborted) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!active.signal.aborted) setMembersLoading(false);
      });
    return () => active.abort();
  }, [workspace.id]);

  useEffect(() => {
    const active = new AbortController();
    setCall(null);
    api<ApplicationCall>(`/calls/${current.call_id}`, { signal: active.signal })
      .then((value) => {
        if (!active.signal.aborted) setCall(value);
      })
      .catch((reason) => {
        if (!active.signal.aborted) setError(errorMessage(reason));
      });
    return () => active.abort();
  }, [current.call_id]);

  const loadDocuments = useCallback(async () => {
    documentsController.current?.abort();
    const active = new AbortController();
    documentsController.current = active;
    setDocumentsLoading(true);
    try {
      const value = await api<ApplicationDocument[]>(`/projects/${project.id}/documents`, {
        signal: active.signal,
      });
      if (!active.signal.aborted) {
        setDocuments(value);
        setCheck(null);
        setLanguageAcknowledged(null);
      }
    } catch (reason) {
      if (!active.signal.aborted) setError(errorMessage(reason));
    } finally {
      if (!active.signal.aborted) setDocumentsLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    void loadDocuments();
    return () => documentsController.current?.abort();
  }, [loadDocuments]);

  useLayoutEffect(() => {
    if (!location.hash) return;
    const id = decodeURIComponent(location.hash.slice(1));
    const targetSection = id.startsWith('section-')
      ? 'text'
      : id.startsWith('attachment-')
        ? 'documents'
        : id === 'application-budget'
          ? 'budget'
          : null;
    if (section !== targetSection) return;
    if (
      (targetSection === 'text' &&
        !template.sections?.some((item) => id === `section-${item.key}`)) ||
      (targetSection === 'documents' &&
        !template.documents?.some((item) => id === `attachment-${item.key}`))
    )
      return;
    const target = document.getElementById(id);
    if (target && sectionContainer.current?.contains(target)) {
      target.scrollIntoView({ block: 'center' });
    }
  }, [location.hash, section, template.sections, template.documents]);

  const editData = (value: ApplicationData) => {
    setData(value);
    setLanguageAcknowledged(null);
    setNotice('');
  };
  const applySaved = (value: ApplicationRecord) => {
    currentRef.current = value;
    setCurrent(value);
    setData(value.data);
    setResponsibleId(value.responsible_id || '');
    setLatest(null);
    setConflictReviewed(false);
    setCheck(null);
    setLanguageAcknowledged(null);
    setNotes('');
  };
  const loadLatest = async () => {
    const active = controller.current;
    if (!active || active.signal.aborted) return;
    const value = await api<ApplicationRecord>(`/applications/${current.id}`, {
      signal: active.signal,
    });
    if (active.signal.aborted) return;
    if (dirtyRef.current) {
      setLatest(value);
      setConflictReviewed(false);
    } else applySaved(value);
  };
  const action = async (
    kind:
      | 'save'
      | 'check'
      | 'submit-review'
      | 'approve'
      | 'reject'
      | 'write'
      | 'import-project-budget'
      | 'docx'
      | 'pdf'
      | 'zip'
      | 'reload',
  ) => {
    const active = controller.current;
    if (!active || active.signal.aborted || busy) return;
    if (
      kind !== 'reload' &&
      (workspace.plan !== 'pro' || (kind === 'save' ? !editable || !dirty || !!latest : locked))
    )
      return;
    if (
      ['save', 'write', 'submit-review', 'check', 'import-project-budget'].includes(kind) &&
      !editable
    )
      return;
    if (['approve', 'reject'].includes(kind) && !reviewer) return;
    if (kind === 'reject' && current.state !== 'review_requested') return;
    if (
      kind === 'approve' &&
      (current.state !== 'review_requested' ||
        !ready ||
        languageAcknowledged !== currentKey ||
        !language)
    )
      return;
    if (kind === 'submit-review' && (current.state !== 'draft' || !ready)) return;
    if (['docx', 'pdf', 'zip'].includes(kind) && (current.state !== 'approved' || !ready)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (kind === 'reload') await loadLatest();
      else if (['docx', 'pdf', 'zip'].includes(kind)) {
        await downloadFile(
          `/applications/${current.id}/export?format=${kind}&expected_revision=${current.revision}`,
          `application-r${current.revision}.${kind}`,
          { signal: active.signal },
        );
      } else if (kind === 'check') {
        const result = await api<ApplicationCheck>(`/applications/${current.id}/check`, {
          method: 'POST',
          signal: active.signal,
        });
        setLanguageAcknowledged(null);
        const [actual, actualDocuments] = await Promise.all([
          api<ApplicationRecord>(`/applications/${current.id}`, { signal: active.signal }),
          api<ApplicationDocument[]>(`/projects/${project.id}/documents`, {
            signal: active.signal,
          }),
        ]);
        if (!active.signal.aborted) {
          setDocuments(actualDocuments);
          if (
            actual.revision !== current.revision ||
            actual.state !== current.state ||
            canonicalApplicationData(actual.data) !== savedCanonical ||
            actual.responsible_id !== current.responsible_id ||
            result.application_revision !== current.revision
          ) {
            setLatest(actual);
            setConflictReviewed(false);
            setCheck(null);
            setError(
              text(
                'Sunucudaki başvuru değişti. Güncel sürümü yükleyip tekrar kontrol edin.',
                'The server application changed. Load the latest revision and check it again.',
              ),
            );
          } else setCheck({ result, key: currentKey });
        }
      } else if (kind === 'write') {
        const value = await api<{ application: ApplicationRecord; requires_review: true }>(
          `/applications/${current.id}/write`,
          { method: 'POST', json: { expected_revision: current.revision }, signal: active.signal },
        );
        if (!active.signal.aborted) {
          applySaved(value.application);
          await onChanged();
          await onUsage();
        }
      } else {
        const value = await api<ApplicationRecord>(
          `/applications/${current.id}${kind === 'save' ? '' : kind === 'reject' ? '/approve' : `/${kind}`}`,
          {
            method: kind === 'save' ? 'PATCH' : 'POST',
            json:
              kind === 'save'
                ? {
                    expected_revision: current.revision,
                    data,
                    responsible_id: responsibleId || null,
                  }
                : kind === 'approve' || kind === 'reject'
                  ? {
                      expected_revision: current.revision,
                      approved: kind === 'approve',
                      notes,
                      ...(kind === 'approve' ? { confirmed_language: language } : {}),
                    }
                  : { expected_revision: current.revision },
            signal: active.signal,
          },
        );
        if (!active.signal.aborted) {
          applySaved(value);
          setNotice(text('Kayıtlı sürüm güncellendi.', 'Saved revision updated.'));
          await onChanged();
        }
      }
    } catch (reason) {
      if (!active.signal.aborted) {
        setError(errorMessage(reason));
        if (reason instanceof ApiError && reason.status === 409) {
          setCheck(null);
          setLanguageAcknowledged(null);
          try {
            await loadLatest();
          } catch (reloadError) {
            setError(`${errorMessage(reason)} · ${errorMessage(reloadError)}`);
          }
        }
      }
    } finally {
      if (!active.signal.aborted) setBusy(false);
    }
  };

  const fieldLink = (field?: string) => {
    if (field?.startsWith('sections'))
      return `${appBase}/text${field.includes('.') ? `#${encodeURIComponent(`section-${field.slice('sections.'.length)}`)}` : ''}`;
    if (field?.startsWith('attachments'))
      return `${appBase}/documents${field.includes('.') ? `#${encodeURIComponent(`attachment-${field.slice('attachments.'.length)}`)}` : ''}`;
    if (field === 'project.budget') return `${base}/projects/${project.id}/budget`;
    if (field?.startsWith('budget')) return `${appBase}/budget#application-budget`;
    if (field?.startsWith('profile')) return `${base}/projects/${project.id}/profile`;
    if (field?.startsWith('evaluation')) return `${base}/projects/${project.id}/eligibility`;
    if (field === 'call') return `${base}/funding/calls/${current.call_id}`;
    if (field === 'template') return `${appBase}/package`;
    return `${appBase}/overview`;
  };
  const budgetMatchesProject = applicationBudgetsEqual(data.budget, project.profile.budget);
  const staleProfile =
    current.profile_revision !== project.revision ||
    project.confirmed_revision !== project.revision;
  const staleCall =
    !!call &&
    (call.status !== 'published' ||
      call.version !== current.call_version ||
      call.source_revision_id !== current.source_revision_id ||
      call.rule_version !== current.rule_version);
  const preview = (
    <div className="stack">
      {(template.sections || []).map((item) => (
        <article key={item.key}>
          <h3>{item.label}</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{data.sections[item.key] || '—'}</p>
        </article>
      ))}
      <h3>
        {text('Başvuru bütçesi', 'Application budget')} · {data.budget.currency}
      </h3>
      <ul>
        {data.budget.items.map((item) => (
          <li key={item.id}>
            {item.description} · {item.category} · {item.amount} {data.budget.currency}
          </li>
        ))}
      </ul>
      <h3>{text('Ekler', 'Attachments')}</h3>
      <ul>
        {(template.documents || []).map((item) => {
          const attached = documents.find((document) => document.id === data.attachments[item.key]);
          return (
            <li key={item.key}>
              {item.label}:{' '}
              {attached
                ? `${attached.original_name} · ${attached.status}`
                : data.attachments[item.key]
                  ? text(
                      'Ekli belge şu anda erişilebilir değil',
                      'Attached document is currently unavailable',
                    )
                  : '—'}
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div className="stack" ref={sectionContainer}>
      <header>
        <Link to={`${base}/applications`}>{text('Başvurular', 'Applications')}</Link>
        <h1>{call?.title || current.call_title || text('Başvuru', 'Application')}</h1>
        <p>
          <Link to={`${base}/projects/${project.id}/overview`}>{project.title}</Link> ·{' '}
          {dirty
            ? text(
                'Kaydedilmemiş düzenleme; önceki onay bu taslağı kapsamıyor',
                'Unsaved edit; previous approval does not cover this draft',
              )
            : current.state}{' '}
          · r{current.revision} · {text('Dil', 'Language')}: {language || '—'}
        </p>
      </header>
      <nav className="section-nav" aria-label={text('Başvuru bölümleri', 'Application sections')}>
        {APPLICATION_SECTIONS.map((value) => {
          const labels: Record<string, string> = {
            overview: text('Genel bakış', 'Overview'),
            text: text('Metin', 'Text'),
            budget: text('Bütçe', 'Budget'),
            documents: text('Belgeler', 'Documents'),
            checks: text('Kontroller', 'Checks'),
            review: text('İnceleme', 'Review'),
            package: text('Paket', 'Package'),
          };
          return dirty || busy ? (
            <span
              key={value}
              aria-current={section === value ? 'page' : undefined}
              aria-disabled="true"
            >
              {labels[value]}
            </span>
          ) : (
            <NavLink
              key={value}
              to={`${appBase}/${value}`}
              aria-current={section === value ? 'page' : undefined}
            >
              {labels[value]}
            </NavLink>
          );
        })}
      </nav>
      {readOnly && (
        <p className="notice">
          {workspace.plan !== 'pro'
            ? text(
                'Geçmiş başvuru salt okunur. Düzenleme, kontrol, onay ve nihai paket Pro gerektirir.',
                'Historical application is read-only. Editing, checks, approval and final packages require Pro.',
              )
            : text(
                'Görüntüleyici erişimi: tüm alanlar salt okunur.',
                'Viewer access: all fields are read-only.',
              )}
        </p>
      )}
      {(staleProfile || staleCall) && (
        <p className="error">
          {text(
            'Bu başvuru tarihsel profil / çağrı sürümüne bağlıdır. Kaynaklar değiştirilmez: güncel proje profilini onaylayın, yeni değerlendirme yapın ve yeni başvuru oluşturun.',
            'This application is bound to a historical profile / call revision. Sources are not silently changed: confirm the current profile, evaluate again and create a new application.',
          )}{' '}
          <Link to={`${base}/projects/${project.id}/profile`}>
            {text('Proje profili', 'Project profile')}
          </Link>{' '}
          ·{' '}
          <Link to={`${base}/projects/${project.id}/eligibility`}>
            {text('Yeni değerlendirme', 'New evaluation')}
          </Link>{' '}
          · <Link to={`${base}/funding`}>{text('Güncel çağrıyı bul', 'Find current call')}</Link>
        </p>
      )}
      <section className="panel">
        <p role="status">
          {dirty
            ? text(
                'Kaydedilmemiş değişiklikler var. Bölüm değiştirmeden ve kontrol / onay / indirmeden önce kaydedin.',
                'Unsaved changes. Save before changing sections or checking / approving / downloading.',
              )
            : text(
                'Ekrandaki içerik kayıtlı sürümdür.',
                'The displayed content is the saved revision.',
              )}
        </p>
        <div className="actions">
          <button
            disabled={!editable || !dirty || busy || !!latest}
            onClick={() => void action('save')}
          >
            {text('Değişiklikleri kaydet', 'Save changes')}
          </button>
          <button disabled={busy} onClick={() => void action('reload')}>
            {text('Sunucudan yenile', 'Reload from server')}
          </button>
        </div>
        <p>
          {text(
            'Kaydetmek önceki onayı iptal eder ve yeni taslak revizyonu oluşturur.',
            'Saving revokes previous approval and creates a new draft revision.',
          )}
        </p>
      </section>
      {latest && (
        <section className="panel" role="alert">
          <h2>{text('Sürüm çakışması', 'Revision conflict')}</h2>
          <p>
            {text(
              'Yerel girişiniz korunmuştur. Sunucudaki sürüm',
              'Your local input has been preserved. Server revision',
            )}
            : r{latest.revision} · {latest.state}
          </p>
          <details>
            <summary>
              {text(
                'Yerel taslak ile sunucudaki veriyi karşılaştır',
                'Compare local draft and latest server data',
              )}
            </summary>
            <h3>{text('Yerel taslak', 'Local draft')}</h3>
            <pre>{JSON.stringify(data, null, 2)}</pre>
            <p>
              {text('Sorumlu', 'Responsible')}:{' '}
              {members.find((member) => member.user_id === responsibleId)?.name ||
                (responsibleId === current.responsible_id
                  ? current.responsible_name
                  : responsibleId) ||
                text('Atanmamış', 'Unassigned')}
            </p>
            <h3>{text('Sunucudaki sürüm', 'Latest server revision')}</h3>
            <pre>{JSON.stringify(latest.data, null, 2)}</pre>
            <p>
              {text('Sorumlu', 'Responsible')}:{' '}
              {latest.responsible_name || text('Atanmamış', 'Unassigned')}
            </p>
          </details>
          <button disabled={busy} onClick={() => applySaved(latest)}>
            {text(
              'Yerel değişiklikleri bırak, son sürümü yükle',
              'Discard local changes and load latest',
            )}
          </button>
          {dirty && editable && (
            <>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={conflictReviewed}
                  onChange={(event) => setConflictReviewed(event.target.checked)}
                />
                {text(
                  'Her iki sürümü karşılaştırdım. Yerel taslağımın yeni sunucu alanlarının yerine geçeceğini anlıyorum; kaydetmeden tekrar inceleyeceğim.',
                  'I compared both revisions. I understand my local draft will replace the latest server fields; I will review before saving.',
                )}
              </label>
              <button
                disabled={busy || !conflictReviewed}
                onClick={() => {
                  if (responsibleId === (current.responsible_id || '')) {
                    setResponsibleId(latest.responsible_id || '');
                  }
                  currentRef.current = latest;
                  setCurrent(latest);
                  setLatest(null);
                  setConflictReviewed(false);
                  setCheck(null);
                  setLanguageAcknowledged(null);
                }}
              >
                {text(
                  'Yerel taslağı son revizyon üzerinde incele (henüz kaydetme)',
                  'Review local draft against latest revision (do not save yet)',
                )}
              </button>
            </>
          )}
        </section>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {section === 'overview' && (
        <section className="panel">
          <h2>{text('Başvuru özeti', 'Application overview')}</h2>
          <dl>
            <div>
              <dt>{text('Profil revizyonu', 'Profile revision')}</dt>
              <dd>
                {current.profile_revision} / {project.revision}
              </dd>
            </div>
            <div>
              <dt>{text('Çağrı sürümü', 'Call version')}</dt>
              <dd>
                {current.call_version} {call ? ` / ${call.version} · ${call.status}` : ''}
              </dd>
            </div>
            <div>
              <dt>{text('Kural sürümü', 'Rule version')}</dt>
              <dd>{current.rule_version}</dd>
            </div>
            <div>
              <dt>{text('Son tarih (UTC)', 'Deadline (UTC)')}</dt>
              <dd>{call?.deadline ? new Date(call.deadline).toISOString() : '—'}</dd>
            </div>
            <div>
              <dt>{text('Oluşturulma (UTC)', 'Created (UTC)')}</dt>
              <dd>{current.created_at ? new Date(current.created_at).toISOString() : '—'}</dd>
            </div>
          </dl>
          <label className="field">
            <span>{text('Başvuru sorumlusu', 'Application responsible')}</span>
            <select
              value={responsibleId}
              disabled={!editable || busy || !!latest || membersLoading}
              onChange={(event) => {
                setResponsibleId(event.target.value);
                setCheck(null);
                setLanguageAcknowledged(null);
                setNotice('');
              }}
            >
              <option value="">{text('Atanmamış', 'Unassigned')}</option>
              {responsibleId &&
                !members.some(
                  (member) => member.user_id === responsibleId && member.role !== 'viewer',
                ) && (
                  <option value={responsibleId} disabled>
                    {current.responsible_name || text('Eski sorumlu', 'Former responsible')} ·{' '}
                    {text('Artık seçilemez', 'No longer selectable')}
                  </option>
                )}
              {members
                .filter((member) => member.role !== 'viewer')
                .map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.name} · {member.role}
                  </option>
                ))}
            </select>
          </label>
          <p>
            {text(
              'Sorumlu değişikliği içerikle birlikte “Değişiklikleri kaydet” ile kaydedilir; yeni taslak revizyonu oluşturur.',
              'Save responsibility changes together with content using “Save changes”; this creates a new draft revision.',
            )}
          </p>
          <p>
            {text(
              'Bu paket resmî form veya gönderim kanıtı değildir. Tüm alanlar, belgeler ve çağrı dilindeki içerik insan incelemesi gerektirir.',
              'This package is not an official form or proof of submission. All fields, attachments and content in the call language require human review.',
            )}
          </p>
          <details>
            <summary>{text('Teknik kaynak bağlantıları', 'Technical source bindings')}</summary>
            <p>
              {current.id} · {current.call_id} · {current.source_revision_id}
            </p>
          </details>
          {preview}
        </section>
      )}
      {section === 'text' && (
        <section className="panel">
          <h2>{text('Kaynağa bağlı başvuru alanları', 'Source-bound application fields')}</h2>
          <button disabled={!editable || locked || !call} onClick={() => void action('write')}>
            {text(
              'Çağrı dilinde AI yaz / çevir (1 yazım; insan incelemesi gerekli)',
              'AI write / translate in call language (1 writing credit; human review required)',
            )}
          </button>
          {!(template.sections || []).length && (
            <p className="error">
              {text(
                'Tarihsel kaynak şablonunda alan bulunmuyor; güncel çağrı şablonu ile değiştirilmez.',
                'The historical source template has no fields; it is not replaced with the current call template.',
              )}
            </p>
          )}
          {(template.sections || []).map((item) => (
            <label id={`section-${item.key}`} key={item.key}>
              {item.label}
              {item.required ? ' *' : ''}
              {item.source_url && (
                <a target="_blank" rel="noreferrer" href={item.source_url}>
                  {text('Resmî kaynak', 'Official source')} {item.source_locator}
                </a>
              )}
              <textarea
                rows={7}
                value={data.sections[item.key] || ''}
                disabled={readOnly || busy}
                maxLength={item.max_characters || undefined}
                onChange={(event) =>
                  editData({
                    ...data,
                    sections: { ...data.sections, [item.key]: event.target.value },
                  })
                }
              />
              {item.max_characters != null && (
                <small>
                  {(data.sections[item.key] || '').length} / {item.max_characters}
                </small>
              )}
            </label>
          ))}
        </section>
      )}
      {section === 'budget' && (
        <section className="panel" id="application-budget">
          <h2>
            {text('Proje bütçesi ve başvuru varyantı', 'Project budget and application variant')}
          </h2>
          <p>
            {text(
              'Proje bütçesi uygunluk değerlendirmesinin temelidir. Buradaki değişiklik yalnızca başvuruyu değiştirir; projeye otomatik aktarılmaz.',
              'The project budget is the eligibility evaluation baseline. Changes here affect only this application; they never silently update the project.',
            )}
          </p>
          <h3>
            {text('Güncel proje bütçesi', 'Current project budget')} · r{project.revision}
          </h3>
          {project.profile.budget ? (
            <>
              <p>
                {project.profile.budget.currency} ·{' '}
                {budgetMatchesProject
                  ? text('Başvuru bütçesiyle aynı', 'Matches application budget')
                  : text('Başvuru bütçesinden farklı', 'Differs from application budget')}
              </p>
              <ul>
                {project.profile.budget.items.map((item) => (
                  <li key={item.id}>
                    {item.description} · {item.category} · {item.amount}{' '}
                    {project.profile.budget?.currency}
                  </li>
                ))}
              </ul>
              <button
                disabled={!editable || locked || staleProfile || staleCall || budgetMatchesProject}
                onClick={() => void action('import-project-budget')}
              >
                {text(
                  'Onaylı proje bütçesini başvuruya aktar ve kaydet',
                  'Import and save the confirmed project budget',
                )}
              </button>
            </>
          ) : (
            <p>{text('Proje bütçesi tanımlanmamış.', 'No project budget has been defined.')}</p>
          )}
          <BudgetEditor
            value={data.budget}
            disabled={readOnly || busy}
            onChange={(budget) => editData({ ...data, budget })}
          />
          <p>
            {text('Çağrının kaynak para birimi', 'Call source currency')}:{' '}
            {call?.finance.currency || '—'} ·{' '}
            {text('Kur dönüşümü yapılmaz.', 'No currency conversion is performed.')}
          </p>
          {call?.finance.notes && <p>{call.finance.notes}</p>}
          {call?.finance.source_url && (
            <a href={call.finance.source_url} target="_blank" rel="noreferrer">
              {text('Resmî finansman kaynağı', 'Official finance source')}
            </a>
          )}
          {call?.finance.requires_national_confirmation && (
            <p>
              {text(
                'Ulusal finansman koşulları atfedilebilir insan teyidi gerektirir; not girmek teyit yerine geçmez.',
                'National finance conditions require attributed human confirmation; entering notes does not constitute confirmation.',
              )}{' '}
              <Link to={`${base}/projects/${project.id}/eligibility`}>
                {text('Finansman koşullarını incele', 'Review finance conditions')}
              </Link>
            </p>
          )}
          {!budgetMatchesProject && call?.finance.budget_required !== false && (
            <p className="error">
              {text(
                'Farklı bütçe nihai paketi engelleyebilir. Bu varyant kullanılacaksa proje bütçesini güncelle → profili onayla → yeni değerlendirme yap → yeni başvuru oluştur. Bu işlem mevcut başvuruyu otomatik güncellemez.',
                'A different budget can block finalization. To use this variant: update the project budget → confirm the profile → evaluate again → create a new application. This never silently rebases the existing application.',
              )}{' '}
              <Link to={`${base}/projects/${project.id}/budget`}>
                {text('Proje bütçesine git', 'Open project budget')}
              </Link>
            </p>
          )}
        </section>
      )}
      {section === 'documents' && (
        <section className="panel">
          <h2>{text('Kaynak belgesi gereksinimleri', 'Source attachment requirements')}</h2>
          <div className="actions">
            <button disabled={busy || documentsLoading} onClick={() => void loadDocuments()}>
              {text('Belgeleri sunucudan yenile', 'Reload documents from server')}
            </button>
            <Link to={`${base}/documents?project=${project.id}`}>
              {text('Projeye belge yükle / doğrula', 'Upload / verify project documents')}
            </Link>
          </div>
          <p>
            {text(
              'Yalnızca insan tarafından doğrulanmış orijinaller seçilebilir. Biçim sınırları çağrı kaynağından gelir; nihai kontrol özel depolama bütünlüğünü tekrar doğrular.',
              'Only human-verified originals can be selected. Format limits come from the call source; final checks revalidate private-storage integrity.',
            )}
          </p>
          {documentsLoading && (
            <p role="status">{text('Belgeler yükleniyor…', 'Loading documents…')}</p>
          )}
          {(template.documents || []).map((item) => {
            const attached = documents.find(
              (document) => document.id === data.attachments[item.key],
            );
            return (
              <div id={`attachment-${item.key}`} key={item.key}>
                <label>
                  {item.label}
                  {item.required ? ' *' : ''}
                  <select
                    value={data.attachments[item.key] || ''}
                    disabled={readOnly || busy || documentsLoading}
                    onChange={(event) =>
                      editData({
                        ...data,
                        attachments: { ...data.attachments, [item.key]: event.target.value },
                      })
                    }
                  >
                    <option value="">
                      {text('Doğrulanmış orijinal seç', 'Select verified original')}
                    </option>
                    {data.attachments[item.key] &&
                      !documents.some(
                        (document) =>
                          document.id === data.attachments[item.key] &&
                          document.status === 'verified' &&
                          document.verified_by &&
                          document.verified_at,
                      ) && (
                        <option value={data.attachments[item.key]}>
                          {attached?.original_name ||
                            text(
                              'Önceki ek erişilebilir değil',
                              'Previous attachment unavailable',
                            )}{' '}
                          · {attached?.status || text('Eksik', 'Missing')}
                        </option>
                      )}
                    {documents
                      .filter(
                        (document) =>
                          document.status === 'verified' &&
                          document.verified_by &&
                          document.verified_at,
                      )
                      .map((document) => (
                        <option key={document.id} value={document.id}>
                          {document.original_name}
                        </option>
                      ))}
                  </select>
                </label>
                <p>
                  {text('Kabul edilen uzantılar', 'Accepted extensions')}:{' '}
                  {item.accepted_extensions?.join(', ') ||
                    text('Kaynakta sınır yok', 'No source limit specified')}
                </p>
                {item.source_url && (
                  <a href={item.source_url} target="_blank" rel="noreferrer">
                    {text('Resmî belge kaynağı', 'Official attachment source')}{' '}
                    {item.source_locator}
                  </a>
                )}
                {attached && (
                  <>
                    <p>
                      {attached.original_name} · {attached.size} bytes · {attached.status} ·{' '}
                      {text('Doğrulama (UTC)', 'Verified (UTC)')}:{' '}
                      {attached.verified_at ? new Date(attached.verified_at).toISOString() : '—'}
                    </p>
                    <button
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError('');
                        try {
                          await downloadFile(
                            `/documents/${attached.id}/download`,
                            attached.original_name,
                          );
                        } catch (reason) {
                          setError(errorMessage(reason));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {text('Orijinali indir', 'Download original')}
                    </button>
                    <details>
                      <summary>SHA-256</summary>
                      <code>{attached.sha256}</code>
                    </details>
                  </>
                )}
              </div>
            );
          })}
          {!(template.documents || []).length && (
            <p>
              {text(
                'Bu tarihsel şablonda ek gereksinimi bulunmuyor.',
                'This historical template specifies no attachment requirements.',
              )}
            </p>
          )}
        </section>
      )}
      {(section === 'checks' || section === 'review' || section === 'package') && (
        <section className="panel">
          <h2>
            {text('Kayıtlı revizyon kontrolü', 'Saved revision check')} · r{current.revision}
          </h2>
          <button
            disabled={!editable || locked || documentsLoading}
            onClick={() => void action('check')}
          >
            {text('Ekrandaki kayıtlı sürümü kontrol et', 'Check the displayed saved revision')}
          </button>
          {!checked && (
            <p>
              {text(
                'İnceleme, onay ve indirme öncesinde bu kayıtlı revizyonu kontrol edin.',
                'Check this saved revision before review, approval or download.',
              )}
            </p>
          )}
          {checked && check && (
            <>
              <p>
                {check.result.ready_for_review
                  ? text('İnceleme için hazır', 'Ready for review')
                  : text('Zorunlu eksikler var', 'Required issues remain')}
              </p>
              <ul>
                {check.result.errors.map((issue) => (
                  <li key={`${issue.code}:${issue.field}:${issue.message}`} className="error">
                    <Link to={fieldLink(issue.field)}>{issue.field || issue.code}</Link>:{' '}
                    {issue.message}
                  </li>
                ))}
                {check.result.warnings.map((issue) => (
                  <li
                    key={
                      typeof issue === 'string'
                        ? issue
                        : `${issue.code}:${issue.field}:${issue.message}`
                    }
                  >
                    {typeof issue === 'string' ? (
                      issue
                    ) : (
                      <>
                        {issue.field && <Link to={fieldLink(issue.field)}>{issue.field}</Link>}{' '}
                        {issue.message}
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {check.result.budget && (
                <dl>
                  {Object.entries(check.result.budget).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value ?? '—'}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          )}
        </section>
      )}
      {section === 'review' && (
        <section className="panel">
          <h2>{text('Kayıtlı içeriğin insan incelemesi', 'Human review of saved content')}</h2>
          {preview}
          <p>
            {text(
              'Onay aşağıda gönderilen kayıtlı revizyonu ve tam içeriği kapsar. İnceleme notları onay değildir.',
              'Approval covers this displayed saved revision and its complete content. Review notes are not approval.',
            )}
          </p>
          <button
            disabled={!editable || locked || !ready || current.state !== 'draft'}
            onClick={() => void action('submit-review')}
          >
            {text(
              'Bu kayıtlı revizyonu incelemeye gönder',
              'Submit this saved revision for review',
            )}
          </button>
          {reviewer ? (
            <>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={languageAcknowledged === currentKey && !dirty}
                  disabled={locked || !ready || current.state !== 'review_requested' || !language}
                  onChange={(event) =>
                    setLanguageAcknowledged(event.target.checked ? currentKey : null)
                  }
                />
                {text(
                  'Bu kayıtlı revizyonun tüm metnini, bütçesini ve eklerini çağrı dilinde inceledim',
                  'I reviewed all text, budget and attachments of this saved revision in the call language',
                )}{' '}
                ({language || '—'})
              </label>
              <label>
                {text('İnceleme notu', 'Review notes')}
                <textarea
                  maxLength={5000}
                  disabled={busy}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
              <div className="actions">
                <button
                  disabled={
                    locked ||
                    !ready ||
                    current.state !== 'review_requested' ||
                    languageAcknowledged !== currentKey ||
                    !language
                  }
                  onClick={() => void action('approve')}
                >
                  {text('Bu revizyonu onayla', 'Approve this revision')}
                </button>
                <button
                  disabled={locked || current.state !== 'review_requested'}
                  onClick={() => void action('reject')}
                >
                  {text('Reddet / düzeltme iste', 'Reject / request changes')}
                </button>
              </div>
            </>
          ) : (
            <p>
              {text(
                'Onay için inceleyen, yönetici veya sahip rolü gerekir.',
                'Approval requires reviewer, admin or owner access.',
              )}
            </p>
          )}
        </section>
      )}
      {section === 'package' && (
        <section className="panel">
          <h2>
            {template.package_label ||
              text('Başvuru hazırlık paketi', 'Application preparation package')}
          </h2>
          <p>
            {text(
              'Bu çıktı resmî başvuru formu değildir ve portala gönderilmez. Güncel, hatasız ve insan tarafından onaylı kayıtlı revizyon DOCX / PDF / ZIP olarak indirilebilir. Resmî portala kendiniz gönderin.',
              'This output is not an official application form and is not submitted to a portal. The current, error-free, human-approved saved revision can be downloaded as DOCX / PDF / ZIP. Submit manually through the official portal.',
            )}
          </p>
          <div className="actions">
            {(['docx', 'pdf', 'zip'] as const).map((format) => (
              <button
                key={format}
                disabled={
                  workspace.plan !== 'pro' || locked || !ready || current.state !== 'approved'
                }
                onClick={() => void action(format)}
              >
                {format.toUpperCase()} · r{current.revision}
              </button>
            ))}
          </div>
          {call?.portal_url && (
            <p>
              <a href={call.portal_url} target="_blank" rel="noreferrer">
                {text('Resmî başvuru portalı', 'Official application portal')}
              </a>
            </p>
          )}
          {template.official_template_url && (
            <p>
              <a href={template.official_template_url} target="_blank" rel="noreferrer">
                {text('Bağlı sürümün resmî şablonu', 'Official template for the bound revision')}
              </a>
            </p>
          )}
          {(template.official_template_required ||
            template.submission_mode === 'official_form') && (
            <p className="error">
              {text(
                'Resmî form zorunludur. Bu hazırlık paketi zorunlu resmî formun doldurulduğunu kanıtlamaz; sunucu nihai dışa aktarmayı engeller.',
                'An official form is required. This preparation package does not establish that the mandatory official form was completed; the server blocks final export.',
              )}
            </p>
          )}
          {(template.guidance || []).map((item) => (
            <article key={`${item.url}:${item.title}`}>
              <h3>
                <a href={item.url} target="_blank" rel="noreferrer">
                  {item.title}
                </a>
              </h3>
              <p>{item.text}</p>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

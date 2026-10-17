import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ExternalLink,
  Globe2,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { errorMessage } from '../services/api';
import type {
  DiscoveryProgram,
  FundingCondition,
  FundingDetail,
  FundingDiscovery,
  FundingRecommendation,
  FundingSelection,
} from '../services/fundingDiscovery';
import {
  addFundingSelection,
  discoverFunding,
  exploreFunding,
  getFundingDetail,
  getFundingSelections,
} from '../services/fundingDiscovery';
import { canEditWorkspace } from '../services/navigation';
import type { Application, Project, Workspace } from '../types';
import { COUNTRIES } from '../types';
import { SourceLink, timestamp } from './EvidenceUi';
import type { FundingCall } from './FundingCatalog';
import { fundingCallState, fundingDisplayName } from './FundingCatalog';

export interface FundingScreenProps {
  workspace: Workspace;
  projects: Project[];
  programId?: string;
  callId?: string;
}

export default function FundingScreen({
  workspace,
  projects,
  programId,
  callId,
}: FundingScreenProps) {
  const { text, language } = useI18n();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const queryKey = params.toString();
  const activeLoad = useRef<AbortController | null>(null);
  const projectId = params.get('project') || '';
  const project = projects.find(
    (item) => item.id === projectId && item.workspace_id === workspace.id,
  );
  const [items, setItems] = useState<DiscoveryProgram[]>([]);
  const [discovery, setDiscovery] = useState<FundingDiscovery | null>(null);
  const [detail, setDetail] = useState<FundingDetail | null>(null);
  const [selections, setSelections] = useState<FundingSelection[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const base = `/w/${workspace.id}/funding`;
  const region = params.get('region') === 'international' ? 'international' : 'domestic';
  const route = params.get('route') === 'establish' ? 'establish' : 'direct';
  const showAll = params.get('all') === 'true';
  const offset = Math.max(0, Math.floor(Number(params.get('offset')) || 0));
  const isDetail = Boolean(programId || callId);
  const canPrepare = workspace.plan === 'pro' && canEditWorkspace(workspace.role);
  const states: Record<string, string> = {
    open: text('Başvuruya açık', 'Open'),
    upcoming: text('Yakında', 'Upcoming'),
    closed: text('Kapalı', 'Closed'),
    pending: text('Kaynak / tarih bekleniyor', 'Source / dates pending'),
    draft: text('İnceleme bekleyen taslak', 'Draft awaiting review'),
    published: text('İncelenmiş kaynak', 'Reviewed source'),
    archived: text('Arşiv', 'Archived'),
  };
  const supports: Record<string, string> = {
    grant: text('Hibe', 'Grant'),
    equity_accelerator: text('Yatırım / hızlandırıcı', 'Investment / accelerator'),
    tax_employment: text('Vergi / istihdam', 'Tax / employment'),
  };
  const classifications: Record<string, string> = {
    domestic: text('Yurt içi', 'Domestic'),
    direct: text('Mevcut ülkeden başvuru', 'Apply from your current country'),
    establish: text('Yurt dışında yapılanma', 'Establish abroad'),
    unknown: text('Katılım yolu doğrulanmadı', 'Participation route unconfirmed'),
  };

  function update(values: Record<string, string | null>, resetOffset = true) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (resetOffset) next.delete('offset');
    setParams(next);
  }
  function href(path: string) {
    return queryKey ? `${path}?${queryKey}` : path;
  }

  const loadFunding = useCallback(() => {
    activeLoad.current?.abort();
    const controller = new AbortController();
    activeLoad.current = controller;
    setBusy(true);
    setError('');
    setDetail(null);
    setItems([]);
    setDiscovery(null);
    const filters = new URLSearchParams(queryKey);
    void (async () => {
      if (projectId && !project)
        throw new Error(
          text('Bu çalışma alanında proje bulunamadı.', 'Project not found in this workspace.'),
        );
      if (isDetail) {
        const loaded = await getFundingDetail(programId, callId, controller.signal);
        if (project && loaded.call) {
          const response = await discoverFunding(
            project.id,
            new URLSearchParams({ call_id: loaded.call.id, all: 'true', language }),
            controller.signal,
          );
          loaded.recommendation = response.items[0]?.recommendation;
          if (!controller.signal.aborted) setDiscovery(response);
        }
        if (!controller.signal.aborted) setDetail(loaded);
      } else if (project) {
        const search = new URLSearchParams({ region, route, all: String(showAll), language });
        for (const name of ['q', 'support_type', 'state']) {
          const value = filters.get(name);
          if (value) search.set(name, value);
        }
        const response = await discoverFunding(project.id, search, controller.signal);
        if (!controller.signal.aborted) {
          setDiscovery(response);
          setItems(response.items);
        }
      } else {
        const search = new URLSearchParams({ limit: '100', offset: String(offset) });
        for (const name of ['q', 'country', 'support_type', 'state']) {
          const value = filters.get(name);
          if (value) search.set(name, value);
        }
        const response = await exploreFunding(search, controller.signal);
        if (!controller.signal.aborted) setItems(response);
      }
    })()
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return controller;
  }, [
    queryKey,
    projectId,
    project,
    programId,
    callId,
    isDetail,
    region,
    route,
    showAll,
    offset,
    language,
    text,
  ]);
  useEffect(() => {
    loadFunding();
    return () => activeLoad.current?.abort();
  }, [loadFunding]);

  useEffect(() => {
    const controller = new AbortController();
    setSelections([]);
    setSelectionError('');
    if (project) {
      getFundingSelections(project.id, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) setSelections(result);
        })
        .catch((reason) => {
          if (!controller.signal.aborted) setSelectionError(errorMessage(reason));
        });
    }
    return () => controller.abort();
  }, [project]);

  async function selectCall(call: FundingCall) {
    if (!project || saving || !canPrepare) return;
    setSaving(true);
    setSelectionError('');
    try {
      const saved = await addFundingSelection(project.id, call.id);
      navigate(
        `/w/${workspace.id}/projects/${project.id}/overview${saved.report_id ? `?report=${encodeURIComponent(saved.report_id)}` : ''}`,
      );
    } catch (reason) {
      setSelectionError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  function recommendationView(rec: FundingRecommendation | undefined) {
    if (!rec) return null;
    return (
      <section className="funding-detail-section">
        <span className={`funding-classification funding-classification-${rec.classification}`}>
          {classifications[rec.classification]}
        </span>
        <p className="funding-reason">{rec.reason}</p>
        {rec.country_evidence?.map((evidence) => (
          <p
            className="funding-country-evidence"
            key={`${evidence.source_url}:${evidence.source_locator}`}
          >
            <SourceLink url={evidence.source_url}>{fundingDisplayName(evidence.label)}</SourceLink>
            <small>{evidence.source_locator}</small>
          </p>
        ))}
        {rec.missing_information.length > 0 && (
          <div className="funding-notice">
            <h3>
              {text('Tamamlanması / doğrulanması gerekenler', 'Missing facts and confirmations')}
            </h3>
            <ul>
              {rec.missing_information.map((item) => (
                <li key={item}>{fundingDisplayName(item)}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
    );
  }

  function callDetail(call: FundingCall) {
    const template = call.template as Application['template'];
    const source = detail?.program.sources?.find((item) => item.id === call.source_revision_id);
    const selected = selections.find((item) => item.call_id === call.id);
    const conditions = detail?.recommendation?.conditions;
    const rawRules = Array.isArray(call.rules)
      ? (call.rules as (Partial<FundingCondition> & { id: string; label: string })[])
      : [];
    return (
      <>
        <div className="funding-detail-heading">
          <h2>{fundingDisplayName(call.title)}</h2>
          <span className={`funding-status funding-status-${fundingCallState(call)}`}>
            {states[fundingCallState(call)]}
          </span>
        </div>
        <dl className="funding-meta">
          <div>
            <dt>{text('Başlangıç', 'Opens')}</dt>
            <dd>
              {call.opens_at ? timestamp(call.opens_at) : text('Doğrulanmadı', 'Unconfirmed')}
            </dd>
          </div>
          <div>
            <dt>{text('Son tarih', 'Deadline')}</dt>
            <dd>
              {call.deadline ? timestamp(call.deadline) : text('Doğrulanmadı', 'Unconfirmed')}
            </dd>
          </div>
          <div>
            <dt>{text('Kaynak incelemesi', 'Source review')}</dt>
            <dd>{source?.publication_status === 'published' ? states.published : states.draft}</dd>
          </div>
          {source && (
            <div>
              <dt>{text('Son kaynak kontrolü', 'Source checked')}</dt>
              <dd>{timestamp(source.checked_at)}</dd>
            </div>
          )}
        </dl>
        {fundingCallState(call) === 'pending' && (
          <p className="funding-notice">
            {text(
              'Gösterilen tarihler kayıtlı kaynak verileridir; çağrı / kaynak incelemesi tamamlanmadan açık başvuru veya uygunluk anlamına gelmez.',
              'Displayed dates are recorded source data, not confirmation that applications are open or that you are eligible while call/source review is pending.',
            )}
          </p>
        )}
        {recommendationView(detail?.recommendation)}
        <section className="funding-detail-section">
          <h3>{text('Başvuru koşulları', 'Application conditions')}</h3>
          <ul className="funding-conditions">
            {(conditions || rawRules).map((condition) => (
              <li key={condition.id}>
                <div>
                  <strong>{fundingDisplayName(condition.label)}</strong>
                  {condition.status && (
                    <span
                      className={`funding-condition-status funding-condition-${condition.status}`}
                    >
                      {
                        {
                          pass: text('Bilgi eşleşiyor', 'Fact matches'),
                          fail: text('Koşul karşılanmıyor', 'Condition not met'),
                          missing: text('Bilgi eksik', 'Fact missing'),
                          review: text('İnsan incelemesi', 'Human review'),
                        }[condition.status]
                      }
                    </span>
                  )}
                </div>
                {condition.expected !== null && condition.expected !== undefined && (
                  <p className="funding-condition-value">
                    {text('Koşul', 'Requirement')}:{' '}
                    {typeof condition.expected === 'string'
                      ? condition.expected
                      : JSON.stringify(condition.expected)}
                  </p>
                )}
                <SourceLink url={condition.source_url}>
                  {condition.source_locator || text('Resmi koşul', 'Official condition')}
                </SourceLink>
              </li>
            ))}
            {!rawRules.length && (
              <li>
                {text(
                  'Kayıtlı koşul yok; resmi kaynaktan doğrulayın.',
                  'No recorded conditions; confirm against the official source.',
                )}
              </li>
            )}
          </ul>
        </section>
        {!!template?.sections?.length && (
          <section className="funding-detail-section">
            <h3>{text('Hazırlanacak metinler', 'Preparation sections')}</h3>
            <ul>
              {template.sections.map((section) => (
                <li key={section.key}>
                  {fundingDisplayName(section.label)}
                  {section.required ? ' *' : ''}
                </li>
              ))}
            </ul>
          </section>
        )}
        {!!template?.documents?.length && (
          <section className="funding-detail-section">
            <h3>{text('Gerçek başvuru belgeleri', 'Actual application documents')}</h3>
            <p>
              {text(
                'Seçim belge üretmez veya imza/onay yerine geçmez.',
                'Selecting does not create attachments or replace signatures and approval.',
              )}
            </p>
            <ul>
              {template.documents.map((document) => (
                <li key={document.key}>
                  {fundingDisplayName(document.label)}
                  {document.required ? ' *' : ''}{' '}
                  <SourceLink url={document.source_url}>{text('Kaynak', 'Source')}</SourceLink>
                </li>
              ))}
            </ul>
          </section>
        )}
        {template?.guidance?.map((guidance) => (
          <section className="funding-detail-section" key={`${guidance.title}:${guidance.url}`}>
            <h3>{fundingDisplayName(guidance.title)}</h3>
            <p>{fundingDisplayName(guidance.text)}</p>
            <SourceLink url={guidance.url}>{text('Resmi rehber', 'Official guidance')}</SourceLink>
          </section>
        ))}
        <section className="funding-selection-panel">
          <h3>{text('Proje dosyana ekle', 'Add to your project file')}</h3>
          <p>
            {text(
              'Çağrıya özel hazırlık metni grubu eklenir. AI başlamaz, başvuru gönderilmez. Nihai uygunluk, güncel kaynaklar ve insan onayı ayrıca gerekir.',
              'Adds a call-specific preparation document group. No AI starts and no application is submitted. Final eligibility, current sources, and human approval remain required.',
            )}
          </p>
          {!project && (
            <label className="funding-field">
              {text('Bir proje seç', 'Choose a project')}
              <select
                className="funding-select"
                value={projectId}
                onChange={(event) => update({ project: event.target.value })}
              >
                <option value="">{text('Proje seçin', 'Choose project')}</option>
                {projects
                  .filter((item) => item.workspace_id === workspace.id)
                  .map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.title}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {!projects.length && (
            <Link className="funding-button" to={`/w/${workspace.id}/projects`}>
              {text('Projelerime git', 'Go to my projects')}
            </Link>
          )}
          {!canPrepare && (
            <p className="funding-notice">
              {workspace.plan !== 'pro'
                ? text(
                    'Kataloğu ücretsiz keşfedebilirsiniz. Projeye destek ekleme ve fon hazırlığı Pro çalışma alanı gerektirir.',
                    'Exploration is free. Adding support to a project and funding preparation require a Pro workspace.',
                  )
                : text(
                    'Destek eklemek için düzenleyici veya daha yüksek proje yetkisi gerekir.',
                    'Adding support requires editor or higher workspace permission.',
                  )}
            </p>
          )}
          {selectionError && (
            <p className="funding-error" role="alert">
              {selectionError}
            </p>
          )}
          {selected ? (
            <Link
              className="funding-button funding-button-primary"
              to={`/w/${workspace.id}/projects/${project?.id}/overview`}
            >
              <Check size={16} />
              {text('Proje dosyasında aç', 'Open project file')}
            </Link>
          ) : (
            <button
              className="funding-button funding-button-primary"
              type="button"
              disabled={!project || !canPrepare || saving || call.status === 'archived'}
              onClick={() => void selectCall(call)}
            >
              {saving ? text('Kaydediliyor…', 'Saving…') : text('Projeye ekle', 'Add to project')}
              <ArrowRight size={16} />
            </button>
          )}
        </section>
      </>
    );
  }

  return (
    <section className="funding-screen">
      <header className="funding-header">
        <div>
          <span className="funding-eyebrow">
            {text('Fikrinden sonraki adım', 'Your next possibility')}
          </span>
          <h1>
            {isDetail
              ? text('Desteği yakından tanı', 'Explore the support')
              : text('Doğru desteği bul', 'Find the right support')}
          </h1>
          <p>
            {text(
              'Resmi kaynaklara dayalı fırsatları keşfet. Kararını bilgiyle ver.',
              'Explore opportunities grounded in official sources. Decide with clarity.',
            )}
          </p>
        </div>
      </header>
      <div className="funding-context">
        <label className="funding-field">
          {text('Şunun için keşfet', 'Explore for')}
          <select
            className="funding-select"
            value={projectId}
            onChange={(event) => update({ project: event.target.value, all: null, country: null })}
          >
            <option value="">
              {text('Projeden bağımsız katalog', 'Catalogue without a project')}
            </option>
            {projects
              .filter((item) => item.workspace_id === workspace.id)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
          </select>
        </label>
        {project ? (
          <p className="funding-country">
            <Globe2 size={16} />
            {discovery?.country
              ? `${text('Proje ülkesi', 'Project country')}: ${discovery.country}${discovery.country_source === 'company.country' ? text(' · doğrulanmış şirket bilgisi', ' · confirmed company fact') : ''}`
              : text('Doğrulanmış proje ülkesi bekleniyor', 'Confirmed project country needed')}
          </p>
        ) : (
          <label className="funding-field">
            {text('Program ülkesi', 'Programme country')}
            <select
              className="funding-select"
              value={params.get('country') || ''}
              onChange={(event) => update({ country: event.target.value })}
            >
              <option value="">{text('Tüm ülkeler', 'All countries')}</option>
              {COUNTRIES.map((country) => (
                <option key={country}>{country}</option>
              ))}
              <option value="EU">{text('Avrupa / uluslararası', 'Europe / international')}</option>
            </select>
          </label>
        )}
      </div>
      {isDetail ? (
        <>
          <Link className="funding-back" to={href(base)}>
            <ArrowLeft size={16} />
            {text('Desteklere dön', 'Back to support')}
          </Link>
          {busy ? (
            <div className="funding-skeleton" role="status">
              {text('Resmi kayıtlar yükleniyor…', 'Loading official records…')}
            </div>
          ) : (
            detail && (
              <div className="funding-detail">
                <div className="funding-detail-main">
                  <div className="funding-institution">
                    <Building2 size={18} />
                    {fundingDisplayName(detail.program.institution)}
                  </div>
                  <h2 className="funding-program-title">
                    {fundingDisplayName(detail.program.name)}
                  </h2>
                  <p className="funding-description">
                    {fundingDisplayName(detail.program.description)}
                  </p>
                  {(detail.program.calls?.length || 0) > 1 && (
                    <label className="funding-field">
                      {text('Çağrı / sürüm', 'Call / version')}
                      <select
                        className="funding-select"
                        value={detail.call?.id || ''}
                        onChange={(event) => navigate(href(`${base}/calls/${event.target.value}`))}
                      >
                        {detail.program.calls?.map((call) => (
                          <option value={call.id} key={call.id}>
                            {fundingDisplayName(call.title)} · v{call.version} ·{' '}
                            {states[fundingCallState(call)]}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {detail.call ? (
                    callDetail(detail.call)
                  ) : (
                    <div className="funding-empty">
                      {text(
                        'Henüz kayıtlı çağrı bulunmuyor. Resmi kaynakları izleyin; doğrulanmış başvuru yolu yok.',
                        'No recorded call yet. Follow the official sources; no application route is confirmed.',
                      )}
                    </div>
                  )}
                </div>
                <aside className="funding-detail-aside">
                  <h3>{text('Resmi kaynaklar', 'Official sources')}</h3>
                  <SourceLink url={detail.program.official_url}>
                    {text('Programın resmi sayfası', 'Official programme page')}{' '}
                    <ExternalLink size={14} />
                  </SourceLink>
                  {detail.call?.portal_url && (
                    <SourceLink url={detail.call.portal_url}>
                      {text('Resmi başvuru portalı', 'Official application portal')}
                    </SourceLink>
                  )}
                  {detail.program.sources?.map((source) => (
                    <div className="funding-source" key={source.id}>
                      <SourceLink url={source.source_url}>
                        {text('Kayıtlı kaynak', 'Recorded source')} · v{source.version}
                      </SourceLink>
                      <small>
                        {source.publication_status === 'published'
                          ? states.published
                          : states.draft}
                        <br />
                        {timestamp(source.checked_at)}
                      </small>
                    </div>
                  ))}
                  <p className="funding-notice">
                    {text(
                      'Abi resmi uygunluk veya fon kararı vermez. Kaynaklar ve çağrı koşulları değişebilir.',
                      'Abi does not make official eligibility or award decisions. Sources and call conditions may change.',
                    )}
                  </p>
                </aside>
              </div>
            )
          )}
        </>
      ) : (
        <>
          {project && (
            <>
              <fieldset
                className="funding-tabs"
                aria-label={text('Destek bölgesi', 'Support region')}
              >
                <button
                  type="button"
                  aria-pressed={region === 'domestic'}
                  onClick={() => update({ region: 'domestic' })}
                >
                  {text('Yurt içi', 'Domestic')}
                </button>
                <button
                  type="button"
                  aria-pressed={region === 'international'}
                  onClick={() => update({ region: 'international' })}
                >
                  {text('Yurt dışı', 'Abroad')}
                </button>
              </fieldset>
              {region === 'international' && (
                <fieldset
                  className="funding-subtabs"
                  aria-label={text('Yurt dışı başvuru yolu', 'Application route abroad')}
                >
                  <button
                    type="button"
                    aria-pressed={route === 'direct'}
                    onClick={() => update({ route: 'direct' })}
                  >
                    {text('Mevcut ülkeden başvuru', 'Apply from your current country')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={route === 'establish'}
                    onClick={() => update({ route: 'establish' })}
                  >
                    {text('Yurt dışında yapılanma', 'Establish abroad')}
                  </button>
                </fieldset>
              )}
            </>
          )}
          <div className="funding-toolbar">
            <label className="funding-search">
              <Search size={18} />
              <input
                className="funding-input"
                type="search"
                maxLength={200}
                placeholder={text(
                  'Destek, kurum veya konu ara',
                  'Search support, institution or topic',
                )}
                aria-label={text('Destek ara', 'Search support')}
                value={params.get('q') || ''}
                onChange={(event) => update({ q: event.target.value })}
              />
            </label>
            {project && (
              <label className="funding-all">
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={(event) => update({ all: event.target.checked ? 'true' : null })}
                />
                {text('Tümünü göster', 'Show all')}
              </label>
            )}
            <details
              className="funding-filters"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.currentTarget.open = false;
                  event.currentTarget.querySelector('summary')?.focus();
                }
              }}
            >
              <summary>
                <SlidersHorizontal size={16} />
                {text('Filtreler', 'Filters')}
              </summary>
              <div className="funding-filter-fields">
                <button
                  type="button"
                  className="compact-menu-dismiss"
                  onClick={(event) => {
                    const menu = event.currentTarget.closest('details');
                    if (menu) {
                      menu.open = false;
                      menu.querySelector('summary')?.focus();
                    }
                  }}
                >
                  <X size={14} aria-hidden="true" />
                  {text('Kapat', 'Close')}
                </button>
                <label className="funding-field">
                  {text('Destek türü', 'Support type')}
                  <select
                    className="funding-select"
                    value={params.get('support_type') || ''}
                    onChange={(event) => update({ support_type: event.target.value })}
                  >
                    <option value="">{text('Tüm türler', 'All types')}</option>
                    {Object.entries(supports).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="funding-field">
                  {text('Çağrı durumu', 'Call state')}
                  <select
                    className="funding-select"
                    value={params.get('state') || ''}
                    onChange={(event) => update({ state: event.target.value })}
                  >
                    <option value="">{text('Tüm durumlar', 'All states')}</option>
                    {['open', 'upcoming', 'closed', 'pending'].map((state) => (
                      <option value={state} key={state}>
                        {states[state]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </details>
          </div>
          {project && (
            <details className="funding-context-note">
              <summary>{text('Öneriler nasıl seçildi?', 'How are suggestions chosen?')}</summary>
              <div>
                <p className="funding-results-note">
                  {showAll
                    ? text(
                        'Seçili bölge ve başvuru yolundaki tüm kayıtlar gösteriliyor. Diğer uygunluk koşulları ayrıca incelenmelidir.',
                        'Showing all records within the selected region and application route. Other eligibility conditions still require review.',
                      )
                    : text(
                        'Doğrulanmış proje bilgileri ve kaynaklı ülke kurallarıyla ilgili öneriler. Uygunluk onayı değildir.',
                        'Recommendations use confirmed project facts and sourced country rules. This is not eligibility approval.',
                      )}
                </p>
              </div>
            </details>
          )}
          {project && !busy && !discovery?.country && !error && (
            <p className="funding-notice">
              {text(
                'Bölgeye göre öneriler için proje ülkesini fikir görüşmesinde belirtip kapsamı doğrulayın. Bu sırada projeden bağımsız kataloğu gezebilirsiniz.',
                'For region-based recommendations, specify the project country in the idea conversation and confirm scope. Meanwhile, browse the project-independent catalogue.',
              )}{' '}
              <Link to={`/w/${workspace.id}/projects/${project.id}/ai/idea`}>
                {text('Fikri netleştir', 'Clarify idea')}
              </Link>
            </p>
          )}
          {!!discovery?.unclassified_count && (
            <details className="funding-context-note">
              <summary>
                {text(
                  `${discovery.unclassified_count} kayıt için başvuru yolu belirsiz`,
                  `${discovery.unclassified_count} records have unconfirmed routes`,
                )}
              </summary>
              <div>
                <p className="funding-results-note">
                  {discovery.unclassified_count}{' '}
                  {text(
                    'kaydın bu proje için başvuru yolu kaynaklardan doğrulanamıyor; bölge sonuçlarına dahil edilmedi.',
                    'records have no source-confirmed application route for this project and are excluded from region results.',
                  )}{' '}
                  <Link to={base}>
                    {text(
                      'Projeden bağımsız katalogda incele',
                      'Inspect in the project-independent catalogue',
                    )}
                  </Link>
                </p>
              </div>
            </details>
          )}
          {busy ? (
            <div className="funding-skeleton" role="status">
              {text('Kaynaklı fırsatlar yükleniyor…', 'Loading sourced opportunities…')}
            </div>
          ) : (
            !error && (
              <section
                className="funding-results"
                aria-label={text('Destek sonuçları', 'Support results')}
              >
                <div className="funding-grid">
                  {items.map((item) => {
                    const call = item.current_call;
                    const state = fundingCallState(call);
                    return (
                      <article className="funding-card" key={item.id}>
                        <div className="funding-card-top">
                          <span className="funding-institution">
                            <Building2 size={16} />
                            {fundingDisplayName(item.institution)}
                          </span>
                          <span className={`funding-status funding-status-${state}`}>
                            {states[state]}
                          </span>
                        </div>
                        <h2>
                          <Link to={href(`${base}/programs/${item.id}`)}>
                            {fundingDisplayName(item.name)}
                          </Link>
                        </h2>
                        <p className="funding-reason">
                          {item.recommendation?.reason ||
                            text(
                              `${item.country} kaynaklı program · proje uygunluğu değerlendirilmedi.`,
                              `${item.country}-based programme · project fit has not been assessed.`,
                            )}
                        </p>
                        {item.recommendation?.classification === 'unknown' && (
                          <span className="funding-classification funding-classification-unknown">
                            {classifications.unknown}
                          </span>
                        )}
                        <div className="funding-card-tags">
                          <span>{supports[item.support_type] || item.support_type}</span>
                          <span>{item.country}</span>
                        </div>
                        <dl className="funding-card-meta">
                          <div>
                            <dt>{text('Son tarih', 'Deadline')}</dt>
                            <dd>
                              {call?.deadline
                                ? timestamp(call.deadline)
                                : text('Doğrulanmadı', 'Unconfirmed')}
                            </dd>
                          </div>
                        </dl>
                        {state === 'pending' && (
                          <small className="funding-pending-note">
                            {text(
                              'Tarih / kaynak onayı bekleniyor; hazırlık amaçlı.',
                              'Dates / source review pending; preparation only.',
                            )}
                          </small>
                        )}
                        <Link
                          className="funding-card-link"
                          to={href(`${base}/programs/${item.id}`)}
                        >
                          {text('Ayrıntıları incele', 'Explore details')}
                          <ArrowRight size={16} />
                        </Link>
                      </article>
                    );
                  })}
                </div>
                {!items.length && (
                  <div className="funding-empty">
                    <Globe2 size={30} />
                    <h2>{text('Bu görünümde destek bulunamadı', 'No support in this view')}</h2>
                    <p>
                      {text(
                        'Aramayı ve filtreleri değiştirebilir veya Tümünü göster ile seçili bölgedeki diğer kayıtları inceleyebilirsiniz. Bilinmeyen ülke kurallarını uygunluk olarak yorumlamıyoruz.',
                        'Change your search and filters, or use Show all to inspect other records in the selected region. Unknown country rules are never treated as eligibility.',
                      )}
                    </p>
                  </div>
                )}
                {!project && (
                  <nav
                    className="funding-pagination"
                    aria-label={text('Katalog sayfaları', 'Catalogue pages')}
                  >
                    <button
                      className="funding-button"
                      type="button"
                      disabled={!offset}
                      onClick={() => update({ offset: String(Math.max(0, offset - 100)) }, false)}
                    >
                      {text('Önceki', 'Previous')}
                    </button>
                    <button
                      className="funding-button"
                      type="button"
                      disabled={items.length < 100}
                      onClick={() => update({ offset: String(offset + 100) }, false)}
                    >
                      {text('Sonraki', 'Next')}
                    </button>
                  </nav>
                )}
              </section>
            )
          )}
        </>
      )}
      {error && (
        <div className="funding-error" role="alert">
          <p>{error}</p>
          <button className="funding-button" type="button" onClick={() => loadFunding()}>
            {text('Tekrar dene', 'Try again')}
          </button>
        </div>
      )}
    </section>
  );
}

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import type { Project, Workspace } from '../types';
import { COUNTRIES } from '../types';
import {
  buttonClass,
  errorText,
  inputClass,
  panelClass,
  SourceLink,
  timestamp,
  useEvidenceText,
} from './EvidenceUi';

export interface FundingCall {
  id: string;
  program_id?: string;
  title: string;
  version: number;
  status: string;
  opens_at: string | null;
  deadline: string | null;
  rule_version: string;
  source_revision_id: string | null;
  validated_source_sha256?: string;
  state?: 'open' | 'upcoming' | 'closed' | 'pending';
  language: string;
  portal_url: string | null;
  rules: unknown;
  template: unknown;
  finance: unknown;
}
export interface FundingSource {
  id: string;
  program_id: string;
  version: number;
  source_url: string;
  sha256: string;
  checked_at: string;
  publication_status: string;
  published_by?: string | null;
  published_at?: string | null;
  draft_call_ids?: string[];
}
export interface FundingProgram {
  id: string;
  code: string;
  name: string;
  institution: string;
  country: string;
  support_type: string;
  description: string;
  official_url: string;
  catalog_status: string;
  current_call: FundingCall | null;
  calls?: FundingCall[];
  sources?: FundingSource[];
}
export interface FundingCatalogProps {
  workspace?: Workspace;
  project?: Project;
  projects?: Project[];
  programId?: string;
  callId?: string;
  onSelectCall?: (callId: string) => void;
  onEvaluate?: (call: FundingCall) => void;
  evaluating?: boolean;
}

// Presentation only: source names, identifiers and evidence are never rewritten.
const fundingDisplayNames: Record<string, string> = {
  'TÜBİTAK1501 Sanayi Ar-Ge': 'TÜBİTAK 1501 Sanayi Ar-Ge',
  'TÜBİTAK1507 KOBİ Ar-Ge Başlangıç': 'TÜBİTAK 1507 KOBİ Ar-Ge Başlangıç',
  'TÜBİTAKBiGG1812 TohumÖncesiYatırım': 'TÜBİTAK BiGG 1812 Tohum Öncesi Yatırım',
  TÜBİTAKBiGGFonu: 'TÜBİTAK BiGG Fonu',
  'TÜBİTAK15012026/2': 'TÜBİTAK 1501 — 2026/2',
  'TÜBİTAK15072026/2': 'TÜBİTAK 1507 — 2026/2',
  'BiGG18122026-2 Aşama2': 'BiGG 1812 — 2026-2 Aşama 2',
  'Eurostars–EUcompanies': 'Eurostars — EU companies',
  'Eurostars–CanadianSMEs': 'Eurostars — Canadian SMEs',
  'Eurostars–SwissSMEs': 'Eurostars — Swiss SMEs',
  'Eurostars–NorwegianSMEs': 'Eurostars — Norwegian SMEs',
  'Eurostars–IcelandicSMEs': 'Eurostars — Icelandic SMEs',
  'Eureka /nationalfundingbody': 'Eureka / national funding body',
  'NRCIRAP /Eureka': 'NRC IRAP / Eureka',
  'ResearchCouncilofNorway /Eureka': 'Research Council of Norway / Eureka',
  'UKMergedR&DExpenditureCredit': 'UK Merged R&D Expenditure Credit',
  'HMRevenue&Customs': 'HM Revenue & Customs',
  'MergedRDEC–accountingperiodsfromApril2024': 'Merged RDEC — accounting periods from April 2024',
  'YCombinator–USaccelerator': 'Y Combinator — US accelerator',
  'YCombinator–internationalrouteforLiechtensteinapplicants':
    'Y Combinator — international route for Liechtenstein applicants',
  YCombinator: 'Y Combinator',
  'YCWinter2027preparation;lateapplicationsconsidered':
    'YC Winter 2027 preparation; late applications considered',
  UKEmploymentAllowance: 'UK Employment Allowance',
  'EmploymentAllowance2026/27–business-employerclaim':
    'Employment Allowance 2026/27 — business employer claim',
};
export function fundingDisplayName(value: string) {
  return (
    fundingDisplayNames[value] ||
    value
      .replace(/EurostarsCall12–4March2027/g, 'Eurostars Call 12 — 4 March 2027')
      .replace(/([a-zçğıöşü])([A-ZÇĞİÖŞÜ])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
  );
}
export function fundingCallState(call: FundingCall | null, now = Date.now()) {
  if (call?.state) return call.state;
  if (call?.status !== 'published' || !call.opens_at || !call.deadline) return 'pending';
  const opens = new Date(call.opens_at).getTime();
  const deadline = new Date(call.deadline).getTime();
  if (!Number.isFinite(opens) || !Number.isFinite(deadline) || opens >= deadline) return 'pending';
  if (deadline <= now) return 'closed';
  return opens > now ? 'upcoming' : 'open';
}

export default function FundingCatalog({
  workspace,
  project,
  projects = [],
  programId,
  callId,
  onSelectCall,
  onEvaluate,
  evaluating,
}: FundingCatalogProps) {
  const text = useEvidenceText();
  const [params, setParams] = useSearchParams();
  const queryKey = params.toString();
  const offset = Math.max(0, Math.floor(Number(params.get('offset')) || 0));
  const [programs, setPrograms] = useState<FundingProgram[]>([]);
  const [detail, setDetail] = useState<{
    key: string;
    program: FundingProgram;
    call?: FundingCall;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const detailKey = `${programId || ''}:${callId || ''}`;
  const selectedProject =
    project ||
    projects.find(
      (item) => item.id === params.get('project') && item.workspace_id === workspace?.id,
    );
  const base = `/w/${workspace?.id}/funding`;
  const stateLabels: Record<string, string> = {
    open: text('Açık', 'Open'),
    upcoming: text('Yakında açılacak', 'Upcoming'),
    closed: text('Kapalı', 'Closed'),
    pending: text('Kaynak / tarih doğrulaması bekleniyor', 'Source / date confirmation pending'),
    published: text('Yayımlanmış', 'Published'),
    draft: text('İnsan incelemesi bekleyen taslak', 'Draft awaiting human review'),
    archived: text('Arşivlenmiş', 'Archived'),
  };
  const supportLabels: Record<string, string> = {
    grant: text('Hibe', 'Grant'),
    equity_accelerator: text('Sermaye / hızlandırıcı', 'Equity / accelerator'),
    tax_employment: text('Vergi / istihdam teşviki', 'Tax / employment incentive'),
  };

  useEffect(() => {
    const controller = new AbortController();
    const requestParams = new URLSearchParams(queryKey);
    const requestOffset = Math.max(0, Math.floor(Number(requestParams.get('offset')) || 0));
    setBusy(true);
    setError('');
    if (programId || callId) {
      setDetail(null);
      void (async () => {
        const call = callId
          ? await api<FundingCall>(`/calls/${encodeURIComponent(callId)}`, {
              signal: controller.signal,
            })
          : undefined;
        const id = programId || call?.program_id;
        if (!id) throw new Error('Program not found.');
        const program = await api<FundingProgram>(`/programs/${encodeURIComponent(id)}`, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setDetail({ key: detailKey, program, call });
      })()
        .catch((reason) => {
          if (!controller.signal.aborted) setError(errorText(reason));
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    } else {
      setPrograms([]);
      const filters = new URLSearchParams();
      for (const name of ['q', 'country', 'support_type', 'state', 'sort', 'applicant']) {
        const value = requestParams.get(name);
        if (value) filters.set(name, value);
      }
      filters.set('limit', '100');
      filters.set('offset', String(requestOffset));
      api<FundingProgram[]>(`/programs?${filters}`, { signal: controller.signal })
        .then((data) => {
          if (!controller.signal.aborted) setPrograms(data);
        })
        .catch((reason) => {
          if (!controller.signal.aborted) setError(errorText(reason));
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }
    return () => controller.abort();
  }, [programId, callId, detailKey, queryKey]);

  function callActions(call: FundingCall) {
    const available =
      workspace?.plan === 'pro' &&
      call.status === 'published' &&
      ['owner', 'admin', 'reviewer', 'editor'].includes(workspace?.role || '');
    return (
      <div className="space-y-3">
        {!project && (
          <label>
            {text('Çalışılacak proje', 'Project to work on')}
            <select
              className={inputClass}
              value={selectedProject?.id || ''}
              onChange={(event) => {
                const next = new URLSearchParams(params);
                if (event.target.value) next.set('project', event.target.value);
                else next.delete('project');
                setParams(next);
              }}
            >
              <option value="">{text('Proje seçin', 'Choose a project')}</option>
              {projects
                .filter((item) => item.workspace_id === workspace?.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </select>
          </label>
        )}
        {workspace?.plan !== 'pro' && (
          <p>
            {text(
              'Katalog Free ile açıktır. Değerlendirme ve yeni başvuru hazırlama Pro gerektirir; geçmiş kayıtlar korunur.',
              'The catalog is available on Free. Evaluation and preparing new applications require Pro; historical records are retained.',
            )}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {onEvaluate ? (
            <button
              className={buttonClass}
              disabled={
                !available ||
                evaluating ||
                selectedProject?.confirmed_revision !== selectedProject?.revision ||
                !selectedProject
              }
              onClick={() => onEvaluate(call)}
            >
              {text('Tüm koşulları değerlendir', 'Evaluate all conditions')}
            </button>
          ) : (
            available &&
            selectedProject && (
              <Link
                className={buttonClass}
                to={`/w/${workspace!.id}/projects/${selectedProject.id}/eligibility?call=${encodeURIComponent(call.id)}`}
              >
                {text('Projeyle değerlendir', 'Evaluate with project')}
              </Link>
            )
          )}
          {onSelectCall ? (
            <button
              className={buttonClass}
              disabled={!available || !selectedProject}
              onClick={() => onSelectCall(call.id)}
            >
              {text('Başvuru hazırla', 'Prepare application')}
            </button>
          ) : (
            available &&
            selectedProject && (
              <Link
                className={buttonClass}
                to={`/w/${workspace!.id}/applications?call=${encodeURIComponent(call.id)}&project=${encodeURIComponent(selectedProject.id)}`}
              >
                {text('Başvuru hazırla', 'Prepare application')}
              </Link>
            )
          )}
        </div>
      </div>
    );
  }

  function renderCall(call: FundingCall) {
    const finance = call.finance as {
      currency?: string;
      support_kind?: string;
      max_project_budget?: string | null;
      max_support?: string | null;
      support_rate?: string | null;
      equity_rate?: string | null;
      support_tiers?: { prior_count_max: number | null; rate: string }[];
      prior_count_field?: string | null;
      notes?: string;
      source_url?: string;
      requires_national_confirmation?: boolean;
      eligible_categories?: string[];
      budget_required?: boolean;
    };
    const rules = Array.isArray(call.rules)
      ? (call.rules as {
          id: string;
          label: string;
          field: string;
          op: string;
          expected: unknown;
          source_url: string;
          source_locator: string;
        }[])
      : [];
    const template = call.template as {
      prerequisites?: string[];
      guidance?: { title: string; text: string; url: string }[];
      official_template_url?: string;
      documents?: { key: string; label: string; required: boolean; source_url: string }[];
      sections?: {
        key: string;
        label: string;
        required: boolean;
        profile_field?: string | null;
        max_characters?: number | null;
        source_url: string;
        source_locator: string;
      }[];
      package_label?: string;
      submission_mode?: string;
      official_template_required?: boolean;
      milestones?: {
        key: string;
        label: string;
        at: string;
        source_url: string;
        source_locator: string;
      }[];
    };
    return (
      <article className={panelClass} key={call.id}>
        <h3 className="text-lg font-semibold">
          <Link
            className="text-primary underline"
            to={`${base}/calls/${call.id}${queryKey ? `?${queryKey}` : ''}`}
          >
            {fundingDisplayName(call.title)}
          </Link>
        </h3>
        <p>
          {stateLabels[call.status] || call.status} · {stateLabels[fundingCallState(call)]} ·{' '}
          {text('Çağrı sürümü', 'Call version')} {call.version} ·{' '}
          {text('Kural sürümü', 'Rule version')} {call.rule_version}
        </p>
        <p>
          {text('Açılış (UTC)', 'Opens (UTC)')}: {timestamp(call.opens_at)} ·{' '}
          {text('Son tarih (UTC)', 'Deadline (UTC)')}:{' '}
          {call.deadline
            ? timestamp(call.deadline)
            : text(
                'Kaynakta belirtilmemiş; açık varsayılmaz',
                'Not specified in source; not assumed open',
              )}
        </p>
        {!!template.milestones?.length && (
          <div>
            <ul>
              {template.milestones.map((milestone) => (
                <li key={milestone.key}>
                  {milestone.label}: {timestamp(milestone.at)} · UTC ·{' '}
                  <SourceLink url={milestone.source_url} /> · {milestone.source_locator}
                </li>
              ))}
            </ul>
            <p>
              {text(
                'Önkayıt tarihleri hatırlatmadır; önkayıtlı kuruluşlar yeniden önkayıt yapmaz. Otomatik uygunluk kararı değildir.',
                'Preregistration dates are reminders; already-preregistered companies need not preregister again. They are not automatic eligibility decisions.',
              )}
            </p>
          </div>
        )}
        <p>
          {text('Kaynak revizyonu', 'Source revision')}: {call.source_revision_id || '—'} ·{' '}
          {text('Başvuru dili', 'Application language')}: {call.language}
        </p>
        {call.validated_source_sha256 && (
          <p className="break-all">SHA-256: {call.validated_source_sha256}</p>
        )}
        <SourceLink url={call.portal_url}>
          {text('Resmî başvuru portalı (manuel)', 'Official application portal (manual)')}
        </SourceLink>
        <h4 className="font-semibold">
          {text('Mali koşullar — kaynak sürümü', 'Financial terms — source version')}
        </h4>
        <dl className="grid gap-2 sm:grid-cols-2">
          {[
            [text('Para birimi', 'Currency'), finance?.currency],
            [text('Destek türü', 'Support kind'), finance?.support_kind],
            [text('Azami proje bütçesi', 'Maximum project budget'), finance?.max_project_budget],
            [text('Azami destek', 'Maximum support'), finance?.max_support],
            [text('Destek oranı (0–1)', 'Support rate (0–1)'), finance?.support_rate],
            [text('Sermaye oranı (0–1)', 'Equity rate (0–1)'), finance?.equity_rate],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value ?? text('Kaynakta belirtilmemiş', 'Not specified in source')}</dd>
            </div>
          ))}
        </dl>
        {finance?.support_tiers?.map((tier) => (
          <p key={`${tier.prior_count_max ?? 'unlimited'}:${tier.rate}`}>
            {text('Önceki destek sayısı en çok', 'Maximum prior support count')}:{' '}
            {tier.prior_count_max ?? text('Sınır yok', 'No limit')} ·{' '}
            {text('Oran (0–1)', 'Rate (0–1)')}: {tier.rate}
          </p>
        ))}
        <p>{finance?.notes}</p>
        <p>{finance?.eligible_categories?.join(' · ')}</p>
        <SourceLink url={finance?.source_url} />
        {finance?.requires_national_confirmation && (
          <p>
            {text(
              'Ulusal kurum teyidi gereklidir.',
              'National authority confirmation is required.',
            )}
          </p>
        )}
        {finance?.prior_count_field && (
          <p>
            {text('Kademeli oran için profil alanı', 'Profile field for tiered rate')}:{' '}
            {finance.prior_count_field}
          </p>
        )}
        <p>
          {finance?.budget_required
            ? text('Bütçe zorunlu', 'Budget required')
            : text('Bütçe zorunlu değil', 'Budget not required')}
        </p>
        <h4 className="font-semibold">{text('Resmî koşullar', 'Official conditions')}</h4>
        {rules.map((rule) => (
          <section className="border-t border-border-dark pt-2" key={rule.id}>
            <h5>{rule.label}</h5>
            <p>
              {rule.field} · {rule.op} ·{' '}
              {typeof rule.expected === 'object'
                ? JSON.stringify(rule.expected)
                : String(rule.expected ?? '—')}
            </p>
            <p>{rule.source_locator}</p>
            <SourceLink url={rule.source_url} />
          </section>
        ))}
        <h4 className="font-semibold">
          {text('Başvuru rehberi ve belgeler', 'Application guidance and documents')}
        </h4>
        {template?.prerequisites?.map((item) => (
          <p key={item}>{item}</p>
        ))}
        {template?.guidance?.map((item) => (
          <section key={`${item.title}:${item.url}`}>
            <h5>{item.title}</h5>
            <p>{item.text}</p>
            <SourceLink url={item.url} />
          </section>
        ))}
        {template?.documents?.map((item) => (
          <p key={item.key}>
            {item.label} ·{' '}
            {item.required ? text('Zorunlu', 'Required') : text('İsteğe bağlı', 'Optional')}{' '}
            <SourceLink url={item.source_url} />
          </p>
        ))}
        <SourceLink url={template?.official_template_url}>
          {text('Resmî başvuru şablonu', 'Official application template')}
        </SourceLink>
        <p>
          {template?.package_label} ·{' '}
          {template?.submission_mode === 'official_form'
            ? text('Resmî form ile manuel gönderim', 'Manual submission using official form')
            : text(
                'Resmî portal alanlarına manuel giriş',
                'Manual entry into official portal fields',
              )}
        </p>
        {template?.official_template_required && (
          <p>{text('Resmî şablon zorunludur.', 'The official template is required.')}</p>
        )}
        {template?.sections?.map((section) => (
          <section key={section.key} className="border-t border-border-dark pt-2">
            <h5>{section.label}</h5>
            <p>
              {section.required ? text('Zorunlu', 'Required') : text('İsteğe bağlı', 'Optional')}
              {section.max_characters
                ? ` · ${text('Karakter sınırı', 'Character limit')}: ${section.max_characters}`
                : ''}{' '}
              {section.profile_field}
            </p>
            <p>{section.source_locator}</p>
            <SourceLink url={section.source_url} />
          </section>
        ))}
        {callActions(call)}
      </article>
    );
  }

  const current = detail?.key === detailKey ? detail : null;
  return (
    <section
      className="space-y-5"
      aria-label={text('Resmî destek kataloğu', 'Official funding catalog')}
    >
      <div className={panelClass}>
        <h2 className="text-xl font-semibold">
          {text('Resmî destek kataloğu', 'Official funding catalog')}
        </h2>
        <p>
          {text(
            'Seçilmiş resmî kaynaklar; tüm dünyadaki destekleri kapsamaz. Taslak çağrılar insan incelemesi tamamlanmadan değerlendirmeye açılamaz. Bu ekran resmî kabul kararı vermez.',
            'Selected official sources; not a comprehensive worldwide catalog. Draft calls cannot be evaluated before human publication review. This screen does not issue official acceptance decisions.',
          )}
        </p>
        {programId || callId ? (
          <Link className="text-primary underline" to={`${base}${queryKey ? `?${queryKey}` : ''}`}>
            {text('Kataloğa dön', 'Back to catalog')}
          </Link>
        ) : (
          <form
            key={queryKey}
            className="grid gap-3 sm:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const next = new URLSearchParams();
              for (const name of ['q', 'country', 'support_type', 'state', 'sort', 'applicant']) {
                const value = String(form.get(name) || '').trim();
                if (value) next.set(name, value);
              }
              setParams(next);
            }}
          >
            <label>
              {text('Arama', 'Search')}
              <input
                name="q"
                maxLength={200}
                className={inputClass}
                defaultValue={params.get('q') || ''}
              />
            </label>
            <label>
              {text('Ülke', 'Country')}
              <select
                name="country"
                className={inputClass}
                defaultValue={params.get('country') || ''}
              >
                <option value="">{text('Tümü', 'All')}</option>
                {['EU', ...COUNTRIES].map((country) => (
                  <option key={country}>{country}</option>
                ))}
              </select>
            </label>
            <label>
              {text('Başvuru sahibi (kaynak koşulu)', 'Applicant (source condition)')}
              <select
                name="applicant"
                className={inputClass}
                defaultValue={params.get('applicant') || ''}
              >
                <option value="">
                  {text('Tümü / kaynak ayrımı yok', 'All / no source distinction')}
                </option>
                <option value="individual">
                  {text('Bireysel girişimci', 'Individual entrepreneur')}
                </option>
                <option value="company">{text('Şirket', 'Company')}</option>
                <option value="sme">{text('KOBİ', 'SME')}</option>
              </select>
            </label>
            <label>
              {text('Destek türü', 'Support type')}
              <select
                name="support_type"
                className={inputClass}
                defaultValue={params.get('support_type') || ''}
              >
                <option value="">{text('Tümü', 'All')}</option>
                {Object.entries(supportLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {text('Çağrı durumu', 'Call state')}
              <select name="state" className={inputClass} defaultValue={params.get('state') || ''}>
                <option value="">{text('Tümü', 'All')}</option>
                {['open', 'upcoming', 'closed', 'pending'].map((value) => (
                  <option key={value} value={value}>
                    {stateLabels[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {text('Sıralama', 'Sort')}
              <select
                name="sort"
                className={inputClass}
                defaultValue={params.get('sort') || 'name'}
              >
                <option value="name">{text('Program adı', 'Program name')}</option>
                <option value="deadline">{text('Son tarih', 'Deadline')}</option>
              </select>
            </label>
            <button className={buttonClass}>{text('Filtrele', 'Filter')}</button>
          </form>
        )}
        {busy && <p role="status">{text('Kaynaklar yükleniyor…', 'Loading sources…')}</p>}
        {error && <p role="alert">{error}</p>}
      </div>
      {!busy && !error && !programId && !callId && programs.length === 0 && (
        <p>{text('Bu filtrelerde program bulunamadı.', 'No programs match these filters.')}</p>
      )}
      {!programId &&
        !callId &&
        programs.map((program) => (
          <article key={program.id} className={panelClass}>
            <h3 className="text-lg font-semibold">
              <Link
                className="text-primary underline"
                to={`${base}/programs/${program.id}${queryKey ? `?${queryKey}` : ''}`}
              >
                {program.code} — {fundingDisplayName(program.name)}
              </Link>
            </h3>
            <p>
              {fundingDisplayName(program.institution)} · {program.country} ·{' '}
              {supportLabels[program.support_type] || program.support_type} ·{' '}
              {stateLabels[fundingCallState(program.current_call)]}
            </p>
            <p>{program.description}</p>
            <SourceLink url={program.official_url} />
            {program.current_call && (
              <p>
                <Link
                  className="text-primary underline"
                  to={`${base}/calls/${program.current_call.id}${queryKey ? `?${queryKey}` : ''}`}
                >
                  {fundingDisplayName(program.current_call.title)}
                </Link>{' '}
                · {timestamp(program.current_call.deadline)}
              </p>
            )}
          </article>
        ))}
      {!programId && !callId && (
        <div className="flex gap-2">
          <button
            className={buttonClass}
            disabled={busy || offset === 0}
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
            disabled={busy || programs.length < 100}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set('offset', String(offset + 100));
              setParams(next);
            }}
          >
            {text('Sonraki', 'Next')}
          </button>
        </div>
      )}
      {current && (
        <>
          <section className={panelClass}>
            <h2 className="text-xl font-semibold">
              {current.program.code} — {fundingDisplayName(current.program.name)}
            </h2>
            <p>
              {fundingDisplayName(current.program.institution)} · {current.program.country} ·{' '}
              {supportLabels[current.program.support_type] || current.program.support_type}
            </p>
            <p>{current.program.description}</p>
            <SourceLink url={current.program.official_url} />
          </section>
          {current.call
            ? renderCall(current.call)
            : current.program.calls?.map((call) => renderCall(call))}
          {!current.program.calls?.length && (
            <p>{text('Kaynakta kayıtlı çağrı yok.', 'No calls recorded in the source.')}</p>
          )}
          <section className={panelClass}>
            <h3 className="font-semibold">
              {text('Çağrı ve kaynak sürüm geçmişi', 'Call and source version history')}
            </h3>
            {current.program.calls?.map((call) => (
              <p key={call.id}>
                <Link
                  className="text-primary underline"
                  to={`${base}/calls/${call.id}${queryKey ? `?${queryKey}` : ''}`}
                >
                  {fundingDisplayName(call.title)} / v{call.version}
                </Link>{' '}
                · {stateLabels[call.status] || call.status} · {call.rule_version}
              </p>
            ))}
            {current.program.sources?.map((source) => (
              <section key={source.id} className="border-t border-border-dark pt-3">
                <p>
                  {text('Kaynak sürümü', 'Source version')} {source.version} ·{' '}
                  {stateLabels[source.publication_status] || source.publication_status} ·{' '}
                  {timestamp(source.checked_at)}
                </p>
                <SourceLink url={source.source_url} />
                <p className="break-all">SHA-256: {source.sha256}</p>
                {source.published_by && (
                  <p>
                    {text('Yayımlayan', 'Published by')}: {source.published_by} ·{' '}
                    {timestamp(source.published_at)}
                  </p>
                )}
              </section>
            ))}
          </section>
        </>
      )}
    </section>
  );
}

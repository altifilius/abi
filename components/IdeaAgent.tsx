import {
  ArrowRight,
  ArrowUp,
  Check,
  Globe2,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useHasUnsavedChanges, useUnsavedChanges } from '../contexts/NavigationGuard';
import { useIdeaChat } from '../hooks/useIdeaChat';
import type { ProjectSave } from '../hooks/useProjectState';
import { useI18n } from '../i18n';
import { api, errorMessage } from '../services/api';
import { COUNTRIES, type Project, type Usage, type Workspace } from '../types';

interface ScopeProposal {
  title: string;
  description: string;
  country: string;
  problem: string;
  solution: string;
  objectives: string;
  profile_revision: number;
}

export default function IdeaAgent({
  project,
  workspace,
  usage,
  reload,
  onUsage,
  save,
  readOnly = false,
}: {
  project: Project;
  workspace: Workspace;
  usage: Usage | null;
  reload: () => Promise<void>;
  onUsage: () => void | Promise<void>;
  save: ProjectSave;
  readOnly?: boolean;
}) {
  const { text, language } = useI18n();
  const navigate = useNavigate();
  const hasUnsavedChanges = useHasUnsavedChanges();
  const chat = useIdeaChat(project, language, reload, onUsage);
  const [proposal, setProposal] = useState<ScopeProposal | null>(null);
  const [proposing, setProposing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [proposalDirty, setProposalDirty] = useState(false);
  const [scopeSaved, setScopeSaved] = useState(false);
  const [view, setView] = useState<'conversation' | 'scope'>('conversation');
  const active = useRef<AbortController | null>(null);
  const confirmed = project.confirmed_revision === project.revision;
  const scope = project.profile.project || {};
  const history = useRef<HTMLDivElement>(null);
  const scopePanel = useRef<HTMLElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (chat.messages.length > 0 || chat.busy)
      history.current?.scrollTo({ top: history.current.scrollHeight });
  }, [chat.messages.length, chat.busy]);
  useEffect(() => {
    if (error) scopePanel.current?.scrollTo({ top: 0 });
  }, [error]);
  useUnsavedChanges(!readOnly && (!!chat.input.trim() || chat.busy || proposalDirty), () => {
    chat.setInput('');
    setProposal(null);
    setProposalDirty(false);
  });
  useEffect(() => {
    if (scopeSaved && !hasUnsavedChanges)
      navigate(`/w/${workspace.id}/projects/${project.id}/overview`);
  }, [scopeSaved, hasUnsavedChanges, navigate, workspace.id, project.id]);
  const propose = async () => {
    if (proposing || !active.current || readOnly) return;
    const signal = active.current.signal;
    setProposing(true);
    setError('');
    try {
      const value = await api<ScopeProposal>(`/projects/${project.id}/scope-proposal`, {
        method: 'POST',
        json: { language },
        signal,
      });
      if (!signal.aborted) {
        setProposal(value);
        setProposalDirty(true);
        setView('scope');
        await onUsage();
      }
    } catch (reason) {
      if (!signal.aborted) setError(errorMessage(reason));
    } finally {
      if (!signal.aborted) setProposing(false);
    }
  };
  const updateProposal = (key: keyof ScopeProposal, value: string) => {
    setProposal((previous) => (previous ? { ...previous, [key]: value } : null));
    setProposalDirty(true);
  };
  return (
    <div className="idea-workspace page-enter" data-view={view}>
      <fieldset
        className="idea-mobile-tabs"
        aria-label={text('Fikir çalışma görünümü', 'Idea workspace view')}
      >
        <button
          type="button"
          aria-pressed={view === 'conversation'}
          onClick={() => setView('conversation')}
        >
          {text('Sohbet', 'Conversation')}
        </button>
        <button type="button" aria-pressed={view === 'scope'} onClick={() => setView('scope')}>
          {proposal
            ? text('Kapsamı incele', 'Review scope')
            : text('Proje kapsamı', 'Project scope')}
          {proposal && <span className="scope-review-dot" />}
        </button>
      </fieldset>
      <section
        className="idea-conversation"
        aria-label={text('Fikir konuşması', 'Idea conversation')}
      >
        <header className="idea-conversation-heading">
          <span className="ai-orb">
            <Sparkles size={19} />
          </span>
          <div>
            <h2>{text('Fikrini birlikte netleştirelim', 'Give your idea a little clarity')}</h2>
            <p>
              {text(
                'İlk adım kusursuz bir plan değil, iyi bir konuşma.',
                'A good conversation comes before a perfect plan.',
              )}
            </p>
          </div>
        </header>
        <div
          className="idea-history"
          ref={history}
          role="log"
          aria-live="polite"
          aria-label={text('Fikir konuşma geçmişi', 'Idea conversation history')}
        >
          {chat.messages.length === 0 && (
            <div className="idea-welcome">
              <span className="chat-author">abi</span>
              <h3>{text('Aklında ne var?', 'What’s on your mind?')}</h3>
              <p>
                {text(
                  'Aklındaki fikri ya da çözmek istediğin sorunu anlat. Birlikte, her seferinde tek bir soruyla ilerleyelim.',
                  'Share the idea or problem on your mind. We’ll work through it together, one question at a time.',
                )}
              </p>
              <div className="idea-starters">
                {[
                  text(
                    'Bir fikrim var, nereden başlayacağımı bilmiyorum.',
                    'I have an idea, but I’m not sure where to start.',
                  ),
                  text(
                    'Mevcut projemi geliştirmek istiyorum.',
                    'I want to develop a project I’ve already started.',
                  ),
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    disabled={readOnly || chat.busy}
                    onClick={() => chat.setInput(suggestion)}
                  >
                    {suggestion}
                    <ArrowRight size={14} />
                  </button>
                ))}
              </div>
            </div>
          )}
          {chat.messages.map((message) => (
            <article key={message.id} className={`chat-message chat-${message.role}`}>
              <span className="chat-author">
                {message.role === 'assistant' ? 'abi' : text('Sen', 'You')}
              </span>
              <p>{message.text}</p>
            </article>
          ))}
          {chat.busy && (
            <div className="chat-thinking" role="status">
              <span />
              <span />
              <span />
              {text('Abi düşünüyor', 'Abi is thinking')}
            </div>
          )}
        </div>
        {chat.error && (
          <p role="alert" className="error">
            {chat.error}
          </p>
        )}
        {chat.historyUncertain && (
          <button onClick={() => void chat.refreshMessages()}>
            <RefreshCw size={15} />
            {text('Konuşmayı yeniden yükle', 'Reload conversation')}
          </button>
        )}
        <form
          className="idea-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void chat.perform();
          }}
        >
          <label className="sr-only" htmlFor="idea-message">
            {text('Fikrini anlat', 'Tell me about your idea')}
          </label>
          <textarea
            id="idea-message"
            rows={2}
            maxLength={12000}
            value={chat.input}
            onChange={(event) => chat.setInput(event.target.value)}
            placeholder={text('Fikrini anlat, bir soru sor…', 'Share an idea, ask a question…')}
            disabled={readOnly || chat.busy}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (chat.input.trim() && !chat.busy) void chat.perform();
              }
            }}
          />
          <button
            type="submit"
            className="send-button"
            aria-label={text('Mesajı gönder', 'Send message')}
            disabled={readOnly || chat.busy || !chat.input.trim() || chat.historyUncertain}
          >
            {chat.busy ? <LoaderCircle size={20} className="spin" /> : <ArrowUp size={20} />}
          </button>
        </form>
        <p className="composer-note">
          {text(
            'Fikir konuşman bu projeye özel kalır. Raporların konuşmaları ayrıdır.',
            'This conversation belongs to your idea. Each report has its own conversation.',
          )}
        </p>
      </section>
      <aside className="idea-scope" ref={scopePanel}>
        <button
          className="scope-mobile-back quiet-button"
          type="button"
          onClick={() => setView('conversation')}
        >
          ← {text('Sohbete dön', 'Back to conversation')}
        </button>
        <div className="scope-heading">
          <Globe2 size={18} />
          <span>{text('PROJENİN ÇERÇEVESİ', 'THE SHAPE OF YOUR PROJECT')}</span>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {proposal ? (
          <form
            className="scope-proposal"
            onSubmit={async (event) => {
              event.preventDefault();
              if (saving || proposal.profile_revision !== project.revision) return;
              setSaving(true);
              setError('');
              try {
                const { title, description, country, problem, solution, objectives } = proposal;
                await save(
                  {
                    title,
                    description,
                    profile: {
                      ...project.profile,
                      project: {
                        ...project.profile.project,
                        country,
                        problem,
                        solution,
                        objectives,
                      },
                    },
                    confirm_profile: true,
                  },
                  proposal.profile_revision,
                );
                setProposalDirty(false);
                setProposal(null);
                setScopeSaved(true);
              } catch (reason) {
                setError(errorMessage(reason));
              } finally {
                setSaving(false);
              }
            }}
          >
            <h3>{text('Bu kapsam seni anlatıyor mu?', 'Does this capture your idea?')}</h3>
            <p className="muted">
              {text(
                'Düzeltebilir, sonra onaylayabilirsin. Bilmediğin bilgileri eklemek zorunda değilsin.',
                'Adjust the proposal, then confirm it. You don’t need to invent facts you don’t know.',
              )}
            </p>
            <label>
              {text('Proje adı', 'Project name')}
              <input
                required
                maxLength={200}
                value={proposal.title}
                onChange={(event) => updateProposal('title', event.target.value)}
              />
            </label>
            <label>
              {text('Proje ülkesi', 'Project country')}
              <select
                required
                value={proposal.country || ''}
                onChange={(event) => updateProposal('country', event.target.value)}
              >
                <option value="">
                  {text('Sohbette belirlenmedi — seç', 'Not established in chat — select')}
                </option>
                {COUNTRIES.map((country) => (
                  <option key={country}>{country}</option>
                ))}
              </select>
            </label>
            {(['description', 'problem', 'solution', 'objectives'] as const).map((key) => (
              <label key={key}>
                {
                  {
                    description: text('Kısa kapsam', 'Project scope'),
                    problem: text('Problem', 'Problem'),
                    solution: text('Çözüm', 'Solution'),
                    objectives: text('Amaçlar', 'Objectives'),
                  }[key]
                }
                <textarea
                  rows={3}
                  value={proposal[key]}
                  onChange={(event) => updateProposal(key, event.target.value)}
                />
              </label>
            ))}
            {proposal.profile_revision !== project.revision && (
              <p role="alert" className="error">
                {text(
                  'Proje değişti. Güncel konuşmadan yeni kapsam önerisi al.',
                  'The project changed. Create a new scope proposal from the latest conversation.',
                )}
              </p>
            )}
            <button
              className="primary"
              disabled={
                saving ||
                !proposal.country ||
                !proposal.title.trim() ||
                proposal.profile_revision !== project.revision
              }
            >
              <Check size={17} />
              {saving
                ? text('Kaydediliyor…', 'Saving…')
                : text('Kapsamı onayla', 'Confirm project scope')}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={saving}
              onClick={() => {
                setProposal(null);
                setProposalDirty(false);
                setView('conversation');
              }}
            >
              {text('Sohbete devam et', 'Keep exploring')}
            </button>
          </form>
        ) : (
          <>
            <h3>
              {confirmed
                ? text('Fikrin bir projeye dönüştü.', 'Your idea has a shape.')
                : text('Önce fikrin, sonra yol haritan.', 'First the idea. Then the way forward.')}
            </h3>
            <p>
              {confirmed
                ? text(
                    'Raporlara geçebilir veya bu konuşmada kapsamını geliştirmeye devam edebilirsin. Kapsamı güncellediğinde mevcut raporların korunur.',
                    'Start your reports or keep refining the idea. Updating the scope preserves the reports you have already written.',
                  )
                : text(
                    'Sohbetten proje adını, amacını ve ülkesini toparlayacağız. Onayladığında raporlarını ve uygun destekleri birlikte geliştirmeye başlayabiliriz.',
                    'We’ll gather the project name, purpose and country from this conversation. Once you confirm the scope, your reports and funding journey can begin.',
                  )}
            </p>
            <dl className="scope-facts">
              <div>
                <dt>{text('Proje ülkesi', 'Project country')}</dt>
                <dd>
                  {String(scope.country || text('Birlikte belirleyeceğiz', 'To be discussed'))}
                </dd>
              </div>
              {scope.problem != null && (
                <div>
                  <dt>{text('Problem', 'Problem')}</dt>
                  <dd>{String(scope.problem)}</dd>
                </div>
              )}
              {scope.solution != null && (
                <div>
                  <dt>{text('Çözüm', 'Solution')}</dt>
                  <dd>{String(scope.solution)}</dd>
                </div>
              )}
            </dl>
            {!readOnly && (
              <button
                className={confirmed ? 'secondary-button' : 'primary'}
                disabled={proposing || chat.busy || chat.messages.length === 0}
                onClick={() => void propose()}
              >
                {proposing ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}{' '}
                {proposing
                  ? text('Toparlanıyor…', 'Gathering your idea…')
                  : confirmed
                    ? text('Kapsamı yeniden toparla', 'Refine the scope')
                    : text('Proje kapsamını toparla', 'Bring the scope together')}
              </button>
            )}
            {confirmed && (
              <Link
                className="text-link"
                to={`/w/${workspace.id}/projects/${project.id}/ai/reports`}
              >
                {text('Raporlarıma geç', 'Go to my reports')}
                <ArrowRight size={16} />
              </Link>
            )}
            <div className="scope-assurance">
              <MessageCircle size={17} />
              <p>
                {text(
                  'Bilinmeyenler soru olarak kalır. Ülke ve kapsam sen onaylamadan kesinleşmez.',
                  'Unknowns stay unknown. Your country and scope are only confirmed by you.',
                )}
              </p>
            </div>
            <details className="ai-details">
              <summary>{text('AI ve kullanım bilgileri', 'AI and usage details')}</summary>
              <p>
                {workspace.ai_policy === 'local'
                  ? text('Yerel / kendi sunucun', 'Local / self-hosted')
                  : text('Haricî sağlayıcı', 'External provider')}
              </p>
              <p>
                {text('Kalan sohbet / yazım', 'Remaining chat / writing')}:{' '}
                {usage ? `${usage.chat.remaining} / ${usage.write.remaining}` : '—'}
              </p>
            </details>
          </>
        )}
      </aside>
    </div>
  );
}

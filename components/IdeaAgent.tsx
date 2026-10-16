import { useState } from 'react';
import { useUnsavedChanges } from '../contexts/NavigationGuard';
import { mergeProfileProposal, useIdeaChat } from '../hooks/useIdeaChat';
import { type ProjectSave, useProjectDraft } from '../hooks/useProjectState';
import { useI18n } from '../i18n';
import { errorMessage } from '../services/api';
import type { Profile, Project, Usage, Workspace } from '../types';
import BudgetEditor from './BudgetEditor';
import { ProfileFields } from './ProfileScreen';

function ProposalReview({
  project,
  proposal,
  save,
  discard,
  readOnly,
  pro,
}: {
  project: Project;
  proposal: { profile: Profile; profile_revision: number };
  save: ProjectSave;
  discard: () => void;
  readOnly: boolean;
  pro: boolean;
}) {
  const { text } = useI18n();
  const state = useProjectDraft(project, mergeProfileProposal(project.profile, proposal.profile));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const stale = proposal.profile_revision !== project.revision && !saved;
  return (
    <section className="panel stack">
      <h2>{text('Profil önerisini düzenleyin', 'Edit the proposed profile')}</h2>
      <p>
        {text(
          'AI önerisi henüz kayıtlı değildir. Bilgileri düzeltin, önce kaydedin, ardından kayıtlı revizyonu onaylayın. Mevcut manuel bütçe ve ek bilgiler korunur.',
          'The AI proposal is not saved. Correct the facts, save first, then confirm the saved revision. Existing manual budget and additional facts are preserved.',
        )}
      </p>
      {(stale || state.conflict) && (
        <p className="error" role="alert">
          {text(
            'Proje değişti. Bu öneriyle eski revizyonun üzerine yazılamaz; öneriyi atıp güncel profilden yeni öneri alın.',
            'The project changed. This proposal cannot overwrite the newer revision; discard it and generate a new proposal from the current profile.',
          )}
        </p>
      )}
      <ProfileFields
        profile={state.draft.profile}
        disabled={readOnly || busy}
        onChange={(profile) => state.setDraft({ ...state.draft, profile })}
      />
      {pro && state.draft.profile.budget && (
        <BudgetEditor
          mode="project"
          value={state.draft.profile.budget}
          disabled={readOnly || busy}
          onChange={(budget) =>
            state.setDraft({ ...state.draft, profile: { ...state.draft.profile, budget } })
          }
        />
      )}
      <div className="actions">
        {!readOnly && (
          <>
            <button
              disabled={busy || stale || state.conflict || !state.dirty}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  const value = await save({ profile: state.draft.profile }, state.base.revision);
                  state.accept(value);
                  setSaved(true);
                } catch (error) {
                  setError(errorMessage(error));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {text('Düzeltilmiş öneriyi kaydet', 'Save corrected proposal')}
            </button>
            <button
              disabled={
                busy ||
                state.dirty ||
                stale ||
                state.conflict ||
                project.confirmed_revision === project.revision
              }
              onClick={async () => {
                if (state.dirty || stale || busy) return;
                setBusy(true);
                setError('');
                try {
                  await save({ confirm_profile: true }, project.revision);
                  discard();
                } catch (error) {
                  setError(errorMessage(error));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {text('Kayıtlı profili onayla', 'Confirm saved profile')}
            </button>
          </>
        )}
        <button
          disabled={busy}
          onClick={() => {
            state.discard();
            discard();
          }}
        >
          {text('Öneriyi at', 'Discard proposal')}
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
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
  const chat = useIdeaChat(project, language, reload, onUsage);
  const [refreshError, setRefreshError] = useState('');
  useUnsavedChanges(!readOnly && (!!chat.input.trim() || chat.busy), () => chat.setInput(''));
  return (
    <div className="stack">
      <h2>{text('Proje sohbeti', 'Project conversation')}</h2>
      <p>
        {text(
          'Bu bir proje geliştirme yardımcısıdır, fon kararı değildir. Profil önerileri düzenlenip kaydedilmeden mevcut profili değiştirmez.',
          'This is a project development assistant, not a grant decision. Proposals do not change the existing profile until reviewed and saved.',
        )}
      </p>
      <p className="notice">
        {text('AI politikası', 'AI policy')}:{' '}
        {workspace.ai_policy === 'local'
          ? text('Yerel / kendi sunucunuz', 'Local / self-hosted')
          : text('Harici sağlayıcı', 'External provider')}{' '}
        · {text('Aylık kalan sohbet / yazım', 'Monthly remaining chat / writing')}:{' '}
        {usage ? `${usage.chat.remaining} / ${usage.write.remaining}` : '—'}
      </p>
      {readOnly && (
        <p className="notice">
          {text(
            'Salt okunur: kayıtlı konuşmayı görüntüleyebilirsiniz.',
            'Read-only: you can view the saved conversation.',
          )}
        </p>
      )}
      <section
        className="panel conversation"
        aria-label={text('Kayıtlı konuşma', 'Saved conversation')}
        aria-live="polite"
      >
        {chat.messages.length === 0 && (
          <p>{text('Henüz kayıtlı mesaj yok.', 'No saved messages yet.')}</p>
        )}
        {chat.messages.map((message) => (
          <article key={message.id} className={`message ${message.role}`}>
            <strong>{message.role === 'user' ? text('Siz', 'You') : 'Abi'}</strong>
            <p>{message.text}</p>
            <small>
              {new Date(message.created_at).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-GB', {
                timeZone: 'UTC',
              })}{' '}
              UTC
            </small>
          </article>
        ))}
      </section>
      {!readOnly && (
        <form
          className="panel stack"
          onSubmit={(e) => {
            e.preventDefault();
            void chat.perform('chat');
          }}
        >
          <label>
            {text('Mesajınız', 'Your message')}
            <textarea
              rows={4}
              maxLength={12000}
              disabled={chat.busy}
              value={chat.input}
              onChange={(e) => chat.setInput(e.target.value)}
            />
          </label>
          <small>{chat.input.length} / 12000</small>
          <div className="actions">
            <button
              className="primary"
              disabled={
                chat.busy ||
                chat.historyUncertain ||
                !chat.input.trim() ||
                usage?.chat.remaining === 0
              }
            >
              {text('Gönder', 'Send')}
            </button>
            <button
              type="button"
              disabled={
                chat.busy || !!chat.proposal || !!chat.input.trim() || usage?.write.remaining === 0
              }
              onClick={() => void chat.perform('write')}
            >
              {text(
                'Kayıtlı profilden genel taslak yaz (1 yazım)',
                'Write general draft from saved profile (1 writing credit)',
              )}
            </button>
            <button
              type="button"
              disabled={
                chat.busy || !!chat.proposal || !!chat.input.trim() || usage?.write.remaining === 0
              }
              onClick={() => void chat.perform('extract-profile')}
            >
              {text('Profil öner (1 yazım)', 'Propose profile (1 writing credit)')}
            </button>
          </div>
          {chat.busy && (
            <p role="status">
              {text(
                'AI işlemi devam ediyor; sağlayıcıya bağlı olarak birkaç dakika sürebilir. Sonuç gelene kadar yeni işlem başlatmayın.',
                'The AI operation is still running; the provider may take several minutes. Do not start another operation before it finishes.',
              )}
            </p>
          )}
          {chat.committedFailure && (
            <p className="notice">
              {text(
                'Mesajınız sunucuda kaydedildi ancak yanıt işlemi başarısız oldu. Kayıtlı konuşma yenilendi; aynı mesaj otomatik tekrar gönderilmedi.',
                'Your message was saved on the server, but the reply failed. Saved history was refreshed; the message was not automatically sent again.',
              )}
            </p>
          )}
        </form>
      )}
      {chat.historyUncertain && (
        <section className="notice">
          <p>
            {text(
              'Kayıtlı konuşma doğrulanamadı. Aynı mesajı tekrar göndermeden önce geçmişi yenileyin.',
              'Saved conversation could not be verified. Refresh history before sending the same message again.',
            )}
          </p>
          <button
            disabled={chat.busy}
            onClick={async () => {
              setRefreshError('');
              try {
                await chat.refreshMessages();
              } catch (error) {
                setRefreshError(errorMessage(error));
              }
            }}
          >
            {text('Kayıtlı konuşmayı yenile', 'Refresh saved conversation')}
          </button>
        </section>
      )}
      {chat.proposal && (
        <ProposalReview
          key={`${project.id}-${chat.proposal.profile_revision}`}
          project={project}
          proposal={chat.proposal}
          save={save}
          discard={() => chat.setProposal(null)}
          readOnly={readOnly}
          pro={workspace.plan === 'pro'}
        />
      )}
      {(chat.error || refreshError) && (
        <p role="alert" className="error">
          {chat.error || refreshError}
        </p>
      )}
      <p>
        {text(
          'Kredi bittiğinde manuel düzenleme ve PDF / DOCX indirme devam eder. Başarısız AI işlemleri kredi tüketmez.',
          'Manual editing and PDF / DOCX exports remain available after quota. Failed AI operations consume no credits.',
        )}
      </p>
    </div>
  );
}

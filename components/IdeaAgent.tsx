import { useState } from 'react';
import { useIdeaChat } from '../hooks/useIdeaChat';
import { useI18n } from '../i18n';
import { errorMessage } from '../services/api';
import type { Profile, Project, Usage, Workspace } from '../types';
export default function IdeaAgent({
  project,
  workspace,
  usage,
  reload,
  onUsage,
  save,
}: {
  project: Project;
  workspace: Workspace;
  usage: Usage | null;
  reload: () => Promise<void>;
  onUsage: () => void;
  save: (changes: { profile: Profile; confirm_profile: boolean }) => Promise<Project>;
}) {
  const { text, language } = useI18n();
  const chat = useIdeaChat(project, language, reload, onUsage);
  const [confirmError, setConfirmError] = useState('');
  return (
    <div className="stack">
      <h1>{text('Fikir sohbeti ve proje yazımı', 'Idea conversation and project writing')}</h1>
      <p>
        {text(
          'Fon kararı veren bir yapay zekâ değil; proje geliştirme yardımcısıdır. Profil önerileri yalnızca sizin onayınızla kaydedilir.',
          'This is a project development assistant, not an AI grant decision. Profile proposals are saved only with your confirmation.',
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
      <p>
        {text(
          'Kredi bittiğinde manuel düzenleme, mevcut içerik, fon keşfi ve genel taslak indirme devam eder. Başarısız işlemler kredi tüketmez.',
          'Manual editing, existing content, funding discovery and general draft exports remain after quota. Failed operations do not consume credits.',
        )}
      </p>
      <section
        className="panel conversation"
        aria-label={text('Kayıtlı konuşma', 'Saved conversation')}
        aria-live="polite"
      >
        {chat.messages.length === 0 && (
          <p>
            {text(
              'Henüz kayıtlı mesaj yok. Projenizin problemini ve çözümünü anlatın.',
              'No saved messages yet. Describe your project problem and solution.',
            )}
          </p>
        )}
        {chat.messages.map((message) => (
          <article key={message.id} className={`message ${message.role}`}>
            <strong>{message.role === 'user' ? text('Siz', 'You') : 'Abi'}</strong>
            <p>{message.text}</p>
          </article>
        ))}
      </section>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          void chat.perform('chat');
        }}
      >
        <label>
          {text('Mesajınız', 'Your message')}
          <textarea
            rows={3}
            value={chat.input}
            maxLength={20000}
            onChange={(e) => chat.setInput(e.target.value)}
          />
        </label>
        <div className="actions">
          <button
            className="primary"
            disabled={chat.busy || !chat.input.trim() || usage?.chat.remaining === 0}
          >
            {text('Gönder', 'Send')}
          </button>
          <button
            type="button"
            disabled={chat.busy || usage?.write.remaining === 0}
            onClick={() => void chat.perform('write')}
          >
            {text('Genel taslağı yaz (1 yazım)', 'Write general draft (1 writing credit)')}
          </button>
          <button
            type="button"
            disabled={chat.busy || usage?.write.remaining === 0}
            onClick={() => void chat.perform('extract-profile')}
          >
            {text('Profil öner (1 yazım)', 'Propose profile (1 writing credit)')}
          </button>
        </div>
        {chat.busy && <p role="status">{text('İşleniyor…', 'Processing…')}</p>}
        {chat.error && (
          <p role="alert" className="error">
            {chat.error}
          </p>
        )}
      </form>
      {chat.proposal && (
        <section className="panel">
          <h2>{text('Profil önerisini gözden geçirin', 'Review proposed profile')}</h2>
          <p>
            {text(
              'Bu öneri henüz kaydedilmedi. Formda ayrıntılı düzenleyebilirsiniz.',
              'This proposal has not been saved. You can edit details in the profile form afterward.',
            )}
          </p>
          <pre>{JSON.stringify(chat.proposal.profile, null, 2)}</pre>
          {chat.proposal.profile_revision !== project.revision && (
            <p className="error">
              {text(
                'Proje değişti; eski öneriyi onaylamayın. Yeni öneri alın.',
                'Project changed; do not confirm a stale proposal. Generate a new one.',
              )}
            </p>
          )}
          <div className="actions">
            <button
              disabled={chat.proposal.profile_revision !== project.revision}
              onClick={async () => {
                setConfirmError('');
                try {
                  await save({ profile: chat.proposal!.profile, confirm_profile: true });
                  chat.setProposal(null);
                } catch (error) {
                  setConfirmError(errorMessage(error));
                }
              }}
            >
              {text('Öneriyi onayla ve kaydet', 'Confirm and save proposal')}
            </button>
            <button onClick={() => chat.setProposal(null)}>{text('Reddet', 'Discard')}</button>
          </div>
          {confirmError && (
            <p role="alert" className="error">
              {confirmError}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

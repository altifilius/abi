import { useEffect, useRef, useState } from 'react';
import { type ProjectSave, useProjectDraft } from '../hooks/useProjectState';
import { useI18n } from '../i18n';
import { api, downloadFile, errorMessage } from '../services/api';
import { readLegacyImport, removeLegacyImport } from '../services/persistence';
import type { Project } from '../types';
export default function DraftScreen({
  project,
  save,
  reload,
  readOnly = false,
}: {
  project: Project;
  save: ProjectSave;
  reload: () => Promise<void>;
  readOnly?: boolean;
}) {
  const { text } = useI18n();
  const state = useProjectDraft(project);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [legacy, setLegacy] = useState(readLegacyImport);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    return () => active.abort();
  }, []);
  return (
    <div className="stack">
      <h2>{text('Genel proje taslağı (Ücretsiz)', 'General project draft (Free)')}</h2>
      <p>
        {text(
          'Bu belge resmî başvuru formu değildir. Manuel düzenleme ve PDF / DOCX indirme kredi tüketmez. Metninizi AI kullanmadan yazabilirsiniz.',
          'This is not an official application form. Manual editing and PDF / DOCX export consume no credits. You can write your text without AI.',
        )}
      </p>
      {readOnly && <p className="notice">{text('Salt okunur erişim', 'Read-only access')}</p>}
      {state.conflict && (
        <section className="notice" role="alert">
          <p>
            {text(
              'Kayıt değişti. Yerel metniniz korunuyor; eski revizyonun üzerine yazılamaz.',
              'The record changed. Your local text is preserved; it cannot overwrite the newer revision.',
            )}
          </p>
          <button
            disabled={busy}
            onClick={() => {
              state.discard();
              setError('');
            }}
          >
            {text(
              'Yerel metni at ve güncel kaydı yükle',
              'Discard local text and load the latest record',
            )}
          </button>
        </section>
      )}
      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          if (readOnly || busy || !state.dirty || state.conflict) return;
          setBusy(true);
          setError('');
          try {
            state.accept(await save({ description: state.draft.description }, state.base.revision));
          } catch (error) {
            setError(errorMessage(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {text('Taslak metni', 'Draft text')}
          <textarea
            rows={16}
            maxLength={100000}
            readOnly={readOnly}
            disabled={busy}
            value={state.draft.description}
            onChange={(e) => state.setDraft({ ...state.draft, description: e.target.value })}
          />
        </label>
        {!readOnly && (
          <div className="actions">
            <button className="primary" disabled={busy || !state.dirty || state.conflict}>
              {text('Taslağı kaydet', 'Save draft')}
            </button>
            <button
              type="button"
              disabled={busy || !state.dirty}
              onClick={() => {
                state.discard();
                setError('');
              }}
            >
              {text('Değişiklikleri at', 'Discard changes')}
            </button>
          </div>
        )}
      </form>
      <section className="panel">
        <p>
          {state.dirty
            ? text(
                'Kaydedilmemiş değişiklikler var. İndirmeden önce taslağı kaydedin.',
                'There are unsaved changes. Save the draft before exporting.',
              )
            : text(
                'İndirme kayıtlı içerikten oluşturulur. Metnin dili korunur.',
                'Exports use saved content and preserve its language.',
              )}
        </p>
        <div className="actions">
          {(['docx', 'pdf'] as const).map((format) => (
            <button
              key={format}
              disabled={busy || state.dirty || state.conflict}
              onClick={async () => {
                if (state.dirty || busy) return;
                setBusy(true);
                setError('');
                try {
                  await downloadFile(
                    `/projects/${project.id}/draft-export?format=${format}`,
                    `project-draft.${format}`,
                    { method: 'POST', signal: controller.current?.signal },
                  );
                } catch (error) {
                  setError(errorMessage(error));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {format.toUpperCase()} {text('indir', 'download')}
            </button>
          ))}
        </div>
      </section>
      {legacy && !readOnly && (
        <section className="panel">
          <h3>{text('Eski yerel taslak bulundu', 'Legacy local draft found')}</h3>
          <p>
            {text(
              'Yalnızca açık onayınızla bu projeye aktarılır. Belge adları dosya veya doğrulama kanıtı değildir; eski verified durumları aktarılmaz.',
              'Imported into this project only with explicit consent. Document names are not files or verification evidence; legacy verified states are not imported.',
            )}
          </p>
          <button
            disabled={busy || state.dirty || state.conflict}
            onClick={async () => {
              if (state.dirty || state.conflict || busy) return;
              setBusy(true);
              setError('');
              try {
                await api(`/projects/${project.id}/import-legacy`, {
                  method: 'POST',
                  json: { ...legacy, expected_revision: project.revision },
                  signal: controller.current?.signal,
                });
                await reload();
                removeLegacyImport();
                setLegacy(null);
              } catch (error) {
                setError(errorMessage(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            {text('Eski taslağı bu projeye aktar', 'Import legacy draft into this project')}
          </button>
        </section>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}

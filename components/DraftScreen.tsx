import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { api, downloadFile, errorMessage } from '../services/api';
import { readLegacyImport, removeLegacyImport } from '../services/persistence';
import type { Project } from '../types';
export default function DraftScreen({
  project,
  save,
  reload,
}: {
  project: Project;
  save: (changes: { description: string }) => Promise<Project>;
  reload: () => Promise<void>;
}) {
  const { text } = useI18n();
  const [description, setDescription] = useState(project.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [legacy, setLegacy] = useState(readLegacyImport);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    return () => active.abort();
  }, []);
  useEffect(() => {
    setDescription(project.description);
    setError('');
  }, [project]);
  return (
    <div className="stack">
      <h1>{text('Genel proje taslağı (Ücretsiz)', 'General project draft (Free)')}</h1>
      <p>
        {text(
          'Bu belge resmî başvuru formu değildir. Manuel düzenleme ve indirme kredi tüketmez. Değişiklikler profil onayını geçersiz kılar.',
          'This is not an official application form. Manual editing and export consume no credits. Edits invalidate profile confirmation.',
        )}
      </p>
      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await save({ description });
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
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy}>
          {text('Taslağı kaydet', 'Save draft')}
        </button>
      </form>
      <section className="panel">
        <p>
          {text(
            'İndirmeler kayıtlı içerikten oluşturulur; önce değişiklikleri kaydedin.',
            'Downloads use saved content; save your changes first.',
          )}
        </p>
        <div className="actions">
          {(['docx', 'pdf'] as const).map((format) => (
            <button
              key={format}
              disabled={busy}
              onClick={async () => {
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
      {legacy && (
        <section className="panel">
          <h2>{text('Eski yerel taslak bulundu', 'Legacy local draft found')}</h2>
          <p>
            {text(
              'Yalnızca açık onayınızla bu projeye aktarılır. Belge adları dosya veya doğrulama kanıtı değildir; eski verified durumları aktarılmaz.',
              'Imported into this project only with your explicit consent. Document names are not files or verification evidence; legacy verified states are not imported.',
            )}
          </p>
          <button
            disabled={busy}
            onClick={async () => {
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

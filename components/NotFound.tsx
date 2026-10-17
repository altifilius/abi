import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';

export default function NotFound({ workspaceId }: { workspaceId?: string }) {
  const { text } = useI18n();
  return (
    <section className="panel stack">
      <h1>{text('Sayfa veya kayıt bulunamadı', 'Page or record not found')}</h1>
      <p>
        {text(
          'Bağlantı geçersiz olabilir veya bu kayda erişim yetkiniz olmayabilir. Başka bir çalışma alanının verisi gösterilmez.',
          'The link may be invalid or you may not have permission to access this record. Data from another workspace is never substituted.',
        )}
      </p>
      <Link to={workspaceId ? `/w/${workspaceId}/projects` : '/'}>
        {text('Projelerime dön', 'Return to my projects')}
      </Link>
    </section>
  );
}

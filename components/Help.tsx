import { ArrowRight, FileText, Globe2, MessageCircle, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import type { Project, Workspace } from '../types';

export default function Help({
  workspace,
  project,
}: {
  workspace?: Workspace | null;
  project?: Project | null;
}) {
  const { text } = useI18n();
  const root = workspace ? `/w/${encodeURIComponent(workspace.id)}` : null;
  const base =
    root && project?.workspace_id === workspace?.id
      ? `${root}/projects/${encodeURIComponent(project.id)}`
      : null;
  return (
    <div className="help-screen stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{text('KÜÇÜK BİR REHBER', 'A LITTLE GUIDANCE')}</p>
          <h1>{text('Bir fikirden, bir adım öteye.', 'A little further with your idea.')}</h1>
          <p className="page-subtitle">
            {text(
              'Her şeyi bir anda çözmen gerekmiyor. Abi ile sıradaki küçük adımı seç.',
              'You don’t need every answer at once. Choose the next small step with Abi.',
            )}
          </p>
        </div>
      </header>
      <div className="file-card-grid">
        <section className="panel stack">
          <span className="file-card-icon">
            <MessageCircle size={23} />
          </span>
          <h2>{text('1. Fikrini anlat', '1. Start with your idea')}</h2>
          <p className="muted">
            {text(
              'Projelerim → Yeni proje, doğrudan fikir konuşmasını açar. Proje adını, problemi, çözümü ve hangi ülkede ilerleyeceğini birlikte netleştiririz. Kapsam önerisini sen inceler ve onaylarsın; bilinmeyenler uydurulmaz.',
              'My projects → New project opens the idea conversation. We clarify the name, problem, solution and project country together. You review and confirm the scope; unknown facts are never invented.',
            )}
          </p>
          {root && (
            <Link className="text-link" to={`${root}/projects`}>
              {text('Projelerime git', 'Go to my projects')}
              <ArrowRight size={14} />
            </Link>
          )}
        </section>
        <section className="panel stack">
          <span className="file-card-icon">
            <Sparkles size={23} />
          </span>
          <h2>{text('2. Konuşarak yaz', '2. Write through conversation')}</h2>
          <p className="muted">
            {text(
              'AI → Rapor üretimi içinde soldan açılan panelle raporlarını seç. Şablondaki istediğin başlıktan başla; aynı raporu bitirmeden başka rapora geçebilirsin. Her raporun konuşması ayrıdır. Metin sohbette gelişir; yalnız “Bu hâlini rapora uygula” gibi açık talimatınla kaydedilir.',
              'In AI → Report writing, choose reports from the left panel. Start with any template heading and switch reports without completing the current one. Each report has its own conversation. Writing stays in chat until your explicit instruction, such as “Apply this draft to the report”.',
            )}
          </p>
          {base && (
            <Link className="text-link" to={`${base}/ai/reports`}>
              {text('Raporlarla çalış', 'Work on reports')}
              <ArrowRight size={14} />
            </Link>
          )}
        </section>
        <section className="panel stack">
          <span className="file-card-icon">
            <FileText size={23} />
          </span>
          <h2>{text('3. Dosyanı geliştir', '3. Make the document yours')}</h2>
          <p className="muted">
            {text(
              'Proje dosyası, raporlarını ve seçtiğin her desteğin belgelerini ayrı gruplar. Geniş editörde biçimlendirme, tablolar ve otomatik kayıt vardır. Kayıt hatasında yerel metin korunur; indirmeler yalnız kayıtlı sürümü içerir. Kapsam değişince raporlar silinmez, gözden geçirme gereği gösterilir.',
              'The project file groups your reports and each selected support’s documents. The full editor provides formatting, tables and autosave. Save errors preserve local edits; exports contain the saved version only. Changing scope marks reports for review rather than deleting them.',
            )}
          </p>
          {base && (
            <Link className="text-link" to={`${base}/overview`}>
              {text('Proje dosyasını aç', 'Open project file')}
              <ArrowRight size={14} />
            </Link>
          )}
        </section>
        <section className="panel stack">
          <span className="file-card-icon support-icon">
            <Globe2 size={23} />
          </span>
          <h2>{text('4. Doğru desteği keşfet', '4. Explore relevant support')}</h2>
          <p className="muted">
            {text(
              'Destek bul, proje ülkesine göre yurt içi ve yurt dışını ayırır. Yurt dışında mevcut ülkeden katılım ve yabancı yapılanma yolları ayrı gösterilir; kaynaklarda doğrulanmayan katılım yolları uygun sayılmaz. Tümünü göster ve filtreler keşfi genişletir. Seçmek AI üretimi veya resmî başvuru başlatmaz.',
              'Find support separates domestic and international routes using your confirmed project country. International participation and foreign establishment are distinct; unverified routes are never treated as eligible. All and filters broaden discovery. Selecting support does not start AI writing or an official submission.',
            )}
          </p>
          {root && (
            <Link
              className="text-link"
              to={`${root}/funding${project ? `?project=${project.id}` : ''}`}
            >
              {text('Destek bul', 'Find support')}
              <ArrowRight size={14} />
            </Link>
          )}
        </section>
      </div>
      <section className="panel stack">
        <h2>{text('Bilmen gereken sınırlar', 'A few important boundaries')}</h2>
        <p className="muted">
          {text(
            'Katalog seçilmiş resmî programları kapsar; dünyadaki bütün destekleri değil. Taslak kaynak ve çağrılar insan incelemesi tamamlanmadan açık başvuru veya kesin uygunluk değildir. Fon belgeleri hazırlık metnidir; gerçek orijinal ek, uygunluk kontrolü, bütçe, dil ve insan onayı ile resmî portal gönderimi ayrı adımlardır. İmzalı belge üretilmiş gibi gösterilmez.',
            'The catalogue covers selected official programmes, not all funding worldwide. Pending sources and calls are not verified opportunities or definitive eligibility. Funding documents are preparation text; originals, eligibility, budget, language review, human approval and official portal submission remain separate. Signed originals are never simulated.',
          )}
        </p>
        <p className="muted">
          {text(
            'Free ve Pro sınırları sunucuda uygulanır. Manuel yazım ve kayıtlı çıktıları indirme AI hakkı tüketmez. Başarısız veya eski revizyona gelen AI işlemleri ücretlendirilmez. Gerçek ödeme, fiyatlandırma ve kredi satın alma etkin değildir.',
            'Free and Pro limits are enforced on the server. Manual writing and saved exports do not consume AI allowance. Failed or stale AI operations are not charged. Real checkout, pricing and credit purchasing are not enabled.',
          )}
        </p>
        <p className="muted">
          {text(
            'Hesap menüsünden dil/tema, güvenlik, çalışma alanı, ekip, gizlilik ve kullanım bilgilerine ulaşabilirsin. Bildirim tercihleri teslimat garantisi değildir; e-posta için yapılandırılmış SMTP ve çalışan işçi gerekir.',
            'Use the account menu for language/theme, security, workspace, team, privacy and usage. Notification preferences are not a delivery guarantee; email needs configured SMTP and a running worker.',
          )}
        </p>
      </section>
    </div>
  );
}

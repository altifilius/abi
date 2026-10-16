import { useI18n } from '../i18n';
export default function Help() {
  const { text } = useI18n();
  return (
    <div className="stack">
      <h1>{text('Yardım', 'Help')}</h1>
      <section className="panel">
        <h2>{text('Başlangıç', 'Getting started')}</h2>
        <ol>
          <li>
            {text(
              'Şirket zorunlu olmadan hesap açın; kişisel çalışma alanınız oluşturulur.',
              'Sign up without a company; a personal workspace is created.',
            )}
          </li>
          <li>
            {text(
              'Proje oluşturun, manuel profili ve taslağı düzenleyin. AI sohbeti isteğe bağlıdır.',
              'Create a project and edit its profile and draft manually. AI conversation is optional.',
            )}
          </li>
          <li>
            {text(
              'Kaydedilen profili onaylayın ve ücretsiz genel taslağı PDF / DOCX indirin.',
              'Confirm the saved profile and download the free general draft as PDF / DOCX.',
            )}
          </li>
          <li>
            {text(
              'Resmî kaynaklı seçili fonları keşfedin. Katalog dünya çapında eksiksiz değildir.',
              'Discover selected officially sourced programs. The catalog is not globally comprehensive.',
            )}
          </li>
          <li>
            {text(
              'Pro ile sürümlü uygunluk kontrolü, başvuru bütçesi, belge incelemesi ve onay sürecini kullanın. Portala kendiniz gönderin.',
              'With Pro, use versioned eligibility checks, application budgets, document review and approvals. Submit to the official portal yourself.',
            )}
          </li>
        </ol>
      </section>
      <section className="panel">
        <h2>{text('Güvenilirlik ve sınırlar', 'Trust and boundaries')}</h2>
        <p>
          {text(
            'Uygunluk kuralları deterministiktir; yorum gerektiren koşullar insan incelemesine gider. Yapay zekâ fon kararı veya resmî hukuk danışmanlığı vermez. Belge yüklemek doğrulama değildir.',
            'Eligibility rules are deterministic; interpretive conditions require human review. AI is not a grant decision or official legal advice. Uploading does not verify a document.',
          )}
        </p>
        <p>
          {text(
            'Değişiklikler onayı geçersiz kılar; önceki değerlendirmeler geçmişte kalır. Çalışma alanları ayrı tutulur.',
            'Edits invalidate confirmation; earlier evaluations remain historical. Workspaces are isolated.',
          )}
        </p>
        <p>
          {text(
            'AI yapılandırma veya kota hatasında manuel çalışma sürer. Harici / yerel veri politikasını Ayarlar’da görün.',
            'Manual work remains available after AI configuration or quota errors. See external / local data policy in Settings.',
          )}
        </p>
        <p>
          {text(
            'Ödeme sağlayıcısı ve fiyatlandırma tamamlanmadı. Yerel yönetici Pro yetkisi ödeme değildir.',
            'Billing and pricing are not implemented. Local admin Pro entitlement is not payment.',
          )}
        </p>
      </section>
    </div>
  );
}

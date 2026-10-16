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
  const projectRoot =
    root && project?.workspace_id === workspace?.id
      ? `${root}/projects/${encodeURIComponent(project.id)}`
      : null;
  return (
    <div className="stack">
      <h1>{text('Yardım', 'Help')}</h1>
      {!root && (
        <p>
          {text(
            'Çalışma alanına özel bağlantılar için önce üst menüden bir çalışma alanı seçin. Hesap ve bildirimler çalışma alanından bağımsızdır.',
            'Select a workspace in the header to access workspace-specific links. Account settings and notifications are independent of workspaces.',
          )}
        </p>
      )}
      <section className="panel">
        <h2>{text('1. Projeyi oluşturun ve kaydedin', '1. Create and save your project')}</h2>
        <p>
          {text(
            'Şirketiniz olmadan da proje oluşturabilirsiniz. Proje profilini, ekip bilgilerini ve genel taslağı manuel düzenleyin; AI konuşması isteğe bağlıdır. Formlar açık Kaydet düğmesiyle kaydedilir. Kaydedilmemiş değişikliklerde başka sayfaya geçerken iptal veya vazgeç seçeneği gösterilir.',
            'You can create a project without a company. Edit its profile, team information and general draft manually; AI conversation is optional. Forms use an explicit Save button. Leaving with unsaved changes offers cancel or discard.',
          )}
        </p>
        <p>
          {text(
            'Önce profili kaydedin, sonra kaydedilmiş sürümü onaylayın. Düzenleme onayı geçersiz kılar. Proje geçmişi önceki sürümleri gösterir; genel taslağı PDF veya DOCX olarak indirmek ücretsizdir.',
            'Save the profile before confirming its saved revision. Editing invalidates confirmation. Project history shows earlier revisions; general draft PDF and DOCX downloads are free.',
          )}
        </p>
        {root && (
          <div className="flex flex-wrap gap-3">
            <Link to={`${root}/projects`}>{text('Projeler', 'Projects')}</Link>
            {projectRoot && (
              <>
                <Link to={`${projectRoot}/profile`}>
                  {text('Proje profili', 'Project profile')}
                </Link>
                <Link to={`${projectRoot}/conversation`}>
                  {text('AI konuşması', 'AI conversation')}
                </Link>
                <Link to={`${projectRoot}/draft`}>{text('Genel taslak', 'General draft')}</Link>
                <Link to={`${projectRoot}/history`}>
                  {text('Sürüm geçmişi', 'Revision history')}
                </Link>
              </>
            )}
          </div>
        )}
      </section>
      <section className="panel">
        <h2>
          {text(
            '2. Fonları keşfedin ve uygunluğu inceleyin',
            '2. Discover funding and review eligibility',
          )}
        </h2>
        <p>
          {text(
            'Fon keşfi ücretsizdir. Katalog seçili resmî kaynakları kapsar, dünyadaki bütün fonları kapsamaz. Program ve çağrı ayrıntılarında kaynak, sürüm, dil, açılış ve son tarihleri inceleyin. Yayımlanmamış taslak, duraklatılmış program veya güncel çağrısı bulunmayan bir kaydı açık başvuru fırsatı saymayın; resmî kaynağı doğrulayın.',
            'Funding discovery is free. The catalog covers selected official sources, not every program worldwide. Inspect sources, versions, languages, openings and deadlines in program and call details. An unpublished draft, paused program or record without a current call is not an open application opportunity; verify official guidance.',
          )}
        </p>
        <p>
          {text(
            'Pro ile kaydedilmiş ve onaylanmış proje profiline göre sürümlü uygunluk değerlendirmesi yapın. Eksik alanları profilde tamamlayıp yeniden değerlendirin. Yorum gerektiren koşullar insan incelemesi gerektirir; AI fon kararı vermez.',
            'With Pro, evaluate eligibility against the saved, confirmed project profile and versioned rules. Complete missing profile fields and evaluate again. Interpretive conditions require human review; AI does not award funding.',
          )}
        </p>
        {root && (
          <div className="flex flex-wrap gap-3">
            <Link to={`${root}/funding`}>{text('Fon keşfi', 'Funding discovery')}</Link>
            {projectRoot && (
              <>
                <Link to={`${projectRoot}/eligibility`}>
                  {text('Proje uygunluğu', 'Project eligibility')}
                </Link>
                <Link to={`${projectRoot}/budget`}>{text('Proje bütçesi', 'Project budget')}</Link>
              </>
            )}
          </div>
        )}
      </section>
      <section className="panel">
        <h2>
          {text(
            '3. Başvuruyu hazırlayın, inceleyin ve indirin',
            '3. Prepare, review and download the application',
          )}
        </h2>
        <p>
          {text(
            'Çağrı ve proje seçerek başvuru oluşturun. Başvuruda metin, bütçe, belgeler ve kontroller ayrı bölümlerdedir. Proje bütçesini başvuruya aktarmak açık bir işlemdir; başvuru bütçesi proje profilini sessizce değiştirmez. Uyumsuzlukları gidermeden son pakete geçmeyin.',
            'Choose a call and project to create an application. Text, budget, documents and checks have separate sections. Importing the project budget is an explicit action; editing an application budget never silently changes the project profile. Resolve discrepancies before the final package.',
          )}
        </p>
        <p>
          {text(
            'Kaydedilmiş başvuru sürümünü incelemeye gönderin. İnceleme ve dil onayı başvurunun İnceleme bölümünde yapılır, görevlerde değil. Düzenlemeden sonra yeniden onay gerekir. Paket bölümünden indirip resmî portala kendiniz gönderin; otomatik başvuru gönderimi yoktur.',
            'Submit the saved application revision for review. Review and language confirmation happen in the application Review section, not inside tasks. Edits require renewed approval. Download from Package and submit to the official portal yourself; there is no automatic filing.',
          )}
        </p>
        {root && (
          <Link
            to={`${root}/applications${project ? `?project=${encodeURIComponent(project.id)}` : ''}`}
          >
            {text(
              'Başvurular — bir başvuru açıp ilgili bölüme geçin',
              'Applications — open an application to access its sections',
            )}
          </Link>
        )}
      </section>
      <section className="panel">
        <h2>{text('4. Belgeleri doğrulayın', '4. Verify documents')}</h2>
        <p>
          {text(
            'Belge yüklemek içeriği doğrulamaz. Orijinal dosyayı, OCR metnini ve AI önerisini ayrı inceleyin. Profil önerileri yalnızca açık onayla uygulanır; kaydedilmemiş profil değişikliklerini koruyun. AI veya OCR işlemi başarısız olduğunda işlem durumunu okuyun ve orijinal belgeyle manuel devam edin.',
            'Uploading does not verify document contents. Inspect the original file, OCR text and AI proposal separately. Profile proposals apply only with explicit confirmation; preserve unsaved profile changes. If AI or OCR fails, inspect the operation status and continue manually with the original document.',
          )}
        </p>
        {root && (
          <Link
            to={`${root}/documents${project ? `?project=${encodeURIComponent(project.id)}` : ''}`}
          >
            {text('Belgeler', 'Documents')}
          </Link>
        )}
      </section>
      <section className="panel">
        <h2>
          {text(
            '5. Görevleri, takvimi ve bildirimleri kullanın',
            '5. Use tasks, calendar and notifications',
          )}
        </h2>
        <p>
          {text(
            'Görevlerim, tüm görevler veya proje görünümünde gerçek kayıtları filtreleyin. Pro ve düzenleyici yetkisiyle sorumlu, açıklama, UTC son tarihi ve durumu kaydedin. Görev ayrıntısındaki yorumlar proje genelindedir, göreve özel değildir. Takvim yalnızca kayıtlı tarihleri gösterir; aynı ay ve proje filtresini ICS olarak indirebilirsiniz.',
            'Filter actual records by My tasks, All tasks or Project. Pro editors can save assignees, descriptions, UTC due dates and statuses. Comments in task details belong to the whole project, not a task-specific thread. Calendar shows recorded dates only; download the same month and project filters as ICS.',
          )}
        </p>
        <p>
          {text(
            'Bildirimler hesabınıza aittir ve çalışma alanı seçimi gerektirmez. Bildirim bağlantısı ilgili kaydı açar; okundu durumunu ayrı değiştirebilirsiniz. E-posta gönderimi sunucu yapılandırması, tercihler ve arka plan işçisi gerektirir; ekranda bildirim olması e-posta teslim edildiği anlamına gelmez.',
            'Notifications belong to your account and require no workspace selection. Their links open the relevant record; read status is changed separately. Email delivery requires server configuration, preferences and a background worker; an in-app notification does not imply email delivery.',
          )}
        </p>
        <div className="flex flex-wrap gap-3">
          {root && (
            <>
              <Link to={`${root}/tasks`}>{text('Görevler', 'Tasks')}</Link>
              <Link to={`${root}/calendar`}>{text('Takvim', 'Calendar')}</Link>
            </>
          )}
          <Link to="/notifications">{text('Bildirimler', 'Notifications')}</Link>
          <Link to="/account/preferences">
            {text('Bildirim tercihleri', 'Notification preferences')}
          </Link>
        </div>
      </section>
      <section className="panel">
        <h2>{text('6. Erişim, AI ve hesap ayarları', '6. Access, AI and account settings')}</h2>
        <p>
          {text(
            'Çalışma alanı yöneticileri ekip rollerini ve AI politikasını yönetir. Görüntüleyiciler salt okunur çalışır. Free kullanım kotası UTC ayı başına kullanıcı, Pro kotası çalışma alanı kapsamındadır. AI sağlayıcısı yapılandırılmamış, duraklatılmış veya kotası dolmuşsa hata gizlenmez ve başka sağlayıcıya sessiz geçiş yapılmaz; manuel çalışma sürer.',
            'Workspace administrators manage team roles and AI policy. Viewers are read only. Free quotas are user-scoped per UTC month; Pro quotas are workspace-scoped. If an AI provider is unconfigured, paused or exhausted, errors are not hidden and no silent provider fallback occurs; manual work remains available.',
          )}
        </p>
        <p>
          {text(
            'AI resmî hukuk danışmanı değildir. Türkiye şirketleşme rehberi bilgi amaçlıdır. Ödeme ve abonelik sistemi henüz sunulmuyor; yerel yönetici Pro yetkisi veya kullanım kredisi vermesi ödeme değildir.',
            'AI is not official legal advice. The Turkey incorporation guide is informational. Payments and subscriptions are not available; local admin Pro entitlements or usage credits are not payments.',
          )}
        </p>
        <div className="flex flex-wrap gap-3">
          {root && (
            <>
              <Link to={`${root}/workspace/team`}>{text('Ekip ve roller', 'Team and roles')}</Link>
              <Link to={`${root}/workspace/ai`}>
                {text('AI veri politikası', 'AI data policy')}
              </Link>
              <Link to={`${root}/workspace/usage`}>
                {text('Kullanım ve kota', 'Usage and quotas')}
              </Link>
              <Link to={`${root}/workspace/privacy`}>
                {text('Çalışma alanı gizliliği', 'Workspace privacy')}
              </Link>
              <Link to={`${root}/workspace/incorporation`}>
                {text('Türkiye şirketleşme rehberi', 'Turkey incorporation guide')}
              </Link>
            </>
          )}
          <Link to="/account/identity">{text('Hesap bilgileri', 'Account identity')}</Link>
          <Link to="/account/security">{text('Şifre ve oturumlar', 'Password and sessions')}</Link>
          <Link to="/account/privacy">{text('Hesap gizliliği', 'Account privacy')}</Link>
        </div>
      </section>
    </div>
  );
}

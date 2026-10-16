# Değişiklikler

## Ekran bazlı yükleme

- Ana menü ekranları ve proje alt bölümleri `React.lazy` ile ihtiyaç anında yüklenir; ekip/kuruluş rehberi de ayrıldı. Başlangıç giriş/oturum/özet/ana gezinme ilk pakette kaldı.
- Ekran/bölüm kimlikli `Suspense` sınırları eski içeriği yükleme sırasında gizler; üst çubuk, menü, başvuru düzenleme state’i ve navigasyon koruması korunur.
- İlk JS paketi 651,05 → 418,37 kB; gzip 197,97 → 131,94 kB. Bütün parçaların toplamı 658,46 kB: başlangıç tasarrufu, toplam kod tasarrufu değildir.
- Vite büyük chunk uyarısı eşik bastırılmadan kaldırıldı. Soğuk istekler, yavaş ağdaki loading durumu, doğrudan menü/proje URL’leri, stay/discard, kalıcı kayıt ve mobil geçiş gerçek tarayıcıda doğrulandı.

## Proje merkezli menü teslimatı

- Kaynak/build/çalıştırma hedefi `/home/emre/Projects/abi`; ayrı `abi-upgrade` yolu teslimat bağımlılığı değildir.
- Yedi ana menü, kalıcı detay URL’leri, çalışma alanı/proje seçicileri, mobil klavye menüsü ve bağlamsal işlemler.
- Proje/başvuru sekmeleri; typed program nesne/listeleri; farklı alanlardan geciken yanıtlar ve eski revizyon geri almalarına karşı scope/revizyon koruması.
- İçerik ve inceleme notu navigation guard’ları; belge filtre değişiminde gerçek discard; ekip mutasyon hatasının yenilemede korunması.
- Başvuru sorumlusu, proje/belge/başvuru bağlantılı görevler, atıflı görev geçmişi ve kayıplı olmayan `0004_task_context` migration.
- Kaynaklı önkayıt milestone’ları, Bana atanan takvim filtresi, seçilmiş kayıt ICS; eski yayımlanmış çağrıya otomatik tarih/koşul eklenmez.
- Onaylı proje bütçesinin provenance kontrollü açık aktarımı; eksik/çelişkili çağrı tarihlerinde değerlendirme ve final üretim kapısı.
- Hesap adı, e-posta doğrulama, açık oturum iptali, tek kullanımlık parola kurtarma; gerçek bildirimler ve TR/EN tema tercihleri.
- Kaynak inceleme/yayın ve ödeme olmayan manuel Pro/kredi konsolu; canlılık/hazırlık/degraded ayrımı, gerçek OCR/worker durumları ve yedek/restore zaman metaverisi.

## Çalışma alanı yükseltmesi

- Eski tek-projeli browser state yerine kimlik doğrulamalı, rollü ve revizyonlu PostgreSQL çalışma alanları; kişisel Free kayıt şirket gerektirmez.
- Kullanıcı onaylı sohbet/form profili, kalıcı geçmiş, gerçek ücretsiz DOCX/PDF taslağı; başarısız/stale AI işlemlerini ücretlendirmeyen aylık haklar ve manuel ek kredi ledgerı.
- Sürümlü resmî kaynak/çağrı kataloğu, deterministik uygunluk ve atıflı insan incelemesi. Eski BİGG/1501/1507 katalog koşulları kaldırıldı.
- Özel dosya saklama, içerik doğrulama, yerel OCR ve inceleme statüleri; dosya seçimi artık verified sayılmaz.
- Kaynak alanlarına bağlı düzenlenebilir başvuru, Decimal bütçeler, revizyon/dil/ek bağlı insan onayı ve gerçek DOCX/PDF/ZIP portal hazırlık paketi.
- Gerçek görev, yorum, faaliyet, SMTP ve ICS; Türkiye kaynaklı kalıcı kuruluş öz-kontrolü; sahte dashboard olayları ve işlevsiz push ayarı kaldırıldı.
- TR/EN, açık/koyu ve mobil/klavye erişimi; ana port 8001, kilitli Python/JS bağımlılıkları, tek Alembic şema otoritesi, özel dosya+DB yedeği ve geri yükleme.
- Workspace AI politikasına uygun yerel/haricî çağrılar; alıntı doğrulaması, rapor/kaynak/model/boyut sürüm izolasyonu ve atomik ingestion.

Ücretli checkout, fiyat/OCR kota kararları kullanıcı talebiyle ertelendi. Pro/kredi aktivasyonu manuel yönetici kontrolüdür, tahsilat değildir. Seçilmiş çağrılar kaynak incelemesine kadar taslaktır; portal gönderimi kullanıcıya aittir. Kamuya kapalı veya erişilemeyen resmî form/kurallar tamamlanmış gösterilmez.

# Değişiklikler

## Devam ve teslimat doğrulaması

- Kapanmış yerel web ve AI süreçleri mevcut yapılandırmayla yeniden başlatıldı; ana hazırlık yanıtı `ready: true, degraded: false` oldu. Mevcut veritabanı, özel belgeler ve `.env` dosyaları korunur.
- 27 frontend ve ayrı migration'lı PostgreSQL üzerinde 165 backend testi, lint, TypeScript ve üretim build'i yeniden geçti. Masaüstü/mobil kapsam onayı, rapor seçimi, otomatik kayıt/yenileme, gerçek Unicode PDF/DOCX ve kaynaklı destek keşfi tarayıcıda çalıştırıldı.
- Yerel tarayıcı kanıtları Git dışında tutulur. Tek-soru biçimi, verilmiş bilgiyi yeniden sorma veya örnek yanıtı kopyalama gibi model kalite sınırlarının çözüldüğü anlamına gelmez.

## Ekrana sığan çalışma alanı ve tek-soru danışmanı

- Ekran yüksekliğine bağlı uygulama kabuğu; uzun sohbet/belge/sonuç listelerinde panel içi kaydırma, mobil sohbet/kapsam ve sohbet/belge geçişleri. Kısa/yatay ekranda mesaj kutusu ve indirme/filtre seçenekleri erişilebilir kalır.
- Fikir sohbetinde bağlama göre iş geliştirme yönlendirmesi; kısa yanıt ve tek soru için yapısal sağlayıcı sözleşmesi. Bozuk/çoklu sorular kesilip başarı gösterilmez; hata/kota iadesi korunur.
- Daha kompakt başlık, seçim ve indirme araçları; kapsam hatası ilgili panelde görünür. Otomatik kayıt, PDF/DOCX indirme, kaydetme hatasında metin/çıkış koruması ve klavyeyle rapor çekmecesi gerçek tarayıcıda doğrulandı.

## Sade proje deneyimi ve konuşmalı rapor stüdyosu

- Sol menü kaldırıldı; iki ana giriş Projelerim / Destek bul, hesap/bildirim üst çubuğu, kompakt aranabilir proje kartları ve doğrudan fikir sohbetiyle yeni proje.
- Proje dosyası / AI ayrımı, tek açık belge grubu, çoklu fon grupları, bağlamsal yapılacaklar/tarihler; eski bütçe, belge, uygunluk, inceleme ve final paket işlevleri ilgili projenin içinde korunur.
- Beş iki dilli hazır rapor şablonu; her rapora ayrı kalıcı sohbet; başlık seçimi ve soldan çoklu toggle paneli. AI taslakları yalnız sohbette kalır; açık uygulama talimatı kayıtlı bölüme yazabilir, sonraki başlık kullanıcıya aittir.
- Tiptap zengin editör, otomatik kayıt, güvenli şablon özelleştirme, stale-scope/report koruması, gerçek biçimlendirilmiş Unicode PDF/DOCX. Soft-break biçimlendirme, rowspan ve uzun tablo PDF sayfalama sınırları kapsanır.
- Kaynaklı proje ülkesine göre yurt içi / yurt dışı; doğrudan başvuru / yabancı yapılanma alt yolları. Bilinmeyen veya yayımlanmamış kurallar kesin uygunluk sayılmaz; seçilen kaynaklar yalnız hazırlık grubu ekler.
- Eklemeli `0005_project_studio` migration öncesi DB+dosya yedeği alındı; mevcut proje kaydının hash'i ve `.env` dosyaları geçişte korundu.
- Kayıt hatasında yerel metin ve çıkış engeli, biçimlendirilmiş soft-break, tablo rowspan/sayfalama ve kayıt sonrası kapsam geçişi doğrulandı. Yedek manifesti artık kod sürümünü varsaymak yerine gerçek Alembic revision'ını veritabanından okur.

## Kalıcı arka plan işçileri

- Günlük resmî kaynak kontrolü için `abi-source-watch.service` eklendi; mevcut 60 saniyelik hatırlatma/e-posta servisiyle birlikte kullanıcı systemd yöneticisine kuruldu ve etkinleştirildi.
- Gerçek kaynak kontrolünde 12 programdan 11'i yeni inceleme taslağı üretti, biri değişmedi, kaynak hatası olmadı; otomatik yayın yapılmadı. İki işçinin başarılı heartbeat'iyle yerel `/api/ready` yanıtı `ready: true, degraded: false` oldu.
- Kurulum, durum/log okuma, durdurma ve bağımlılık/linger sınırları README'ye eklendi. SMTP yapılandırması veya haricî AI ayarı başarılı teslimat/çağrı olarak gösterilmez.

## Geliştirme kopyalarının birleştirilmesi

- `upgrade/workspace-build` çalışma alanı yükseltmesi GitHub’a yayımlandı ve `abi` içindeki `upgrade/menu-workspace-execution` dalına pull ile alındı. Daha yeni menü, hesap, lazy-loading ve `0004_task_context` davranışları korundu.
- Web ve hatırlatma systemd servisleri `/home/emre/Projects/abi` ve `.venv-menu` ortamına taşındı. Eski ekran kopyaları ve üretilmiş Python önbellekleri yeni geliştirme hedefinde tutulmaz.
- Eski ekip ekranındaki kişisel e-posta teslimat geçmişi Bildirimler ekranına; kullanıcı kimliği ve JSON ayrıntılarıyla son 100 faaliyet Özet ekranına taşındı. Yeni menüye geçişte bu işlevler kaybolmaz.
- Kaynak kodu gömülü DB parolası içermez; gerçek `.env`, özel belge deposu ve veritabanı Git’e dahil edilmez.

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

# Abi

Girişimciler ve şirket ekipleri için kaynaklı fon keşfi, proje yazımı ve başvuru hazırlama çalışma alanı. React/Vite + FastAPI + PostgreSQL/pgvector. Şirket kurmadan kişisel hesap açılabilir.

Bu yerel teslimatın kaynak, build ve çalışma dizini **`/home/emre/Projects/abi`**. `abi-upgrade` çalıştırma veya teslimat hedefi değildir. `dist/` bu dizinde üretilir; FastAPI aynı dizinin build’ini sunar.

Çalışma alanı yükseltmesi `upgrade/workspace-build` dalında yayımlandı; güncel menü/hesap geliştirmeleriyle birleşen devam dalı `upgrade/menu-workspace-execution`. Klasörler arasında dosya kopyalamak yerine bu dizinde Git pull/merge kullanın. `abi.service`, `abi-worker.service` ve `abi-source-watch.service` bu dizinin `.venv-menu` ortamını çalıştırır.

## Bu build’in kapsamı

- **Free:** kalıcı kişisel projeler, fikir sohbeti ve kullanıcı onaylı kapsam/ülke, beş şablonlu proje raporu, rapora özel AI konuşması, elle zengin metin düzenleme/otomatik kayıt, gerçek DOCX/PDF indirme ve resmî kaynaklı destek keşfi.
- **Pro:** çalışma alanı başına en fazla üç üye, kaynak/sürüm bağlı uygunluk değerlendirmesi, bütçe kontrolleri, özel belge deposu ve yerel OCR, belge AI önerileri, çağrı dilinde başvuru yazımı, görev/yorum/inceleme, insan onayından sonra DOCX/PDF/ZIP hazırlama paketi.
- **Uygunluk:** deterministik koşullar geçti/kaldı/bilgi eksik/inceleme gerekli olarak değerlendirilir. Sıralama puanı destek kazanma olasılığı değildir. Eksik bilgi ve yoruma açık koşullar kesin uygunluk sayılmaz. İnsan incelemesi kayıtlı ve atıflıdır; resmî kurum kararı değildir.
- **Sürümleme:** proje revizyonu, çağrı/kural/kaynak sürümü ve değerlendirme zamanı saklanır. Düzenleme onayı geçersizleştirir; eski değerlendirme sessizce değiştirilmez.
- **Gerçek ürün verisi:** proje içi yapılacaklar/tarihler, çalışma alanı faaliyet geçmişi, kalıcı şirketleşme öz-kontrolü, görevler, e-posta tercihleri ve gerçek görev/çağrı tarihlerinden ICS aktarımı. Sahte örnek faaliyetler yoktur.
- **Dil/erişim:** Türkçe/İngilizce arayüz, açık/koyu tema ve mobil klavye erişimi. Başvuru yazımı çağrının yayımlanmış dilini kullanır ve final onayında dil incelemesi gerekir.

### Menü ve kalıcı URL’ler

Üstte yalnız **Projelerim** ve **Destek bul** vardır. Hesap/bildirimler üst çubuktadır; çalışma alanı geçişi, ekip, kullanım, güvenlik ve yönetici araçları hesap menüsünden açılır.

- **Projelerim:** iki sütunlu kompakt kartlar ve arama. Yeni proje ad formu olmadan doğrudan fikir sohbetiyle başlar.
- **Proje dosyası:** sıradaki iş, kapsam bağlantısı, temel raporlar ve her seçili fon için ayrı belge grubu. Aynı anda tek rapor/fon grubu genişler; açık belge, AI ve indirme işlemleri bağlamsaldır. Yapılacaklar/tarihler küçük açılır bölümdedir. Orijinal dosya yükleme, bütçe, uygunluk, insan/dil incelemesi ve final paket kontrolleri korunur.
- **AI:** Fikir ve Rapor üretimi ayrı oturumlardır; her raporun geçmişi ayrıdır. Soldan açılan panelde çoklu toggle seçimi AI çağrısı yapmaz. Raporlar hazır şablonlarla başlar; başlıklar sıralıdır fakat tamamlanma kilidi yoktur. Konuşmada paragraf/bölüm tarif edilir, taslak mesajlarda geliştirilir; yalnız açık kullanıcı uygulama talimatı kayıtlı raporu değiştirir. Sonraki başlığı kullanıcı başlatır.
- **Belge editörü:** tam rapor, temel biçimlendirme/listeler/tablolar, otomatik kayıt, hata ve revizyon çakışmasında metni koruma, açılır başlık planı. Genel şablon başlıkları düzenlenebilir; fonun kaynakla belirlenmiş başlıkları sabittir. Kapsam değişince raporlar korunur, açık inceleme gereği gösterilir.
- **Destek bul:** onaylı proje ülkesine göre yurt içi/yurt dışı; yurt dışında mevcut ülkeden başvuru ve yabancı yapılanma yolları ayrı sekmelerdir. Kaynaklarda bilinmeyen katılım yolu uygun kabul edilmez. Tümünü göster, arama ve açılır filtreler; ayrı ayrıntıda koşul ve resmî kaynaklar bulunur. Destek seçmek belge grubunu ekler, üretim/gönderim başlatmaz. Birden fazla fon seçilebilir.

Çalışma alanı görünür ekran yüksekliğine sığar; üst gezinme ve mesaj kutusu yerinde kalır. Uzun sohbet, belge ve sonuç listeleri kendi panellerinde kayar. Mobilde sohbet/kapsam ve sohbet/belge ayrı görünümlerdir. Kısa/yatay ekranlarda indirme ve filtre seçenekleri ekran içinde, kapatılabilir bir panelde açılır. Kaydetme/kapsam hataları ilgili panelde görünür; otomatik kayıt ve kaydedilmemiş değişiklik koruması devam eder.

Fikir danışmanı son soruya kısa cevap verip her turda bir yararlı bilinmeyeni ele alacak şekilde yönlendirilir; verilen ülke/bilgiyi yeniden istememesi ve geçilen ayrıntıda ısrar etmemesi beklenir. Sağlayıcı `body` ve tek `next_question` (veya kapanışta `null`) döndürür. Çoklu/bozuk soru, eksik alan veya sağlayıcı reddi başarılı mesaj sayılmaz; yanıt kesilmez, uydurma cevap veya haricî sağlayıcıya sessiz geçiş yapılmaz. Üslup ve bağlama uygunluk model kalitesine bağlıdır.

Kalıcı proje yolları `/w/{workspace}/projects/{project}/overview`, `/ai/idea`, `/ai/reports?report={id}`, `/reports/{id}`. Hesap ve bildirimler proje seçimi istemez; keşif Free'de açıktır. Fon hazırlığı/Pro işlemleri sunucu plan/rol sınırlarını korur; viewer yazamaz.

Kaydedilmemiş metin, bütçe, profil önerisi ve inceleme notları geçişte **kal / bırak ve ayrıl** seçimiyle korunur. Onay ve indirme aynı kayıtlı revizyona bağlanır. Önceki alanın geciken yanıtı yeni alanı doldurmaz; daha eski revizyon yeni kaydı geri almaz. Proje bütçesi aktarımı sunucudaki onaylı profil/çağrı/para birimi kontrolleriyle açıkça kaydedilir; kur dönüşümü yapılmaz.

Önkayıt hatırlatmaları çağrı şablonunun kaynaklı `milestones` alanındadır. Yeni 1501/1507 seed tanımları resmî §6 tarihlerini içerir; mevcut yayımlanmış çağrı değiştirilmez. Eski taslaklarda kaynak incelemesi üzerinden açık tanım güncellemesi gerekir; `seed` insan düzenlemesini ezmez. Önkayıtlı kuruluşların tekrar başvurması gerektiği varsayılmaz. Tarihi bilinmeyen veya çelişkili çağrı kesin uygun/final paket olamaz.

### Ücretlendirme sınırı

**Gerçek ödeme, fiyatlandırma ve kredi satın alma bu build’de etkin değildir.** Kullanıcı bu kararları build sonrasına erteledi. Sistem yöneticisi Pro ve ek kullanım haklarını manuel tanımlayabilir; bu işlemler ödeme olarak gösterilmez. Sunucuda gerçek özellik/rol sınırları ve kullanım ledgerı uygulanır:

| Hak | Free | Pro |
|---|---|---|
| Kapsam | Kullanıcı; tüm Free alanlarında ortak | Çalışma alanı; en fazla üç üyede ortak |
| Başarılı AI sohbet yanıtı / UTC ayı | 100 | 500 |
| Başarılı yazım/öneri işlemi / UTC ayı | 10 | 50 |

Başarısız veya eski revizyona gelen işlemler hakkı tüketmez. Silip yeni alan açmak Free kotasını sıfırlamaz. Elle düzenleme, kaydedilmiş çıktıları indirme ve fon keşfi kota dolunca da devam eder. Pro OCR sayfa kotası ve ücretli aşım fiyatı belirlenmedi; uydurma kota/fiyat yoktur. Otomatik aşım ücreti alınmaz.

## Seçilmiş resmî programlar

Tüm dünyadaki fonların kapsamı iddia edilmez. `data/programs.json` içinde 18 gerçek resmî HTML/PDF kaynağının SHA-256’lı kopyaları tekilleştirilmiştir. Başlangıç listesi:

| Bölge | Desteklenen seçilmiş hazırlık akışı |
|---|---|
| Türkiye | TÜBİTAK 1501-2026/2, 1507-2026/2, BiGG 1812-2026-2 |
| AB şirketleri | Eurostars Call 12 konsorsiyum hazırlığı |
| Kanada / İsviçre / Norveç / İzlanda | Eurostars Call 12 ve kaynakta yayımlanan ulusal koşullar |
| Birleşik Krallık | Merged RDEC; Employment Allowance |
| ABD | Y Combinator seçilmiş kamuya açık başvuru alanları |
| Lihtenştayn | Y Combinator uluslararası başvuru yolu; **Lihtenştayn kamu hibesi değildir** |

**Kaynaklar ve çağrılar ilk kurulumda taslaktır.** Yetkili insan kaynakları ve koşulları inceleyip yayımlamadan değerlendirme açılamaz. Kaynak izleyici yalnız yeni taslak üretir; yasal kuralları otomatik yayımlamaz. BiGG 2026-2 kapanmıştır. Eurostars Call 12’nin açılışı 17 Aralık 2026’dır; henüz açık olmadığı durumda final üretimine izin verilmez.

Eurostars ulusal destek oranları/mali uygunluk ilgili kurumun onayını gerektirir; para birimi dönüşümü uydurulmaz. Lihtenştayn Innovationsscheck’in resmî PDF ve sayfasına erişim HTTP403/Cloudflare nedeniyle tamamlanamadı; yerel kupon koşulları ve şablonu uygulanmış gösterilmez. YC’nin oturum gerektiren güncel formu kamuya açık değildir; mevcut portal alanları yetkili kullanıcı tarafından ayrıca incelenir.

### Başvuru çıktısının anlamı

Üretilen dosyalar **kaynağa bağlı portal hazırlık paketi**dir; otomatik gönderim veya resmî AGY formu iddiası değildir. Alanlar, bütçe, incelenmiş orijinal ekler, kaynak sürümleri ve manuel gönderim rehberi içerir. Eurostars imzalı resmî ekleri kullanıcı gerçek dosya olarak sağlamalıdır. Gelecekte zorunlu resmî şablonu doldurulmamış bir çağrı final üretimine açılamaz.

## Kurulum

Gerekenler: Bun 1.4.2, Python 3.12, `uv`, PostgreSQL 18 + pgvector, PostgreSQL istemci araçları (`pg_dump`, `pg_restore`), yerel Tesseract ve seçilen dil verileri, DejaVu Sans Unicode fontu. AI için açıkça yapılandırılmış haricî veya kendi altyapınızdaki OpenAI uyumlu servis gerekir. Manuel profil/dosya çıktısı AI olmadan çalışır; eksik AI yapılandırması açık 503 verir.

```sh
bun install --frozen-lockfile
uv venv --python 3.12 .venv-menu
uv pip install --python .venv-menu/bin/python -r backend/requirements.lock
cp .env.example .env.local
cp backend/.env.example backend/.env
chmod 600 backend/.env
```

`backend/.env` dosyasında veritabanı, AI, özel depolama/font/OCR ve SMTP ayarlarını gerçek ortama göre yapılandırın. Anahtarları `VITE_*` içine koymayın. Mevcut `.env` dosyalarını örnekle ezmeyin; yalnız ilk kurulumda kopyalayın. Boş opsiyonel ayarlara sahte anahtar yazmayın.

Yeni altyapı için `compose.yml` örneği kullanılabilir; `ABI_DATABASE_PASSWORD` özel değeri gerekir. Mevcut servislerle aynı portları ikinci kez açmayın.

```sh
make migrate
make seed
bun run build
make dev-backend
```

Üretim build’i FastAPI üzerinden **http://127.0.0.1:8001** adresinde açılır. Yerelde komutları `/home/emre/Projects/abi` içinde çalıştırın: `make build`, `make migrate`, `make dev`. `make dev-frontend` geliştirme için 3000 portunda çalışır ve `/api` isteklerini 8001’e yönlendirir. Şemanın tek otoritesi Alembic’tir; güncel geçiş `0005_project_studio`, önceki proje/başvuru kayıtlarını değiştirmeden raporları, ayrı konuşmaları ve fon seçimlerini ekler. Uygulama açılışı tablo oluşturmaz.

### Yerel AI

Bu makinede kurulmuş servis 11435 loopback portunda, `OLLAMA_NO_CLOUD=true` ile çalışır. `qwen3:1.7b` ve `embeddinggemma` yerel modelleri kullanılır. Ollama için `LOCAL_AI_REASONING_EFFORT=none` açık sağlayıcı seçeneğidir; başka sağlayıcıda uygun şekilde değiştirin. Küçük CPU modelinin yazım kalitesi uzman incelemesi gerektirir; yerel başarı doğruluk garantisi değildir.

Mevcut yerel Ollama süreci model ağırlıklarını `/home/emre/Projects/abi-upgrade/var/models` deposundan kullanır; bu yalnız yerel model verisidir, eski uygulamanın kaynak/build/veritabanı değildir. Bu depo otomatik taşınmadı; model servisini yeniden başlatırken aynı `OLLAMA_MODELS` yolunu koruyun.

Tek-soru güncellemesinde mevcut yerel modelle gerçek üç turlu sohbet çalıştırıldı; yanıt, tek soru ve sorusuz kapanış sözleşmesi geçti. Qwen3 4B/8B, 4B Instruct ve Gemma3 4B denemeleri Türkçe danışmanlık kalitesini güvenilir biçimde iyileştirmediği için canlı model ayarı değiştirilmedi. Küçük model hâlâ kullanıcı dilini taklit edebilir veya zayıf öneri üretebilir; kaliteli danışmanlık ve gerçek bilgi doğrulaması garanti edilmez.

Şirket/kişisel alanın `local` politikası sohbet, belge analizi, çeviri ve embedding için uygulanır. Haricî servise sessiz geçiş olmaz. Eski haricî credential’ın çalıştığı iddia edilmez; bu build’in başarılı AI kabulü yerel servisle yapıldı.

### Kaynak ve yönetici erişimi

İlk kaydolan kullanıcı yönetici olmaz. Kendi hesabınızı açtıktan sonra, açıkça seçilmiş mevcut hesabı yönetici yapın:

```sh
.venv-menu/bin/python -m backend.bootstrap_admin --email sizin-adresiniz@example.com
```

Yeniden giriş/yenileme sonrası kaynak yönetimi ve **manuel, ödeme olmayan** Pro/kredi kontrolleri görünür. Kaynak ekranında farkı ve çağrı tanımını inceleyin; insan onayını işaretleyip tanımı kaydedin, sonra yayımlayın.

```sh
make watch-sources                       # Tek seferlik gerçek kaynak kontrolü
.venv-menu/bin/python -m backend.funding watch --interval 86400
make reminders                           # Kalıcı e-posta/reminder worker
```

Yerel Mailpit teslimatları **http://127.0.0.1:18025** üzerinden okunur; gerçek dış alıcıya iletilmez. Yayında gerçek TLS SMTP kullanın. Tercih kaydetmek gönderim değildir; worker gerekir. SMTP teslimatı crash sonrası en az bir kez olabilir; sabit Message-ID korunur. Gönderim hataları sınırlı tekrar sonrası görünür `dead_letter` olur.

### Kalıcı arka plan işçileri

Yerel kullanıcı systemd servislerini proje kökünden kurun. Önce mevcut PostgreSQL, yerel AI ve SMTP servislerini hazır edin; bu unit dosyaları bağımlılık konteynerlerini oluşturmaz veya başlatmaz.

```sh
systemd-analyze --user verify abi-worker.service abi-source-watch.service
systemctl --user link "$PWD/abi-worker.service" "$PWD/abi-source-watch.service"
systemctl --user daemon-reload
systemctl --user enable --now abi-worker.service abi-source-watch.service
systemctl --user status abi-worker.service abi-source-watch.service --no-pager
journalctl --user -u abi-worker.service -u abi-source-watch.service --since today
```

`abi-worker.service` bildirim/e-posta kuyruğunu başlangıçta ve her turdan 60 saniye sonra işler. `abi-source-watch.service` başlangıçta resmî kaynakları kontrol eder, tur bitiminden 86400 saniye sonra tekrarlar. Değişen kaynaklar ve kopyalanan koşullar **inceleme bekleyen taslaktır**; servisler kaynak veya çağrı yayımlamaz. Hata veya eski heartbeat gerçek `degraded` durumunu korur; yalnız process'in çalışıyor olması başarı değildir.

Kullanıcı oturumu kapandıktan sonra ve açılışta çalışmak için systemd kullanıcı yöneticisinin açık kalması gerekir (`loginctl show-user "$USER" -p Linger`). Yerel kurulumda linger açıktır; bu, Docker konteynerlerinin veya AI servisinin yeniden başlatma politikasını değiştirmez. İşçileri durdurmak/devre dışı bırakmak için:

```sh
systemctl --user disable --now abi-worker.service abi-source-watch.service
```

### İşletim durumu

`GET /api/health` yalnız process canlılığını bildirir. `GET /api/ready` DB/özel depo hazırlığına göre 200/503 verir; başarısız/güncel olmayan işçiler ve kontrol edilmiş servis hataları `degraded` olur. OCR executable/dil verileri ve yerel AI modelinin varlığı kontrol edilir. SMTP/haricî AI yapılandırması başarılı teslimat/provider çağrısı sayılmaz: kullanılabilirlik henüz doğrulanmadıysa **Kontrol edilmedi** gösterilir. Sistem yöneticisi yalnız toplu sayımlar ve bu metaveriyi görür; tenant belge/sohbet içeriğine üyelik olmadan erişemez.

Yedek/geri yükleme CLI başarıları özel depodaki `.backup-status.json` içinde yalnız zaman damgalarıyla kayıtlıdır; dosya yolu/anahtar gösterilmez. Kayıt yoksa konsol **Kayıt yok** der. Bir zaman damgası, güncel yedek veya başarılı kurtarma tatbikatı garantisi değildir.

### Rapor ingestion

```sh
make -C backend ingest PDF=/absolute/path/report.pdf REPORT_ID=rapor-1 AI_POLICY=local
```

Chunk, embedding modeli/boyutu, kaynak hash’i, rapor sürümü ve playbook aynı transaction içinde yayımlanır. Başarısız yeniden ingestion önceki iyi sürümü bozmaz. Eski sürümün provenansı bilinmeyen RAG satırları `*_legacy` tablolarda korunur fakat yeni analizde kullanılmaz. Taranmış raporu önce yerel OCR’dan geçirin. Rapor analizi alıntıları gerçek chunk metniyle doğrular; bozuk alıntı başarı sayılmaz.

## Güvenlik ve veri yaşam döngüsü

- HttpOnly/SameSite oturum, sunucuda sahiplik/rol/Pro kontrolleri, CSRF ve açık Origin sınırı; auth IP/e-posta throttling.
- Dosyalar webroot dışında özel depoda, içerik hash kontrolüyle tutulur; içerik seçimi doğrulama değildir.
- Haricî belge içerikleri/PDF/DOCX/XLSX/ZIP/görseller sınırlanır; tehlikeli XML/makro/içerik-tür uyuşmazlıkları reddedilir.
- API yanıtları no-store; doğrulama hataları parola/proje girdisini geri yansıtmaz. AI sağlayıcı hata içerikleri loglanmaz.
- Veri dışa aktarımı ve yetkili silme var. Çalışma alanı silinmeden veya sahiplik devredilmeden son sahibi olan kullanıcı hesabını silemez. DB silmesi commit olduktan sonra orijinal dosyalar kaldırılır.
- Dosya/DB **diskte otomatik şifrelenmiş değildir**; yayın ortamında şifreli disk/depo, erişim ve yedek politikası ayrıca yapılandırılmalıdır. KVKK/GDPR hukuki uygunluk onayı iddia edilmez.
- İnternete doğrudan açmayın. HTTPS reverse proxy, `PUBLIC_APP_URL=https://...`, `SESSION_COOKIE_SECURE=true`, doğru `CORS_ORIGINS`, gerçek SMTP ve işletim kontrolleri gerekir. `Caddyfile.example` örnektir, yayına alınmış değildir.

### Gerçek yedek ve geri yükleme

Önce uygulamayı ve bütün worker’ları durdurun. SQL ile dosya durumlarının tutarlı olması gerekir.

```sh
.venv-menu/bin/python -m backend.backup --app-stopped create /private/backup.tar.gz
.venv-menu/bin/python -m backend.backup --app-stopped restore /private/backup.tar.gz \
  --target-database-url 'postgresql+asyncpg://user:password@host/empty_db' \
  --target-storage /private/empty-files
```

Geri yükleme boş hedef ister; mevcut kayıtları temizleyen `--clean` kullanmaz. Yedek manifest, PostgreSQL dump’ı ve orijinal özel dosyaları birlikte içerir. Depo ve DB ayrı hedefte yeniden açılıp gerçek orijinal indirmeyle kontrol edilmelidir. Bu build’de bu geri yükleme senaryosu çalıştırıldı.

## Ekran bazlı JS yükleme

Oturum, iki ana gezinme ve giriş formu ilk pakettedir. Proje ekranları, fikir/rapor oturumları, Tiptap tabanlı zengin belge editörü ve yönetim araçları ihtiyaç anında yüklenir. Editör kodu ilk girişte indirilmez. `Suspense` yalnız ilgili içeriği kapsar; ana gezinme yerinde kalır.

Son üretim build'inde ilk JS paketi 413,97 kB (gzip 131,37 kB), zengin belge editörü parçası 478,20 kB (gzip 153,75 kB). Bu ilk yük ertelemesidir; bütün kodun toplamı için küçülme iddiası değildir. Zod kaynak yorumlarından iki Rollup annotation uyarısı sürer; büyük chunk eşiği yükseltilmedi.

## Doğrulama

```sh
bun run check
uvx ruff check backend
.venv-menu/bin/python -m unittest discover -s backend/tests -v
uvx pip-audit -r backend/requirements.lock
bun audit
uvx bandit -r backend -x backend/tests,backend/alembic -f screen
```

PostgreSQL sınır/kota/worker testleri için **ayrı, boş ve migration yapılmış test veritabanını** açıkça verin. Tarayıcı kabul kayıtları veya gerçek e-posta kuyruğunu bu DB’ye koymayın; worker testi başka kullanıcının mailini seçebilir. Test DB’si üretim veya tarayıcı kabul DB’sinden ayrıdır:

```sh
ABI_TEST_DATABASE_URL='postgresql+asyncpg://user:password@host/abi_tests' \
  .venv-menu/bin/python -m unittest discover -s backend/tests -v
```

Bu yeniden tasarımda **27 frontend ve 165 backend davranış testi** (ayrı migration'lı PostgreSQL dahil), frontend/backend lint, TypeScript ve üretim build'i geçti. Gerçek yerel modelle fikir sohbeti/kapsam önerisi, insan onayı, ayrı rapor konuşmaları, başlığı konuşmada tarif ederek taslak yazımı ve açık uygulama talimatı çalıştırıldı. Tarayıcıda otomatik kayıt/tablo/reload, başlık ekleme, biçimlendirilmiş Unicode PDF/DOCX indirme, çoklu fon grubu, kaynaklı bölge ayrımları, görev ekleme, kapsam değişince inceleme işareti ve kayıt hatasında çıkış engeli doğrulandı. TR/EN, açık/koyu, masaüstü/mobil yüzeyler açıldı. Migration öncesi DB+dosya yedeği ayrı boş hedefte 0004 şeması ve aynı proje hash'iyle geri yüklendi; canlı DB 0005'e geçirildi. Bun/pip bağımlılık auditleri ve Bandit temiz geçti. Önceki başvuru inceleme/paket güvenlik testleri korunur; bütün resmî portallar, gerçek ödeme, haricî sağlayıcı ve internete açık HTTPS dağıtımı bu değişiklikte doğrulanmış değildir.

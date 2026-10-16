# Abi

Girişimciler ve şirket ekipleri için kaynaklı fon keşfi, proje yazımı ve başvuru hazırlama çalışma alanı. React/Vite + FastAPI + PostgreSQL/pgvector. Şirket kurmadan kişisel hesap açılabilir.

Bu yerel teslimatın kaynak, build ve çalışma dizini **`/home/emre/Projects/abi`**. `abi-upgrade` çalıştırma veya teslimat hedefi değildir. `dist/` bu dizinde üretilir; FastAPI aynı dizinin build’ini sunar.

Çalışma alanı yükseltmesi `upgrade/workspace-build` dalında yayımlandı; güncel menü/hesap geliştirmeleriyle birleşen devam dalı `upgrade/menu-workspace-execution`. Klasörler arasında dosya kopyalamak yerine bu dizinde Git pull/merge kullanın. `abi.service` ve `abi-worker.service` bu dizinin `.venv-menu` ortamını çalıştırır.

## Bu build’in kapsamı

- **Free:** kalıcı kişisel projeler, sohbet ve yapılandırılmış profil, kullanıcı onaylı AI profil önerileri, düzenlenebilir genel proje taslağı, gerçek DOCX/PDF indirme ve resmî kaynaklı fon keşfi.
- **Pro:** çalışma alanı başına en fazla üç üye, kaynak/sürüm bağlı uygunluk değerlendirmesi, bütçe kontrolleri, özel belge deposu ve yerel OCR, belge AI önerileri, çağrı dilinde başvuru yazımı, görev/yorum/inceleme, insan onayından sonra DOCX/PDF/ZIP hazırlama paketi.
- **Uygunluk:** deterministik koşullar geçti/kaldı/bilgi eksik/inceleme gerekli olarak değerlendirilir. Sıralama puanı destek kazanma olasılığı değildir. Eksik bilgi ve yoruma açık koşullar kesin uygunluk sayılmaz. İnsan incelemesi kayıtlı ve atıflıdır; resmî kurum kararı değildir.
- **Sürümleme:** proje revizyonu, çağrı/kural/kaynak sürümü ve değerlendirme zamanı saklanır. Düzenleme onayı geçersizleştirir; eski değerlendirme sessizce değiştirilmez.
- **Gerçek ürün verisi:** dashboard faaliyetleri, kalıcı şirketleşme öz-kontrolü, görevler, e-posta tercihleri ve gerçek görev/çağrı tarihlerinden ICS aktarımı. Sahte örnek faaliyetler yoktur.
- **Dil/erişim:** Türkçe/İngilizce arayüz, açık/koyu tema ve mobil klavye erişimi. Başvuru yazımı çağrının yayımlanmış dilini kullanır ve final onayında dil incelemesi gerekir.

### Menü ve kalıcı URL’ler

| Menü | Bölümler |
|---|---|
| Özet | Sıradaki iş, projeler, başvuru durumları, yaklaşan tarihler, kullanım ve atıflı faaliyetler |
| Projeler | Genel bakış, profil, sohbet, Free taslak, Pro bütçe, uygunluk ve revizyon farkları |
| Fon keşfi | Ülke, kaynakta belirtilen başvuru sahibi, destek türü, çağrı durumu; program/çağrı ve resmî kaynak ayrıntıları |
| Başvurular | Genel bakış/sorumlu, metin, ayrı başvuru bütçesi, gerçek belge referansları, kontroller, inceleme ve paket |
| Belgeler | Çalışma alanı özel kasası; orijinal dosya, çıkarılmış metin/OCR, düzenlenebilir AI önerisi ve atıflı inceleme |
| Görevler | Bana atananlar, tüm/proje görevleri, gerçek başvuru/belge bağlantıları, yorum ve değişiklik geçmişi |
| Takvim | UTC ay/liste, proje/tür/Bana atanan filtreleri; bütün görünüm veya seçilmiş kayıtların ICS aktarımı |

Çalışma alanı ayarları, kişisel hesap/bildirimler, Yardım ve sistem yöneticisi konsolu ayrı URL’lerdedir. Hesap ve bildirimler proje seçimi istemez; fon keşfi Free’de açık kalır. Free’ye geçiş geçmiş kayıtları silmez; yeni Pro işlemlerine izin vermez. Pro planı viewer rolüne yazma/onay yetkisi vermez.

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

Üretim build’i FastAPI üzerinden **http://127.0.0.1:8001** adresinde açılır. Yerelde komutları `/home/emre/Projects/abi` içinde çalıştırın: `make build`, `make migrate`, `make dev`. `make dev-frontend` geliştirme için 3000 portunda çalışır ve `/api` isteklerini 8001’e yönlendirir. Veritabanı şemasının tek otoritesi Alembic’tir; uygulama açılışı tablo oluşturmaz. Güncel geçiş `0004_task_context`; nullable görev bağlantıları ve başvuru sorumlusu ekler, mevcut kayıtları silmez. Migration yapılmamışsa başlangıç hata verir.

### Yerel AI

Bu makinede kurulmuş servis 11435 loopback portunda, `OLLAMA_NO_CLOUD=true` ile çalışır. `qwen3:1.7b` ve `embeddinggemma` yerel modelleri kullanılır. Ollama için `LOCAL_AI_REASONING_EFFORT=none` açık sağlayıcı seçeneğidir; başka sağlayıcıda uygun şekilde değiştirin. Küçük CPU modelinin yazım kalitesi uzman incelemesi gerektirir; yerel başarı doğruluk garantisi değildir.

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

Oturum, ana gezinme, giriş formu ve başlangıç özeti ilk pakette kalır. Hesap/yönetici/başvuru/belge/görev/takvim/fon ekranları; proje profil/sohbet/taslak/bütçe/uygunluk/geçmiş bölümleri ve ekip/kuruluş rehberi açıldığında `React.lazy` ile yüklenir. `Suspense` yalnız ilgili içeriği kapsar; menü, üst çubuk ve kaydedilmemiş değişiklik koruması yükleme sırasında yerinde kalır. Menü/bölüm kimlikleri eski ekranın yükleme sırasında görünmesini engeller; başvuru sekmelerinin ortak düzenleme state’i korunur.

| JS çıktısı (ondalık kB) | Önce | Sonra |
|---|---:|---:|
| İlk paket | 651.05 | 418.37 |
| İlk paketin gzip boyutu | 197.97 | 131.94 |
| Bütün JS parçaları toplamı | 651.05 | 658.46 |

Bu, toplam kodu küçültmekten çok ilk yükü ertelemektir: açılmayan ekranlar başlangıçta indirilmez. İlk ham yük %35,7, gzip boyutu %33,4 azaldı; parçalama metadata’sı toplam JS’yi yaklaşık %1,1 artırdı. Gzip rakamları build ölçümüdür; FastAPI’nin mevcut statik sunumu için sıkıştırılmış HTTP aktarım iddiası değildir. Vite büyük chunk uyarısı artık yok; eşik yükseltilmedi. Zod bağımlılığının yorum konumundan kaynaklanan Rollup annotation uyarısı sürüyor.

Gerçek tarayıcıda soğuk giriş/özetin yalnız ilk JS paketini istediği, proje ekranlarının açılınca indirilmesi, yavaş ağda loading+ana menü, stay/discard, kayıt sonrası reload, doğrudan detay URL’leri ve mobil gezinme doğrulandı. Bu değişiklik backend/schema, ödeme, portal gönderimi veya yayın ayarlarını değiştirmez.

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

Bu menü teslimatında üretim build’i, **23 frontend ve 114 backend davranış testi** (ayrı, boş ve migration’lı PostgreSQL dahil) geçti. Gerçek tarayıcıda Free DOCX/PDF; Pro kaynak yayını → uygunluk/atıflı inceleme → metin/belge → insan/dil onayı → ZIP; bütçe aktarımı; kaydedilmemiş içerik koruması; geciken yanıtla çalışma alanı izolasyonu; tipli nesne/listeler; özel dosya, yerel OCR ve AI belge önerisi; görev/belge/başvuru bağlantıları ve atıflı geçmiş; kaynaklı önkayıt/Bana atanan/seçili ICS; e-posta doğrulama ve gerçek tek kullanımlık parola kurtarma; bildirim okuma; DB+özel dosya yedek/geri yükleme ve aynı SHA-256 ile orijinal indirme doğrulandı. JS/Python bağımlılık auditleri ve Bandit temiz geçti. Son ekran bazlı yükleme değişiminde Biome, TypeScript, 23 frontend testi, production build ve gerçek tarayıcı smoke yeniden geçti; backend değişmedi. Bütün resmî portal akışları, ödeme tahsilatı, SMTP/haricî AI yayın sağlayıcısı ve internete açık HTTPS dağıtımı doğrulanmış değildir.

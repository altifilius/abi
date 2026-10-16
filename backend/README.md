# Abi backend

Kaynak, build ve çalıştırma hedefi `/home/emre/Projects/abi`. Tam ürün kapsamı, güvenlik sınırları ve işletim yönergeleri için [ana README](../README.md) kullanılır.

## Kurulum ve çalıştırma

Aşağıdaki komutları proje kökünde çalıştırın:

```sh
make install
# Yalnız ilk kurulumda backend/.env.example dosyasından backend/.env oluşturun.
# Mevcut .env dosyasını ezmeden gerçek bağlantı ve servis ayarlarını yapılandırın.
make migrate
make seed
bun run build
make dev
```

Python ortamı `.venv-menu`; FastAPI üretim build'ini ve `/api` uçlarını `http://127.0.0.1:8001` üzerinden sunar. Vite geliştirme sunucusu `make dev-frontend` ile 3000 portunda açılır ve `/api` isteklerini 8001'e yönlendirir.

Şemanın tek otoritesi Alembic'tir. Güncel revision `0004_task_context`; uygulama açılışta tablo oluşturmaz ve eski şemayı kabul etmez. Mevcut kayıtları silerek veya revision damgasını değiştirerek bu kontrolü atlamayın.

## Servis ayarları

- Gerçek DB/AI/SMTP bağlantıları Git dışında tutulan `backend/.env` içindedir; örnek alanları için `backend/.env.example` kullanılır.
- AI sağlayıcısı ve modeli açıkça yapılandırılır. Çalışma alanının `local` politikası haricî sağlayıcıya sessiz geçiş yapmaz.
- Özel dosyalar `STORAGE_ROOT` altında, webroot dışında saklanır. OCR yerel Tesseract ve yapılandırılmış dil verilerini kullanır.
- `GET /api/health` process canlılığıdır; `GET /api/ready` DB/depo hazırlığını ve diğer servislerin ayrı durumlarını verir.
- Kalıcı e-posta/hatırlatma işçisi `make reminders` ile çalışır; yapılandırma tek başına başarılı teslimat değildir.

## Rapor ingestion ve doğrulama

```sh
make -C backend ingest PDF=/absolute/path/report.pdf REPORT_ID=rapor-1 AI_POLICY=local
ruff check backend
.venv-menu/bin/python -m unittest discover -s backend/tests -v
```

Ingestion kaynak hash'i, rapor/politika/model/boyut sürümleriyle atomiktir. Gerçek PostgreSQL davranış testleri için `ABI_TEST_DATABASE_URL` yalnız ayrı, boş ve migration yapılmış test veritabanını göstermelidir; canlı veya tarayıcı kabul veritabanını kullanmayın.

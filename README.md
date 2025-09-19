Berikut langkah ringkas untuk menjalankan di folder ethereum-caliper-workspace. Ada dua cara: langsung di host (paling sederhana) atau via Docker Compose (containerized).

Prasyarat

Node.js 18+ dan npm.
Docker + Docker Compose.
jq terpasang (untuk script).
Jaringan blockchain Geth PoA/PoS sudah jalan. Untuk PoA, jalankan dulu project tetangga blockchain-poa-geth agar network blockchain_sut_net terbentuk dan node nonsigner1 tersedia.
Sebelum Mulai

Install dependency: cd ethereum-caliper-workspace && npm install
Pastikan .env sudah benar:
CONSENSUS sesuai jaringan (PoA/PoS).
Endpoint node:
Host mode: NODE_URL="ws://localhost:8557" dan BLOCKCHAIN_NODE_URL="http://localhost:8545" atau ws://localhost:8557 (sesuaikan).
Docker mode: gunakan hostname service di network blockchain, mis. BLOCKCHAIN_NODE_URL="http://nonsigner1:8545".
Keystore:
Host mode: KEYSTORE_SRC_PATH gunakan path host, contoh .../blockchain-poa-geth/data/signer1/keystore.
Docker mode: karena folder itu di-mount ke container di /blockchain-poa-geth, set ke KEYSTORE_SRC_PATH="/blockchain-poa-geth/data/signer1/keystore".
Database:
Host mode: jalankan Postgres dari docker-compose.yml di folder ini dan samakan nama DB. Contoh set:
POSTGRES_DB=postgreskripsi
DATABASE_URL=postgresql://maul:passMaul1234@localhost:5432/postgreskripsi?schema=public
Docker mode: gunakan service DB internal caliper: DATABASE_URL=postgresql://caliper_user:YourStrongPassword@caliper-db:5432/caliper_db?schema=public
Jalankan salah satu dari dua alur berikut.

Alur A — Jalankan di Host (paling cepat)

Start Postgres lokal: docker compose up -d (pakai docker-compose.yml di folder ini). Pastikan POSTGRES_DB dan DATABASE_URL konsisten.
Deploy schema Prisma: npx prisma migrate deploy
Export env agar run_pipeline.sh bisa baca variabel: set -a && source .env && set +a
Jalankan pipeline otomatis:
bash run_pipeline.sh
Script ini akan:
Ekstrak private key dari KEYSTORE_SRC_PATH
Deploy kontrak (deploy-contracts.js) → menghasilkan deployed-contracts.json
Generate network config (networks/ethereum-poa-config.json atau ethereum-pos-config.json)
Generate benchmark config dari scenarios.json
Jalankan Caliper (npx caliper launch manager)
Simpan report ke reports/*.html dan log ke DB via Prisma
Cek hasil:
Report: reports/report-A0-trial-1.html (default skenario A0)
Tabel DB: ExperimentResult (schema Prisma)
Catatan:

Kalau hanya mau manual per langkah, Anda bisa jalankan urut:
node deploy-contracts.js
node generate-network-config.js
node generate-benchmark-config.js --scenario A0 --output benchmarks/A0-benchmark.yaml
npx caliper launch manager --caliper-workspace . --caliper-networkconfig networks/ethereum-poa-config.json --caliper-benchconfig benchmarks/A0-benchmark.yaml --caliper-report-path reports/report-A0.html --caliper-flow-skip-install
node log-to-db.js reports/report-A0.html benchmarks/A0-benchmark.yaml 1
Alur B — Jalankan via Docker Compose (containerized)

Pastikan stack blockchain jalan (folder blockchain-poa-geth):
Setup PoA (sekali): ./setup-network-poa.sh
Start: docker compose -f docker-compose.poa.yml up -d
Ini akan membuat network eksternal ${COMPOSE_PROJECT_NAME:-blockchain_sut}_net yang akan dipakai Caliper.
Sesuaikan .env untuk container:
KEYSTORE_SRC_PATH="/blockchain-poa-geth/data/signer1/keystore"
BLOCKCHAIN_NODE_URL="http://nonsigner1:8545"
DATABASE_URL="postgresql://caliper_user:YourStrongPassword@caliper-db:5432/caliper_db?schema=public"
Build & jalankan Caliper + DB internal:
docker compose -f docker-compose.caliper.yml up --build
Container caliper_benchmark akan menjalankan run_pipeline.sh otomatis.
Jika perlu, jalankan migrasi Prisma di dalam container (sekali):
docker compose -f docker-compose.caliper.yml run --rm caliper-benchmark npx prisma migrate deploy
Cek hasil di host:
Report: ethereum-caliper-workspace/reports/*.html
Tips & Masalah Umum

Kontrak gagal deploy: pastikan akun punya ETH di jaringan Anda, PRIVATE_KEY sesuai, dan NODE_URL/BLOCKCHAIN_NODE_URL reachable.
DB error saat logging: pastikan DATABASE_URL benar dan DB sudah dibuat/migrasi dijalankan.
Network tidak nyambung di Docker: pastikan network eksternal blockchain_sut_net ada (dibuat oleh stack blockchain) dan service nonsigner1 berjalan.
Ganti skenario uji:
- Gunakan skenario `LAM` untuk rangkaian mint/baca/burn Sertifikat LAM (butuh hasil mint untuk menentukan `totalTokens` dan rentang burn).
 ubah CORE_SCENARIOS di run_pipeline.sh atau panggil generator benchmark dengan --scenario yang diinginkan (lihat scenarios.json).
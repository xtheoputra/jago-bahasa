# 📝 Catatan Sesi Pengembangan — Jago Bahasa

Dokumen ini merangkum sesi percakapan saat aplikasi **Jago Bahasa** dibangun
bersama Claude Code, agar konteks dan keputusan desain tersimpan dalam repositori.

---

## Tujuan dari Pengguna

> "Buatkan website PWA, tujuan saya ingin membuat media pembelajaran saya di
> berbagai bahasa di dunia, buatkan secara professional dan internasional,
> dengan website yang sangat bagus dari segi aturan, dan UI/UX."

Permintaan lanjutan:
1. Menjelaskan cara membuka aplikasi dan menyediakan **satu file start** (dibuat: `START.bat`).
2. Menyimpan seluruh sesi ke **git lokal** dan **GitHub online** (dokumen ini bagian dari itu).

---

## Apa yang Dibangun

Sebuah **Progressive Web App (PWA)** pembelajaran bahasa dunia, dibuat dengan
**vanilla HTML + CSS + JavaScript** (tanpa framework, tanpa build step) agar
ringan, cepat, portabel, dan mudah dirawat.

### Fitur
- 🌍 **8 bahasa**: Inggris, Spanyol, Prancis, Jerman, Jepang, Korea, Mandarin, Arab — dengan romanisasi untuk aksara non-Latin dan dukungan RTL untuk Arab.
- 🃏 **Flashcard** animasi balik 3D + navigasi keyboard.
- 🧠 **Kuis** pilihan ganda otomatis dengan cincin skor & XP.
- 🔊 **Pelafalan audio** via Web Speech (text-to-speech) per bahasa.
- 🏅 **Gamifikasi**: XP, level, streak harian, pencapaian, confetti.
- 🌐 **Antarmuka 3 bahasa** (Indonesia / English / Español) yang dapat diganti.
- 🌙 **Mode terang/gelap** mengikuti sistem + toggle manual.
- 📡 **Offline & installable**: service worker (cache offline-first) + manifest + ikon maskable.
- 🔒 **Privat**: seluruh progres disimpan lokal (localStorage), tanpa akun/server.
- ♿ **Aksesibilitas**: skip-link, `:focus-visible`, `prefers-reduced-motion`, ARIA.

### Struktur Proyek
```
Jago Bahasa/
├── index.html              # App shell
├── manifest.webmanifest    # Metadata PWA
├── sw.js                   # Service worker (offline-first)
├── server.js               # Server statis zero-dependency
├── START.bat               # Klik dua kali untuk menjalankan
├── package.json
├── README.md
├── css/styles.css          # Design system
├── js/i18n.js              # Antarmuka multi-bahasa
├── js/data.js              # Konten kursus & pelajaran
├── js/app.js               # Router SPA, flashcard, kuis, gamifikasi, PWA
├── icons/icon.svg
├── icons/maskable.svg
└── docs/SESSION-LOG.md     # Dokumen ini
```

### Keputusan Desain Utama
- **Tanpa framework / build step** → portabel ke hosting statis mana pun (GitHub Pages, Netlify, Vercel) dan mudah dipahami.
- **Server statis sendiri (`server.js`)** karena PWA butuh `http://` (service worker tidak jalan di `file://`).
- **Konten terpisah di `js/data.js`** → menambah bahasa/pelajaran cukup edit satu file, kuis & flashcard menyesuaikan otomatis.
- **Arti kosakata multi-bahasa** (id/en/es) agar benar-benar internasional.

---

## Cara Menjalankan
- Klik dua kali **`START.bat`** (otomatis membuka browser), atau
- `npm start` lalu buka `http://localhost:5273`.

> Port 5273 dipakai karena 5173 sedang digunakan proyek lain di mesin pengembang.

---

---

## Pembaruan v2.0 — Akun, Keamanan & Refactor (2026-06-26)

Permintaan pengguna: *"lengkapi website ini menjadi website internasional, lancar, clean code, dengan keamanan, otorisasi user password login dan register, professional."*

Pendekatan yang dipilih: **hybrid auth** (tetap jalan di GitHub Pages, plus backend opsional).

### Yang ditambahkan
- **Autentikasi hybrid**:
  - *Mode lokal* (GitHub Pages): daftar/masuk di browser, sandi di-hash **PBKDF2-HMAC-SHA256 (600k iterasi)** via Web Crypto, disimpan di **IndexedDB**. Sesi dengan kedaluwarsa + "tetap masuk".
  - *Mode cloud* (backend opsional): **scrypt**, sesi **cookie httpOnly/Secure/SameSite**, **CSRF double-submit**, **rate-limit**, **header keamanan/CSP**, store JSON atomik. Frontend memilih provider via probe `GET /api/health`.
- **Halaman akun**: ubah profil, ganti sandi (mencabut sesi perangkat lain), ekspor/impor data, hapus akun, indikator sinkronisasi.
- **Progres per-akun** (namespaced) + merge progres tamu → akun sekali saat sign-in.
- **Refactor clean-code**: `app.js` (IIFE 785 baris) dipecah menjadi ES modules (`core/`, `auth/`, `views/`, `chrome.js`, `pwa.js`). Shuffle kuis diperbaiki → Fisher–Yates kriptografis.
- **Keamanan**: CSP + framebuster (hash), path-traversal & blokir `data/`/`server/`, batas ukuran body, escaping XSS menyeluruh, anti-enumerasi login.
- **Internasional**: 8 → **12 bahasa** (+ Italia, Portugis, Rusia, Hindi). Ikon **PNG asli** (180/192/512 + maskable) untuk iOS.
- **PWA**: SW v2 (precache modul, `/api` network-only, fallback aset 404 bukan HTML), prompt update.

### Proses
Dibangun dengan orkestrasi multi-agen (ultracode): workflow **desain/analisis-risiko** (4 lensa) → implementasi → workflow **review adversarial** (4 dimensi, find→verify) yang mengonfirmasi 16 temuan; semuanya diperbaiki & diverifikasi (backend diuji end-to-end via curl).

---

## Pembaruan v2.1 — Konten Kosakata & Hardening iOS/Safari (2026-07-13)

Permintaan pengguna: *"tambahkan yang banyak kosakata, dengan bahasa korea sebagai prioritas, bahasa percakapan pekerjaan, dan bahasa ticketing pesawat, refund dan contohnya"* dan *"harus bisa berjalan di iphone 8 keatas dengan baik ... iphone 10-11 keatas, dan harus bisa bekerja di safari browser."*

### Konten kosakata (`js/data.js`)
- **Bahasa Korea (prioritas)** — 3 pelajaran baru, **+47 kosakata**, semua dengan contoh kalimat (Hangul + romanisasi + arti id/en/es):
  - 💼 `work` — Percakapan di Kantor (menengah, 15 kata)
  - ✈️ `ticket` — Tiket Pesawat & Bandara (menengah, 16 kata)
  - 💸 `refund` — Refund & Pembatalan (lanjutan, 16 kata)
- **Bahasa Inggris** — 3 pelajaran bertema sama, **+45 kosakata** dengan contoh (praktis untuk konteks kerja & penerbangan lintas negara).
- Level kesulitan baru **`advanced`** ("Lanjutan"/"Advanced"/"Avanzado") ditambahkan ke `js/i18n.js`.
- Divalidasi: import ESM bersih (338 total item, tidak ada arti/contoh/romanisasi hilang) + smoke test HTTP.

### Hardening iOS/Safari (`css/styles.css`, `sw.js`)
Target: **iPhone 8+ (baseline iOS 16)** & **iPhone X/11+** di Safari.
- `.appbar` → `padding-top: env(safe-area-inset-top)` agar notch iPhone X/11+ tak menutupi bar (mode standalone).
- Fallback `background: var(--surface)` sebelum `color-mix()` di `.appbar`, `.bottomnav`, & border danger (`color-mix()` butuh iOS 16.2 → iPhone 8 di iOS 16.0/16.1 tetap dapat bar bertint).
- `-webkit-transform-style: preserve-3d` di `.flashcard__inner` agar flip 3D andal di Safari.
- SW `VERSION` `jb-v2.0.1` → `jb-v2.0.2` untuk memaksa refresh cache CSS/data.

Catatan: belum diuji di perangkat iOS asli (analisis kode + cek brace/smoke test). Install di iOS tetap manual (Share → Add to Home Screen). Wajib HTTPS untuk `crypto.subtle` + Service Worker.

### Ide lanjutan (untuk sesi berikutnya)
- Replikasi tema `work`/`ticket`/`refund` ke bahasa lain (Jepang & Mandarin paling relevan).
- Petunjuk "Add to Home Screen" khusus iOS (karena `beforeinstallprompt` tak ada di iOS).
- Uji langsung di iPhone via URL HTTPS GitHub Pages.

---

## Pembaruan v2.2 — Kamus Korea & Inggris Tingkat Ahli (2026-07-14)

Permintaan pengguna: *"perkaya lagi kamus bahasa, dengan korea dan inggris sebagai prioritas, se profesional dan se canggih mungkin, kebutuhan expert untuk belajar korea dan inggris, mulai dari basic sampai yang tertinggi."*

### Dua tingkat kesulitan baru (`js/i18n.js`)
Jenjang diperluas dari 4 → **6 level** agar ada tangga "basic sampai tertinggi", ditambahkan ke ketiga bahasa UI:
- `proficient` — **Mahir** / Proficient / Competente (setara C1)
- `expert` — **Ahli** / Expert / Experto (setara C2)

### Konten kosakata (`js/data.js`) — semua trilingual (id/en/es), mayoritas dengan contoh kalimat
- **Bahasa Korea (prioritas)** — 8 pelajaran baru, disisipkan sesuai urutan level menaik (Hangul + romanisasi RR + arti + contoh):
  - 🍚 `food` — Makanan & Restoran (dasar)
  - 🧭 `direction` — Arah & Transportasi (menengah)
  - 😊 `emotion` — Perasaan & Emosi (menengah)
  - 📧 `business` — Bisnis & Email Formal (lanjutan; honorifik bisnis: 담당자·회신·결재·감사드립니다)
  - 🏦 `bank` — Perbankan & Keuangan (lanjutan; 입금·출금·송금·환율·대출)
  - 🗣️ `idiom` — Peribahasa & Idiom (mahir; 속담/관용구: 눈치가 빠르다·티끌 모아 태산·우물 안 개구리)
  - 🙇 `honorific` — Honorifik & Tingkat Tutur (ahli; 존댓말/반말, 계시다·잡수시다·주무시다·께서·-(으)시-)
  - 🎓 `academic` — Kosakata Akademis & Formal (ahli; 그러므로·따라서·영향을 미치다·요약하면)
- **Bahasa Inggris** — 9 pelajaran baru, jenjang basic → tertinggi:
  - 🍽️ `food` (dasar) · 🧭 `city` (dasar)
  - 🔗 `phrasal` — Phrasal Verbs (menengah, tiap kata + contoh) · 🧑 `describe` — Describing People (menengah)
  - 📈 `business` — Business & Negotiation (lanjutan) · 📝 `academic` — Academic & Formal Writing (lanjutan)
  - 🗣️ `idiom` — Idioms & Collocations (mahir) · 💎 `nuance` — Nuanced C2 Vocabulary (ahli) · 🎯 `discourse` — Discourse Markers & Rhetoric (ahli)
- Untuk kosakata tingkat ahli, kolom arti Inggris (`m.en`) diisi definisi/sinonim singkat (mis. *Meticulous → "Extremely careful and precise"*) sebagai bantuan belajar monolingual.

### Validasi
- Import ESM bersih: **12 kursus, 59 pelajaran, 519 item, 254 contoh** — 0 error, 0 warning (cek: tiap item punya `term` + `m.{id,en,es}`, tiap `ex` lengkap, tak ada id pelajaran/term ganda per course, setiap `level` punya kunci `diff.*` di 3 bahasa UI).
- Total kini: **Korea 14 pelajaran / 149 kata**, **Inggris 15 pelajaran / 165 kata**.
- `node --check` untuk `data.js` & `i18n.js` (via salinan `.mjs`) — sintaks OK. Smoke test HTTP: `/`, `/js/data.js`, `/js/i18n.js`, `/sw.js` → semua 200.
- SW `VERSION` `jb-v2.0.2` → `jb-v2.1.0` agar cache `data.js`/`i18n.js` ter-refresh di klien lama.

Catatan: belum diuji klik di perangkat asli; verifikasi lewat import/validasi struktur + smoke test HTTP.

---

*Dirangkum oleh Claude Code — sesi awal 2026-06-24, pembaruan v2.0 2026-06-26, v2.1 2026-07-13, v2.2 2026-07-14.*

---

## Pembaruan v2.3 — Grammar, Tema Baru, Kamus Cari & Latihan SRS (2026-07-14)

Permintaan pengguna: *"lanjutkan apa yang dapat ditambahkan / ide"* → dipilih **keempat** arah: fitur Kamus/Cari, Latihan pintar (SRS + isian), Tata bahasa Korea & Inggris, dan lebih banyak kosakata tema. Dikerjakan berurutan, tiap tahap divalidasi & di-commit terpisah.

### 1. Konten: grammar + tema (`js/data.js`) — commit konten
- **Korea (+6 pelajaran):** 🧩 Partikel & Pola (은/는·이/가·을/를·에·에서…), 🔧 Konjugasi & Kesopanan (~아/어요·~습니다·~았/었어요·~(으)ㄹ 거예요…), 🏥 Medis, 💻 IT, 🧑‍💼 Wawancara Kerja, 🎬 K-drama & bahasa gaul (대박·헐·꿀잼…).
- **Inggris (+5 pelajaran):** 🧩 Tenses & Grammar, 🏥 Medical, 💻 IT, 🧑‍💼 Job Interview, 📚 IELTS/TOEFL academic.
- Total konten kini **70 pelajaran / 629 item / 364 contoh** (Korea 20·209 kata, Inggris 20·215 kata). Validasi ESM 0 error.

### 2. Fitur Kamus/Cari (`js/views/dictionary.js`, route `#/search`) — commit fitur
- Meng-index seluruh 629 kosakata → pencarian langsung (debounce) atas istilah, romanisasi, 3 arti, & contoh; **tak sensitif diakritik** untuk Latin, cocok persis untuk Hangul/Han. Filter **bahasa + level + "ada contoh"**. Batas 200 hasil dengan pemberitahuan (tanpa potong senyap). TTS per-hasil (kode BCP-47 masing-masing). Tautan nav baru **Kamus** (atas + bawah).
- Uji harness DOM-stub: `refund`→17, `환불`→9, `annyeong`→3, expert+contoh→52.

### 3. Latihan SRS + Cloze (`js/views/practice.js`, `js/core/state.js`) — commit fitur
- **Review Harian (`#/review`):** penjadwalan **SM-2-lite** atas kata dari pelajaran yang sudah selesai. Kartu baru langsung jatuh tempo; tombol Ulang/Sulit/Bagus/Mudah menyesuaikan interval + ease & tanggal jatuh tempo berikutnya. "Ulang" muncul lagi dalam sesi; "belajar lebih awal" bila tak ada yang due. Selesai → XP (dibatasi) + streak. `state.srs` namespaced per-user + ikut merge/sinkron. Pintu masuk: CTA di Beranda (with due count), tombol di Progres. Keyboard: Spasi buka, 1–4 nilai.
- **Cloze/Isian (`#/cloze/:cid/:lid`):** isian dari kalimat contoh (blanking cerdas menangani "to <verb>" & aksara non-Latin), 4 pilihan; fallback bila tak ada contoh. Tombol "Isian" muncul di pelajaran hanya jika ada contoh.
- Uji unit SRS (pool/due/grade/ease/interval/XP/snapshot) lolos; cloze mencakup 32/35 pelajaran ber-contoh (292 item).

### Umum
- 2 tier level baru sudah ada sejak v2.2 (Mahir/Ahli). i18n bertambah untuk search/review/cloze (id/en/es). SW `jb-v2.1.0` → **`jb-v2.3.0`** (via 3 commit). Divalidasi: `node --check` + smoke test HTTP 200 semua aset; belum diklik di perangkat asli.

---

*Diperbarui — v2.3 2026-07-14 (grammar+tema, Kamus, SRS+Cloze).*

---

## Pembaruan v2.4 — 8 Bahasa Baru + Perluasan 10 Bahasa Tipis (2026-07-15)

Permintaan pengguna: *"menambah bahasa dan pelajaran serta perbaiki jika ada bug"*. Dipilih (via konfirmasi): **tambah 8 bahasa baru** dan **perdalam semua 10 bahasa yang masih tipis**.

### Bahasa baru (8 kursus, aksara Latin + Thai)
Ditambahkan ke `COURSES` di `js/data.js`, masing-masing **6 pelajaran** (`greet`, `num`, `ess`, `food`, `city`, `family`) trilingual (id/en/es) dengan kalimat contoh pada tema `food` & `city`:
- 🇲🇾 **Melayu** (`ms`, ms-MY) · 🇳🇱 **Belanda** (`nl`, nl-NL) · 🇸🇪 **Swedia** (`sv`, sv-SE) · 🇹🇷 **Turki** (`tr`, tr-TR)
- 🇵🇭 **Tagalog** (`tl`, fil-PH) · 🇻🇳 **Vietnam** (`vi`, vi-VN) · 🇵🇱 **Polandia** (`pl`, pl-PL) · 🇹🇭 **Thai** (`th`, th-TH — tiap item ber-`reading` romanisasi RTGS)

### Perluasan 10 bahasa tipis (dari 3 → 7 pelajaran)
Tiap kursus berikut ditambah **4 pelajaran** (`food`, `city`, `family`, `time`) dengan contoh (yang non-Latin ber-`reading`):
- Latin: `es`, `fr`, `de`, `it`, `pt`
- Non-Latin: `ja` (romaji), `zh` (pinyin), `ar` (RTL + transliterasi), `ru`, `hi`

### Bug/robustness
- Tidak ditemukan bug fatal di kode (view/state/router bersih: cleanup listener via AbortSignal, escaping XSS, bonus kuis anti-farming).
- Batasan yang dijaga saat menulis konten: tiap pelajaran **≥4 item** (kuis butuh 4 opsi) & **tanpa arti duplikat per pelajaran** (agar opsi kuis tak ambigu) — divalidasi otomatis, 0 pelanggaran.

### Validasi
- Validator struktural (ESM): **20 kursus, 158 pelajaran, 1297 item, 530 contoh** — 0 error, 0 warning (cek: id unik, ≥4 item, trilingual lengkap, tiap `ex` lengkap, tiap `level` punya `diff.*` di 3 UI, tak ada arti duplikat/term duplikat per pelajaran).
- Uji fungsional: `findCourse`/`findLesson` untuk semua bahasa/pelajaran baru; simulasi **1297 set opsi kuis** semuanya tepat 4 opsi; romanisasi Thai lengkap; flag RTL Arab; pencarian kamus (`taksi`→17, `stasiun`→20).
- `node --check` OK; smoke test HTTP: `/`, `/js/data.js`, `/js/i18n.js`, `/js/views/*.js`, `/sw.js`, `/manifest.webmanifest`, `/api/health` → semua 200.
- Docs diperbarui: kartu "20 Bahasa Dunia" di Tentang (`learn.js`), tabel fitur `README.md`. SW `VERSION` `jb-v2.3.0` → **`jb-v2.4.0`** agar cache `data.js`/`i18n.js` ter-refresh di klien lama.

Catatan: belum diklik di perangkat asli; verifikasi lewat validasi struktural + uji fungsional + smoke test HTTP. Total kini **20 bahasa · 158 pelajaran · 1297 kosakata**.

---

*Diperbarui — v2.4 2026-07-15 (8 bahasa baru + perluasan 10 bahasa tipis).*

---

## Pembaruan v2.5 — Dialog Percakapan (chat A–B) di Semua Bahasa (2026-07-15)

Permintaan pengguna: *"selain kosakata tambahkan kalimat percakapan"* → dipilih: **dialog A–B bergaya chat** sebagai pelajaran baru, di **semua 20 bahasa**.

### Fitur (kode)
- **Model data:** pelajaran kini boleh punya `dialog: ["A","B",...]` yang paralel dengan `items` — tiap `item` adalah satu baris ucapan, tiap tag menandai penutur. Sumber tunggal (tanpa duplikasi teks): baris dialog otomatis jadi flashcard, kuis, dan masuk indeks Kamus.
- **Render:** `dialogHTML()` baru di `js/views/partials.js` menampilkan gelembung chat (A kiri, B kanan) dengan avatar penutur, romanisasi (bila ada), arti, dan tombol TTS per baris. `renderLesson()` (`js/views/learn.js`) otomatis menampilkan dialog bila pelajaran punya `dialog` (menggantikan daftar kosakata), plus tetap ada tombol Flashcard/Kuis.
- **CSS:** komponen `.dialog*` di `css/styles.css` (memakai token desain yang ada, sadar tema terang/gelap, RTL & font CJK aman).
- **i18n:** kunci `lesson.convo` & `lesson.dialogIntro` (id/en/es).

### Konten
- **20 pelajaran "🗣️ Percakapan: Perkenalan"** (satu per bahasa), tiap dialog **6 baris** A–B (sapaan → apa kabar → balasan → kenalan → salam pisah), trilingual (id/en/es), dengan `reading` (romanisasi) untuk 7 skrip non-Latin (ja·ko·zh·ar·ru·hi·th) dan RTL untuk Arab.

### Validasi
- Validator (diperluas cek dialog): **20 kursus, 178 pelajaran, 1417 item, 530 contoh, 20 dialog** — 0 error, 0 warning (dialog: panjang == items, tiap tag "A"/"B"; arti tiap baris unik → opsi kuis tak ambigu).
- Uji fungsional: 20 pelajaran `convo` resolvable; pola A/B benar (ababab); romanisasi lengkap di 7 skrip; kunci i18n ada di 3 UI; **1417 set opsi kuis semua tepat 4 opsi**.
- `node --check` OK; smoke test HTTP: `/`, `data.js`, `i18n.js`, `views/learn.js`, `views/partials.js`, `css/styles.css`, `sw.js` → semua 200.
- SW `VERSION` `jb-v2.4.0` → **`jb-v2.5.0`** (refresh cache CSS/JS/data). README ditambah baris fitur "Dialog percakapan".

Catatan: belum diklik di perangkat asli; verifikasi lewat validasi struktural + uji fungsional + smoke test HTTP.

---

*Diperbarui — v2.5 2026-07-15 (dialog percakapan chat A–B di semua bahasa).*

---

## Pembaruan v2.6 — Belanja & Perjalanan (kosakata + kalimat) di Semua Bahasa (2026-07-15)

Permintaan pengguna: *"perbanyak kosakatanya dan kalimatnya"*.

### Konten (`js/data.js`)
- **2 pelajaran bertema baru per bahasa (semua 20)**, tiap pelajaran **8 item** dan kaya kalimat contoh (5/8 ada `ex`):
  - 🛍️ **`shop`** — Belanja & Harga (beli, uang, harga, mahal, murah, tunai, diskon, struk)
  - 🧳 **`travel`** — Perjalanan & Penginapan (hotel, kamar, paspor, tiket, bagasi, bandara, kunci, reservasi)
- Trilingual (id/en/es) + `reading` (romanisasi) untuk 7 skrip non-Latin (ja·ko·zh·ar·ru·hi·th); RTL untuk Arab.
- Total konten kini **218 pelajaran / 1737 item / 730 contoh / 20 dialog** (dari 178/1417/530).

### Validasi
- Validator: **20 kursus, 218 pelajaran, 1737 item, 730 contoh** — 0 error, 0 warning (id unik, ≥4 item, trilingual, tiap `ex` lengkap, arti tiap pelajaran unik).
- Uji fungsional: 40 pelajaran shop/travel resolvable (@8 item, arti unik); romanisasi lengkap 7 skrip; **1737 set opsi kuis semua tepat 4**; pencarian kamus (hotel→20, paspor→22, diskon→20, reservasi→22).
- `node --check` OK; smoke test HTTP: aset kunci + `/js/data.js` → 200. SW `jb-v2.5.0` → **`jb-v2.6.0`**.

Catatan: belum diklik di perangkat asli; verifikasi lewat validasi struktural + uji fungsional + smoke test HTTP.

---

*Diperbarui — v2.6 2026-07-15 (belanja & perjalanan di semua bahasa: +40 pelajaran, +320 kata, +200 kalimat).*

---

## Pembaruan v2.7 — Kesehatan & Cuaca di Semua Bahasa (2026-07-15)

Permintaan pengguna: *"perbanyak lagi"*.

### Konten (`js/data.js`)
- **2 pelajaran bertema baru per bahasa (semua 20)**, @8 item, kaya kalimat contoh:
  - 🏥 **`health`** — Kesehatan & Darurat (dokter, rumah sakit, obat, sakit, sakit kepala, apotek, darurat, demam)
  - 🌤️ **`weather`** — Cuaca (panas, dingin, hujan, matahari, angin, awan, salju, cuaca)
- Trilingual (id/en/es) + `reading` (romanisasi) untuk 7 skrip non-Latin; RTL untuk Arab.
- Total konten kini **258 pelajaran / 2057 item / 930 contoh / 20 dialog** (dari 218/1737/730).

### Validasi
- Validator: **20 kursus, 258 pelajaran, 2057 item, 930 contoh** — 0 error, 0 warning.
- Uji fungsional: 40 pelajaran health/weather (@8 item, arti unik), romanisasi lengkap 7 skrip.
- `node --check` OK; smoke test HTTP: aset kunci → 200. SW `jb-v2.6.0` → **`jb-v2.7.0`**.

---

*Diperbarui — v2.7 2026-07-15 (kesehatan & cuaca di semua bahasa: +40 pelajaran, +320 kata, +200 kalimat).*

---

## Pembaruan v2.8 — Dialog Restoran + Warna + Tubuh di Semua Bahasa (2026-07-15)

Permintaan pengguna: *"perbanyak lagi percakapan dan isi"*.

### Konten (`js/data.js`) — 3 pelajaran baru per bahasa (semua 20)
- **Percakapan:** 🍽️ **`convo2`** — Percakapan: Di Restoran (dialog chat A–B 6 baris: minta menu → pesan minum → pesan ayam → tawaran lain → minta bon → penutup). Ini dialog ke-2 tiap bahasa → total **40 dialog**.
- **Isi (kosakata):** 🎨 **`color`** — Warna (8 warna) · 🧍 **`body`** — Tubuh (8 bagian tubuh).
- Trilingual (id/en/es) + `reading` untuk 7 skrip non-Latin; RTL Arab. Contoh kalimat pada warna (merah/biru) & tubuh (tangan/perut).
- Total konten kini **318 pelajaran / 2497 item / 1010 contoh / 40 dialog** (dari 258/2057/930/20).

### Validasi
- Validator: **20 kursus, 318 pelajaran, 2497 item, 1010 contoh, 40 dialog** — 0 error, 0 warning.
- Uji fungsional: 20 `convo2` (pola A/B ababab, 6 baris), 20 `color` + 20 `body` (@8, arti unik); romanisasi lengkap 7 skrip; **2497 set opsi kuis semua tepat 4**.
- `node --check` OK; smoke test HTTP: aset kunci → 200. SW `jb-v2.7.0` → **`jb-v2.8.0`**.

---

*Diperbarui — v2.8 2026-07-15 (dialog restoran + warna + tubuh di semua bahasa: +60 pelajaran, +440 kata, +20 dialog).*

---

## Pembaruan v2.12 — 3 Bahasa Baru, Mode Dikte & Perbaikan Bug Tanggal (2026-07-23)

Permintaan pengguna: *"kerjakan tambah bahasa/pelajaran, fitur baru, perbaikan bug, dan jalankan dulu servernya untuk pengecekan, jika sukses maka lanjutkan"*.

> Catatan: v2.9–v2.11 (multi-pembicara A/B/C/D, 10 mode latihan, statistik, personalisasi) sudah rilis
> pada commit `7baffb0` tetapi belum sempat dicatat di dokumen ini; ringkasannya ada di `README.md`.

### 1. Konten — 3 bahasa baru (`js/data.js`, `js/scripts.js`)
Mengikuti template 16 pelajaran yang sama persis dengan bahasa lain (greet · num · ess · food · city ·
family · convo · shop · travel · health · weather · convo2 · color · body · convo3 · convo4):

| | Bahasa | Aksara | TTS | Isi |
|---|---|---|---|---|
| 🇬🇷 | **Yunani** (`el`) | Yunani (+ romanisasi tiap item) | `el-GR` | 16 pelajaran / 126 item / 31 contoh |
| 🇺🇦 | **Ukraina** (`uk`) | Kiril Ukraina (+ romanisasi) | `uk-UA` | 16 pelajaran / 126 item / 25 contoh |
| 🇰🇪 | **Swahili** (`sw`) | Latin | `sw-KE` | 16 pelajaran / 126 item / 31 contoh |

- Tiap bahasa membawa **4 dialog** (perkenalan, kafe/pasar, obrolan grup A/B/C, dialog panjang 12 baris di hotel).
- **Pelatih Aksara** baru: **alfabet Yunani** (24 huruf) & **Kiril Ukraina** (33 huruf, termasuk ґ/є/і/ї).
- Katalog kini **23 kursus / 406 pelajaran / 3275 item** (dari 20/358/2897). Swahili menutup celah:
  sebelumnya tidak ada satu pun bahasa Afrika di katalog.

### 2. Fitur baru
- 📝 **Mode Dikte** (`#/dictation/:kursus/:pelajaran`, `renderDictation`) — murni audio: kata dibunyikan TTS,
  pelajar mengetik apa yang didengar. Ada tombol putar ulang & **mode pelan 0,6×**; aksara non-Latin cukup
  ditulis romanisasinya (aturan sama dengan mode Ketik, jadi tanpa IME). Terhubung ke XP, SRS,
  dek "Perbaiki Kesalahan", statistik akurasi, dan pencapaian baru **Telinga Tajam** (30 kata).
- 🌟 **Kata Hari Ini** di Beranda — satu kata untuk seluruh katalog per hari kalender, dipilih dengan
  hash FNV-1a atas tanggal (stabil lintas muat-ulang & perangkat, tanpa menyimpan apa pun), lengkap
  dengan TTS, tombol ⭐ favorit, dan tautan ke pelajarannya.
- 🔎 **Filter katalog bahasa** — dengan 23 bahasa, halaman Katalog kini punya kotak cari yang mencocokkan
  nama dalam bahasa UI, Inggris, Spanyol, endonim, atau kode ISO; diakritik diabaikan (`Francais` → Français).
  Kartu disembunyikan di tempat sehingga wiring klik/keyboard-nya tetap hidup.
- Pencapaian tambahan: **Warga Dunia** (coba 10 bahasa) → total **18 pencapaian**.

### 3. Perbaikan bug
1. **Tanggal ISO diurai sebagai UTC** (`js/core/state.js`, `js/views/learn.js`) — `new Date("YYYY-MM-DD")`
   menghasilkan tengah malam UTC, lalu komponennya dibaca secara lokal. Di seluruh zona waktu di sebelah
   barat UTC (Amerika, dll.) ini menggeser satu hari: **jadwal SRS jatuh tempo sehari lebih awal**, huruf
   hari pada kisi streak salah, dan kolom heatmap bergeser. Ditambahkan `parseISO()` yang membangun tanggal
   dari komponennya (selalu lokal) dan dipakai di `addDaysISO`, `daysBetween`, `dayLetter`, dan `firstDow`.
2. **`mergeInto` memangkas `activeDays` ke 60 hari** — masuk akun, impor cadangan, atau tarik data cloud
   diam-diam menghapus sebagian besar riwayat heatmap 182 hari. Kini memakai batas yang sama dengan
   `touchStreak` (400 hari) lewat konstanta bersama.
3. **`xpHistory` dipangkas di 140 hari** padahal heatmap butuh 182 → konstanta `HISTORY_DAYS = 200`,
   sehingga kolom terlama heatmap tidak lagi selalu kosong.
4. **Mode Jodohkan** menampilkan pesan yang salah ("Tidak ada kesalahan — kerja bagus! 🎉") ketika
   pelajaran terlalu sedikit katanya → kunci baru `match.tooFew`.
5. **Mode Isian (cloze) tidak mencatat apa pun** — tidak masuk statistik akurasi dan jawaban salahnya
   tidak pernah menjadi dek "Perbaiki Kesalahan". Kini memanggil `recordAttempt`/`recordMistake`/
   `clearMistake` seperti mode lain, dan **cloze + dikte ditambahkan ke daftar akurasi** di halaman Statistik.
6. **`speak()` tanpa penangan `onerror`** — bila suara untuk sebuah bahasa tidak tersedia, callback `onend`
   tidak pernah terpanggil sehingga **playlist "Dengar Tanpa Tangan" berhenti selamanya**. Kini `onend`
   dan `onerror` memakai satu callback sekali-jalan.

### Validasi
- Server `node server.js` dijalankan lebih dulu: `/api/health` → 200, seluruh aset kunci → 200.
- `node --check` untuk **semua** berkas JS (front-end + server + sw) — bersih.
- Validator konten: **23 kursus, 406 pelajaran, 3275 item**, panjang `dialog` == panjang `items`,
  arti id/en/es lengkap, tidak ada id kursus/pelajaran ganda — 0 error.
- Uji logika `state.js` di Node (localStorage di-stub): **20 assert lulus** — termasuk jatuh tempo SRS =
  besok (bukan hari ini), `lastNDates` bersambung, pemangkasan `xpHistory`, dan `activeDays` tidak terpotong saat impor.
- Uji konten & filter: **26 assert lulus** — romanisasi lengkap untuk el/uk, cloze & pembangun kalimat
  terbukti bisa dimainkan (≥23 soal per bahasa baru), tiap pelajaran mampu mengisi 4 opsi kuis,
  filter katalog cocok untuk "yunani"/"greek"/"Ελλην"/"swahili"/"ukrain"/"francais".
- Render nyata headless Chrome pada 8 rute (beranda, katalog, kursus el, pelajaran, dikte, kuis, kamus,
  statistik) — **0 error konsol**; Kata Hari Ini, 23 kartu bahasa, tombol Dikte, dan pelatih aksara Yunani muncul.
- Paritas i18n: **328 kunci** identik di id/en/es. SW `jb-v2.11.0` → **`jb-v2.12.0`**.

---

*Diperbarui — v2.12 2026-07-23 (3 bahasa baru: +48 pelajaran, +378 kata, +12 dialog, +2 pelatih aksara; mode Dikte, Kata Hari Ini, filter katalog; 6 perbaikan bug).*

---

## Pembaruan v2.9–v2.11 — Multi-Pembicara & 10 Mode Latihan (2026-07-16) — *catatan susulan*

Ditulis susulan pada 2026-07-23: rilis ini sudah masuk lewat commit `7baffb0` tetapi belum
sempat dicatat di dokumen ini. Ringkasannya:

- **Konten:** percakapan multi-pembicara A/B/C/D — 2 pelajaran baru per bahasa × 20
  (obrolan grup "Rencana Akhir Pekan" dan dialog panjang 12 baris "Di Hotel"), lengkap
  dengan romanisasi untuk 7 aksara non-Latin. `dialogHTML` diperluas agar mendukung lebih
  dari dua pembicara (posisi kiri/kanan + warna avatar per orang).
- **10 mode latihan baru:** Ketik, Simak, Jodohkan, Ucap (Web Speech Recognition),
  Dengar Tanpa Tangan, Pembangun Kalimat, Pelatih Aksara (`js/scripts.js`), Campur Cepat,
  Perbaiki Kesalahan, Favorit.
- **Kebiasaan & wawasan:** Target Harian, streak freeze + rekor streak, riwayat XP harian,
  tally akurasi per mode, halaman **Statistik** (heatmap 26 minggu, tren XP, akurasi,
  kata per bahasa), pengingat belajar.
- **Personalisasi & data:** 5 warna aksen, teks besar, mode ramah disleksia,
  ekspor/impor progres JSON, 16 pencapaian bertingkat.
- SW `jb-v2.8.0` → **`jb-v2.11.0`**, paritas i18n 318 kunci di id/en/es.

---

## Pembaruan v2.13 — Harness Uji, Aksesibilitas & Kontras (2026-07-23)

Permintaan pengguna: memilih keempat pekerjaan lanjutan sekaligus. Ini dua tahap pertama.

### 1. Harness uji di dalam repo — `npm test`
Selama ini setiap verifikasi ditulis ulang manual di scratchpad tiap sesi. Sekarang jadi bagian repo:
**85 tes, ±5 detik, nol dependency** (test runner bawaan Node, butuh Node ≥ 18).

- `tests/content.test.mjs` — bentuk katalog: metadata 3 bahasa lengkap, ≥4 arti unik per pelajaran
  (kuis butuh 4 opsi), romanisasi wajib untuk 9 kursus beraksara non-Latin, panjang `dialog` =
  jumlah baris, Isian & Pembangun Kalimat terbukti bisa dimainkan di **tiap** kursus.
- `tests/state.test.mjs` — SRS (termasuk regresi zona waktu `parseISO`, lantai ease 1.3, pertumbuhan
  interval), target harian, retensi riwayat, ekspor/impor, isolasi progres antar-akun.
- `tests/i18n.test.mjs` — paritas kunci id/en/es, tak ada terjemahan kosong, jumlah `%s` sama,
  semua kunci yang dipakai kode ada, **dan tak ada kunci yang menganggur**.
- `tests/assets.test.mjs` — tiap modul JS ada di precache `sw.js` & sebaliknya, manifest + ikon valid,
  CSP `index.html` utuh, hanya satu skrip inline (yang di-hash).
- `tests/contrast.test.mjs` — rasio kontras WCAG dihitung langsung dari token CSS, terang & gelap.
- `tests/server.test.mjs` — `node server.js` sungguhan di port acak + `DATA_DIR` sementara: MIME,
  header keamanan, modul hilang → 404 (bukan cangkang HTML), fallback SPA, blokir `server/`/dotfile/
  path-traversal, alur daftar→masuk→sinkron→keluar, penolakan CSRF, anti-enumerasi login,
  batas 5 pendaftaran/jam, dan sandi tak pernah tersimpan polos.
- `tests/smoke.test.mjs` — headless Chrome merender 11 rute, **console wajib bersih**; dilewati
  otomatis bila Chrome tidak ada (`CHROME_PATH`).

`js/package.json` berisi `{"type":"module"}` agar Node bisa meng-`import` modul ES di `js/` langsung
(peramban mengabaikannya; root tetap `commonjs` untuk server).

### 2. Aksesibilitas & kontras
**Temuan kontras (semua di tema terang, ditemukan oleh tes, bukan tebakan):**

| Token | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `--text-faint` | 2,89:1 di `--surface-3` | **4,79:1** (`#6f7590`) | teks sekunder di bawah ambang 3:1 |
| `--success` sebagai teks | 1,74:1 | **5,01:1** (`--success-text: #0a785d`) | mint hanya layak jadi isian |
| `--danger` sebagai teks | 2,94:1 | **5,44:1** (`--danger-text: #d1123a`) | dipakai umpan balik salah & galat form |
| `--accent` sebagai teks/ikon | 2,04:1 | **5,33:1** (`--accent-text: #a75500`) | chip, XP pop, bintang favorit |
| Teks putih di `.btn--danger` | 2,94:1 | **4,56:1** (`--danger-600`) | isian tombol digelapkan |
| Batas kontrol interaktif | 1,39:1 | **≥3:1** (`--line-input`) | WCAG 1.4.11 untuk input/opsi/chip |

Warna **isian** (mint, koral, oranye) tidak diubah — hanya kembarannya untuk teks yang ditambahkan,
sehingga identitas visual tetap sama.

**Perbaikan ARIA:**
- Umpan balik Ketik/Dikte/Ucap/Pembangun Kalimat kini `role="status"` (otomatis dibacakan).
- Hasil pilihan ganda (Kuis, Simak, Campur, Isian, Perbaiki Kesalahan) diumumkan lewat live region —
  sebelumnya benar/salah hanya disampaikan lewat warna.
- Flashcard: `aria-pressed` + mengumumkan sisi yang sedang tampak.
- Jodohkan: pasangan yang cocok jadi `disabled` (keluar dari urutan tab) + progres diumumkan.
- Heatmap 182 sel → satu `role="img"` berlabel ringkasan, bukan 182 pembacaan.
- Bilah progres yang menduplikasi teks "n dari m" di sebelahnya → `aria-hidden`.
- Mode latihan kini punya judul (`<h2 class="visually-hidden">`) sebagai penanda halaman.
- Tombol Campur Cepat & Perbaiki Kesalahan diberi `aria-label` kalimat penuh.

**PWA:** shortcut manifest bertambah (Campur Cepat, Kamus) jadi 4; service worker punya halaman
offline terakhir bila cangkang aplikasi belum pernah tersimpan.

**i18n:** 25 kunci mati dihapus dari ketiga tabel (328 → 303 kunci), kunci yang berguna justru
dipakai (judul mode, `mix.sub`, `mistakes.count`, dan pemberitahuan "progres tamu digabungkan"
yang selama ini tak pernah muncul). Tes baru menjaga agar tak ada kunci menganggur lagi.

SW `jb-v2.12.0` → **`jb-v2.13.0`**.

---

*Diperbarui — v2.13 2026-07-23 (harness uji 85 tes; 6 perbaikan kontras WCAG; 8 perbaikan ARIA; 25 kunci i18n mati dibersihkan).*

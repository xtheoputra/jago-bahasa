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

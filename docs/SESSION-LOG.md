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

*Dirangkum oleh Claude Code — sesi awal 2026-06-24, pembaruan v2.0 2026-06-26, pembaruan v2.1 2026-07-13.*

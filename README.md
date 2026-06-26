# 🌍 Jago Bahasa

**Progressive Web App (PWA) untuk media pembelajaran bahasa dunia.**
Profesional, ringan, multi-bahasa, **bekerja offline**, dengan **akun aman & sinkronisasi opsional**.

---

## ✨ Fitur

| | |
|---|---|
| 🌍 **12 bahasa dunia** | Inggris, Spanyol, Prancis, Jerman, Jepang, Korea, Mandarin, Arab, Italia, Portugis, Rusia, Hindi |
| 🃏 **Flashcard interaktif** | Kartu balik dengan animasi 3D + navigasi keyboard |
| 🧠 **Kuis otomatis** | Pilihan ganda (acak kriptografis) dengan skor, cincin progres, dan XP |
| 🔊 **Pelafalan audio** | Text-to-speech native untuk setiap kata |
| 🏅 **Gamifikasi** | XP, level, hari beruntun (streak), dan pencapaian |
| 🔐 **Akun & keamanan** | Daftar / masuk dengan kata sandi. Sandi **di-hash** (tidak pernah disimpan apa adanya) |
| ☁️ **Sinkronisasi** | Progres tersimpan per-akun & bisa disinkronkan antar-perangkat (mode backend) |
| 🌐 **Antarmuka 3 bahasa** | Indonesia · English · Español (bisa diganti kapan saja) |
| 🌙 **Mode terang/gelap** | Mengikuti sistem, bisa di-toggle manual |
| 📡 **Offline & installable** | Service worker + manifest + ikon PNG/SVG (termasuk maskable) |
| ♿ **Aksesibilitas** | Skip-link, `:focus-visible`, `prefers-reduced-motion`, ARIA, live regions, dialog terjebak-fokus |

---

## 🔐 Model Keamanan & Privasi (penting — baca ini)

Jago Bahasa mendukung **dua mode autentikasi** yang dipilih otomatis:

### 1. Mode lokal (default di GitHub Pages / tanpa server)
- Akun dibuat **sepenuhnya di browser**. Kata sandi di-hash dengan **PBKDF2-HMAC-SHA256 (600.000 iterasi, salt acak 16-byte)** lewat Web Crypto, lalu disimpan di **IndexedDB**.
- Kata sandi **tidak pernah** disimpan apa adanya dan **tidak dapat dipulihkan** (tidak ada "lupa sandi" — buat akun baru bila lupa).
- ⚠️ **Jujur soal ancaman:** mode lokal **memisahkan profil** dan menambah lapisan, tetapi **bukan** perlindungan terhadap orang yang memiliki akses fisik ke perangkat (mereka tetap bisa membaca IndexedDB). Gunakan fitur **Ekspor Data** sebagai cadangan.

### 2. Mode cloud (saat backend Node dijalankan)
- Autentikasi server sungguhan: hashing **scrypt (N=2¹⁵)**, **sesi cookie httpOnly + Secure + SameSite**, **proteksi CSRF (double-submit)**, **rate-limiting**, dan **header keamanan ketat (CSP, dll)**.
- Progres **disinkronkan antar-perangkat** per akun.
- Frontend mendeteksi backend lewat `GET /api/health` dan otomatis beralih ke mode cloud bila tersedia, atau kembali ke mode lokal bila tidak.

**Catatan keamanan tambahan:**
- Konten Security Policy (`script-src 'self'`), proteksi clickjacking, path-traversal, dan batas ukuran body diterapkan.
- Pendaftaran mengembalikan pesan "email sudah terdaftar" demi UX — ini adalah trade-off enumerasi email yang disengaja (mitigasi penuh butuh verifikasi email yang di luar cakupan).

---

## 🚀 Cara Menjalankan

PWA membutuhkan `http://` (service worker tidak berjalan di `file://`).
Sudah disediakan server **tanpa dependency** (hanya butuh Node.js ≥ 16):

```bash
npm start          # atau: node server.js
```

Lalu buka **http://localhost:5173** (atau port dari variabel `PORT`).
Server ini melayani file statis **dan** API auth/sinkronisasi di `/api/*`, jadi menjalankannya secara lokal otomatis mengaktifkan **mode cloud** untuk pengujian.

> Hanya butuh situs statis (mode lokal)? File apa pun bisa di-host statis — lihat **Deploy** di bawah.

### Variabel lingkungan (mode backend)
| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `5173` | Port server |
| `DATA_DIR` | `./data` | Lokasi penyimpanan JSON (akun, sesi, progres) — **jangan di-commit** |
| `COOKIE_SECURE` | `0` | Set `1` di produksi (HTTPS) agar cookie `Secure` |
| `TRUST_PROXY` | `0` | Set `1` di belakang reverse proxy (honor `X-Forwarded-*`) |
| `ALLOW_ORIGIN` | — | Set bila API beda origin dari frontend (mengaktifkan CORS + `SameSite=None`) |

### Memasang sebagai aplikasi
- **Desktop (Chrome/Edge):** klik ikon install di address bar, atau tombol **⬇️ Pasang Aplikasi**.
- **Android:** menu browser → *Add to Home Screen*.
- **iOS (Safari):** Share → *Add to Home Screen*.

---

## ☁️ Deploy

- **GitHub Pages / Netlify / Vercel (statis):** unggah seluruh isi repo (kecuali `server/` & `data/`). Aplikasi berjalan penuh dalam **mode lokal** (akun tersimpan di perangkat). Tidak perlu backend.
- **Akun cloud + sinkronisasi:** jalankan `node server.js` di host yang mendukung Node (Render, Railway, Fly.io, VPS). Set `COOKIE_SECURE=1` dan sajikan via HTTPS. Backend ini sekaligus melayani frontend statis.

---

## 🗂️ Struktur Proyek

```
Jago Bahasa/
├── index.html              # App shell (CSP, live regions, framebuster)
├── manifest.webmanifest    # Metadata PWA (ikon PNG + SVG, maskable, id)
├── sw.js                   # Service worker (cache offline-first, /api network-only)
├── server.js               # Shim → server/index.js
├── css/styles.css          # Design system + komponen auth/akun
├── icons/                  # icon.svg + icon-{180,192,512}.png + maskable
├── js/
│   ├── app.js              # Bootstrap (rute, auth, PWA)
│   ├── i18n.js  data.js    # Antarmuka 3 bahasa · konten kursus
│   ├── core/               # dom, ui, random (crypto Fisher–Yates), state, router
│   ├── auth/               # crypto (PBKDF2), db (IndexedDB), local/remote provider, session, validate
│   ├── views/              # learn, practice, auth, partials
│   ├── chrome.js  pwa.js   # Tema/bahasa/menu akun/install · registrasi SW
└── server/                 # Backend opsional (zero-dependency: node:http + node:crypto)
    ├── index.js  config.js  crypto.js (scrypt)  store.js (atomic JSON)
    ├── sessions.js  security.js (CSP/CSRF/rate-limit)  static.js  api.js  db.js
```

---

## ➕ Menambah Bahasa / Pelajaran

Cukup edit **`js/data.js`** — tambahkan objek kursus ke `COURSES` (ES module):

```js
{
  id: "it", flag: "🇮🇹", native: "Italiano", speech: "it-IT", cjk: false,
  name: { id: "Bahasa Italia", en: "Italian", es: "Italiano" },
  tagline: { id: "...", en: "...", es: "..." },
  lessons: [
    { id: "greet", icon: "👋", level: "beginner",
      title: { id: "Sapaan", en: "Greetings", es: "Saludos" },
      items: [ { term: "Ciao", m: { id: "Halo", en: "Hello", es: "Hola" } } ] }
  ]
}
```

- `term` = kata target · `reading` = romanisasi (aksara non-Latin) · `m` = arti 3 bahasa · `ex` = contoh (opsional) · `speech` = kode BCP-47.

Kuis & flashcard otomatis menyesuaikan — tidak perlu mengubah kode lain.

---

## 🛠️ Teknologi

Vanilla **HTML + CSS + JavaScript (ES modules)** — tanpa framework, tanpa build step.
Backend opsional **pure Node** tanpa dependency. Ringan, cepat, mudah dirawat, portabel.

© 2026 Jago Bahasa — MIT License

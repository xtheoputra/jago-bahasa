# 🌍 Jago Bahasa

**Progressive Web App (PWA) untuk media pembelajaran bahasa dunia.**
Profesional, ringan, multi-bahasa, dan **bekerja offline**.

---

## ✨ Fitur

| | |
|---|---|
| 🌍 **8 bahasa dunia** | Inggris, Spanyol, Prancis, Jerman, Jepang, Korea, Mandarin, Arab |
| 🃏 **Flashcard interaktif** | Kartu balik dengan animasi 3D + navigasi keyboard |
| 🧠 **Kuis otomatis** | Pilihan ganda dengan skor, cincin progres, dan XP |
| 🔊 **Pelafalan audio** | Text-to-speech native untuk setiap kata |
| 🏅 **Gamifikasi** | XP, level, hari beruntun (streak), dan pencapaian |
| 🌐 **Antarmuka 3 bahasa** | Indonesia · English · Español (bisa diganti kapan saja) |
| 🌙 **Mode terang/gelap** | Mengikuti sistem, bisa di-toggle manual |
| 📡 **Offline & installable** | Service worker + manifest — bisa dipasang seperti aplikasi |
| 🔒 **Privat** | Semua progres tersimpan di perangkat (localStorage), tanpa server |

---

## 🚀 Cara Menjalankan

PWA membutuhkan `http://` (service worker tidak berjalan di `file://`).
Sudah disediakan server statis **tanpa dependency** (hanya butuh Node.js):

```bash
npm start
```

Lalu buka **http://localhost:5173** di browser.

> Alternatif tanpa Node: `python -m http.server 5173` lalu buka alamat yang sama.

### Memasang sebagai aplikasi
- **Desktop (Chrome/Edge):** klik ikon install di address bar, atau tombol **⬇️ Pasang Aplikasi** di pojok layar.
- **Android:** menu browser → *Add to Home Screen*.
- **iOS (Safari):** Share → *Add to Home Screen*.

---

## 🗂️ Struktur Proyek

```
Jago Bahasa/
├── index.html              # App shell
├── manifest.webmanifest    # Metadata PWA (nama, ikon, warna, shortcut)
├── sw.js                   # Service worker (cache offline-first)
├── server.js               # Server statis lokal (zero-dependency)
├── css/
│   └── styles.css          # Design system (tema, komponen, responsif)
├── js/
│   ├── i18n.js             # Antarmuka multi-bahasa (id/en/es)
│   ├── data.js             # Konten kursus & pelajaran
│   └── app.js              # Router SPA, flashcard, kuis, gamifikasi, PWA
└── icons/
    ├── icon.svg            # Ikon aplikasi
    └── maskable.svg        # Ikon maskable (Android adaptive)
```

---

## ➕ Menambah Bahasa / Pelajaran

Cukup edit **`js/data.js`**. Tambahkan objek kursus baru ke `window.COURSES`:

```js
{
  id: "it", flag: "🇮🇹", native: "Italiano", speech: "it-IT", cjk: false,
  name: { id: "Bahasa Italia", en: "Italian", es: "Italiano" },
  tagline: { id: "...", en: "...", es: "..." },
  lessons: [
    { id: "greet", icon: "👋", level: "beginner",
      title: { id: "Sapaan", en: "Greetings", es: "Saludos" },
      items: [
        { term: "Ciao", m: { id: "Halo", en: "Hello", es: "Hola" } },
        // ...
      ] }
  ]
}
```

- `term` = kata dalam bahasa target
- `reading` = romanisasi (untuk aksara non-Latin, opsional)
- `m` = arti dalam 3 bahasa antarmuka
- `ex` = contoh kalimat (opsional)
- `speech` = kode BCP-47 untuk audio TTS (mis. `ja-JP`, `ar-SA`)

Tidak perlu mengubah kode lain — kuis & flashcard otomatis menyesuaikan.

---

## 🛠️ Teknologi

Vanilla **HTML + CSS + JavaScript** — tanpa framework, tanpa build step.
Ringan, cepat dimuat, mudah dirawat, dan portabel ke hosting statis mana pun
(GitHub Pages, Netlify, Vercel, dll).

© 2026 Jago Bahasa — MIT License

/* =========================================================================
   i18n — Interface languages (UI chrome only; lesson content lives in data.js)
   ========================================================================= */
window.I18N = {
  // available UI languages shown in the switcher
  langs: [
    { code: "id", flag: "🇮🇩", label: "Bahasa Indonesia", dir: "ltr" },
    { code: "en", flag: "🇬🇧", label: "English", dir: "ltr" },
    { code: "es", flag: "🇪🇸", label: "Español", dir: "ltr" },
  ],

  strings: {
    id: {
      "nav.home": "Beranda", "nav.courses": "Bahasa", "nav.progress": "Progres", "nav.about": "Tentang",
      "install.cta": "Pasang Aplikasi",
      "home.eyebrow": "Belajar bahasa dunia, gratis",
      "home.title": "Kuasai bahasa baru, satu kartu sekaligus.",
      "home.subtitle": "Kosakata pilihan, flashcard interaktif, dan kuis cepat dengan pelacakan progres — bekerja offline di mana saja.",
      "home.start": "Mulai Belajar", "home.browse": "Lihat Semua Bahasa",
      "home.streak": "Hari Beruntun", "home.continue": "Lanjutkan Belajar",
      "home.popular": "Bahasa Populer", "home.popular.sub": "Pilih bahasa untuk memulai perjalananmu.",
      "home.viewall": "Lihat semua →",
      "stat.xp": "Total XP", "stat.lessons": "Pelajaran Selesai", "stat.words": "Kata Dipelajari", "stat.level": "Level",
      "courses.title": "Katalog Bahasa", "courses.sub": "Bahasa dunia yang siap kamu kuasai.",
      "courses.lessons": "pelajaran", "courses.start": "Mulai", "courses.continue": "Lanjutkan",
      "course.lessons": "Daftar Pelajaran", "course.back": "Bahasa",
      "lesson.vocab": "Kosakata", "lesson.practice": "Latihan",
      "lesson.flashcards": "Flashcard", "lesson.quiz": "Kuis", "lesson.done": "Tandai Selesai",
      "lesson.example": "Contoh", "lesson.intro": "Pelajari kata-kata berikut, lalu uji dirimu.",
      "flash.tap": "Ketuk kartu untuk membaliknya", "flash.know": "Sudah Tahu", "flash.again": "Ulangi",
      "flash.prev": "Sebelumnya", "flash.next": "Berikutnya", "flash.done": "Selesai 🎉",
      "quiz.title": "Kuis", "quiz.q": "Apa arti kata ini?", "quiz.of": "dari",
      "quiz.result": "Hasil Kuis", "quiz.correct": "benar", "quiz.retry": "Coba Lagi", "quiz.back": "Kembali ke Pelajaran",
      "quiz.perfect": "Sempurna! Kamu hebat!", "quiz.good": "Bagus sekali!", "quiz.keepgoing": "Terus berlatih, kamu pasti bisa!",
      "progress.title": "Progres Saya", "progress.sub": "Lacak pencapaian belajarmu.",
      "progress.byLang": "Progres per Bahasa", "progress.ach": "Pencapaian", "progress.reset": "Atur Ulang Progres",
      "progress.resetConfirm": "Hapus semua progres belajar? Tindakan ini tidak bisa dibatalkan.",
      "progress.none": "Belum ada progres. Ayo mulai pelajaran pertamamu!",
      "about.title": "Tentang Jago Bahasa", "install.title": "Pasang sebagai Aplikasi",
      "toast.lessonDone": "Pelajaran selesai! +%s XP", "toast.installed": "Aplikasi berhasil dipasang!",
      "toast.reset": "Progres telah diatur ulang.", "toast.offline": "Kamu sedang offline — konten tetap tersedia.",
      "toast.online": "Kembali online.",
      "level": "Level", "xp": "XP", "words": "kata", "minutes": "menit",
      "diff.beginner": "Pemula", "diff.elementary": "Dasar", "diff.intermediate": "Menengah",
    },
    en: {
      "nav.home": "Home", "nav.courses": "Languages", "nav.progress": "Progress", "nav.about": "About",
      "install.cta": "Install App",
      "home.eyebrow": "Learn world languages, free",
      "home.title": "Master a new language, one card at a time.",
      "home.subtitle": "Curated vocabulary, interactive flashcards, and quick quizzes with progress tracking — works offline, anywhere.",
      "home.start": "Start Learning", "home.browse": "Browse All Languages",
      "home.streak": "Day Streak", "home.continue": "Continue Learning",
      "home.popular": "Popular Languages", "home.popular.sub": "Pick a language to begin your journey.",
      "home.viewall": "View all →",
      "stat.xp": "Total XP", "stat.lessons": "Lessons Done", "stat.words": "Words Learned", "stat.level": "Level",
      "courses.title": "Language Catalog", "courses.sub": "World languages ready for you to master.",
      "courses.lessons": "lessons", "courses.start": "Start", "courses.continue": "Continue",
      "course.lessons": "Lessons", "course.back": "Languages",
      "lesson.vocab": "Vocabulary", "lesson.practice": "Practice",
      "lesson.flashcards": "Flashcards", "lesson.quiz": "Quiz", "lesson.done": "Mark as Done",
      "lesson.example": "Example", "lesson.intro": "Study the words below, then test yourself.",
      "flash.tap": "Tap the card to flip it", "flash.know": "I Knew It", "flash.again": "Again",
      "flash.prev": "Previous", "flash.next": "Next", "flash.done": "Finish 🎉",
      "quiz.title": "Quiz", "quiz.q": "What does this word mean?", "quiz.of": "of",
      "quiz.result": "Quiz Result", "quiz.correct": "correct", "quiz.retry": "Try Again", "quiz.back": "Back to Lesson",
      "quiz.perfect": "Perfect! You nailed it!", "quiz.good": "Great job!", "quiz.keepgoing": "Keep practicing, you've got this!",
      "progress.title": "My Progress", "progress.sub": "Track your learning achievements.",
      "progress.byLang": "Progress by Language", "progress.ach": "Achievements", "progress.reset": "Reset Progress",
      "progress.resetConfirm": "Erase all learning progress? This cannot be undone.",
      "progress.none": "No progress yet. Start your first lesson!",
      "about.title": "About Jago Bahasa", "install.title": "Install as App",
      "toast.lessonDone": "Lesson complete! +%s XP", "toast.installed": "App installed successfully!",
      "toast.reset": "Progress has been reset.", "toast.offline": "You're offline — content is still available.",
      "toast.online": "Back online.",
      "level": "Level", "xp": "XP", "words": "words", "minutes": "min",
      "diff.beginner": "Beginner", "diff.elementary": "Elementary", "diff.intermediate": "Intermediate",
    },
    es: {
      "nav.home": "Inicio", "nav.courses": "Idiomas", "nav.progress": "Progreso", "nav.about": "Acerca",
      "install.cta": "Instalar App",
      "home.eyebrow": "Aprende idiomas del mundo, gratis",
      "home.title": "Domina un nuevo idioma, una tarjeta a la vez.",
      "home.subtitle": "Vocabulario seleccionado, tarjetas interactivas y cuestionarios rápidos con seguimiento de progreso — funciona sin conexión.",
      "home.start": "Empezar", "home.browse": "Ver todos los idiomas",
      "home.streak": "Racha de días", "home.continue": "Continuar aprendiendo",
      "home.popular": "Idiomas populares", "home.popular.sub": "Elige un idioma para comenzar.",
      "home.viewall": "Ver todos →",
      "stat.xp": "XP Total", "stat.lessons": "Lecciones", "stat.words": "Palabras", "stat.level": "Nivel",
      "courses.title": "Catálogo de Idiomas", "courses.sub": "Idiomas del mundo listos para dominar.",
      "courses.lessons": "lecciones", "courses.start": "Empezar", "courses.continue": "Continuar",
      "course.lessons": "Lecciones", "course.back": "Idiomas",
      "lesson.vocab": "Vocabulario", "lesson.practice": "Práctica",
      "lesson.flashcards": "Tarjetas", "lesson.quiz": "Cuestionario", "lesson.done": "Marcar completada",
      "lesson.example": "Ejemplo", "lesson.intro": "Estudia las palabras y luego ponte a prueba.",
      "flash.tap": "Toca la tarjeta para girarla", "flash.know": "Lo sabía", "flash.again": "Otra vez",
      "flash.prev": "Anterior", "flash.next": "Siguiente", "flash.done": "Terminar 🎉",
      "quiz.title": "Cuestionario", "quiz.q": "¿Qué significa esta palabra?", "quiz.of": "de",
      "quiz.result": "Resultado", "quiz.correct": "correctas", "quiz.retry": "Reintentar", "quiz.back": "Volver a la lección",
      "quiz.perfect": "¡Perfecto!", "quiz.good": "¡Muy bien!", "quiz.keepgoing": "¡Sigue practicando!",
      "progress.title": "Mi Progreso", "progress.sub": "Sigue tus logros de aprendizaje.",
      "progress.byLang": "Progreso por idioma", "progress.ach": "Logros", "progress.reset": "Reiniciar progreso",
      "progress.resetConfirm": "¿Borrar todo el progreso? No se puede deshacer.",
      "progress.none": "Aún no hay progreso. ¡Empieza tu primera lección!",
      "about.title": "Acerca de Jago Bahasa", "install.title": "Instalar como App",
      "toast.lessonDone": "¡Lección completa! +%s XP", "toast.installed": "¡App instalada!",
      "toast.reset": "Progreso reiniciado.", "toast.offline": "Sin conexión — el contenido sigue disponible.",
      "toast.online": "De vuelta en línea.",
      "level": "Nivel", "xp": "XP", "words": "palabras", "minutes": "min",
      "diff.beginner": "Principiante", "diff.elementary": "Básico", "diff.intermediate": "Intermedio",
    },
  },

  current: "id",

  t(key, ...args) {
    const table = this.strings[this.current] || this.strings.id;
    let s = table[key] ?? this.strings.id[key] ?? key;
    args.forEach((a) => { s = s.replace("%s", a); });
    return s;
  },

  setLang(code) {
    if (!this.strings[code]) return;
    this.current = code;
    const meta = this.langs.find((l) => l.code === code);
    document.documentElement.lang = code;
    document.documentElement.dir = meta?.dir || "ltr";
    try { localStorage.setItem("jb.uilang", code); } catch (e) {}
  },

  init() {
    let saved = null;
    try { saved = localStorage.getItem("jb.uilang"); } catch (e) {}
    const nav = (navigator.language || "id").slice(0, 2);
    this.setLang(saved || (this.strings[nav] ? nav : "id"));
  },
};

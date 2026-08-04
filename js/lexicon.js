/* =========================================================================
   lexicon.js — the book dictionary layer.

   The course catalogue (data.js) teaches words lesson by lesson. This layer is
   the other half of a real language school: a reference *book* per language —
   headwords in alphabetical order, pronunciation, part of speech, CEFR band,
   a definition, an example, synonyms/antonyms, usage notes — plus front matter
   (writing system, pronunciation key, grammar summary) the way a printed
   dictionary opens with one.

   Same split as the catalogue: this file is a light index (which languages have
   a dictionary and how many entries they carry), and js/lexicon/<id>.js holds
   the entries, imported the first time that dictionary is opened.

   Entries are written as compact literals and normalised on load:
     { w, r?, ipa?, pos, cefr, gen?, g:[id,en,es], d:[id,en,es],
       ex?:[target,id,en,es], syn?:[], ant?:[], note?:[id,en,es] }
   ========================================================================= */
import { fold } from "./core/dom.js";

/** Part-of-speech codes. Labels live in i18n as `pos.<code>`. */
export const POS = ["n", "v", "adj", "adv", "pron", "prep", "conj", "num", "phr", "intj", "part", "det"];

/** CEFR bands, from absolute beginner to mastery — the "nol → ahli" ladder. */
export const BANDS = ["A1", "A2", "B1", "B2", "C1", "C2"];

/** Each band maps onto the lesson difficulty tiers the app already uses, so a
 *  dictionary band and a lesson level can be shown side by side on the path. */
export const BAND_LEVEL = {
  A1: "beginner", A2: "elementary", B1: "intermediate",
  B2: "advanced", C1: "proficient", C2: "expert",
};

/* ------------------------------------------------------- the ladder itself
   What a learner can actually *do* at each band. These descriptors are the
   spine of the "nol → ahli" path: they are language-independent (adapted from
   the CEFR global scale), so they live here rather than in every chunk. */
export const BAND_INFO = {
  A1: {
    icon: "🌱",
    name: ["Nol — Mulai dari awal", "Zero — Starting out", "Cero — Primeros pasos"],
    can: [
      ["Menyapa, memperkenalkan diri, dan mengeja nama.", "Greet people, introduce yourself and spell your name.", "Saludar, presentarte y deletrear tu nombre."],
      ["Memakai angka, tanggal, harga, dan kata sehari-hari.", "Use numbers, dates, prices and everyday words.", "Usar números, fechas, precios y palabras cotidianas."],
      ["Bertanya dan menjawab hal yang sangat sederhana.", "Ask and answer very simple questions.", "Preguntar y responder cosas muy sencillas."],
    ],
  },
  A2: {
    icon: "🌿",
    name: ["Dasar — Bertahan hidup", "Elementary — Getting by", "Básico — Sobrevivir"],
    can: [
      ["Berbelanja, memesan makanan, dan menanyakan arah.", "Shop, order food and ask for directions.", "Comprar, pedir comida y preguntar direcciones."],
      ["Menceritakan rutinitas, keluarga, dan pekerjaan.", "Talk about routines, family and work.", "Hablar de rutinas, familia y trabajo."],
      ["Menulis pesan pendek dan mengisi formulir.", "Write short messages and fill in forms.", "Escribir mensajes cortos y rellenar formularios."],
    ],
  },
  B1: {
    icon: "🌳",
    name: ["Menengah — Mandiri", "Intermediate — Independent", "Intermedio — Independiente"],
    can: [
      ["Mengatasi hampir semua situasi saat bepergian.", "Handle most situations that come up while travelling.", "Resolver casi cualquier situación al viajar."],
      ["Menceritakan pengalaman, rencana, dan alasan.", "Describe experiences, plans and reasons.", "Describir experiencias, planes y razones."],
      ["Mengikuti percakapan sehari-hari dengan lancar.", "Follow everyday conversation comfortably.", "Seguir una conversación cotidiana con soltura."],
    ],
  },
  B2: {
    icon: "🏔️",
    name: ["Lanjutan — Berargumen", "Advanced — Arguing a case", "Avanzado — Argumentar"],
    can: [
      ["Berdiskusi tentang topik rumit dan abstrak.", "Discuss complex and abstract topics.", "Debatir temas complejos y abstractos."],
      ["Menyampaikan pendapat lengkap dengan alasan.", "Give an opinion and back it with reasons.", "Dar una opinión y respaldarla con razones."],
      ["Berinteraksi dengan penutur asli tanpa tegang.", "Interact with native speakers without strain.", "Interactuar con nativos sin tensión."],
    ],
  },
  C1: {
    icon: "🎓",
    name: ["Mahir — Luwes & tepat", "Proficient — Flexible & precise", "Competente — Flexible y preciso"],
    can: [
      ["Memakai bahasa secara luwes untuk kerja & studi.", "Use the language flexibly for work and study.", "Usar el idioma con flexibilidad en trabajo y estudio."],
      ["Menangkap makna tersirat dan nada bicara.", "Catch implied meaning and shifts in tone.", "Captar el sentido implícito y los matices de tono."],
      ["Menyusun teks panjang yang runtut dan jelas.", "Produce long, well-structured texts.", "Redactar textos largos y bien estructurados."],
    ],
  },
  C2: {
    icon: "👑",
    name: ["Ahli — Nuansa penuh", "Expert — Full nuance", "Experto — Matiz total"],
    can: [
      ["Memahami hampir semua yang dibaca dan didengar.", "Understand virtually everything read or heard.", "Comprender prácticamente todo lo leído u oído."],
      ["Berbicara spontan dengan nuansa yang tepat.", "Speak spontaneously with precise nuance.", "Expresarte con espontaneidad y matices exactos."],
      ["Memakai idiom, register, dan gaya secara sadar.", "Wield idiom, register and style deliberately.", "Manejar modismos, registro y estilo a voluntad."],
    ],
  },
};

/* --------------------------------------------------------------- the index
   `n` is the entry count, kept here so cards and the learning path can show
   dictionary sizes without downloading a single entry. Kept in sync with the
   chunks by tests/lexicon.test.mjs. */
export const LEXICONS = [
  { id: "en", n: 168 },
  { id: "es", n: 168 },
  { id: "fr", n: 168 },
  { id: "de", n: 144 },
  { id: "ja", n: 144 },
  { id: "ko", n: 167 },
  { id: "zh", n: 144 },
  { id: "ar", n: 144 },
  { id: "it", n: 144 },
  { id: "pt", n: 144 },
  { id: "ru", n: 144 },
  { id: "hi", n: 144 },
  { id: "ms", n: 144 },
  { id: "nl", n: 144 },
  { id: "sv", n: 144 },
  { id: "tr", n: 144 },
  { id: "tl", n: 144 },
  { id: "vi", n: 144 },
  { id: "pl", n: 144 },
  { id: "th", n: 144 },
  { id: "el", n: 144 },
  { id: "uk", n: 144 },
  { id: "sw", n: 144 },
];

export const lexiconMeta = (id) => LEXICONS.find((l) => l.id === id);
export const lexiconSize = (id) => (lexiconMeta(id) || { n: 0 }).n;

/* ------------------------------------------------------------- alphabet
   A printed dictionary is browsed by its own alphabet, not by ours. Latin
   headwords bucket on their folded first letter; Cyrillic, Greek, Arabic,
   Devanagari and Thai bucket on their own first letter; Hangul buckets on the
   leading jamo (가나다순); Japanese and Chinese bucket on the romanisation,
   exactly like a rōmaji or Hanyu Pinyin index at the back of a real volume. */
const HANGUL_LEAD = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

const LATIN = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const ALPHABETS = {
  cyr: "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЮЯ".split(""),
  ukr: "АБВГДЕЖЗИІКЛМНОПРСТУФХЦЧШЩЮЯ".split(""),
  gre: "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ".split(""),
  ara: "ابتثجحخدذرزسشصضطظعغفقكلمنهوي".split(""),
  dev: "अआइईउऊएऐओऔकखगघचछजझटठडढणतथदधनपफबभमयरलवशषसह".split(""),
  tha: "กขคงจฉชซญดตถทธนบปผฝพฟภมยรลวศสหอฮ".split(""),
  han: HANGUL_LEAD,
};

/** Which alphabet a language is browsed by (absent = Latin, on the headword). */
const SCRIPT_OF = {
  ru: "cyr", uk: "ukr", el: "gre", ar: "ara", hi: "dev", th: "tha", ko: "han",
};
/** Languages indexed on their romanisation rather than their own script. */
const BY_READING = new Set(["ja", "zh"]);

/** The letter strip for a language — the tabs down the edge of the book. */
export function alphabetOf(lang) {
  const s = SCRIPT_OF[lang];
  return s ? ALPHABETS[s].slice() : LATIN.slice();
}

/** Latin letters that are not a base letter plus a combining mark, so NFD
 *  cannot fold them: Polish Ł, Nordic Ø/Æ, Croatian Đ, German ß… They share a
 *  tab with the base letter a reader would look under. */
const LATIN_BASE = { "Ł": "L", "Ø": "O", "Æ": "A", "Œ": "O", "Ð": "D", "Đ": "D", "Þ": "T", "ß": "S", "Ĳ": "I" };

/** Arabic letters written with a hamza or a final variant are looked up under
 *  their base letter, exactly as a printed Arabic dictionary indexes them. */
const ARABIC_BASE = { "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ة": "ه", "ى": "ي", "ئ": "ي", "ؤ": "و" };

/** Thai writes four vowels *before* the consonant they follow. A dictionary
 *  files such a word under the consonant, so skip the leading vowel sign. */
const THAI_LEAD_VOWELS = "เแโใไ";

/** Which letter bucket an entry belongs to ("#" for anything unclassifiable). */
export function letterOf(lang, w, r) {
  const src = BY_READING.has(lang) ? r || w : w;
  const chars = Array.from(String(src).trim());
  let ch = chars[0] || "";
  if (lang === "th" && THAI_LEAD_VOWELS.includes(ch)) ch = chars[1] || ch;
  if (ARABIC_BASE[ch]) ch = ARABIC_BASE[ch];
  if (!ch) return "#";
  const code = ch.codePointAt(0);
  if (SCRIPT_OF[lang] === "han" && code >= 0xac00 && code <= 0xd7a3) {
    return HANGUL_LEAD[Math.floor((code - 0xac00) / 588)] || "#";
  }
  const up = LATIN_BASE[ch.toUpperCase()] || ch.toUpperCase();
  const alphabet = alphabetOf(lang);
  if (alphabet.includes(up)) return up;
  // Latin with diacritics (é, ñ, ø…) folds onto its base letter.
  const folded = fold(up).toUpperCase();
  if (alphabet.includes(folded)) return folded;
  // Greek final sigma, Arabic alef variants, Thai/Devanagari ligatures…
  const near = alphabet.find((a) => fold(a).toUpperCase() === folded);
  return near || "#";
}

/* --------------------------------------------------------------- normalise */
const tri = (a) => (Array.isArray(a) ? { id: a[0], en: a[1], es: a[2] } : a);

function normalize(lang, raw, i) {
  const e = {
    lang, i,
    w: raw.w,
    r: raw.r || "",
    ipa: raw.ipa || "",
    pos: raw.pos,
    cefr: raw.cefr,
    gen: raw.gen || "",
    g: tri(raw.g),
    /* A definition is optional: a transparent concrete noun ("door", "spoon")
       is fully served by its gloss, exactly as printed dictionaries treat them.
       Anything abstract, idiomatic or easily confused still carries one. */
    d: raw.d ? tri(raw.d) : null,
    ex: raw.ex ? { t: raw.ex[0], m: tri(raw.ex.slice(1)) } : null,
    syn: raw.syn || [],
    ant: raw.ant || [],
    note: raw.note ? tri(raw.note) : null,
    /** Stable favourite key. Kept outside the `course/lesson#index` namespace
     *  on purpose — state.favPool() skips `lex/` keys instead of pruning them. */
    key: `lex/${lang}/${raw.w}`,
  };
  e.letter = letterOf(lang, e.w, e.r);
  e.hay = fold([e.w, e.r, e.ipa, e.g.id, e.g.en, e.g.es, e.d && e.d.id, e.d && e.d.en, e.d && e.d.es,
    e.ex && e.ex.t, e.ex && e.ex.m.id, e.ex && e.ex.m.en, e.ex && e.ex.m.es,
    e.syn.join(" "), e.ant.join(" ")].filter(Boolean).join(" "));
  return e;
}

/* ----------------------------------------------------------- lazy loading */
const loading = new Map(); // lang -> Promise, so concurrent callers share a fetch
const books = new Map(); // lang -> { lang, entries, byWord, guide }

export const lexiconLoaded = (lang) => books.has(lang);
export const getLexicon = (lang) => books.get(lang) || null;

/** Load one dictionary and index it. Idempotent; unknown ids resolve to null. */
export function loadLexicon(lang) {
  if (books.has(lang)) return Promise.resolve(books.get(lang));
  if (loading.has(lang)) return loading.get(lang);
  if (!lexiconMeta(lang)) return Promise.resolve(null);
  const p = import(`./lexicon/${lang}.js`)
    .then((mod) => {
      const list = (mod.default || []).map((raw, i) => normalize(lang, raw, i));
      // Alphabetical in the language's own collation — Swedish å ä ö really do
      // come after z, and Spanish ñ really does come after n. Letter buckets
      // sort first so each tab in the A–Z strip is one contiguous block: the
      // collator alone can interleave, e.g. Hangul ㄱ and ㄲ.
      const collator = new Intl.Collator(lang, { sensitivity: "base" });
      const keyOf = (e) => (BY_READING.has(lang) ? e.r || e.w : e.w);
      const order = alphabetOf(lang);
      const rank = (e) => {
        const i = order.indexOf(e.letter);
        return i < 0 ? order.length : i;
      };
      list.sort((a, b) => rank(a) - rank(b) || collator.compare(keyOf(a), keyOf(b)));
      list.forEach((e, i) => (e.i = i));
      const book = {
        lang,
        entries: list,
        byWord: new Map(list.map((e) => [e.w, e])),
        guide: mod.guide || null,
      };
      books.set(lang, book);
      loading.delete(lang);
      return book;
    })
    .catch((err) => {
      loading.delete(lang);
      throw err;
    });
  loading.set(lang, p);
  return p;
}

/** Load several dictionaries at once; failures resolve to null, never throw. */
export function loadLexicons(langs) {
  return Promise.all([...new Set(langs)].filter(Boolean).map((l) => loadLexicon(l).catch(() => null)));
}

/** Load every dictionary — only the cross-language search needs this. */
export const loadAllLexicons = () => loadLexicons(LEXICONS.map((l) => l.id));

/* ------------------------------------------------- entries as study cards
   The practice modes all speak one shape: { key, c, l, it }. A dictionary
   entry becomes that shape here, so Review, Quick Mix and Fix-Mistakes can
   drill a headword without knowing the dictionary exists. */

/** Where a dictionary card says it came from — a lesson-shaped stand-in. */
const DICT_LESSON = { id: "lex", icon: "📖", title: { id: "Kamus", en: "Dictionary", es: "Diccionario" }, items: [] };
export const dictLesson = (entry) => ({ ...DICT_LESSON, level: BAND_LEVEL[entry.cefr] });

/** The vocabulary-item view of an entry: same fields a lesson word carries. */
export const dictItem = (entry) => ({
  term: entry.w,
  reading: entry.r || undefined,
  m: entry.g,
  ex: entry.ex || undefined,
});

/** Look up one headword (exact match) in an already loaded dictionary. */
export function findEntry(lang, word) {
  const book = books.get(lang);
  return book ? book.byWord.get(word) || null : null;
}

/** Every loaded entry, flattened — the cross-language search index. */
export function allEntries() {
  const out = [];
  for (const book of books.values()) out.push(...book.entries);
  return out;
}

/** Entries of one band, in book order. */
export const bandEntries = (book, band) => book.entries.filter((e) => e.cefr === band);

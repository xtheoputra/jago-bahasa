/* =========================================================================
   scripts.js — Writing-system trainers for non-Latin courses.
   Each script is a flat list of { ch, rom } (character + romanization/sound),
   used by the "Script Trainer" flashcard mode. `speech` drives TTS.
   ========================================================================= */
export const SCRIPTS = [
  {
    id: "hiragana", lang: "ja", speech: "ja-JP", cjk: true, flag: "🇯🇵",
    name: { id: "Hiragana (Jepang)", en: "Hiragana (Japanese)", es: "Hiragana (japonés)" },
    chars: [
      { ch: "あ", rom: "a" }, { ch: "い", rom: "i" }, { ch: "う", rom: "u" }, { ch: "え", rom: "e" }, { ch: "お", rom: "o" },
      { ch: "か", rom: "ka" }, { ch: "き", rom: "ki" }, { ch: "く", rom: "ku" }, { ch: "け", rom: "ke" }, { ch: "こ", rom: "ko" },
      { ch: "さ", rom: "sa" }, { ch: "し", rom: "shi" }, { ch: "す", rom: "su" }, { ch: "せ", rom: "se" }, { ch: "そ", rom: "so" },
      { ch: "た", rom: "ta" }, { ch: "ち", rom: "chi" }, { ch: "つ", rom: "tsu" }, { ch: "て", rom: "te" }, { ch: "と", rom: "to" },
      { ch: "な", rom: "na" }, { ch: "に", rom: "ni" }, { ch: "ぬ", rom: "nu" }, { ch: "ね", rom: "ne" }, { ch: "の", rom: "no" },
      { ch: "は", rom: "ha" }, { ch: "ひ", rom: "hi" }, { ch: "ふ", rom: "fu" }, { ch: "へ", rom: "he" }, { ch: "ほ", rom: "ho" },
      { ch: "ま", rom: "ma" }, { ch: "み", rom: "mi" }, { ch: "む", rom: "mu" }, { ch: "め", rom: "me" }, { ch: "も", rom: "mo" },
      { ch: "や", rom: "ya" }, { ch: "ゆ", rom: "yu" }, { ch: "よ", rom: "yo" },
      { ch: "ら", rom: "ra" }, { ch: "り", rom: "ri" }, { ch: "る", rom: "ru" }, { ch: "れ", rom: "re" }, { ch: "ろ", rom: "ro" },
      { ch: "わ", rom: "wa" }, { ch: "を", rom: "wo" }, { ch: "ん", rom: "n" },
    ],
  },
  {
    id: "hangul", lang: "ko", speech: "ko-KR", cjk: true, flag: "🇰🇷",
    name: { id: "Hangul (Korea)", en: "Hangul (Korean)", es: "Hangul (coreano)" },
    chars: [
      { ch: "ㄱ", rom: "g / k" }, { ch: "ㄴ", rom: "n" }, { ch: "ㄷ", rom: "d / t" }, { ch: "ㄹ", rom: "r / l" }, { ch: "ㅁ", rom: "m" },
      { ch: "ㅂ", rom: "b / p" }, { ch: "ㅅ", rom: "s" }, { ch: "ㅇ", rom: "ng / —" }, { ch: "ㅈ", rom: "j" }, { ch: "ㅊ", rom: "ch" },
      { ch: "ㅋ", rom: "k" }, { ch: "ㅌ", rom: "t" }, { ch: "ㅍ", rom: "p" }, { ch: "ㅎ", rom: "h" },
      { ch: "ㅏ", rom: "a" }, { ch: "ㅑ", rom: "ya" }, { ch: "ㅓ", rom: "eo" }, { ch: "ㅕ", rom: "yeo" }, { ch: "ㅗ", rom: "o" },
      { ch: "ㅛ", rom: "yo" }, { ch: "ㅜ", rom: "u" }, { ch: "ㅠ", rom: "yu" }, { ch: "ㅡ", rom: "eu" }, { ch: "ㅣ", rom: "i" },
    ],
  },
  {
    id: "cyrillic", lang: "ru", speech: "ru-RU", flag: "🇷🇺",
    name: { id: "Kiril (Rusia)", en: "Cyrillic (Russian)", es: "Cirílico (ruso)" },
    chars: [
      { ch: "А", rom: "a" }, { ch: "Б", rom: "b" }, { ch: "В", rom: "v" }, { ch: "Г", rom: "g" }, { ch: "Д", rom: "d" },
      { ch: "Е", rom: "ye" }, { ch: "Ё", rom: "yo" }, { ch: "Ж", rom: "zh" }, { ch: "З", rom: "z" }, { ch: "И", rom: "i" },
      { ch: "Й", rom: "y" }, { ch: "К", rom: "k" }, { ch: "Л", rom: "l" }, { ch: "М", rom: "m" }, { ch: "Н", rom: "n" },
      { ch: "О", rom: "o" }, { ch: "П", rom: "p" }, { ch: "Р", rom: "r" }, { ch: "С", rom: "s" }, { ch: "Т", rom: "t" },
      { ch: "У", rom: "u" }, { ch: "Ф", rom: "f" }, { ch: "Х", rom: "kh" }, { ch: "Ц", rom: "ts" }, { ch: "Ч", rom: "ch" },
      { ch: "Ш", rom: "sh" }, { ch: "Щ", rom: "shch" }, { ch: "Ъ", rom: "—" }, { ch: "Ы", rom: "y" }, { ch: "Ь", rom: "'" },
      { ch: "Э", rom: "e" }, { ch: "Ю", rom: "yu" }, { ch: "Я", rom: "ya" },
    ],
  },
  {
    id: "arabic", lang: "ar", speech: "ar-SA", rtl: true, flag: "🇸🇦",
    name: { id: "Abjad Arab", en: "Arabic Alphabet", es: "Alfabeto árabe" },
    chars: [
      { ch: "ا", rom: "alif (a)" }, { ch: "ب", rom: "ba (b)" }, { ch: "ت", rom: "ta (t)" }, { ch: "ث", rom: "tha (th)" },
      { ch: "ج", rom: "jim (j)" }, { ch: "ح", rom: "ha (ḥ)" }, { ch: "خ", rom: "kha (kh)" }, { ch: "د", rom: "dal (d)" },
      { ch: "ذ", rom: "dhal (dh)" }, { ch: "ر", rom: "ra (r)" }, { ch: "ز", rom: "zay (z)" }, { ch: "س", rom: "sin (s)" },
      { ch: "ش", rom: "shin (sh)" }, { ch: "ص", rom: "sad (ṣ)" }, { ch: "ض", rom: "dad (ḍ)" }, { ch: "ط", rom: "ta (ṭ)" },
      { ch: "ظ", rom: "za (ẓ)" }, { ch: "ع", rom: "ayn (ʿ)" }, { ch: "غ", rom: "ghayn (gh)" }, { ch: "ف", rom: "fa (f)" },
      { ch: "ق", rom: "qaf (q)" }, { ch: "ك", rom: "kaf (k)" }, { ch: "ل", rom: "lam (l)" }, { ch: "م", rom: "mim (m)" },
      { ch: "ن", rom: "nun (n)" }, { ch: "ه", rom: "ha (h)" }, { ch: "و", rom: "waw (w)" }, { ch: "ي", rom: "ya (y)" },
    ],
  },
  {
    id: "thai", lang: "th", speech: "th-TH", flag: "🇹🇭",
    name: { id: "Konsonan Thai", en: "Thai Consonants", es: "Consonantes tailandesas" },
    chars: [
      { ch: "ก", rom: "k (kai)" }, { ch: "ข", rom: "kh (khai)" }, { ch: "ค", rom: "kh (khwai)" }, { ch: "ง", rom: "ng (ngu)" },
      { ch: "จ", rom: "ch (chan)" }, { ch: "ฉ", rom: "ch (ching)" }, { ch: "ช", rom: "ch (chang)" }, { ch: "ซ", rom: "s (so)" },
      { ch: "ด", rom: "d (dek)" }, { ch: "ต", rom: "t (tao)" }, { ch: "ท", rom: "th (thahan)" }, { ch: "น", rom: "n (nu)" },
      { ch: "บ", rom: "b (baimai)" }, { ch: "ป", rom: "p (pla)" }, { ch: "ผ", rom: "ph (phueng)" }, { ch: "ฝ", rom: "f (fa)" },
      { ch: "พ", rom: "ph (phan)" }, { ch: "ฟ", rom: "f (fan)" }, { ch: "ม", rom: "m (ma)" }, { ch: "ย", rom: "y (yak)" },
      { ch: "ร", rom: "r (ruea)" }, { ch: "ล", rom: "l (ling)" }, { ch: "ว", rom: "w (waen)" }, { ch: "ส", rom: "s (suea)" },
      { ch: "ห", rom: "h (hip)" }, { ch: "อ", rom: "o (ang)" },
    ],
  },
  {
    id: "greek", lang: "el", speech: "el-GR", flag: "🇬🇷",
    name: { id: "Alfabet Yunani", en: "Greek Alphabet", es: "Alfabeto griego" },
    chars: [
      { ch: "Α α", rom: "alfa (a)" }, { ch: "Β β", rom: "vita (v)" }, { ch: "Γ γ", rom: "gama (gh/y)" }, { ch: "Δ δ", rom: "delta (dh)" },
      { ch: "Ε ε", rom: "epsilon (e)" }, { ch: "Ζ ζ", rom: "zita (z)" }, { ch: "Η η", rom: "ita (i)" }, { ch: "Θ θ", rom: "thita (th)" },
      { ch: "Ι ι", rom: "iota (i)" }, { ch: "Κ κ", rom: "kapa (k)" }, { ch: "Λ λ", rom: "lamda (l)" }, { ch: "Μ μ", rom: "mi (m)" },
      { ch: "Ν ν", rom: "ni (n)" }, { ch: "Ξ ξ", rom: "ksi (ks)" }, { ch: "Ο ο", rom: "omikron (o)" }, { ch: "Π π", rom: "pi (p)" },
      { ch: "Ρ ρ", rom: "ro (r)" }, { ch: "Σ σ/ς", rom: "sigma (s)" }, { ch: "Τ τ", rom: "taf (t)" }, { ch: "Υ υ", rom: "ipsilon (i)" },
      { ch: "Φ φ", rom: "fi (f)" }, { ch: "Χ χ", rom: "hi (kh)" }, { ch: "Ψ ψ", rom: "psi (ps)" }, { ch: "Ω ω", rom: "omega (o)" },
    ],
  },
  {
    id: "cyrillic-uk", lang: "uk", speech: "uk-UA", flag: "🇺🇦",
    name: { id: "Kiril (Ukraina)", en: "Cyrillic (Ukrainian)", es: "Cirílico (ucraniano)" },
    chars: [
      { ch: "А", rom: "a" }, { ch: "Б", rom: "b" }, { ch: "В", rom: "v" }, { ch: "Г", rom: "h" }, { ch: "Ґ", rom: "g" },
      { ch: "Д", rom: "d" }, { ch: "Е", rom: "e" }, { ch: "Є", rom: "ye" }, { ch: "Ж", rom: "zh" }, { ch: "З", rom: "z" },
      { ch: "И", rom: "y" }, { ch: "І", rom: "i" }, { ch: "Ї", rom: "yi" }, { ch: "Й", rom: "y (short)" }, { ch: "К", rom: "k" },
      { ch: "Л", rom: "l" }, { ch: "М", rom: "m" }, { ch: "Н", rom: "n" }, { ch: "О", rom: "o" }, { ch: "П", rom: "p" },
      { ch: "Р", rom: "r" }, { ch: "С", rom: "s" }, { ch: "Т", rom: "t" }, { ch: "У", rom: "u" }, { ch: "Ф", rom: "f" },
      { ch: "Х", rom: "kh" }, { ch: "Ц", rom: "ts" }, { ch: "Ч", rom: "ch" }, { ch: "Ш", rom: "sh" }, { ch: "Щ", rom: "shch" },
      { ch: "Ь", rom: "(soft sign)" }, { ch: "Ю", rom: "yu" }, { ch: "Я", rom: "ya" },
    ],
  },
];

export const findScript = (id) => SCRIPTS.find((s) => s.id === id);

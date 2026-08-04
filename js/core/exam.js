/* =========================================================================
   core/exam.js — the stage exam: proving a CEFR band, not just visiting it.

   The path shows six stages and plenty of practice, but nothing ever said
   "your A1 is done". An exam closes that loop. It deliberately draws from
   BOTH halves of the app — the lessons of that difficulty tier and the
   dictionary band — because a stage is the pair, not either one alone, and it
   asks in three directions so recognition alone cannot carry a pass:

     mean  meaning → which word is it?      (recognition)
     term  word    → what does it mean?     (recall)
     gap   sentence with a hole → fill it   (use)

   Pure data in, pure questions out: no DOM, no state, so the whole generator
   is testable in Node.
   ========================================================================= */
import { shuffle } from "./random.js";
import { mean } from "./dom.js";
import { BAND_LEVEL } from "../lexicon.js";

/** A pass is 80%: high enough to mean something, low enough that one slip on
 *  a 15-question paper does not undo an otherwise solid stage. */
export const PASS_PCT = 80;
export const EXAM_QUESTIONS = 15;
/** Under this there is not enough material in a stage to certify anything. */
export const MIN_POOL = 8;

const OPTIONS = 4;
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Languages that write without spaces cannot use a letter boundary: in
 *  「本を読む」every neighbour of every word is itself a letter. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;

/** Blank out the headword inside its own example. Returns null when the
 *  example does not actually contain the word (an inflected or idiomatic
 *  example is common, and a gap nobody can fill is worse than no gap).
 *
 *  Two things a naive replace gets wrong, both of which hand the learner the
 *  answer. It blanks only the first hit, so "Comer es comer bien." keeps a
 *  second "comer" in plain sight; and it matches inside longer words, so the
 *  Spanish "es" turns "Esto es un libro." into "____to es un libro." — a
 *  mangled word, with the real answer still sitting there. So: every
 *  occurrence, and only whole words. The boundary is written as a captured
 *  non-letter rather than a lookbehind, which Safari only learned in 16.4. */
export function gapSentence(sentence, term) {
  const s = String(sentence || ""), w = String(term || "");
  if (!s || !w) return null;
  const body = escRe(w);
  const re = UNSPACED.test(w)
    ? new RegExp(body, "giu")
    : new RegExp(`(^|\\P{L})${body}(?!\\p{L})`, "giu");
  if (!re.test(s)) return null;
  re.lastIndex = 0; // `test` on a /g/ regex leaves the cursor mid-string.
  return s.replace(re, UNSPACED.test(w) ? "____" : "$1____");
}

/** Everything a stage can be examined on, from both halves of the app.
 *  A word that lives in the lesson *and* in the dictionary is one candidate,
 *  not two — but it keeps whichever of the pair carries an example or a
 *  definition, so merging never costs the richer question. */
export function examCandidates(course, book, band) {
  const level = BAND_LEVEL[band];
  const byTerm = new Map();
  const add = (cand) => {
    const k = String(cand.term || "").toLowerCase();
    if (!k) return;
    const kept = byTerm.get(k);
    if (!kept) return void byTerm.set(k, cand);
    if (!kept.ex && cand.ex) kept.ex = cand.ex;
    if (!kept.hint && cand.hint) kept.hint = cand.hint;
    if (!kept.reading && cand.reading) kept.reading = cand.reading;
  };

  for (const l of (course && course.lessons) || []) {
    if (l.level !== level) continue;
    (l.items || []).forEach((it, i) =>
      add({
        key: `${course.id}/${l.id}#${i}`,
        term: it.term,
        reading: it.reading || "",
        meaning: it.m,
        hint: null,
        ex: it.ex || null,
        from: "lesson",
      })
    );
  }
  for (const e of (book && book.entries) || []) {
    if (e.cefr !== band) continue;
    add({
      key: e.key,
      term: e.w,
      reading: e.r || "",
      meaning: e.g,
      hint: e.d || null,
      ex: e.ex || null,
      from: "dict",
    });
  }
  return [...byTerm.values()];
}

/** Three or fewer plausible wrong answers, never repeating the right one.
 *  Options are compared by the text actually shown: two different words that
 *  gloss the same way would make a question with two correct answers.
 *
 *  Distractors are chosen closest in length to the answer, because the pool
 *  mixes dictionary headwords with whole dialogue lines. Drawn at random, a
 *  sentence answer lands among three single words and can be picked out on
 *  shape alone — no knowledge of the language required. Sorting by distance
 *  needs no thresholds and works in scripts that write without spaces, where
 *  counting words would say every sentence is one word long. */
function optionsFor(answer, pool, textOf) {
  const target = Array.from(String(answer)).length;
  const seen = new Set([answer]);
  const texts = [];
  for (const cand of shuffle(pool)) {
    const text = textOf(cand);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    texts.push(text);
  }
  // Shuffled first, and V8's sort is stable, so equally-close candidates still
  // vary between sittings instead of always producing the same four options.
  texts.sort(
    (a, b) => Math.abs(Array.from(a).length - target) - Math.abs(Array.from(b).length - target)
  );
  return shuffle([answer, ...texts.slice(0, OPTIONS - 1)]);
}

/** Turn chosen candidates into questions, drawing distractors from `pool`. */
function makePaper(picks, pool) {
  const termOf = (c) => c.term;
  const meaningOf = (c) => mean(c.meaning);

  return picks.map((c, i) => {
    const others = pool.filter((x) => x !== c);
    const gap = c.ex ? gapSentence(c.ex.t, c.term) : null;
    // Rotate through the three directions so a paper is never all-recognition;
    // a candidate with no usable example simply takes the next best question.
    const wanted = ["mean", "term", "gap"][i % 3];
    const type = wanted === "gap" && !gap ? "term" : wanted;

    if (type === "term") {
      return {
        type, key: c.key, term: c.term,
        prompt: c.term,
        sub: c.reading || "",
        answer: meaningOf(c),
        options: optionsFor(meaningOf(c), others, meaningOf),
        script: false,
      };
    }
    const promptText = type === "gap" ? gap : mean(c.hint || c.meaning);
    return {
      type, key: c.key, term: c.term,
      prompt: promptText,
      sub: type === "gap" ? mean(c.ex.m) : c.hint ? meaningOf(c) : "",
      answer: c.term,
      options: optionsFor(c.term, others, termOf),
      script: true,
    };
  });
}

/** Build one exam paper. Returns null when the stage is too thin to certify. */
export function buildExam(course, book, band, count = EXAM_QUESTIONS) {
  const pool = examCandidates(course, book, band);
  if (pool.length < MIN_POOL) return null;
  return makePaper(shuffle(pool).slice(0, Math.min(count, pool.length)), pool);
}

/* ------------------------------------------------------ the final paper
   A stage exam proves you reached a band. It cannot prove you still hold the
   ones underneath it — a learner can certify A1, spend two months on B1 and
   quietly lose half of A1 on the way. The comprehensive paper is the answer
   to that: it draws across every band already certified, so passing it means
   the whole ladder is still standing, not just the rung you are on. */

/** How long the comprehensive paper is. Longer than a stage exam because it
 *  has more ground to cover, still short enough to sit in one go. */
export const FINAL_QUESTIONS = 25;
/** Combining one band with itself is just a stage exam under another name. */
export const FINAL_MIN_BANDS = 2;

/** Build a paper spanning several bands at once. Returns null when fewer than
 *  FINAL_MIN_BANDS of them hold enough material to be worth asking about.
 *
 *  Bands are drawn round-robin rather than proportionally: a thin band
 *  contributes what it has and drops out, and the rest keep going, so no band
 *  can dominate the paper and none is silently skipped. */
export function buildFinalExam(course, book, bands, count = FINAL_QUESTIONS) {
  const decks = (bands || [])
    .map((b) => examCandidates(course, book, b))
    .filter((p) => p.length >= MIN_POOL)
    .map((p) => shuffle(p));
  if (decks.length < FINAL_MIN_BANDS) return null;

  const pool = decks.flat();
  const picks = [];
  /* A word can sit in two bands at once — Spanish "ir" is both an A1 lesson
     item and an A2 headword — and each band's deck is built independently, so
     without this the same question can be asked twice on one paper. */
  const taken = new Set();
  for (let round = 0; picks.length < count; round++) {
    let drew = false;
    for (const deck of decks) {
      if (round >= deck.length) continue;
      drew = true;
      const cand = deck[round];
      const k = String(cand.term).toLowerCase();
      if (taken.has(k)) continue;
      taken.add(k);
      picks.push(cand);
      if (picks.length >= count) break;
    }
    if (!drew) break; // every band exhausted
  }
  // Interleaved by construction; shuffle so the difficulty does not arrive in
  // a predictable A1, A2, B1, A1, A2, B1… cycle.
  return makePaper(shuffle(picks), pool);
}

/** Score a finished paper the way the certificate reads it. */
export const examPct = (correct, total) => (total ? Math.round((correct / total) * 100) : 0);
export const isPass = (pct) => pct >= PASS_PCT;

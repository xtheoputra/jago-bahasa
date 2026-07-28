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

/** Blank out the headword inside its own example. Returns null when the
 *  example does not actually contain the word (an inflected or idiomatic
 *  example is common, and a gap nobody can fill is worse than no gap). */
export function gapSentence(sentence, term) {
  const s = String(sentence || ""), w = String(term || "");
  if (!s || !w) return null;
  const re = new RegExp(escRe(w), "iu");
  if (!re.test(s)) return null;
  return s.replace(re, "____");
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
 *  gloss the same way would make a question with two correct answers. */
function optionsFor(answer, pool, textOf) {
  const seen = new Set([answer]);
  const out = [answer];
  for (const cand of shuffle(pool)) {
    if (out.length >= OPTIONS) break;
    const text = textOf(cand);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return shuffle(out);
}

/** Build one exam paper. Returns null when the stage is too thin to certify. */
export function buildExam(course, book, band, count = EXAM_QUESTIONS) {
  const pool = examCandidates(course, book, band);
  if (pool.length < MIN_POOL) return null;

  const termOf = (c) => c.term;
  const meaningOf = (c) => mean(c.meaning);
  const picks = shuffle(pool).slice(0, Math.min(count, pool.length));

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

/** Score a finished paper the way the certificate reads it. */
export const examPct = (correct, total) => (total ? Math.round((correct / total) * 100) : 0);
export const isPass = (pct) => pct >= PASS_PCT;

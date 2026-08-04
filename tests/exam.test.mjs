/* =========================================================================
   tests/exam.test.mjs — the stage exam has to be a fair paper.

   A certificate is only worth something if the paper behind it is sound: no
   question with two right answers, no question whose answer is not among the
   options, nothing asked from outside the stage, and a gap that actually has
   a gap in it. All of that is pure data, so it is checked here in Node — the
   browser only has to click the buttons.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

import { findCourse, loadCourse } from "../js/data.js";
import { BAND_LEVEL, getLexicon, loadLexicon } from "../js/lexicon.js";
import { buildExam, buildFinalExam, examCandidates, gapSentence, MIN_POOL, EXAM_QUESTIONS,
  FINAL_QUESTIONS, FINAL_MIN_BANDS, PASS_PCT, examPct, isPass } from "../js/core/exam.js";

const LANG = "es";
await loadCourse(LANG);
await loadLexicon(LANG);
const course = findCourse(LANG);
const book = getLexicon(LANG);

test("a stage paper only asks about that stage", () => {
  for (const band of ["A1", "B1", "C2"]) {
    const allowed = new Set(examCandidates(course, book, band).map((c) => c.term));
    const paper = buildExam(course, book, band);
    if (!paper) continue; // a stage too thin to certify is tested separately
    for (const q of paper) {
      assert.ok(allowed.has(q.term), `${band} asked about "${q.term}", which is not in the stage`);
    }
  }
});

test("candidates come from the lessons AND the dictionary of the stage", () => {
  const band = "A1";
  const cands = examCandidates(course, book, band);
  const sources = new Set(cands.map((c) => c.from));
  assert.ok(sources.has("lesson"), "no lesson words reached the A1 exam pool");
  assert.ok(sources.has("dict"), "no dictionary words reached the A1 exam pool");
  // Everything must genuinely belong to the stage.
  const level = BAND_LEVEL[band];
  const lessonTerms = new Set(
    course.lessons.filter((l) => l.level === level).flatMap((l) => l.items.map((i) => i.term))
  );
  const dictTerms = new Set(book.entries.filter((e) => e.cefr === band).map((e) => e.w));
  for (const c of cands) {
    assert.ok(lessonTerms.has(c.term) || dictTerms.has(c.term), `"${c.term}" belongs to neither half of ${band}`);
  }
});

test("a word living in both halves is one candidate, not two", () => {
  const cands = examCandidates(course, book, "A1");
  const seen = new Set();
  for (const c of cands) {
    const k = c.term.toLowerCase();
    assert.ok(!seen.has(k), `"${c.term}" was offered twice in one paper pool`);
    seen.add(k);
  }
});

test("every question has one right answer among four distinct options", () => {
  const paper = buildExam(course, book, "A1");
  assert.ok(paper, "A1 should be examinable");
  assert.equal(paper.length, Math.min(EXAM_QUESTIONS, examCandidates(course, book, "A1").length));
  for (const q of paper) {
    assert.ok(q.options.includes(q.answer), `the answer to "${q.prompt}" is not on the paper`);
    assert.equal(new Set(q.options).size, q.options.length, `duplicate option in "${q.prompt}"`);
    assert.equal(q.options.filter((o) => o === q.answer).length, 1, "an option appears twice as the answer");
    assert.ok(q.options.length >= 2 && q.options.length <= 4, "unexpected option count");
    assert.ok(q.prompt && String(q.prompt).trim(), "a question with an empty prompt");
    assert.ok(q.key, "a question that schedules nothing");
  }
});

test("a paper asks in more than one direction", () => {
  // Recognition alone is the easiest way to fake competence; the paper must
  // mix meaning→word, word→meaning and fill-the-gap.
  const types = new Set(buildExam(course, book, "A1").map((q) => q.type));
  assert.ok(types.size >= 2, `a paper used only: ${[...types].join(", ")}`);
});

test("a gap question really hides its word, and the hidden word is the answer", () => {
  /* buildExam shuffles, so one paper only samples the pool — and a leak this
     test is meant to catch ("Comer es comer bien." keeping its second copy)
     lives in one entry out of hundreds. Sweep every band, repeatedly, so a
     regression fails every run rather than one run in twenty. */
  let seen = 0;
  for (const band of ["A1", "A2", "B1", "B2", "C1", "C2"]) {
    for (let round = 0; round < 12; round++) {
      const paper = buildExam(course, book, band, 60);
      if (!paper) continue;
      for (const q of paper.filter((x) => x.type === "gap")) {
        seen++;
        assert.ok(q.prompt.includes("____"), `gap question without a gap: "${q.prompt}"`);
        assert.ok(
          !q.prompt.toLowerCase().includes(q.term.toLowerCase()),
          `"${q.term}" is still visible in its own gap question: "${q.prompt}"`
        );
        assert.equal(q.answer, q.term);
      }
    }
  }
  assert.ok(seen > 50, `only ${seen} gap questions were generated across every band`);
});

test("gapSentence refuses a sentence that does not contain the word", () => {
  assert.equal(gapSentence("Quiero comer algo.", "comer"), "Quiero ____ algo.");
  assert.equal(gapSentence("Quiero comer algo.", "beber"), null, "a gap nobody can fill must not be made");
  assert.equal(gapSentence("Comer es vivir.", "comer"), "____ es vivir.", "the match must ignore case");
  assert.equal(gapSentence("", "comer"), null);
});

test("a gap hides every copy of the word, not just the first", () => {
  // Blanking one occurrence leaves the answer printed on the question itself.
  assert.equal(gapSentence("Comer es comer bien.", "comer"), "____ es ____ bien.");
  assert.equal(gapSentence("The best test is a test.", "test"), "The best ____ is a ____.");
});

test("a gap blanks whole words, never the middle of a longer one", () => {
  // The Spanish "es" used to turn this into "____to es un libro." — a mangled
  // word, with the one actually being asked about still sitting in the clear.
  assert.equal(gapSentence("Esto es un libro.", "es"), "Esto ____ un libro.");
  assert.equal(gapSentence("Ich lese ein Buch.", "lese"), "Ich ____ ein Buch.");
  assert.equal(gapSentence("A cat scatters.", "cat"), "A ____ scatters.");
});

test("scripts written without spaces still gap on a plain match", () => {
  // Japanese and Thai have no letter boundaries to lean on: every neighbour of
  // every word is itself a letter, so the boundary rule must not apply there.
  assert.equal(gapSentence("本を読む。", "読む"), "本を____。");
  assert.equal(gapSentence("ฉันกินข้าว", "กิน"), "ฉัน____ข้าว");
});

test("a stage too thin to certify yields no paper at all", () => {
  const thin = { id: "zz", lessons: [{ id: "x", level: BAND_LEVEL.A1, items: [{ term: "uno", m: { id: "satu", en: "one", es: "uno" } }] }] };
  assert.equal(buildExam(thin, null, "A1"), null, `one word must not be examinable (floor is ${MIN_POOL})`);
});

test("the pass mark is what the certificate claims it is", () => {
  assert.equal(examPct(12, 15), 80);
  assert.equal(isPass(examPct(12, 15)), true, `12/15 is ${PASS_PCT}% and must pass`);
  assert.equal(isPass(examPct(11, 15)), false, "11/15 is below the pass mark");
  assert.equal(examPct(0, 0), 0);
});

/* ------------------------------------------------------ the final paper */

test("the comprehensive paper draws on every band it was given", () => {
  const bands = ["A1", "A2", "B1"];
  const paper = buildFinalExam(course, book, bands, FINAL_QUESTIONS);
  assert.ok(paper, "three certified stages produced no comprehensive paper");
  assert.equal(paper.length, FINAL_QUESTIONS);

  // Every question must be traceable to one of the bands asked for, and each
  // of those bands must actually appear — a "comprehensive" paper that quietly
  // draws 25 questions from A1 alone is the stage exam with a bigger title.
  const owner = new Map();
  for (const b of bands) for (const c of examCandidates(course, book, b)) owner.set(c.term, b);
  const used = new Set();
  for (const q of paper) {
    const from = owner.get(q.term);
    assert.ok(from, `"${q.term}" came from outside every certified stage`);
    used.add(from);
  }
  assert.deepEqual([...used].sort(), bands, `the paper only reached: ${[...used].sort().join(", ")}`);
});

test("no band is allowed to dominate the comprehensive paper", () => {
  const bands = ["A1", "A2", "B1"];
  /* A handful of words belong to two bands at once (Spanish "ir" is an A1
     lesson item and an A2 headword). Those cannot be attributed to one band,
     so they are excluded from the tally rather than counted for whichever
     band happened to be scanned last. */
  const owners = new Map();
  for (const b of bands) {
    for (const c of examCandidates(course, book, b)) {
      owners.set(c.term, (owners.get(c.term) || new Set()).add(b));
    }
  }
  const soleOwner = (term) => {
    const set = owners.get(term);
    return set && set.size === 1 ? [...set][0] : null;
  };

  for (let round = 0; round < 10; round++) {
    const paper = buildFinalExam(course, book, bands, 24);
    const tally = {};
    let shared = 0;
    for (const q of paper) {
      const b = soleOwner(q.term);
      if (!b) { shared++; continue; }
      tally[b] = (tally[b] || 0) + 1;
    }
    const counts = bands.map((b) => tally[b] || 0);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1 + shared,
      `bands drawn unevenly: ${bands.map((b, i) => `${b}=${counts[i]}`).join(" ")}`);
  }
});

test("the comprehensive paper never asks the same word twice", () => {
  // The bands' decks are built independently, so a word living in two of them
  // would otherwise be drawn once from each.
  for (let round = 0; round < 30; round++) {
    const paper = buildFinalExam(course, book, ["A1", "A2", "B1"], 24);
    const terms = paper.map((q) => q.term.toLowerCase());
    const dupes = terms.filter((t, i) => terms.indexOf(t) !== i);
    assert.deepEqual(dupes, [], `the same word was asked twice: ${dupes.join(", ")}`);
  }
});

test("one certified stage is not enough for a comprehensive paper", () => {
  assert.equal(buildFinalExam(course, book, ["A1"]), null,
    `combining one band with itself is just a stage exam (floor is ${FINAL_MIN_BANDS})`);
  assert.equal(buildFinalExam(course, book, []), null, "no stages, no paper");
  assert.equal(buildFinalExam(course, book, null), null, "a missing band list must not throw");
});

test("a band too thin to certify is dropped, not padded out", () => {
  // A stage that cannot carry its own exam cannot carry part of the final one
  // either; asking about it would ask more than the learner ever certified.
  const thin = {
    id: "zz",
    lessons: [
      { id: "a", level: BAND_LEVEL.A1, items: [{ term: "uno", m: { id: "satu", en: "one", es: "uno" } }] },
      { id: "b", level: BAND_LEVEL.A2, items: [{ term: "dos", m: { id: "dua", en: "two", es: "dos" } }] },
    ],
  };
  assert.equal(buildFinalExam(thin, null, ["A1", "A2"]), null, "two one-word stages must not be examinable");
});

test("the odd one out cannot be spotted by its length alone", () => {
  /* The pool mixes dictionary headwords with whole dialogue lines, so a
     sentence answer used to land among three single words — "zapato", "día",
     "La habitación" against "Y yo compro el postre. ¡Nos vemos el sábado!".
     That is answerable without knowing a word of Spanish. */
  const len = (s) => Array.from(String(s)).length;
  let checked = 0;
  for (const bands of [["A1"], ["A2"], ["B1"], ["B2"]]) {
    for (let round = 0; round < 8; round++) {
      const paper = buildExam(course, book, bands[0], 60);
      if (!paper) continue;
      for (const q of paper) {
        if (q.options.length < 3) continue;
        checked++;
        const answer = len(q.answer);
        const wrong = q.options.filter((o) => o !== q.answer).map(len);
        const nearest = Math.min(...wrong.map((w) => Math.abs(w - answer)));
        // The answer must not stand more than twice as far from its nearest
        // rival as that rival's own share of the spread.
        assert.ok(
          nearest <= Math.max(6, answer),
          `"${q.answer}" (${answer} chars) stands alone among ${wrong.join(", ")} chars`
        );
      }
    }
  }
  assert.ok(checked > 100, `only ${checked} questions were checked`);
});

test("the comprehensive paper is a real paper, not a shorter one in disguise", () => {
  const paper = buildFinalExam(course, book, ["A1", "A2", "B1"], FINAL_QUESTIONS);
  const types = new Set(paper.map((q) => q.type));
  assert.ok(types.size >= 2, `a final paper used only: ${[...types].join(", ")}`);
  for (const q of paper) {
    assert.ok(q.options.includes(q.answer), `"${q.term}" has no right answer among its options`);
    assert.equal(new Set(q.options).size, q.options.length, `"${q.term}" repeats an option`);
    assert.ok(q.key, `"${q.term}" carries no SRS key, so sitting the paper schedules nothing`);
  }
  assert.ok(FINAL_QUESTIONS > EXAM_QUESTIONS, "the final paper should be longer than a stage paper");
});

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
import { buildExam, examCandidates, gapSentence, MIN_POOL, EXAM_QUESTIONS, PASS_PCT, examPct, isPass } from "../js/core/exam.js";

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
  const paper = buildExam(course, book, "A1", 60);
  const gaps = paper.filter((q) => q.type === "gap");
  assert.ok(gaps.length, "no gap questions were generated at all");
  for (const q of gaps) {
    assert.ok(q.prompt.includes("____"), `gap question without a gap: "${q.prompt}"`);
    assert.ok(
      !q.prompt.toLowerCase().includes(q.term.toLowerCase()),
      `"${q.term}" is still visible in its own gap question`
    );
    assert.equal(q.answer, q.term);
  }
});

test("gapSentence refuses a sentence that does not contain the word", () => {
  assert.equal(gapSentence("Quiero comer algo.", "comer"), "Quiero ____ algo.");
  assert.equal(gapSentence("Quiero comer algo.", "beber"), null, "a gap nobody can fill must not be made");
  assert.equal(gapSentence("Comer es vivir.", "comer"), "____ es vivir.", "the match must ignore case");
  assert.equal(gapSentence("", "comer"), null);
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

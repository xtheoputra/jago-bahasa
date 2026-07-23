/* =========================================================================
   tests/content.test.mjs — the course catalogue must always be playable.
   Every practice mode makes assumptions about the shape of js/data.js
   (4 quiz options, romanization for non-Latin scripts, dialogue arrays that
   line up with their lines…). These assertions encode those assumptions so a
   content edit can never quietly break a mode.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { COURSES, findCourse, findLesson } from "../js/data.js";
import { SCRIPTS, findScript } from "../js/scripts.js";

const UI_LANGS = ["id", "en", "es"];
/** Courses whose terms are not written in the Latin alphabet: every item there
 *  must carry a `reading`, because typing/dictation expect the romanization. */
const NON_LATIN = ["ja", "ko", "zh", "ar", "ru", "hi", "th", "el", "uk"];

const allLessons = () => COURSES.flatMap((c) => c.lessons.map((l) => ({ c, l })));
const trilingual = (o) => !!o && UI_LANGS.every((k) => typeof o[k] === "string" && o[k].trim().length > 0);

test("catalogue is non-trivial and every course id is unique", () => {
  assert.ok(COURSES.length >= 23, `only ${COURSES.length} courses`);
  const ids = COURSES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate course id");
});

test("course metadata is complete", () => {
  for (const c of COURSES) {
    assert.match(c.id, /^[a-z]{2,3}$/, `${c.id}: odd course id`);
    assert.ok(c.flag && c.native, `${c.id}: missing flag/native name`);
    // 2- or 3-letter language subtag + region, e.g. en-US, zh-CN, fil-PH.
    assert.match(c.speech, /^[a-z]{2,3}-[A-Za-z]{2,4}$/, `${c.id}: speech "${c.speech}" is not BCP-47`);
    assert.ok(trilingual(c.name), `${c.id}: name not translated into id/en/es`);
    assert.ok(trilingual(c.tagline), `${c.id}: tagline not translated into id/en/es`);
    assert.ok(c.lessons.length >= 16, `${c.id}: only ${c.lessons.length} lessons`);
  }
});

test("lesson metadata is complete and lesson ids are unique per course", () => {
  const LEVELS = ["beginner", "elementary", "intermediate", "advanced", "proficient", "expert"];
  for (const c of COURSES) {
    const ids = c.lessons.map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length, `${c.id}: duplicate lesson id`);
    for (const l of c.lessons) {
      assert.ok(l.icon, `${c.id}/${l.id}: missing icon`);
      assert.ok(LEVELS.includes(l.level), `${c.id}/${l.id}: unknown level "${l.level}"`);
      assert.ok(trilingual(l.title), `${c.id}/${l.id}: title not translated into id/en/es`);
      assert.ok(l.items.length >= 4, `${c.id}/${l.id}: only ${l.items.length} items`);
    }
  }
});

test("every vocabulary item has a term and a meaning in all three UI languages", () => {
  for (const { c, l } of allLessons()) {
    for (const it of l.items) {
      assert.ok(typeof it.term === "string" && it.term.trim(), `${c.id}/${l.id}: empty term`);
      assert.ok(trilingual(it.m), `${c.id}/${l.id} "${it.term}": meaning not translated into id/en/es`);
      if (it.ex) {
        assert.ok(typeof it.ex.t === "string" && it.ex.t.trim(), `${c.id}/${l.id} "${it.term}": empty example`);
        assert.ok(trilingual(it.ex.m), `${c.id}/${l.id} "${it.term}": example not translated`);
      }
      if (it.reading !== undefined) {
        assert.ok(typeof it.reading === "string" && it.reading.trim(), `${c.id}/${l.id} "${it.term}": empty reading`);
      }
    }
  }
});

test("non-Latin courses romanize every item (typing/dictation need it)", () => {
  for (const cid of NON_LATIN) {
    const c = findCourse(cid);
    assert.ok(c, `course ${cid} is missing`);
    const missing = c.lessons.flatMap((l) => l.items.filter((it) => !it.reading).map((it) => `${l.id}:${it.term}`));
    assert.deepEqual(missing, [], `${cid}: ${missing.length} items without a reading`);
  }
});

test("every lesson can fill a 4-option quiz with distinct meanings", () => {
  for (const { c, l } of allLessons()) {
    const distinct = new Set(l.items.map((it) => it.m.id));
    assert.ok(distinct.size >= 4, `${c.id}/${l.id}: only ${distinct.size} distinct meanings`);
  }
});

test("dialogue lessons have one speaker tag per line", () => {
  let dialogues = 0;
  for (const { c, l } of allLessons()) {
    if (!l.dialog) continue;
    dialogues++;
    assert.equal(l.dialog.length, l.items.length, `${c.id}/${l.id}: ${l.dialog.length} tags vs ${l.items.length} lines`);
    for (const who of l.dialog) assert.match(who, /^[A-Z]$/, `${c.id}/${l.id}: bad speaker tag "${who}"`);
  }
  assert.ok(dialogues >= 80, `only ${dialogues} dialogues in the catalogue`);
});

/* blankOut() mirrors views/practice.js — the cloze mode can only build a
   question when the term actually occurs in its own example sentence. */
function blankOut(term, sentence) {
  const cands = [term];
  const m = /^to\s+/i.exec(term);
  if (m) cands.push(term.slice(m[0].length));
  for (const cand of cands) {
    const c2 = cand.trim();
    if (!c2) continue;
    const i = sentence.toLowerCase().indexOf(c2.toLowerCase());
    if (i >= 0) return sentence.slice(0, i) + "_____" + sentence.slice(i + c2.length);
  }
  return null;
}

test("every course can actually play cloze and the sentence builder", () => {
  for (const c of COURSES) {
    let cloze = 0,
      build = 0;
    const spaceless = c.cjk || c.id === "th"; // sentence builder is skipped for these
    for (const l of c.lessons) {
      if (l.dialog) continue;
      for (const it of l.items) {
        if (!it.ex) continue;
        if (blankOut(it.term, it.ex.t)) cloze++;
        const words = it.ex.t.replace(/[.,!?¡¿;:"“”]/g, "").split(/\s+/).filter(Boolean);
        if (words.length >= 3 && words.length <= 10) build++;
      }
    }
    assert.ok(cloze >= 10, `${c.id}: only ${cloze} playable cloze questions`);
    if (!spaceless) assert.ok(build >= 10, `${c.id}: only ${build} playable sentence-builder questions`);
  }
});

test("findCourse / findLesson resolve every id in the catalogue", () => {
  for (const { c, l } of allLessons()) {
    assert.equal(findCourse(c.id), c);
    assert.equal(findLesson(findCourse(c.id), l.id), l);
  }
  assert.equal(findCourse("nope"), undefined);
  assert.equal(findLesson(undefined, "greet"), undefined);
});

test("script trainers are well formed and point at real courses", () => {
  const ids = SCRIPTS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate script id");
  for (const s of SCRIPTS) {
    assert.ok(findCourse(s.lang), `script ${s.id}: no course "${s.lang}"`);
    assert.match(s.speech, /^[a-z]{2,3}-[A-Za-z]{2,4}$/, `script ${s.id}: bad speech code`);
    assert.ok(trilingual(s.name), `script ${s.id}: name not translated`);
    assert.ok(s.chars.length >= 20, `script ${s.id}: only ${s.chars.length} characters`);
    for (const ch of s.chars) assert.ok(ch.ch && ch.rom, `script ${s.id}: incomplete character entry`);
    assert.equal(findScript(s.id), s);
  }
});

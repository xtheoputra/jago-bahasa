/* =========================================================================
   tests/lexicon.test.mjs — the book dictionary must stay a *book*.

   Every screen in views/dictionary.js assumes a shape: a headword that buckets
   into the language's own alphabet, a part of speech the abbreviation table can
   name, a CEFR band the path can group by, glosses and definitions in all three
   UI languages, and — for the drill to be playable — at least four entries in
   every band. These assertions encode all of that, so a content edit can never
   quietly break a screen.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

import { COURSES } from "../js/data.js";
import {
  BANDS, BAND_INFO, BAND_LEVEL, LEXICONS, POS, alphabetOf, getLexicon, findEntry, loadAllLexicons,
} from "../js/lexicon.js";
const store = await import("../js/core/state.js");

await loadAllLexicons();

const UI_LANGS = ["id", "en", "es"];
const trilingual = (o) => !!o && UI_LANGS.every((k) => typeof o[k] === "string" && o[k].trim().length > 0);
/** Courses whose headwords are not written in the Latin alphabet. */
const NON_LATIN = ["ja", "ko", "zh", "ar", "ru", "hi", "th", "el", "uk"];
const books = () => LEXICONS.map((lx) => getLexicon(lx.id));

test("every course in the catalogue has a dictionary, and vice versa", () => {
  const courseIds = COURSES.map((c) => c.id).sort();
  const lexIds = LEXICONS.map((l) => l.id).sort();
  assert.deepEqual(lexIds, courseIds, "the shelf and the catalogue must line up");
  assert.equal(new Set(lexIds).size, lexIds.length, "duplicate dictionary id");
});

test("every dictionary chunk loads and matches its index count", () => {
  for (const lx of LEXICONS) {
    const book = getLexicon(lx.id);
    assert.ok(book, `js/lexicon/${lx.id}.js did not load`);
    assert.equal(book.entries.length, lx.n, `${lx.id}: index says n=${lx.n}, chunk has ${book.entries.length}`);
    assert.ok(lx.n >= 60, `${lx.id}: only ${lx.n} entries`);
  }
});

test("headwords are unique inside a dictionary", () => {
  for (const book of books()) {
    const words = book.entries.map((e) => e.w);
    const dupes = words.filter((w, i) => words.indexOf(w) !== i);
    assert.deepEqual(dupes, [], `${book.lang}: duplicate headwords ${dupes.join(", ")}`);
  }
});

test("every entry is complete: headword, part of speech, band, gloss, definition", () => {
  for (const book of books()) {
    for (const e of book.entries) {
      const where = `${book.lang}/${e.w}`;
      assert.ok(typeof e.w === "string" && e.w.trim(), `${where}: empty headword`);
      assert.ok(POS.includes(e.pos), `${where}: unknown part of speech "${e.pos}"`);
      assert.ok(BANDS.includes(e.cefr), `${where}: unknown CEFR band "${e.cefr}"`);
      assert.ok(trilingual(e.g), `${where}: gloss not translated into id/en/es`);
      // A definition is optional (a transparent concrete noun needs none) but
      // must be complete when present — a half-translated one falls back to
      // Indonesian for English and Spanish readers without saying so.
      if (e.d) assert.ok(trilingual(e.d), `${where}: definition not translated into id/en/es`);
      if (e.ex) {
        assert.ok(typeof e.ex.t === "string" && e.ex.t.trim(), `${where}: empty example`);
        assert.ok(trilingual(e.ex.m), `${where}: example not translated into id/en/es`);
      }
      if (e.note) assert.ok(trilingual(e.note), `${where}: usage note not translated`);
      for (const s of [...e.syn, ...e.ant]) {
        assert.ok(typeof s === "string" && s.trim(), `${where}: empty synonym/antonym`);
      }
    }
  }
});

test("non-Latin dictionaries romanise every headword", () => {
  for (const lang of NON_LATIN) {
    const book = getLexicon(lang);
    const missing = book.entries.filter((e) => !e.r).map((e) => e.w);
    assert.deepEqual(missing, [], `${lang}: ${missing.length} headwords without a reading`);
  }
});

test("every dictionary keeps a solid core of worked entries", () => {
  // Short gloss-only entries give the book its breadth; the worked entries —
  // definition plus example — are what make it teachable. Both must be there.
  for (const book of books()) {
    const withEx = book.entries.filter((e) => e.ex).length;
    const withDef = book.entries.filter((e) => e.d).length;
    assert.ok(withEx >= 60, `${book.lang}: only ${withEx} entries have an example`);
    assert.ok(withDef >= 60, `${book.lang}: only ${withDef} entries have a definition`);
    assert.ok(withEx >= book.entries.length * 0.4, `${book.lang}: only ${withEx}/${book.entries.length} entries have an example`);
  }
});

test("every headword buckets into its own alphabet (A–Z tabs must work)", () => {
  for (const book of books()) {
    const alphabet = new Set(alphabetOf(book.lang));
    const stray = book.entries.filter((e) => !alphabet.has(e.letter)).map((e) => `${e.w}→${e.letter}`);
    assert.deepEqual(stray, [], `${book.lang}: unbucketed headwords ${stray.join(", ")}`);
  }
});

test("entries are stored in the language's own alphabetical order", () => {
  for (const book of books()) {
    const collator = new Intl.Collator(book.lang, { sensitivity: "base" });
    const keyOf = (e) => (["ja", "zh"].includes(book.lang) ? e.r || e.w : e.w);
    const order = alphabetOf(book.lang);
    const seen = new Set();
    let current = null;
    for (let i = 1; i < book.entries.length; i++) {
      const [prev, cur] = [book.entries[i - 1], book.entries[i]];
      // Letter blocks run in alphabet order and never resume once left — that
      // is what makes the A–Z strip a real index instead of a filter.
      if (cur.letter !== prev.letter) {
        seen.add(prev.letter);
        current = cur.letter;
        assert.ok(!seen.has(current), `${book.lang}: letter ${current} appears in two blocks`);
        assert.ok(order.indexOf(current) > order.indexOf(prev.letter), `${book.lang}: ${prev.letter} sorts after ${current}`);
      } else {
        const cmp = collator.compare(keyOf(prev), keyOf(cur));
        assert.ok(cmp <= 0, `${book.lang}: "${prev.w}" sorts after "${cur.w}"`);
      }
    }
    assert.ok(current !== undefined);
    // The index each entry carries is what prev/next paging walks.
    book.entries.forEach((e, i) => assert.equal(e.i, i, `${book.lang}: stale entry index`));
  }
});

test("every CEFR band can fill a 4-option drill in every language", () => {
  for (const book of books()) {
    for (const band of BANDS) {
      const n = book.entries.filter((e) => e.cefr === band).length;
      assert.ok(n >= 4, `${book.lang}/${band}: only ${n} entries (the drill needs 4)`);
    }
  }
});

test("every band maps onto a lesson difficulty tier the catalogue uses", () => {
  const levels = new Set(COURSES.flatMap((c) => c.lessons.map((l) => l.level)));
  for (const band of BANDS) {
    assert.ok(levels.has(BAND_LEVEL[band]), `band ${band} maps to "${BAND_LEVEL[band]}", which no lesson uses`);
    assert.ok(BAND_INFO[band] && BAND_INFO[band].icon, `band ${band} has no path descriptor`);
    assert.ok(Array.isArray(BAND_INFO[band].can) && BAND_INFO[band].can.length >= 3, `band ${band}: too few can-do statements`);
    for (const line of [BAND_INFO[band].name, ...BAND_INFO[band].can]) {
      assert.equal(line.length, 3, `band ${band}: descriptor is not trilingual`);
      for (const s of line) assert.ok(s && s.trim(), `band ${band}: empty descriptor`);
    }
  }
});

test("every dictionary opens with usable front matter", () => {
  for (const book of books()) {
    const g = book.guide;
    assert.ok(g, `${book.lang}: no guide`);
    for (const field of ["intro", "script"]) {
      assert.equal(g[field].length, 3, `${book.lang}: ${field} is not trilingual`);
      for (const s of g[field]) assert.ok(s && s.trim(), `${book.lang}: empty ${field}`);
    }
    assert.ok(g.pron.length >= 4, `${book.lang}: only ${g.pron.length} pronunciation rows`);
    for (const row of g.pron) {
      assert.equal(row.length, 4, `${book.lang}: pronunciation row needs symbol + 3 translations`);
      for (const s of row) assert.ok(s && String(s).trim(), `${book.lang}: empty pronunciation cell`);
    }
    assert.ok(g.grammar.length >= 4, `${book.lang}: only ${g.grammar.length} grammar points`);
    for (const p of g.grammar) {
      assert.equal(p.t.length, 3, `${book.lang}: grammar title is not trilingual`);
      assert.equal(p.d.length, 3, `${book.lang}: grammar explanation is not trilingual`);
      assert.ok(p.ex && p.ex.trim(), `${book.lang}: grammar point without an example`);
    }
  }
});

test("cross-references point at headwords that exist (or are plain text)", () => {
  // Synonyms render as links when the word is itself a headword; the point of
  // this test is that a linked chip never lands on a 'not found' page.
  for (const book of books()) {
    for (const e of book.entries) {
      for (const s of [...e.syn, ...e.ant]) {
        const target = findEntry(book.lang, s);
        if (target) assert.equal(target.lang, book.lang, `${book.lang}/${e.w}: cross-reference leaves the book`);
      }
    }
  }
});

test("dictionary favourites survive alongside lesson favourites", () => {
  // favPool() prunes keys it cannot resolve to a lesson word. A dictionary key
  // is not resolvable that way — it must be skipped, not deleted, or starring a
  // headword would silently erase itself on the next Favourites visit.
  store.reset();
  const e = getLexicon("es").entries[0];
  store.favToggle(e.key);
  assert.ok(store.isFav(e.key));
  assert.deepEqual(store.favPool(), [], "a dictionary star is not a lesson card");
  assert.ok(store.isFav(e.key), "favPool() must not prune dictionary keys");
  assert.deepEqual(store.lexFavKeys().map((f) => f.word), [e.w]);
  assert.ok(!store.progressCourseIds().includes("lex"), '"lex" is not a course id');
  store.favToggle(e.key);
  assert.equal(store.lexFavCount(), 0);
});

test("the two favourite counters never borrow from each other", () => {
  // favCount() drives the Favourites *deck* button, and that deck can only play
  // lesson words. Counting dictionary stars there produced a button promising
  // two cards and a page saying there were none.
  store.reset();
  const e = getLexicon("es").entries[0];
  store.favToggle(e.key);
  store.favToggle("es/greet#0");
  assert.equal(store.favCount(), 1, "favCount() must ignore dictionary stars");
  assert.equal(store.lexFavCount(), 1, "lexFavCount() must ignore lesson stars");
  assert.equal(store.favCount() + store.lexFavCount(), Object.keys(store.getState().favorites).length);
  store.reset();
});

/* =========================================================================
   tests/tts.test.mjs — which languages this device can actually pronounce.

   The app teaches 23 languages; a stock Windows Chrome ships voices for
   thirteen of them. For the other ten the 🔊 button used to hand the text to
   whatever default voice existed, so a learner pressed it and heard English
   phonetics read off Arabic script — or heard nothing, with no way to tell
   that apart from a broken button. core/ui.js only reads speechSynthesis, so
   a stub is enough to exercise the real module under Node.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

let installed = [];
const synth = {
  getVoices: () => installed,
  cancel() {},
  speak() {},
  addEventListener() {},
};
globalThis.window = { speechSynthesis: synth };
globalThis.speechSynthesis = synth;

const ui = await import("../js/core/ui.js");
const voices = (...tags) => tags.map((lang) => ({ lang, name: lang }));

test("a language with an installed voice can be spoken", () => {
  installed = voices("en-US", "es-ES", "de-DE");
  assert.equal(ui.hasVoice("es-ES"), true);
  assert.equal(ui.hasVoice("de-DE"), true);
});

test("a regional variant still counts — es-MX can read es-ES", () => {
  installed = voices("es-MX");
  assert.equal(ui.hasVoice("es-ES"), true, "a Mexican voice can read Spanish");
  installed = voices("en-GB");
  assert.equal(ui.hasVoice("en-US"), true, "a British voice can read English");
});

test("a language with no voice at all is reported as mute", () => {
  installed = voices("en-US", "es-ES", "de-DE", "fr-FR");
  for (const missing of ["ar-SA", "sw-KE", "th-TH", "uk-UA", "tl-PH"]) {
    assert.equal(ui.hasVoice(missing), false, `${missing} should be mute here`);
  }
});

test("a prefix collision does not count as a voice", () => {
  // "sw" (Swahili) must not be satisfied by "sv" (Swedish) or vice versa, and
  // matching must be on the whole subtag, not a loose startsWith.
  installed = voices("sv-SE");
  assert.equal(ui.hasVoice("sw-KE"), false, "Swedish cannot read Swahili");
  installed = voices("sw-KE");
  assert.equal(ui.hasVoice("sv-SE"), false, "Swahili cannot read Swedish");
});

test("Tagalog is fil, and the first two letters of that are Finnish", () => {
  // The catalogue's one three-letter subtag. Comparing `lang.slice(0, 2)`
  // makes "fil-PH" look like "fi", so a Finnish voice would be offered as a
  // way to read Tagalog — audible nonsense presented as the real thing.
  installed = voices("fi-FI");
  assert.equal(ui.hasVoice("fil-PH"), false, "a Finnish voice cannot read Tagalog");
  installed = voices("fil-PH");
  assert.equal(ui.hasVoice("fi-FI"), false, "a Tagalog voice cannot read Finnish");
  assert.equal(ui.hasVoice("fil-PH"), true, "a real Tagalog voice must still count");
});

test("an empty voice list is treated as available, not as mute", () => {
  // Browsers populate getVoices() asynchronously. Flagging every button as
  // mute for the first second would be a worse lie than the one being fixed;
  // whenVoicesReady re-runs the check once the real list lands.
  installed = [];
  assert.equal(ui.hasVoice("th-TH"), true);
});

test("no speech engine at all means nothing can be spoken", () => {
  const saved = globalThis.window;
  globalThis.window = {};
  assert.equal(ui.hasVoice("en-US"), false);
  globalThis.window = saved;
});

test("every course in the catalogue names a speech tag hasVoice can read", async () => {
  // A course whose `speech` were empty or malformed would silently mark every
  // one of its audio buttons mute, so the catalogue is checked against the
  // same function the buttons use.
  const { COURSES } = await import("../js/data.js");
  installed = voices(...COURSES.map((c) => c.speech));
  for (const c of COURSES) {
    assert.match(c.speech, /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/, `${c.id} has an odd speech tag: ${c.speech}`);
    assert.equal(ui.hasVoice(c.speech), true, `${c.id} cannot match its own voice`);
  }
});

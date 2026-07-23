/* =========================================================================
   tests/i18n.test.mjs — the UI ships in three languages; a key that exists in
   one table and not the others silently falls back to Indonesian for everyone
   else. These tests keep the three tables in lockstep and make sure every key
   the code actually asks for exists.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { I18N } from "../js/i18n.js";
import { COURSES } from "../js/data.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const UI_LANGS = ["id", "en", "es"];

/** Every .js file under js/, plus index.html (which carries data-i18n). */
function sourceFiles() {
  const out = [path.join(ROOT, "index.html")];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".js")) out.push(p);
    }
  })(path.join(ROOT, "js"));
  return out;
}

/** Keys referenced as t("key") / I18N.t("key") / data-i18n="key". */
function usedKeys() {
  const used = new Set();
  for (const f of sourceFiles()) {
    const txt = fs.readFileSync(f, "utf8");
    for (const m of txt.matchAll(/\bt\(\s*"([a-zA-Z0-9._]+)"/g)) used.add(m[1]);
    for (const m of txt.matchAll(/data-i18n="([a-zA-Z0-9._]+)"/g)) used.add(m[1]);
  }
  return used;
}

test("the switcher offers exactly the languages that have a string table", () => {
  assert.deepEqual(
    I18N.langs.map((l) => l.code).sort(),
    UI_LANGS.slice().sort()
  );
  for (const l of I18N.langs) {
    assert.ok(l.flag && l.label, `${l.code}: missing flag/label`);
    assert.ok(["ltr", "rtl"].includes(l.dir), `${l.code}: bad direction`);
  }
});

test("all three tables define exactly the same keys", () => {
  const [base, ...rest] = UI_LANGS.map((c) => new Set(Object.keys(I18N.strings[c])));
  for (const [i, other] of rest.entries()) {
    const lang = UI_LANGS[i + 1];
    const missing = [...base].filter((k) => !other.has(k));
    const extra = [...other].filter((k) => !base.has(k));
    assert.deepEqual(missing, [], `${lang} is missing: ${missing.join(", ")}`);
    assert.deepEqual(extra, [], `${lang} has keys id lacks: ${extra.join(", ")}`);
  }
});

test("no translation is left empty", () => {
  for (const lang of UI_LANGS) {
    for (const [k, v] of Object.entries(I18N.strings[lang])) {
      assert.ok(typeof v === "string" && v.trim(), `${lang}."${k}" is empty`);
    }
  }
});

test("placeholder counts match across languages", () => {
  const count = (s) => (s.match(/%s/g) || []).length;
  for (const [k, v] of Object.entries(I18N.strings.id)) {
    for (const lang of UI_LANGS.slice(1)) {
      assert.equal(count(I18N.strings[lang][k]), count(v), `"${k}": %s count differs in ${lang}`);
    }
  }
});

test("every key the code asks for is defined", () => {
  const defined = new Set(Object.keys(I18N.strings.id));
  // t("diff." + l.level) is built at runtime; the levels are checked below.
  const missing = [...usedKeys()].filter((k) => !k.endsWith(".") && !defined.has(k));
  assert.deepEqual(missing, [], `undefined i18n keys: ${missing.join(", ")}`);
});

test("every difficulty level used by the catalogue has a label", () => {
  const levels = new Set(COURSES.flatMap((c) => c.lessons.map((l) => l.level)));
  for (const lv of levels) {
    for (const lang of UI_LANGS) {
      assert.ok(I18N.strings[lang][`diff.${lv}`], `diff.${lv} missing in ${lang}`);
    }
  }
});

test("t() interpolates %s and falls back to Indonesian, then to the key", () => {
  const prev = I18N.current;
  I18N.current = "en";
  assert.equal(I18N.t("nav.home"), I18N.strings.en["nav.home"]);
  assert.equal(I18N.t("totally.unknown.key"), "totally.unknown.key");
  assert.ok(I18N.t("mistakes.count", 5).includes("5"));
  I18N.current = prev;
});

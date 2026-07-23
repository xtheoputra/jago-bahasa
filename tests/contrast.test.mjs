/* =========================================================================
   tests/contrast.test.mjs — WCAG colour contrast for the design tokens.
   The palette lives in CSS custom properties, so it can be parsed and checked
   without a browser. Body text must clear AA (4.5:1); large text, muted labels
   and non-text UI must clear 3:1. Catches a "nice" colour tweak that quietly
   makes the app unreadable in one theme.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = fs.readFileSync(path.join(ROOT, "css/styles.css"), "utf8");

/** Pull `--name: value;` pairs out of one selector block. */
function tokens(selector) {
  const start = css.indexOf(selector + " {");
  assert.ok(start >= 0, `selector ${selector} not found`);
  const block = css.slice(start, css.indexOf("}", start));
  const out = {};
  for (const m of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const hex = (h) => {
  const s = h.replace("#", "");
  const n = s.length === 3 ? [...s].map((c) => c + c).join("") : s;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
};
const rgba = (v) => {
  const m = /rgba?\(([^)]+)\)/.exec(v);
  if (!m) return null;
  const p = m[1].split(",").map((x) => parseFloat(x.trim()));
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
};
/** Flatten a possibly translucent colour over an opaque background. */
function solve(value, bg) {
  if (value.startsWith("#")) return hex(value);
  const c = rgba(value);
  assert.ok(c, `cannot parse colour "${value}"`);
  const [r, g, b, a] = c;
  return [r, g, b].map((ch, i) => Math.round(ch * a + bg[i] * (1 - a)));
}
const luminance = ([r, g, b]) => {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

const BRAND = tokens(":root");

for (const theme of ["dark", "light"]) {
  const t = { ...BRAND, ...tokens(`[data-theme="${theme}"]`) };
  const bg = hex(t.bg);
  const surfaces = { bg, surface: solve(t.surface, bg), "surface-2": solve(t["surface-2"], bg), "surface-3": solve(t["surface-3"], bg) };

  test(`${theme}: body text clears WCAG AA (4.5:1) on every surface`, () => {
    for (const [name, s] of Object.entries(surfaces)) {
      const r = ratio(hex(t.text), s);
      assert.ok(r >= 4.5, `--text on --${name} is ${r.toFixed(2)}:1`);
    }
  });

  test(`${theme}: dimmed text clears WCAG AA (4.5:1) on every surface`, () => {
    for (const [name, s] of Object.entries(surfaces)) {
      const r = ratio(hex(t["text-dim"]), s);
      assert.ok(r >= 4.5, `--text-dim on --${name} is ${r.toFixed(2)}:1`);
    }
  });

  test(`${theme}: faint text clears the 3:1 large-text / secondary threshold`, () => {
    for (const [name, s] of Object.entries(surfaces)) {
      const r = ratio(hex(t["text-faint"]), s);
      assert.ok(r >= 3, `--text-faint on --${name} is ${r.toFixed(2)}:1`);
    }
  });

  test(`${theme}: status colours used as TEXT clear WCAG AA (4.5:1)`, () => {
    // --success/--danger/--accent are fills; their *-text twins are what the
    // stylesheet paints feedback, chips and the favourite star with.
    const resolve = (k) => (t[k].startsWith("var(") ? t[t[k].slice(6, -1)] : t[k]);
    for (const key of ["success-text", "danger-text", "accent-text"]) {
      for (const [name, s] of Object.entries(surfaces)) {
        const r = ratio(hex(resolve(key)), s);
        assert.ok(r >= 4.5, `--${key} on --${name} is ${r.toFixed(2)}:1`);
      }
    }
  });

  test(`${theme}: text painted on a status fill clears WCAG AA (4.5:1)`, () => {
    // Pairs taken straight from the stylesheet: .grade--easy, .grade--hard,
    // .btn--accent, .btn--danger, .streak-grid span.on.
    const pairs = [
      ["#04231a", t.success, ".grade--easy"],
      ["#3a2a00", t.warning, ".grade--hard"],
      ["#3a2200", t.accent, ".btn--accent / .streak-grid.on"],
      ["#ffffff", t["danger-600"], ".btn--danger"],
      ["#ffffff", t["brand-700"], ".btn (brand)"],
    ];
    for (const [fg, fill, where] of pairs) {
      const r = ratio(hex(fg), hex(fill));
      assert.ok(r >= 4.5, `${where}: ${fg} on ${fill} is ${r.toFixed(2)}:1`);
    }
  });

  test(`${theme}: white-on-brand buttons stay readable`, () => {
    for (const key of ["brand", "brand-600", "brand-700"]) {
      const r = ratio([255, 255, 255], hex(t[key]));
      assert.ok(r >= 3, `white on --${key} is ${r.toFixed(2)}:1`);
    }
  });

  test(`${theme}: interactive control borders meet WCAG 1.4.11 (3:1)`, () => {
    // Inputs, quiz options and word chips are identified by their border, so it
    // is non-text contrast — 3:1 against the surface they sit on.
    for (const surface of ["surface", "surface-2"]) {
      const s = surfaces[surface];
      const r = ratio(solve(t["line-input"], s), s);
      assert.ok(r >= 3, `--line-input on --${surface} is ${r.toFixed(2)}:1`);
    }
  });
}

test("accent chip text is readable on its own soft background", () => {
  for (const theme of ["dark", "light"]) {
    const t = { ...BRAND, ...tokens(`[data-theme="${theme}"]`) };
    const bg = hex(t.bg);
    const soft = solve(t["brand-soft"], solve(t.surface, bg));
    const r = ratio(hex(t.brand), soft);
    assert.ok(r >= 3, `${theme}: --brand on --brand-soft is ${r.toFixed(2)}:1`);
  }
});

/* =========================================================================
   views/auth.js — Login, Register, Account views + accessible confirm dialog.
   Forms are real <form>s (Enter-to-submit, password managers), with
   aria-invalid/role=alert error wiring, password show/hide, and a strength
   meter. All user-controlled output is escaped.
   ========================================================================= */
import { $, $$, esc, initials } from "../core/dom.js";
import { toast, liveAlert } from "../core/ui.js";
import { session } from "../auth/session.js";
import { navigate, safeNext, rerender } from "../core/router.js";
import {
  validateEmail, validatePassword, validateDisplayName, passwordStrength,
} from "../auth/validate.js";
import * as store from "../core/state.js";
import { I18N } from "../i18n.js";

const t = (...a) => I18N.t(...a);
const secureOK = () => window.isSecureContext && crypto && crypto.subtle;

/* ----------------------------------------------------------- form helpers */
function field({ name, type = "text", label, placeholder = "", autocomplete, inputmode, value = "" }) {
  return `
    <div class="field">
      <label for="f-${name}">${esc(label)}</label>
      <input id="f-${name}" name="${name}" type="${type}"
        ${placeholder ? `placeholder="${esc(placeholder)}"` : ""}
        ${autocomplete ? `autocomplete="${autocomplete}"` : ""}
        ${inputmode ? `inputmode="${inputmode}"` : ""}
        value="${esc(value)}" />
      <p class="field-err" id="err-${name}" role="alert" aria-live="polite"></p>
    </div>`;
}

function passwordField({ name, label, placeholder = "", autocomplete, meter = false }) {
  return `
    <div class="field">
      <label for="f-${name}">${esc(label)}</label>
      <div class="pw-wrap">
        <input id="f-${name}" name="${name}" type="password"
          ${placeholder ? `placeholder="${esc(placeholder)}"` : ""}
          ${autocomplete ? `autocomplete="${autocomplete}"` : ""} />
        <button type="button" class="pw-toggle" data-pw="${name}" aria-pressed="false" aria-label="${esc(t("login.showPassword"))}">👁</button>
      </div>
      ${meter ? `<div class="pw-meter" id="meter-${name}" aria-hidden="true"><i></i></div><p class="pw-label" id="lbl-${name}"></p>` : ""}
      <p class="field-err" id="err-${name}" role="alert" aria-live="polite"></p>
    </div>`;
}

function wirePwToggles(form) {
  $$(".pw-toggle", form).forEach((btn) => {
    btn.addEventListener("click", () => {
      const inp = $(`#f-${btn.dataset.pw}`, form);
      const show = inp.type === "password";
      inp.type = show ? "text" : "password";
      btn.setAttribute("aria-pressed", String(show));
      btn.setAttribute("aria-label", show ? t("login.hidePassword") : t("login.showPassword"));
      inp.focus();
    });
  });
}

function wireMeter(form, name) {
  const inp = $(`#f-${name}`, form);
  const bar = $(`#meter-${name} i`, form);
  const lbl = $(`#lbl-${name}`, form);
  if (!inp || !bar) return;
  inp.addEventListener("input", () => {
    const { score, key } = passwordStrength(inp.value);
    bar.style.width = `${(score / 4) * 100}%`;
    bar.dataset.score = score;
    lbl.textContent = inp.value ? `${t("pw.strength")}: ${t(key)}` : "";
  });
}

let firstErr;
function clearErrors(form) {
  firstErr = null;
  $$(".field-err", form).forEach((e) => (e.textContent = ""));
  $$("[aria-invalid]", form).forEach((i) => i.removeAttribute("aria-invalid"));
  const g = $(".auth-error", form);
  if (g) g.textContent = "";
}
function fieldError(form, name, key) {
  const inp = $(`#f-${name}`, form);
  const err = $(`#err-${name}`, form);
  if (inp) inp.setAttribute("aria-invalid", "true");
  if (err) err.textContent = t(key);
  if (!firstErr) firstErr = inp;
}
function formError(form, key) {
  const g = $(".auth-error", form);
  const msg = t(key);
  if (g) g.textContent = msg;
  liveAlert(msg);
}

async function withSubmit(btn, busyKey, fn) {
  const orig = btn.textContent;
  btn.disabled = true;
  btn.classList.add("is-busy");
  btn.textContent = t(busyKey);
  try {
    await fn();
  } finally {
    btn.disabled = false;
    btn.classList.remove("is-busy");
    btn.textContent = orig;
  }
}

function insecureNotice(view) {
  view.innerHTML = `
    <div class="auth-wrap">
      <div class="card auth-card">
        <div class="auth-head"><div class="auth-logo">🔒</div><h1>${esc(t("account.signIn"))}</h1></div>
        <p class="auth-error" style="text-align:center">${esc(t("auth.insecureContext"))}</p>
        <a class="btn btn--ghost btn--block" href="#/home" style="margin-top:14px">${esc(t("login.continueGuest"))}</a>
      </div>
    </div>`;
}

/* =====================================================================
   LOGIN
   ===================================================================== */
export function renderLogin(view, params, ctx) {
  if (session.user) return navigate("#/account");
  if (!secureOK() && session.mode !== "remote") return insecureNotice(view);
  const next = safeNext(ctx.query.get("next"));
  const regHref = `#/register${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  view.innerHTML = `
    <div class="auth-wrap">
      <form class="card auth-card" id="loginForm" novalidate>
        <div class="auth-head"><div class="auth-logo">🌍</div><h1>${esc(t("login.title"))}</h1><p>${esc(t("login.subtitle"))}</p></div>
        <p class="auth-error" role="alert" aria-live="assertive"></p>
        ${field({ name: "email", type: "email", label: t("login.email"), placeholder: t("login.emailPlaceholder"), autocomplete: "username", inputmode: "email" })}
        ${passwordField({ name: "password", label: t("login.password"), placeholder: t("login.passwordPlaceholder"), autocomplete: "current-password" })}
        <div class="auth-row">
          <label class="check"><input type="checkbox" name="remember" checked /> ${esc(t("login.remember"))}</label>
        </div>
        <button type="submit" class="btn btn--block" id="loginSubmit">${esc(t("login.submit"))}</button>
        ${session.mode !== "remote" ? `<p class="auth-note">${esc(t("login.forgotLocalNote"))}</p>` : ""}
        <div class="auth-alt"><span>${esc(t("login.noAccount"))}</span> <a href="${regHref}">${esc(t("login.createOne"))}</a></div>
        <div class="auth-sep"><span>${esc(t("login.or"))}</span></div>
        <a class="btn btn--ghost btn--block" href="#/home">${esc(t("login.continueGuest"))}</a>
      </form>
    </div>`;

  const form = $("#loginForm", view);
  wirePwToggles(form);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearErrors(form);
    const email = form.email.value;
    const password = form.password.value;
    const remember = form.remember.checked;

    const eErr = validateEmail(email);
    if (eErr) fieldError(form, "email", eErr);
    if (!password) fieldError(form, "password", "valid.passwordRequired");
    if (firstErr) return firstErr.focus();

    withSubmit($("#loginSubmit", form), "login.submitting", async () => {
      try {
        const user = await session.provider.login({ email, password, remember });
        store.mergeGuestIntoActive();
        toast(t("auth.welcomeBack", user.displayName));
        navigate(next || "#/home");
      } catch (err) {
        formError(form, err.key || "auth.errGeneric");
        if (err.key === "auth.errWrongCreds") form.password.focus();
      }
    });
  });
  $("#f-email", form).focus();
}

/* =====================================================================
   REGISTER
   ===================================================================== */
export function renderRegister(view, params, ctx) {
  if (session.user) return navigate("#/account");
  if (!secureOK() && session.mode !== "remote") return insecureNotice(view);
  const next = safeNext(ctx.query.get("next"));
  const loginHref = `#/login${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  view.innerHTML = `
    <div class="auth-wrap">
      <form class="card auth-card" id="regForm" novalidate>
        <div class="auth-head"><div class="auth-logo">✨</div><h1>${esc(t("register.title"))}</h1><p>${esc(t("register.subtitle"))}</p></div>
        <p class="auth-error" role="alert" aria-live="assertive"></p>
        ${field({ name: "name", label: t("register.name"), placeholder: t("register.namePlaceholder"), autocomplete: "name" })}
        ${field({ name: "email", type: "email", label: t("register.email"), placeholder: t("login.emailPlaceholder"), autocomplete: "username", inputmode: "email" })}
        ${passwordField({ name: "password", label: t("register.password"), placeholder: t("register.passwordPlaceholder"), autocomplete: "new-password", meter: true })}
        ${passwordField({ name: "confirm", label: t("register.confirm"), placeholder: t("register.confirmPlaceholder"), autocomplete: "new-password" })}
        <p class="auth-hint">${esc(t("pw.hint"))}</p>
        <label class="check"><input type="checkbox" name="agree" /> ${esc(t("register.agree"))}</label>
        <p class="field-err" id="err-agree" role="alert" aria-live="polite"></p>
        <button type="submit" class="btn btn--block" id="regSubmit">${esc(t("register.submit"))}</button>
        <div class="auth-alt"><span>${esc(t("register.haveAccount"))}</span> <a href="${loginHref}">${esc(t("register.signInInstead"))}</a></div>
      </form>
    </div>`;

  const form = $("#regForm", view);
  wirePwToggles(form);
  wireMeter(form, "password");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearErrors(form);
    const name = form.name.value;
    const email = form.email.value;
    const password = form.password.value;
    const confirm = form.confirm.value;

    const nErr = validateDisplayName(name);
    if (nErr) fieldError(form, "name", nErr);
    const eErr = validateEmail(email);
    if (eErr) fieldError(form, "email", eErr);
    const pErr = validatePassword(password);
    if (pErr) fieldError(form, "password", pErr);
    if (!confirm) fieldError(form, "confirm", "valid.confirmRequired");
    else if (confirm !== password) fieldError(form, "confirm", "valid.passwordMismatch");
    if (!form.agree.checked) {
      const ae = $("#err-agree", form);
      if (ae) ae.textContent = t("valid.termsRequired");
      if (!firstErr) firstErr = form.agree;
    }
    if (firstErr) return firstErr.focus();

    withSubmit($("#regSubmit", form), "register.submitting", async () => {
      try {
        const user = await session.provider.register({ displayName: name, email, password, remember: true });
        store.mergeGuestIntoActive();
        toast(t("auth.accountCreated"));
        navigate(next || "#/home");
      } catch (err) {
        formError(form, err.key || "auth.errGeneric");
        if (err.key === "auth.errEmailExists") form.email.focus();
      }
    });
  });
  $("#f-name", form).focus();
}

/* =====================================================================
   ACCOUNT / PROFILE  (guarded route)
   ===================================================================== */
function fmtDate(ts) {
  if (!ts) return "";
  try {
    return new Intl.DateTimeFormat(I18N.current, { year: "numeric", month: "long" }).format(new Date(ts));
  } catch (e) {
    return new Date(ts).toLocaleDateString();
  }
}

function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function renderAccount(view) {
  const user = session.user;
  if (!user) return navigate("#/login");
  const isRemote = session.mode === "remote";

  view.innerHTML = `
    <div class="account-head">
      <span class="avatar avatar--lg" aria-hidden="true">${esc(initials(user.displayName))}</span>
      <div>
        <h1>${esc(t("account.title"))}</h1>
        <p>${esc(t("account.subtitle"))}</p>
        <p class="account-meta">${esc(user.displayName)} • ${esc(user.email)}${user.createdAt ? " • " + esc(t("account.memberSince", fmtDate(user.createdAt))) : ""}</p>
      </div>
    </div>

    <section class="card account-section">
      <h2>${esc(t("account.profileSection"))}</h2>
      <form id="profileForm" novalidate>
        <p class="auth-error" role="alert" aria-live="assertive"></p>
        ${field({ name: "name", label: t("account.displayName"), value: user.displayName, autocomplete: "name" })}
        <div class="field"><label>${esc(t("account.email"))}</label><input type="email" value="${esc(user.email)}" disabled /></div>
        <button type="submit" class="btn btn--sm" id="profileSave">${esc(t("account.save"))}</button>
      </form>
    </section>

    <section class="card account-section">
      <h2>${esc(t("account.securitySection"))}</h2>
      <form id="pwForm" novalidate>
        <p class="auth-error" role="alert" aria-live="assertive"></p>
        ${passwordField({ name: "current", label: t("account.currentPassword"), autocomplete: "current-password" })}
        ${passwordField({ name: "next", label: t("account.newPassword"), autocomplete: "new-password", meter: true })}
        <button type="submit" class="btn btn--sm" id="pwSave">${esc(t("account.updatePassword"))}</button>
      </form>
    </section>

    <section class="card account-section">
      <h2>${esc(t("sync.section"))}</h2>
      <div class="sync-row">
        <span class="chip ${isRemote ? "chip--success" : ""}">${isRemote ? "☁️ " + esc(t("sync.modeCloud")) : "📴 " + esc(t("sync.modeLocal"))}</span>
        ${isRemote ? `<button class="btn btn--ghost btn--sm" id="syncNow">${esc(t("sync.now"))}</button>` : ""}
      </div>
    </section>

    <section class="card account-section">
      <h2>${esc(t("account.dataSection"))}</h2>
      <div class="account-actions">
        <button class="btn btn--ghost btn--sm" id="exportBtn">⬇️ ${esc(t("account.export"))}</button>
        <label class="btn btn--ghost btn--sm" for="importInput">⬆️ ${esc(t("account.import"))}</label>
        <input type="file" id="importInput" accept="application/json" hidden />
      </div>
    </section>

    <section class="card account-section account-section--danger">
      <h2>${esc(t("account.dangerSection"))}</h2>
      <div class="account-actions" style="margin-bottom:16px">
        <button class="btn btn--ghost btn--sm" id="signOutBtn">${esc(t("account.signOut"))}</button>
      </div>
      <p class="account-danger-desc">${esc(t("account.deleteDesc"))}</p>
      <form id="deleteForm" novalidate>
        <p class="auth-error" role="alert" aria-live="assertive"></p>
        ${passwordField({ name: "delpw", label: t("account.currentPassword"), autocomplete: "current-password" })}
        ${field({ name: "delword", label: t("account.deleteTypePrompt", t("account.deleteWord")) })}
        <button type="submit" class="btn btn--danger btn--sm" id="deleteBtn">${esc(t("account.deleteConfirmBtn"))}</button>
      </form>
    </section>
  `;

  wirePwToggles(view);
  wireMeter(view, "next");

  /* ---- profile ---- */
  const profileForm = $("#profileForm", view);
  profileForm.addEventListener("submit", (e) => {
    e.preventDefault();
    clearErrors(profileForm);
    const name = profileForm.name.value;
    const nErr = validateDisplayName(name);
    if (nErr) {
      fieldError(profileForm, "name", nErr);
      return firstErr.focus();
    }
    withSubmit($("#profileSave", profileForm), "login.submitting", async () => {
      try {
        await session.provider.updateProfile({ displayName: name });
        toast(t("account.saved"));
        rerender();
      } catch (err) {
        formError(profileForm, err.key || "auth.errGeneric");
      }
    });
  });

  /* ---- change password ---- */
  const pwForm = $("#pwForm", view);
  pwForm.addEventListener("submit", (e) => {
    e.preventDefault();
    clearErrors(pwForm);
    const currentPassword = pwForm.current.value;
    const newPassword = pwForm.next.value;
    if (!currentPassword) fieldError(pwForm, "current", "valid.passwordRequired");
    const pErr = validatePassword(newPassword);
    if (pErr) fieldError(pwForm, "next", pErr);
    if (firstErr) return firstErr.focus();
    withSubmit($("#pwSave", pwForm), "login.submitting", async () => {
      try {
        await session.provider.changePassword({ currentPassword, newPassword });
        toast(t("account.passwordUpdated"));
        pwForm.reset();
        const bar = $("#meter-next i", pwForm);
        if (bar) bar.style.width = "0%";
        const lbl = $("#lbl-next", pwForm);
        if (lbl) lbl.textContent = "";
      } catch (err) {
        formError(pwForm, err.key || "auth.errGeneric");
      }
    });
  });

  /* ---- sync now ---- */
  const syncNow = $("#syncNow", view);
  if (syncNow) {
    syncNow.addEventListener("click", () => {
      withSubmit(syncNow, "sync.syncing", async () => {
        try {
          const remote = await session.provider.pullProgress();
          if (remote && remote.progress) store.applyRemoteProgress(remote.progress);
          await session.provider.pushProgress(store.snapshot(), store.snapshot().updatedAt);
          toast(t("sync.synced"));
          rerender();
        } catch (err) {
          toast(t("sync.error"));
        }
      });
    });
  }

  /* ---- export / import ---- */
  $("#exportBtn", view).addEventListener("click", () => {
    downloadJSON("jago-bahasa-data.json", {
      format: "jago-bahasa.v1",
      exportedAt: Date.now(),
      user: { displayName: user.displayName, email: user.email },
      progress: store.snapshot(),
    });
    toast(t("account.exported"));
  });
  $("#importInput", view).addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 1_048_576) {
      toast(t("account.importTooBig"));
      e.target.value = "";
      return;
    }
    try {
      const obj = JSON.parse(await file.text());
      if (!obj || obj.format !== "jago-bahasa.v1" || typeof obj.progress !== "object") {
        toast(t("account.importBad"));
        return;
      }
      store.applyRemoteProgress(obj.progress);
      toast(t("account.imported"));
      rerender();
    } catch (err) {
      toast(t("account.importBad"));
    } finally {
      e.target.value = "";
    }
  });

  /* ---- sign out ---- */
  $("#signOutBtn", view).addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: t("account.signOutConfirm"),
      confirmLabel: t("account.signOut"),
    });
    if (!ok) return;
    await session.provider.logout();
    toast(t("auth.signedOut"));
    navigate("#/home");
  });

  /* ---- delete account ---- */
  const deleteForm = $("#deleteForm", view);
  deleteForm.addEventListener("submit", (e) => {
    e.preventDefault();
    clearErrors(deleteForm);
    const password = deleteForm.delpw.value;
    const word = deleteForm.delword.value.trim();
    if (!password) fieldError(deleteForm, "delpw", "valid.passwordRequired");
    if (word !== t("account.deleteWord")) fieldError(deleteForm, "delword", "valid.required");
    if (firstErr) return firstErr.focus();
    withSubmit($("#deleteBtn", deleteForm), "login.submitting", async () => {
      try {
        const uid = user.id;
        await session.provider.deleteAccount({ password });
        store.purgeUser(uid);
        toast(t("account.deleted"));
        navigate("#/home");
      } catch (err) {
        formError(deleteForm, err.key || "auth.errGeneric");
      }
    });
  });
}

/* =====================================================================
   Accessible confirm dialog (focus-trapped, Escape, restores focus).
   ===================================================================== */
export function confirmDialog({ title, body, confirmLabel, cancelLabel, danger = false }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const back = document.createElement("div");
    back.className = "modal-backdrop";
    back.innerHTML = `
      <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="mdl-title">
        <h3 id="mdl-title">${esc(title)}</h3>
        ${body ? `<p>${esc(body)}</p>` : ""}
        <div class="modal-actions">
          <button class="btn btn--ghost" data-act="cancel">${esc(cancelLabel || t("account.cancel"))}</button>
          <button class="btn ${danger ? "btn--danger" : ""}" data-act="ok">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(back);
    const dlg = $(".modal", back);
    const close = (val) => {
      back.remove();
      document.removeEventListener("keydown", onKey, true);
      if (prev && prev.focus) prev.focus();
      resolve(val);
    };
    $('[data-act="ok"]', back).onclick = () => close(true);
    $('[data-act="cancel"]', back).onclick = () => close(false);
    back.addEventListener("mousedown", (e) => {
      if (e.target === back) close(false);
    });
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      } else if (e.key === "Tab") {
        const f = $$("button", dlg);
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey, true);
    $('[data-act="ok"]', back).focus();
  });
}

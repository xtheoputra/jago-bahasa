/* =========================================================================
   chrome.js — App shell behaviours: theme, UI language switcher, static
   i18n, install prompt, network status, and the account menu.
   ========================================================================= */
import { $, $$, esc, initials } from "./core/dom.js";
import { toast } from "./core/ui.js";
import { I18N } from "./i18n.js";
import { session } from "./auth/session.js";
import { navigate, rerender } from "./core/router.js";
import { confirmDialog } from "./views/auth.js";

const t = (...a) => I18N.t(...a);

/* ------------------------------------------------------------------ theme */
export function initTheme() {
  let saved;
  try {
    saved = localStorage.getItem("jb.theme");
  } catch (e) {}
  const sys = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", saved || sys);
  $("#themeBtn").onclick = () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("jb.theme", next);
    } catch (e) {}
  };
}

/* ------------------------------------------------------- language switcher */
export function initLangSwitcher() {
  const btn = $("#uiLangBtn");
  const menu = $("#uiLangMenu");
  function paintBtn() {
    const m = I18N.langs.find((l) => l.code === I18N.current);
    $("#uiLangFlag").textContent = m.flag;
    $("#uiLangCode").textContent = m.code.toUpperCase();
  }
  function buildMenu() {
    menu.innerHTML = I18N.langs
      .map(
        (l) =>
          `<button role="option" data-lang="${esc(l.code)}" aria-selected="${l.code === I18N.current}"><span class="flag">${esc(l.flag)}</span> ${esc(l.label)}</button>`
      )
      .join("");
    $$("button", menu).forEach((b) => {
      b.onclick = () => {
        I18N.setLang(b.dataset.lang);
        paintBtn();
        applyStaticI18n();
        rerender();
        window.dispatchEvent(new Event("jb:i18n"));
        closeMenu();
      };
    });
  }
  function openMenu() {
    buildMenu();
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
  }
  function closeMenu() {
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  }
  btn.onclick = (e) => {
    e.stopPropagation();
    menu.hidden ? openMenu() : closeMenu();
  };
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target) && e.target !== btn) closeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });
  paintBtn();
}

export function applyStaticI18n() {
  $$("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.title =
    I18N.current === "id"
      ? "Jago Bahasa — Belajar Bahasa Dunia"
      : I18N.current === "es"
      ? "Jago Bahasa — Aprende idiomas del mundo"
      : "Jago Bahasa — Learn World Languages";
}

/* ----------------------------------------------------------- account menu */
export function initAccountMenu() {
  const btn = $("#accountBtn");
  const menu = $("#accountMenu");
  if (!btn || !menu) return;

  function paintBtn() {
    const u = session.user;
    if (u) {
      btn.innerHTML = `<span class="avatar avatar--sm" aria-hidden="true">${esc(initials(u.displayName))}</span>`;
      btn.setAttribute("aria-label", t("account.open"));
      btn.classList.add("iconbtn--avatar");
    } else {
      btn.innerHTML = `<span aria-hidden="true">👤</span><span class="iconbtn__label">${esc(t("account.signIn"))}</span>`;
      btn.setAttribute("aria-label", t("account.signIn"));
      btn.classList.remove("iconbtn--avatar");
    }
  }

  function buildMenu() {
    const u = session.user;
    if (u) {
      menu.innerHTML = `
        <div class="account-menu__head">
          <span class="avatar" aria-hidden="true">${esc(initials(u.displayName))}</span>
          <div class="account-menu__id">
            <strong>${esc(u.displayName)}</strong>
            <small>${esc(u.email)}</small>
          </div>
        </div>
        <a role="menuitem" tabindex="-1" href="#/account">⚙️ ${esc(t("account.profile"))}</a>
        <a role="menuitem" tabindex="-1" href="#/progress">📈 ${esc(t("nav.progress"))}</a>
        <button role="menuitem" tabindex="-1" data-act="signout">🚪 ${esc(t("account.signOut"))}</button>`;
    } else {
      menu.innerHTML = `
        <div class="account-menu__head">
          <span class="avatar" aria-hidden="true">👤</span>
          <div class="account-menu__id"><strong>${esc(t("account.guest"))}</strong><small>${esc(t("account.guestSub"))}</small></div>
        </div>
        <a role="menuitem" tabindex="-1" href="#/login">🔑 ${esc(t("account.signIn"))}</a>
        <a role="menuitem" tabindex="-1" href="#/register">✨ ${esc(t("account.register"))}</a>`;
    }
    $$('[role="menuitem"]', menu).forEach((item) => {
      item.addEventListener("click", async (e) => {
        if (item.dataset.act === "signout") {
          e.preventDefault();
          closeMenu();
          const ok = await confirmDialog({ title: t("account.signOutConfirm"), confirmLabel: t("account.signOut") });
          if (!ok) return;
          await session.provider.logout();
          toast(t("auth.signedOut"));
          navigate("#/home");
        } else {
          closeMenu();
        }
      });
    });
  }

  const items = () => $$('[role="menuitem"]', menu);
  function focusItem(idx) {
    const list = items();
    if (!list.length) return;
    const i = (idx + list.length) % list.length;
    list.forEach((el) => (el.tabIndex = -1));
    list[i].tabIndex = 0;
    list[i].focus();
  }
  function openMenu() {
    buildMenu();
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    focusItem(0);
  }
  function closeMenu() {
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  }
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden ? openMenu() : closeMenu();
  });
  menu.addEventListener("keydown", (e) => {
    const list = items();
    const cur = list.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(cur + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(cur - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusItem(list.length - 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
      btn.focus();
    }
  });
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closeMenu();
  });

  session.onChange(() => {
    paintBtn();
    if (!menu.hidden) buildMenu();
  });
  window.addEventListener("jb:i18n", paintBtn);
  paintBtn();
}

/* ----------------------------------------------------------- install/net */
export function initInstall() {
  let deferred = null;
  const fab = $("#installBtn");
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    fab.hidden = false;
  });
  fab.onclick = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    fab.hidden = true;
  };
  window.addEventListener("appinstalled", () => {
    fab.hidden = true;
    toast(t("toast.installed"));
  });
}

export function initNetwork() {
  window.addEventListener("offline", () => toast("📴 " + t("toast.offline")));
  window.addEventListener("online", () => toast("✅ " + t("toast.online")));
}

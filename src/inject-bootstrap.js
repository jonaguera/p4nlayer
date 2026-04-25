(function () {
  "use strict";

  const SCRIPT_ID = "p4nlayer-page-hook-script";
  const HOOK_PATH = "injected/around-hook.js";
  const SV_ICON_PATH = "assets/icons/google-street-view.png";
  const PEGMAN_ICON_PATH = "assets/icons/pegman.svg";
  const KEY_ENABLED = "p4nlayerEnabled";
  const KEY_SHOW_RATINGS = "p4nlayerShowRatings";
  const KEY_AUTO_SEARCH = "p4nlayerAutoSearchMap";
  const KEY_FULL_WIDTH = "p4nlayerFullWidthMap";
  const KEY_HIDE_GOOGLE_POIS = "p4nlayerHideGooglePois";

  function isDebug() {
    try {
      return window.localStorage.getItem("p4nlayerDebug") === "1";
    } catch (_) {
      return false;
    }
  }

  function readSettings(run) {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      run({
        enabled: true,
        showRatings: true,
        autoSearch: false,
        fullWidth: false,
        hideGooglePois: false,
      });
      return;
    }
    try {
      chrome.storage.local.get(
        [KEY_ENABLED, KEY_SHOW_RATINGS, KEY_AUTO_SEARCH, KEY_FULL_WIDTH, KEY_HIDE_GOOGLE_POIS],
        function (res) {
        const hasEnabled = res && Object.prototype.hasOwnProperty.call(res, KEY_ENABLED);
        const hasShowRatings =
          res && Object.prototype.hasOwnProperty.call(res, KEY_SHOW_RATINGS);
        const hasAutoSearch = res && Object.prototype.hasOwnProperty.call(res, KEY_AUTO_SEARCH);
        const hasFullWidth = res && Object.prototype.hasOwnProperty.call(res, KEY_FULL_WIDTH);
        const hasHideGooglePois =
          res && Object.prototype.hasOwnProperty.call(res, KEY_HIDE_GOOGLE_POIS);
        run({
          enabled: hasEnabled ? res[KEY_ENABLED] !== false : true,
          showRatings: hasShowRatings ? res[KEY_SHOW_RATINGS] !== false : true,
          autoSearch: hasAutoSearch ? res[KEY_AUTO_SEARCH] !== false : false,
          fullWidth: hasFullWidth ? res[KEY_FULL_WIDTH] !== false : false,
          hideGooglePois: hasHideGooglePois ? res[KEY_HIDE_GOOGLE_POIS] === true : false,
        });
        }
      );
    } catch (_) {
      run({
        enabled: true,
        showRatings: true,
        autoSearch: false,
        fullWidth: false,
        hideGooglePois: false,
      });
    }
  }

  function safeGetUrl(path) {
    try {
      return chrome.runtime.getURL(path);
    } catch (e) {
      console.error("[p4nlayer] no se pudo resolver URL de runtime:", path, e);
      return null;
    }
  }

  function setAttrIfPossible(root, name, value) {
    if (!root || !value) {
      return;
    }
    try {
      root.setAttribute(name, value);
    } catch (_) {
      /* ignore */
    }
  }

  readSettings(function (settings) {
    if (!settings || !settings.enabled) {
      return;
    }
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.getURL) {
      return;
    }
    if (document.getElementById(SCRIPT_ID)) {
      return;
    }

    const hookHref = safeGetUrl(HOOK_PATH);
    if (!hookHref) {
      return;
    }
    const streetViewIconHref = safeGetUrl(SV_ICON_PATH);
    const pegmanIconHref = safeGetUrl(PEGMAN_ICON_PATH);

    const root = document.documentElement || document.head || document.body;
    setAttrIfPossible(root, "data-p4n-sv-icon", streetViewIconHref);
    setAttrIfPossible(root, "data-p4n-pegman-icon", pegmanIconHref);
    setAttrIfPossible(root, "data-p4n-show-ratings", settings.showRatings ? "1" : "0");
    setAttrIfPossible(root, "data-p4n-auto-search-map", settings.autoSearch ? "1" : "0");
    setAttrIfPossible(root, "data-p4n-full-width-map", settings.fullWidth ? "1" : "0");
    setAttrIfPossible(
      root,
      "data-p4n-hide-google-pois",
      settings.hideGooglePois ? "1" : "0"
    );

    if (isDebug()) {
      console.warn(
        "[p4nlayer] inject-bootstrap: insertando around-hook (contexto página). Filtro consola: p4nlayer"
      );
      if (streetViewIconHref) {
        console.info("[p4nlayer] street-view icon URL ->", streetViewIconHref);
      }
      if (pegmanIconHref) {
        console.info("[p4nlayer] pegman icon URL ->", pegmanIconHref);
      }
    }

    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.type = "text/javascript";
    s.src = hookHref;
    s.async = false;
    s.setAttribute("data-p4nlayer", "1");
    setAttrIfPossible(s, "data-p4n-sv-icon", streetViewIconHref);
    setAttrIfPossible(s, "data-p4n-pegman-icon", pegmanIconHref);
    setAttrIfPossible(s, "data-p4n-show-ratings", settings.showRatings ? "1" : "0");
    setAttrIfPossible(s, "data-p4n-auto-search-map", settings.autoSearch ? "1" : "0");
    setAttrIfPossible(s, "data-p4n-full-width-map", settings.fullWidth ? "1" : "0");
    setAttrIfPossible(s, "data-p4n-hide-google-pois", settings.hideGooglePois ? "1" : "0");
    s.addEventListener("load", function () {
      if (isDebug()) {
        console.info("[p4nlayer] inject-bootstrap: around-hook.js cargado", hookHref);
      }
    });
    s.addEventListener("error", function (ev) {
      console.error(
        "[p4nlayer] inject-bootstrap: ERROR al cargar el script de página. Comprueba web_accessible_resources y la ruta:",
        hookHref,
        ev
      );
    });

    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(s);
    } else {
      document.addEventListener("DOMContentLoaded", function once() {
        document.removeEventListener("DOMContentLoaded", once);
        (document.head || document.documentElement).appendChild(s);
      });
    }
  });
})();

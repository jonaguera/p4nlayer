/**
 * Se ejecuta en el Mismo contexto que park4night (L, fetch, DOM).
 * ÚNICO enganche fiable: window.fetch y XHR viven en este mundo.
 */
(function () {
  "use strict";
  var P4N_SV_ICON_URL = "";
  var P4N_PEGMAN_ICON_URL = "";
  var P4N_SV_FALLBACK_URL =
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Google_Street_View_icon.svg/240px-Google_Street_View_icon.svg.png";

  function readDebugFlag() {
    try {
      return window.localStorage.getItem("p4nlayerDebug") === "1";
    } catch (_) {
      return false;
    }
  }
  var P4N_DEBUG_ON = readDebugFlag();
  if (P4N_DEBUG_ON) {
    try {
      console.warn(
        "[p4nlayer] Script de página listo. En consola filtra: p4nlayer (8 letras) — no escribas pn4player (error típico)."
      );
    } catch (_) {
      /* ignore */
    }
  }

  installPlaceDetailStreetViewClickDelegateP4n();

  function resolveExtensionAssetUrlP4n(attrName, assetPath) {
    try {
      var attr =
        (document.documentElement &&
          document.documentElement.getAttribute &&
          document.documentElement.getAttribute(attrName)) ||
        "";
      if (attr) {
        return attr;
      }
    } catch (_svA) {
      /* ignore */
    }
    try {
      var hookScript = document.getElementById("p4nlayer-page-hook-script");
      var fromTag =
        hookScript && hookScript.getAttribute
          ? hookScript.getAttribute(attrName) || ""
          : "";
      if (fromTag) {
        return fromTag;
      }
      var src =
        (document.currentScript && document.currentScript.src) ||
        (hookScript && hookScript.src) ||
        "";
      if (!src) {
        return "";
      }
      var marker = "/injected/around-hook.js";
      var idx = String(src).indexOf(marker);
      if (idx < 0) {
        return "";
      }
      return String(src).slice(0, idx) + "/" + assetPath;
    } catch (_sv0) {
      return "";
    }
  }
  P4N_SV_ICON_URL = resolveExtensionAssetUrlP4n(
    "data-p4n-sv-icon",
    "assets/icons/google-street-view.png"
  );
  P4N_PEGMAN_ICON_URL = resolveExtensionAssetUrlP4n(
    "data-p4n-pegman-icon",
    "assets/icons/pegman.svg"
  );
  if (P4N_DEBUG_ON) {
    try {
      console.info(
        "[p4nlayer] street-view icon resolved ->",
        P4N_SV_ICON_URL || "(vacío -> fallback remoto)"
      );
      console.info(
        "[p4nlayer] pegman icon resolved ->",
        P4N_PEGMAN_ICON_URL || "(vacío -> sin pegman)"
      );
    } catch (_svL) {
      /* ignore */
    }
  }

  const MSG_TYPE = "p4nlayer:around-data";
  const AROUND_RE = /\/api\/places\/around/i;
  const EVENT_NAME = "p4nlayer-places";
  const ATTR = "data-p4n-id";
  const FETCH_WRAPPED = "__p4nlayerFetchWrapped__";
  const SHOW_RATINGS_ATTR_P4n = "data-p4n-show-ratings";
  const AUTO_SEARCH_ATTR_P4n = "data-p4n-auto-search-map";
  const FULL_WIDTH_ATTR_P4n = "data-p4n-full-width-map";
  const HIDE_GOOGLE_POIS_ATTR_P4n = "data-p4n-hide-google-pois";
  /**
   * Estilo "apistyle" de tiles (no documentado) para p.v:off en feature poi (s.t:2 = todos los POI).
   * Mantiene lyrs=s,h (foto+redes y topónimos administrativos); quita negocios/íconos POI.
   * Si Google deja de respetar el parámetro, habría que volver a quitar `h` a mano.
   */
  var GOOGLE_TILE_APISYLE_HIDE_POI_P4n = "s.t:2|p.v:off";

  function readBoolAttrSettingP4n(attrName, fallbackValue) {
    var raw = "";
    try {
      raw =
        (document.documentElement &&
          document.documentElement.getAttribute &&
          document.documentElement.getAttribute(attrName)) ||
        "";
    } catch (_sb1) {
      raw = "";
    }
    if (!raw) {
      try {
        var hookScript = document.getElementById("p4nlayer-page-hook-script");
        raw = hookScript && hookScript.getAttribute ? hookScript.getAttribute(attrName) || "" : "";
      } catch (_sb2) {
        raw = "";
      }
    }
    if (!raw) {
      return fallbackValue;
    }
    return String(raw) !== "0";
  }

  var SHOW_RATINGS_ENABLED_P4n = readBoolAttrSettingP4n(SHOW_RATINGS_ATTR_P4n, true);
  var AUTO_SEARCH_ENABLED_P4n = readBoolAttrSettingP4n(AUTO_SEARCH_ATTR_P4n, false);
  var FULL_WIDTH_ENABLED_P4n = readBoolAttrSettingP4n(FULL_WIDTH_ATTR_P4n, false);
  /** Desactivado por defecto: el mapa en P4N sigue con lyrs=s,h (foto+POIs) tal cual. */
  var HIDE_GOOGLE_POIS_ENABLED_P4n = readBoolAttrSettingP4n(HIDE_GOOGLE_POIS_ATTR_P4n, false);

  function isP4nGoogleMapTileUrlP4n(u) {
    if (!u || typeof u !== "string") {
      return false;
    }
    var t = u.toLowerCase();
    return (
      t.indexOf("google") >= 0 ||
      t.indexOf("gstatic.com") >= 0 ||
      t.indexOf("ggpht.com") >= 0 ||
      (t.indexOf("googleapis.com") >= 0 && t.indexOf("map") >= 0) ||
      t.indexOf("khms") >= 0
    );
  }

  function ensureHidePoiApistyleOnGoogleVtUrlP4n(u) {
    var ap = "apistyle=" + encodeURIComponent(GOOGLE_TILE_APISYLE_HIDE_POI_P4n);
    var m = u.match(/[?&]apistyle=([^&]*)/i);
    if (m) {
      try {
        if (decodeURIComponent(m[1] || "") === GOOGLE_TILE_APISYLE_HIDE_POI_P4n) {
          return u;
        }
      } catch (_de) {
        /* ignore */
      }
    }
    u = u.replace(/[?&]apistyle=[^&]*/gi, "");
    u = u.replace(/\?&/g, "?");
    u = u.replace(/&+/g, "&");
    u = u.replace(/[?&]$/g, "");
    return u + (u.indexOf("?") < 0 ? "?" : "&") + ap;
  }

  /**
   * P4N: `lyrs=s,h` añade carreteras, nombres y POIs. No se quita `h` (eso borra carreteras y pueblos).
   * Se añade apistyle poí↔invisible (s.t:2) según análisis reiterado de URLs de tiles de Google.
   * Sin logs (getTileUrl se llama por cada tile).
   */
  function applyP4nSatelliteNoPoisToTileUrlP4n(u) {
    if (!HIDE_GOOGLE_POIS_ENABLED_P4n) {
      return u;
    }
    if (typeof u !== "string" || !u) {
      return u;
    }
    if (!isP4nGoogleMapTileUrlP4n(u)) {
      return u;
    }
    if (u.toLowerCase().indexOf("lyrs=") < 0) {
      return u;
    }
    return ensureHidePoiApistyleOnGoogleVtUrlP4n(u);
  }

  function isDebug() {
    return P4N_DEBUG_ON;
  }

  function dlog() {
    if (!P4N_DEBUG_ON) {
      return;
    }
    try {
      console.log.apply(
        console,
        ["[p4nlayer:hook]"].concat([].slice.call(arguments))
      );
    } catch (_) {
      /* ignore */
    }
  }

  function hookReady() {
    try {
      injectP4nStylesOnce();
      document.documentElement.setAttribute("data-p4nlayer-badges-page", "1");
      document.documentElement.setAttribute("data-p4nlayer-hook", "1");
      document.documentElement.setAttribute(AUTO_SEARCH_ATTR_P4n, AUTO_SEARCH_ENABLED_P4n ? "1" : "0");
      document.documentElement.setAttribute(FULL_WIDTH_ATTR_P4n, FULL_WIDTH_ENABLED_P4n ? "1" : "0");
      document.documentElement.setAttribute(
        HIDE_GOOGLE_POIS_ATTR_P4n,
        HIDE_GOOGLE_POIS_ENABLED_P4n ? "1" : "0"
      );
      document.documentElement.dispatchEvent(
        new CustomEvent("p4nlayer-hook-ready", { bubbles: true })
      );
      ensureFilterModalObserverP4n();
      ensureStreetViewLinkOnPlaceDetailP4n();
      scheduleSidebarSvLinksP4n();
    } catch (_c) {
      /* ignore */
    }
  }

  function emit(places) {
    try {
      window.postMessage(
        { type: MSG_TYPE, source: "p4nlayer-around-hook", places: places },
        "*"
      );
    } catch (_d) {
      /* ignore */
    }
    try {
      const el = document.documentElement;
      if (el && el.dispatchEvent) {
        el.dispatchEvent(
          new CustomEvent(EVENT_NAME, {
            bubbles: true,
            detail: places,
            cancelable: false,
          })
        );
      }
    } catch (e) {
      dlog("CustomEvent", e);
    }
  }

  /** @type {Object<string, { rating: unknown, review: unknown }>} */
  var placesById = Object.create(null);
  var allMarkers = [];

  var BADGE_STYLE_ID = "p4nlayer-injected-badge-css";

  function firstThumbUrlP4n(place) {
    if (!place) {
      return null;
    }
    var imgs = place.images;
    if (!imgs || !imgs.length) {
      return null;
    }
    var first = imgs[0];
    if (!first) {
      return null;
    }
    var url = first.thumb || first.url || null;
    if (!url) {
      return null;
    }
    return String(url);
  }

  var _p4nAppVersion = null;
  function getAppVersionP4n() {
    if (_p4nAppVersion !== null) {
      return _p4nAppVersion;
    }
    try {
      var meta = document.querySelector('meta[name="version"]');
      var v = meta && meta.getAttribute ? meta.getAttribute("content") : null;
      _p4nAppVersion = v && String(v).trim() ? String(v).trim() : "";
    } catch (_v0) {
      _p4nAppVersion = "";
    }
    return _p4nAppVersion;
  }

  var _p4nLang = null;
  function currentLangP4n() {
    if (_p4nLang !== null) {
      return _p4nLang;
    }
    var supported = ["es", "fr", "en", "de", "it", "nl"];
    var lang = "";
    try {
      var fromPath = /^\/([a-z]{2})(?:\/|$)/.exec(window.location.pathname || "");
      if (fromPath && supported.indexOf(fromPath[1]) >= 0) {
        lang = fromPath[1];
      }
    } catch (_l1) {
      /* ignore */
    }
    if (!lang) {
      try {
        var htmlLang = (document.documentElement.lang || "").slice(0, 2).toLowerCase();
        if (supported.indexOf(htmlLang) >= 0) {
          lang = htmlLang;
        }
      } catch (_l2) {
        /* ignore */
      }
    }
    _p4nLang = lang || "en";
    return _p4nLang;
  }

  var servicesLabelsP4n = null;
  var activitiesLabelsP4n = null;
  var labelsFetchedP4n = false;
  function fetchFiltersLabelsP4n() {
    if (labelsFetchedP4n) {
      return;
    }
    labelsFetchedP4n = true;
    var lang = currentLangP4n();
    function loadOne(kind) {
      try {
        var url = "/api/places/filters/" + kind + "?lang=" + encodeURIComponent(lang);
        fetch(url, { credentials: "same-origin" })
          .then(function (r) {
            if (!r || !r.ok) {
              return null;
            }
            return r.text();
          })
          .then(function (txt) {
            if (!txt) {
              return;
            }
            var parsed = null;
            try {
              parsed = JSON.parse(txt);
            } catch (_pj) {
              try {
                parsed = JSON.parse(atob(String(txt).trim()));
              } catch (_p2) {
                parsed = null;
              }
            }
            if (!parsed || typeof parsed !== "object") {
              return;
            }
            if (kind === "services") {
              servicesLabelsP4n = parsed;
            } else {
              activitiesLabelsP4n = parsed;
            }
            refreshVisiblePreviewP4n();
          })
          .catch(function (_e) {
            /* ignore */
          });
      } catch (_fl) {
        /* ignore */
      }
    }
    loadOne("services");
    loadOne("activities");
  }

  function serviceIconUrlP4n(code) {
    if (!code) {
      return "";
    }
    var c = String(code).trim();
    if (!c) {
      return "";
    }
    var ver = getAppVersionP4n();
    var base =
      "https://cdn6.park4night.com/images/svg/icons/services/service_" + c + ".svg";
    return ver ? base + "?v=" + encodeURIComponent(ver) : base;
  }

  function activityIconUrlP4n(code) {
    if (!code) {
      return "";
    }
    var c = String(code).trim();
    if (!c) {
      return "";
    }
    var ver = getAppVersionP4n();
    var base =
      "https://cdn6.park4night.com/images/svg/icons/activities/activity_" + c + ".svg";
    return ver ? base + "?v=" + encodeURIComponent(ver) : base;
  }

  function serviceLabelP4n(code) {
    if (servicesLabelsP4n && servicesLabelsP4n[code]) {
      return String(servicesLabelsP4n[code]);
    }
    return String(code || "");
  }

  function activityLabelP4n(code) {
    if (activitiesLabelsP4n && activitiesLabelsP4n[code]) {
      return String(activitiesLabelsP4n[code]);
    }
    return String(code || "");
  }

  function extractLatLngFromPlaceP4n(p) {
    if (!p || typeof p !== "object") {
      return { lat: NaN, lng: NaN };
    }
    var rawLat =
      p.latitude != null
        ? p.latitude
        : p.lat != null
        ? p.lat
        : p.gps && p.gps.lat != null
        ? p.gps.lat
        : p.coordinates && p.coordinates.lat != null
        ? p.coordinates.lat
        : Array.isArray(p.coordinates) && p.coordinates.length >= 2
        ? p.coordinates[1]
        : NaN;
    var rawLng =
      p.longitude != null
        ? p.longitude
        : p.lng != null
        ? p.lng
        : p.lon != null
        ? p.lon
        : p.gps && p.gps.lng != null
        ? p.gps.lng
        : p.coordinates && p.coordinates.lng != null
        ? p.coordinates.lng
        : Array.isArray(p.coordinates) && p.coordinates.length >= 2
        ? p.coordinates[0]
        : NaN;
    var lat = Number(rawLat);
    var lng = Number(rawLng);
    if (!isFinite(lat) || !isFinite(lng)) {
      return { lat: NaN, lng: NaN };
    }
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return { lat: NaN, lng: NaN };
    }
    return { lat: lat, lng: lng };
  }

  function buildPlaceDataP4n(p, includeCoords) {
    if (!p) {
      return null;
    }
    var data = {
      rating: p.rating,
      review: p.review,
      createdAt: p.created_at || p.createdAt || null,
      url: p.url,
      typeCode: p.type && p.type.code ? p.type.code : null,
      typeLabel: p.type && p.type.label ? p.type.label : null,
      titleHtml: p.title || "",
      titleShort: p.title_short || p.name || "",
      name: p.name || "",
      description: p.description || "",
      photo: p.photo || 0,
      address: p.address || null,
      thumbUrl: firstThumbUrlP4n(p),
      services: Array.isArray(p.services) ? p.services.slice() : [],
      activities: Array.isArray(p.activities) ? p.activities.slice() : [],
    };
    if (includeCoords) {
      var coords = extractLatLngFromPlaceP4n(p);
      data.lat = coords.lat;
      data.lng = coords.lng;
    }
    return data;
  }

  function setPlacesData(places) {
    placesById = Object.create(null);
    for (var i = 0; i < places.length; i++) {
      var p = places[i];
      if (p && p.id != null) {
        placesById[String(p.id)] = buildPlaceDataP4n(p, true);
      }
    }
  }

  function escapeHtmlP4n(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function absoluteUrlP4n(raw) {
    if (raw == null) {
      return null;
    }
    var u = String(raw).trim();
    if (!u) {
      return null;
    }
    if (/^https?:\/\//i.test(u)) {
      return u;
    }
    if (u.charAt(0) !== "/") {
      u = "/" + u;
    }
    return "https://park4night.com" + u;
  }

  function urlInfoP4n(place) {
    if (!place) {
      return null;
    }
    var abs = absoluteUrlP4n(place.url);
    if (!abs) {
      return null;
    }
    var label = null;
    var m = /\/place\/(\d+)/i.exec(abs);
    if (m) {
      label = "#" + m[1];
    } else {
      try {
        label = new URL(abs).pathname.replace(/^\/+/, "");
      } catch (_u) {
        label = abs;
      }
      if (!label) {
        label = abs;
      }
    }
    return { href: abs, label: label };
  }

  function iconUrlForTypeCodeP4n(code) {
    if (!code) {
      return null;
    }
    var normalized = String(code).trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    return (
      "https://cdn6.park4night.com/images/bitmap/icons/pins/pins_" +
      normalized +
      "@4x.png"
    );
  }

  function expectedPinSlugP4n(typeCode) {
    if (!typeCode) {
      return "";
    }
    return "pins_" + String(typeCode).trim().toLowerCase();
  }

  function currentIconSrcP4n(el) {
    if (!el) {
      return "";
    }
    var tag = String(el.tagName || "").toLowerCase();
    if (tag === "img") {
      try {
        return el.currentSrc || el.src || "";
      } catch (_s1) {
        return "";
      }
    }
    try {
      var style = el.style && el.style.backgroundImage;
      if (style && typeof style === "string") {
        var m = /url\(\s*["']?([^"')]+)["']?\s*\)/i.exec(style);
        if (m) {
          return m[1];
        }
      }
      if (el.getAttribute) {
        var attrStyle = el.getAttribute("style") || "";
        var mm = /background-image\s*:\s*url\(\s*["']?([^"')]+)["']?\s*\)/i.exec(
          attrStyle
        );
        if (mm) {
          return mm[1];
        }
      }
    } catch (_s2) {
      /* ignore */
    }
    return "";
  }

  function ensureTypeIconOnMarkerP4n(m, placeData) {
    if (!m) {
      return;
    }
    var el = m._icon;
    if (!el && typeof m.getElement === "function") {
      el = m.getElement();
    }
    if (!el) {
      return;
    }
    var typeCode = placeData && placeData.typeCode;
    if (!typeCode && m.place && m.place.type && m.place.type.code) {
      typeCode = m.place.type.code;
    }
    var iconUrl = iconUrlForTypeCodeP4n(typeCode);
    var expectedSlug = expectedPinSlugP4n(typeCode);
    if (!iconUrl || !expectedSlug) {
      return;
    }
    var currentSrc = currentIconSrcP4n(el);
    var lower = currentSrc ? currentSrc.toLowerCase() : "";
    if (lower && lower.indexOf(expectedSlug) >= 0) {
      if (el.dataset) {
        el.dataset.p4nlayerTypeIcon = "1";
      }
      return;
    }
    var tag = String(el.tagName || "").toLowerCase();
    try {
      if (tag === "img") {
        el.src = iconUrl;
      } else {
        el.style.backgroundImage = "url('" + iconUrl + "')";
        el.style.backgroundSize = el.style.backgroundSize || "contain";
        el.style.backgroundRepeat = el.style.backgroundRepeat || "no-repeat";
        el.style.backgroundPosition =
          el.style.backgroundPosition || "center center";
      }
      if (el.dataset) {
        el.dataset.p4nlayerTypeIcon = "1";
      }
      dlog(
        "icon reemplazado ->",
        typeCode,
        "|",
        String(iconUrl).slice(-40),
        "(antes:",
        String(currentSrc).slice(-60) + ")"
      );
    } catch (_ico) {
      dlog("icon error al reemplazar", typeCode, _ico);
    }
  }

  function ratingTextP4n(place) {
    if (!place) {
      return null;
    }
    var r = place.rating;
    if (r == null || r === "" || (typeof r === "number" && !isFinite(r))) {
      return null;
    }
    return Number(r).toLocaleString("es-ES", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });
  }

  function reviewCountP4n(place) {
    if (!place) {
      return 0;
    }
    var n = Number(place.review);
    if (!isFinite(n) || n < 0) {
      return 0;
    }
    return Math.floor(n);
  }

  function contentForP4n(place) {
    if (!SHOW_RATINGS_ENABLED_P4n) {
      return null;
    }
    var ratingText = ratingTextP4n(place);
    var reviews = reviewCountP4n(place);
    if (!ratingText && reviews === 0) {
      return null;
    }
    var starsLine =
      '<span class="p4n-line p4n-line-star">\u2605 ' +
      (ratingText ? escapeHtmlP4n(ratingText) : "—") +
      "</span>";
    var commentsLine =
      '<span class="p4n-line p4n-line-com">\uD83D\uDCAC ' +
      escapeHtmlP4n(reviews) +
      "</span>";
    return starsLine + commentsLine;
  }

  function injectP4nStylesOnce() {
    if (document.getElementById(BADGE_STYLE_ID)) {
      return;
    }
    var st = document.createElement("style");
    st.id = BADGE_STYLE_ID;
    st.setAttribute("data-p4nlayer", "1");
    st.textContent =
      ".leaflet-tooltip.p4n-rating-tip{background:rgba(255,255,255,.95);color:#0d47a1;" +
      "border:1px solid rgba(13,71,161,.35);box-shadow:0 1px 3px rgba(0,0,0,.25);" +
      "padding:2px 5px;border-radius:4px;font:600 10px/1.15 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;" +
      "white-space:nowrap;pointer-events:auto;text-align:center;cursor:pointer}" +
      ".leaflet-tooltip.p4n-rating-tip .p4n-line{display:block;line-height:1.2}" +
      ".leaflet-tooltip.p4n-rating-tip .p4n-line-com{color:#37474f;font-weight:500;margin-top:1px}" +
      ".leaflet-tooltip.p4n-rating-tip:before{display:none}" +
      ".p4n-preview-card{position:fixed;z-index:2147483000;display:none;width:360px;max-width:94vw;" +
      "background:#fff;color:#222;border:1px solid rgba(0,0,0,.08);border-radius:10px;" +
      "box-shadow:0 8px 24px rgba(0,0,0,.18);padding:12px 14px;" +
      "font:13px/1.4 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;" +
      "pointer-events:none}" +
      ".p4n-preview-card.p4n-preview-visible{display:flex;gap:12px;align-items:stretch}" +
      ".p4n-preview-thumb{flex:0 0 auto;width:96px;max-width:96px;max-height:120px;" +
      "border-radius:8px;object-fit:cover;background:#f1f5f9;display:block}" +
      ".p4n-preview-body{flex:1 1 auto;min-width:0;display:flex;flex-direction:column}" +
      ".p4n-preview-head{display:flex;align-items:flex-start;gap:10px;margin-bottom:8px}" +
      ".p4n-preview-icon{width:40px;height:40px;flex:0 0 auto;object-fit:contain;background:#e8f5e9;" +
      "border-radius:50%;padding:4px;box-sizing:border-box}" +
      ".p4n-preview-title{font-weight:600;line-height:1.25;font-size:13px;color:#102a43;word-break:break-word}" +
      ".p4n-preview-title img{width:18px;height:auto;vertical-align:middle;margin-right:4px;" +
      "margin-bottom:2px}" +
      ".p4n-preview-desc{font-size:12.5px;color:#334155;line-height:1.45;margin-bottom:10px;" +
      "display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}" +
      ".p4n-preview-footer{display:flex;justify-content:center;gap:18px;padding-top:8px;" +
      "border-top:1px solid #eef2f7;font-size:12.5px;color:#475569;font-weight:500}" +
      ".p4n-preview-footer span{display:inline-flex;align-items:center;gap:4px}" +
      ".p4n-preview-footer .p4n-preview-ico{font-size:13px;line-height:1}" +
      ".p4n-preview-iconrow{display:flex;flex-wrap:wrap;align-items:center;gap:6px;" +
      "margin-top:8px;padding-top:8px;border-top:1px dashed #eef2f7}" +
      ".p4n-preview-iconrow:empty{display:none}" +
      ".p4n-preview-iconrow.p4n-preview-svc{border-top-color:#dbeafe}" +
      ".p4n-preview-iconrow.p4n-preview-act{border-top-color:#dcfce7}" +
      ".p4n-preview-chip-ico{width:22px;height:22px;object-fit:contain;display:block;" +
      "padding:3px;border-radius:6px;background:#f8fafc;border:1px solid #e5e7eb}" +
      ".p4n-preview-iconrow.p4n-preview-svc .p4n-preview-chip-ico{background:#eff6ff;" +
      "border-color:#bfdbfe}" +
      ".p4n-preview-iconrow.p4n-preview-act .p4n-preview-chip-ico{background:#ecfdf5;" +
      "border-color:#bbf7d0}" +
      ".p4n-rf-section{margin:18px 0 10px}" +
      ".p4n-rf-section *{box-sizing:border-box}" +
      ".p4n-rf-title{margin:0 0 10px 0;padding-bottom:8px;border-bottom:1px solid #e5e7eb;" +
      "font:700 15px/1.2 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#111827;" +
      "letter-spacing:-0.01em}" +
      ".p4n-rf-row{display:flex;align-items:center;gap:12px;padding:6px 0;color:#374151;" +
      "font:14px/1.3 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}" +
      ".p4n-rf-icon{font-size:18px;width:28px;text-align:center;color:#f59e0b}" +
      ".p4n-rf-label{flex:1}" +
      ".p4n-rf-value{padding:2px 10px;background:#fef3c7;border-radius:999px;color:#92400e;" +
      "font-weight:700;font-size:12px;min-width:36px;text-align:center}" +
      ".p4n-rf-slider{width:100%;margin:6px 0 2px 0;accent-color:#10b981;cursor:pointer}" +
      ".p4n-rf-ticks{display:flex;justify-content:space-between;padding:0 2px;" +
      "font:11px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#9ca3af}" +
      ".p4n-type-row{position:relative}" +
      ".p4n-exclude-btn{position:absolute;right:30px;top:50%;" +
      "transform:translateY(-50%);display:inline-flex;align-items:center;" +
      "justify-content:center;width:18px;height:18px;border-radius:999px;" +
      "background:#fee2e2;border:1px solid #fca5a5;color:#b91c1c;" +
      "font-size:11px;font-weight:700;cursor:pointer;padding:0;margin:0;" +
      "line-height:1;opacity:0;visibility:hidden;" +
      "transition:opacity .12s ease,visibility .12s ease;" +
      "box-sizing:border-box;z-index:2}" +
      ".p4n-type-row:hover .p4n-exclude-btn{opacity:1;visibility:visible}" +
      ".p4n-exclude-btn:hover{background:#fecaca;color:#991b1b;" +
      "border-color:#f87171;transform:translateY(-50%) scale(1.1)}" +
      ".p4n-exclude-btn:focus-visible{outline:2px solid #ef4444;outline-offset:1px}" +
      ".p4n-sv-wrap{position:relative;display:inline-block;vertical-align:middle;" +
      "line-height:0}" +
      ".p4n-sv-link{position:absolute;top:50%;right:calc(100% + 8px);" +
      "transform:translateY(-50%);display:inline-flex;align-items:center;" +
      "justify-content:center;text-decoration:none;border-radius:999px;" +
      "transition:transform .12s ease;background:transparent;border:0;box-shadow:none;" +
      "margin:0;padding:0;line-height:0;z-index:5}" +
      ".p4n-sv-link:hover{transform:translateY(-50%) scale(1.06)}" +
      ".p4n-sv-link img{display:block;width:100%;height:100%;object-fit:contain;border-radius:inherit}" +
      "ul.place-actions a.p4n-sv-in-actions,ul.place-actions a.p4n-sv-place-action," +
      "ul.place-actions button.p4n-sv-in-actions,ul.place-actions button.p4n-sv-place-action{" +
      "position:relative;right:auto;top:auto;z-index:5;transform:none;line-height:1.2;" +
      "flex-direction:column;align-items:center;justify-content:flex-start;gap:6px;" +
      "font:inherit;color:#334155;cursor:pointer;appearance:none;-webkit-appearance:none;" +
      "box-sizing:border-box}" +
      "ul.place-actions a.p4n-sv-in-actions:hover,ul.place-actions a.p4n-sv-place-action:hover," +
      "ul.place-actions button.p4n-sv-in-actions:hover,ul.place-actions button.p4n-sv-place-action:hover{" +
      "transform:scale(1.05)}" +
      "ul.place-actions .p4n-sv-place-ico{flex:0 0 auto;display:inline-flex;align-items:center;" +
      "justify-content:center;border-radius:999px;overflow:hidden}" +
      "ul.place-actions .p4n-sv-place-ico img{display:block;width:100%;height:100%;" +
      "object-fit:contain}" +
      "ul.place-actions .p4n-sv-place-label{display:block;font-size:13px;" +
      "text-align:center;font-weight:500;color:#334155;white-space:nowrap;max-width:100%}" +
      ".p4n-sv-card-link{display:inline-flex;align-items:center;justify-content:center;" +
      "text-decoration:none;line-height:0;vertical-align:middle;margin-left:8px;" +
      "border-radius:999px;transition:transform .12s ease;cursor:pointer;" +
      "background:transparent;border:0;box-shadow:none;padding:0}" +
      ".p4n-sv-card-link:hover{transform:scale(1.08)}" +
      ".p4n-sv-card-link img{display:block;width:100%;height:100%;object-fit:contain;" +
      "border-radius:inherit;pointer-events:none}" +
      ".leaflet-control.p4n-pegman-control,.p4n-pegman-control{" +
      "box-sizing:border-box !important;width:44px !important;height:44px !important;" +
      "border-radius:999px !important;" +
      "background-color:#fff !important;background-repeat:no-repeat !important;" +
      "background-position:center center !important;background-size:32px 32px !important;" +
      "box-shadow:0 2px 6px rgba(0,0,0,.35) !important;cursor:grab !important;" +
      "border:1px solid rgba(0,0,0,.18) !important;transition:transform .12s ease !important;" +
      "user-select:none;-webkit-user-drag:element;touch-action:none;" +
      "padding:0 !important;margin:10px !important;display:block !important}" +
      ".leaflet-control.p4n-pegman-control:hover,.p4n-pegman-control:hover{" +
      "transform:scale(1.06) !important}" +
      ".leaflet-control.p4n-pegman-control.p4n-pegman-dragging,.p4n-pegman-control.p4n-pegman-dragging{" +
      "cursor:grabbing !important;opacity:.7 !important;transform:scale(.96) !important}" +
      ".leaflet-container.p4n-pegman-dropzone{cursor:crosshair !important}" +
      ".leaflet-container.p4n-pegman-dropzone-over{" +
      "outline:3px dashed rgba(26,115,232,.65);outline-offset:-6px}" +
      "@media (min-width:1400px){" +
      "html[data-p4n-full-width-map='1'] body.search-place-list section>.container{max-width:none}" +
      "html[data-p4n-full-width-map='1'] body.search-place-list .listmap-aside{flex:0 0 25rem;max-width:25rem}" +
      "}";
    (document.head || document.documentElement).appendChild(st);
  }

  function isPlaceDetailPageP4n() {
    try {
      return /\/place\/\d+/i.test(window.location.pathname || "");
    } catch (_p) {
      return false;
    }
  }

  function parseCoordinatesFromTextP4n(text) {
    if (!text) {
      return null;
    }
    var re = /(-?\d{1,2}(?:\.\d+))\s*,\s*(-?\d{1,3}(?:\.\d+))/g;
    var m;
    while ((m = re.exec(String(text)))) {
      var lat = Number(m[1]);
      var lng = Number(m[2]);
      if (!isFinite(lat) || !isFinite(lng)) {
        continue;
      }
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        continue;
      }
      return { lat: lat, lng: lng };
    }
    return null;
  }

  function parseCoordinatesFromJsonTextP4n(text) {
    if (!text) {
      return null;
    }
    var latRe = /"latitude"\s*:\s*(-?\d{1,2}(?:\.\d+)?)/i;
    var lngRe = /"longitude"\s*:\s*(-?\d{1,3}(?:\.\d+)?)/i;
    var mLat = latRe.exec(String(text));
    var mLng = lngRe.exec(String(text));
    if (!mLat || !mLng) {
      return null;
    }
    var lat = Number(mLat[1]);
    var lng = Number(mLng[1]);
    if (!isFinite(lat) || !isFinite(lng)) {
      return null;
    }
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return null;
    }
    return { lat: lat, lng: lng };
  }

  function detectPlaceCoordinatesP4n() {
    var fromMeta = null;
    try {
      var cands = document.querySelectorAll(
        'meta[name*="latitude" i], meta[property*="latitude" i], meta[name*="longitude" i], meta[property*="longitude" i]'
      );
      var lat = null;
      var lng = null;
      for (var i = 0; i < cands.length; i++) {
        var k =
          (cands[i].getAttribute("name") || cands[i].getAttribute("property") || "")
            .toLowerCase();
        var v = Number(cands[i].getAttribute("content"));
        if (!isFinite(v)) {
          continue;
        }
        if (k.indexOf("latitude") >= 0) {
          lat = v;
        }
        if (k.indexOf("longitude") >= 0) {
          lng = v;
        }
      }
      if (lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        fromMeta = { lat: lat, lng: lng };
      }
    } catch (_m) {
      /* ignore */
    }
    if (fromMeta) {
      return fromMeta;
    }
    try {
      var ld = document.querySelectorAll('script[type="application/ld+json"]');
      for (var j = 0; j < ld.length; j++) {
        var parsed = parseCoordinatesFromJsonTextP4n(ld[j].textContent || "");
        if (parsed) {
          return parsed;
        }
      }
    } catch (_ld) {
      /* ignore */
    }
    try {
      var gpsLike = document.querySelectorAll("a[href*='maps'],a[href*='google'],a[href*='@']");
      for (var k = 0; k < gpsLike.length; k++) {
        var href = gpsLike[k].getAttribute("href") || "";
        var found = parseCoordinatesFromTextP4n(href);
        if (found) {
          return found;
        }
      }
    } catch (_a) {
      /* ignore */
    }
    try {
      var ds = document.querySelectorAll("[data-lat],[data-lng],[data-latitude],[data-longitude]");
      for (var q = 0; q < ds.length; q++) {
        var latRaw =
          ds[q].getAttribute("data-lat") || ds[q].getAttribute("data-latitude") || "";
        var lngRaw =
          ds[q].getAttribute("data-lng") || ds[q].getAttribute("data-longitude") || "";
        var latVal = Number(latRaw);
        var lngVal = Number(lngRaw);
        if (isFinite(latVal) && isFinite(lngVal) && Math.abs(latVal) <= 90 && Math.abs(lngVal) <= 180) {
          return { lat: latVal, lng: lngVal };
        }
      }
    } catch (_d) {
      /* ignore */
    }
    var fromBody = null;
    try {
      fromBody = parseCoordinatesFromTextP4n(document.body && document.body.innerText);
    } catch (_b) {
      /* ignore */
    }
    return fromBody;
  }

  function streetViewUrlP4n(coords) {
    if (!coords) {
      return null;
    }
    var lat = Number(coords.lat);
    var lng = Number(coords.lng);
    if (!isFinite(lat) || !isFinite(lng)) {
      return null;
    }
    return (
      "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=" +
      encodeURIComponent(lat + "," + lng)
    );
  }

  function findRatingNodeP4n() {
    var candidates;
    try {
      candidates = document.querySelectorAll("h1,h2,h3,strong,b,span,div");
    } catch (_s) {
      return null;
    }
    var best = null;
    var bestLen = 1e9;
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (!el || !el.textContent) {
        continue;
      }
      var t = el.textContent.trim();
      if (!t) {
        continue;
      }
      if (/^\d(?:[.,]\d+)?\s*\/\s*5$/.test(t) || /^\d(?:[.,]\d+)?\s*\/\s*5\s*$/.test(t)) {
        return el;
      }
      if ((t.indexOf("/5") >= 0 || t.indexOf("★") >= 0) && /(\d(?:[.,]\d+)?\s*\/\s*5|★)/.test(t)) {
        if (t.length < bestLen) {
          best = el;
          bestLen = t.length;
        }
      }
    }
    return best;
  }

  function findPlaceActionsListP4n() {
    try {
      return document.querySelector("ul.place-actions");
    } catch (_p) {
      return null;
    }
  }

  function findContactActionLiP4n(ul) {
    if (!ul) {
      return null;
    }
    try {
      var b = ul.querySelector("button.toggle-subscription-ads");
      if (b && b.closest) {
        return b.closest("li");
      }
      var lis = ul.querySelectorAll("li");
      for (var i = 0; i < lis.length; i++) {
        var li = lis[i];
        if (li.querySelector && li.querySelector(".fa-phone")) {
          return li;
        }
      }
    } catch (_c) {
      /* ignore */
    }
    return null;
  }

  function unwrapP4nSvWrapP4n() {
    var wrap = document.querySelector("span.p4n-sv-wrap");
    if (!wrap || !wrap.parentNode) {
      return;
    }
    var parent = wrap.parentNode;
    while (wrap.firstChild) {
      parent.insertBefore(wrap.firstChild, wrap);
    }
    try {
      parent.removeChild(wrap);
    } catch (_u) {
      /* ignore */
    }
  }

  function placeDetailSvButtonLabelP4n() {
    return "StreetView";
  }

  function createPlaceDetailSvActionLinkP4n(href) {
    /* <button>: la SPA intercepta <a href>; el listado de acciones se re-renderiza. */
    var b = document.createElement("button");
    b.type = "button";
    b.className = "p4n-sv-link p4n-sv-in-actions p4n-sv-place-action";
    b.setAttribute("data-p4nlayer-sv-place-action", "1");
    b.setAttribute("data-p4n-sv-href", href);
    b.title = "Abrir Google Street View";
    b.setAttribute("aria-label", "Abrir Google Street View");
    b.innerHTML =
      '<span class="p4n-sv-place-ico"><img src="' +
      escapeHtmlP4n(P4N_SV_ICON_URL || P4N_SV_FALLBACK_URL) +
      '" alt="" aria-hidden="true" loading="lazy"></span>' +
      '<span class="p4n-sv-place-label">' +
      escapeHtmlP4n(placeDetailSvButtonLabelP4n()) +
      "</span>";
    return b;
  }

  var placeDetailSvClickDelegateP4nInstalled = false;
  function installPlaceDetailStreetViewClickDelegateP4n() {
    if (placeDetailSvClickDelegateP4nInstalled) {
      return;
    }
    placeDetailSvClickDelegateP4nInstalled = true;
    var lastOpenAtP4n = 0;
    var lastOpenHrefP4n = "";
    var placeDetailSvFromEventP4n = function (ev) {
      var t = ev.target;
      if (!t || typeof t.closest !== "function") {
        return;
      }
      var el = t.closest("[data-p4nlayer-sv-place-action='1']");
      if (!el) {
        return;
      }
      var h = String(el.getAttribute("data-p4n-sv-href") || "").trim();
      if (!h || h.indexOf("http") !== 0) {
        return;
      }
      var now = Date.now();
      if (h === lastOpenHrefP4n && now - lastOpenAtP4n < 450) {
        return;
      }
      lastOpenHrefP4n = h;
      lastOpenAtP4n = now;
      try {
        ev.preventDefault();
        ev.stopPropagation();
      } catch (_e) {
        /* ignore */
      }
      try {
        window.open(h, "_blank", "noopener,noreferrer");
      } catch (_o) {
        /* ignore */
      }
    };
    window.addEventListener("click", placeDetailSvFromEventP4n, true);
    window.addEventListener(
      "pointerdown",
      function (ev) {
        if (ev.button != null && ev.button !== 0) {
          return;
        }
        placeDetailSvFromEventP4n(ev);
      },
      true
    );
  }

  function ensurePlaceActionSvLinkP4n(li, href) {
    var oldA = li.querySelector("a.p4n-sv-link");
    if (oldA) {
      try {
        li.removeChild(oldA);
      } catch (_rm) {
        /* ignore */
      }
    }
    var cur = li.querySelector("[data-p4nlayer-sv-place-action='1']");
    if (cur && String(cur.tagName).toLowerCase() !== "button") {
      try {
        li.removeChild(cur);
      } catch (_rm2) {
        /* ignore */
      }
      cur = null;
    }
    if (!cur) {
      cur = createPlaceDetailSvActionLinkP4n(href);
      li.appendChild(cur);
      return cur;
    }
    cur.setAttribute("data-p4n-sv-href", href);
    cur.classList.add("p4n-sv-in-actions", "p4n-sv-place-action", "p4n-sv-link");
    if (!cur.querySelector(".p4n-sv-place-ico")) {
      cur.innerHTML =
        '<span class="p4n-sv-place-ico"><img src="' +
        escapeHtmlP4n(P4N_SV_ICON_URL || P4N_SV_FALLBACK_URL) +
        '" alt="" aria-hidden="true" loading="lazy"></span>' +
        '<span class="p4n-sv-place-label">' +
        escapeHtmlP4n(placeDetailSvButtonLabelP4n()) +
        "</span>";
    }
    return cur;
  }

  function applySvLinkSizeForPlaceActionsP4n(link) {
    if (!link) {
      return;
    }
    var ico = link.querySelector(".p4n-sv-place-ico");
    if (!ico) {
      applySvLinkSizeP4n(link, null);
      return;
    }
    var size = 0;
    var ref = document.querySelector("a.btn-itinerary i");
    try {
      if (ref) {
        var r = ref.getBoundingClientRect();
        size = r && r.width ? r.width : 0;
      }
    } catch (_sz) {
      size = 0;
    }
    if (!size || !isFinite(size) || size < 18 || size > 72) {
      size = 32;
    }
    ico.style.width = Math.round(size) + "px";
    ico.style.height = Math.round(size) + "px";
  }

  function applySvLinkSizeP4n(a, refIcon) {
    if (!a) {
      return;
    }
    var size = 0;
    try {
      if (refIcon) {
        var r = refIcon.getBoundingClientRect();
        size = r && r.width ? r.width : 0;
      }
    } catch (_sz) {
      size = 0;
    }
    if (!size || !isFinite(size)) {
      size = 36;
    }
    if (size < 24) {
      size = 24;
    }
    if (size > 48) {
      size = 48;
    }
    a.style.width = Math.round(size) + "px";
    a.style.height = Math.round(size) + "px";
    a.style.marginRight = "";
  }

  function createSvLinkElementP4n(href) {
    var a = document.createElement("a");
    a.className = "p4n-sv-link";
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = "Abrir Google Street View";
    a.setAttribute("aria-label", "Abrir Google Street View");
    a.innerHTML =
      '<img src="' +
      escapeHtmlP4n(P4N_SV_ICON_URL || P4N_SV_FALLBACK_URL) +
      '" alt="" aria-hidden="true" loading="lazy">';
    return a;
  }

  function upsertStreetViewLinkP4n() {
    if (!isPlaceDetailPageP4n()) {
      return;
    }
    var coords = detectPlaceCoordinatesP4n();
    var href = streetViewUrlP4n(coords);
    if (!href) {
      try {
        var liRm = document.querySelector("ul.place-actions li[data-p4nlayer-sv='1']");
        if (liRm) {
          liRm.remove();
        }
        unwrapP4nSvWrapP4n();
      } catch (_cl) {
        /* ignore */
      }
      return;
    }
    var actionsList = findPlaceActionsListP4n();
    if (actionsList) {
      if (actionsList.getAttribute("data-p4nlayer-sv-obs") !== "1") {
        actionsList.setAttribute("data-p4nlayer-sv-obs", "1");
        try {
          new MutationObserver(function () {
            scheduleStreetViewLinkP4n();
          }).observe(actionsList, { childList: true, subtree: true });
        } catch (_obs) {
          /* ignore */
        }
      }
      var contactLi = findContactActionLiP4n(actionsList);
      var svLi = document.querySelector("ul.place-actions li[data-p4nlayer-sv='1']");
      if (!svLi) {
        svLi = document.createElement("li");
        svLi.setAttribute("data-p4nlayer", "1");
        svLi.setAttribute("data-p4nlayer-sv", "1");
        svLi.className = "col-3";
      }
      var link = ensurePlaceActionSvLinkP4n(svLi, href);
      if (contactLi) {
        try {
          contactLi.insertAdjacentElement("afterend", svLi);
        } catch (_ins) {
          /* ignore */
        }
      } else {
        try {
          actionsList.appendChild(svLi);
        } catch (_ap) {
          /* ignore */
        }
      }
      applySvLinkSizeForPlaceActionsP4n(link);
      unwrapP4nSvWrapP4n();
      return;
    }
    unwrapP4nSvWrapP4n();
    var existing = document.querySelector(
      "a.p4n-sv-link:not(.p4n-sv-card-link)"
    );
    var ratingNode = findRatingNodeP4n();
    if (!ratingNode || !ratingNode.parentElement) {
      return;
    }
    if (existing) {
      if (existing.closest && existing.closest("ul.place-actions")) {
        return;
      }
      existing.href = href;
      applySvLinkSizeP4n(existing, null);
      return;
    }
    var fallbackLink = createSvLinkElementP4n(href);
    applySvLinkSizeP4n(fallbackLink, null);
    ratingNode.insertAdjacentElement("afterend", fallbackLink);
  }

  var placeDetailObserverP4n = null;
  var placeDetailScheduledP4n = false;
  function scheduleStreetViewLinkP4n() {
    if (placeDetailScheduledP4n) {
      return;
    }
    placeDetailScheduledP4n = true;
    setTimeout(function () {
      placeDetailScheduledP4n = false;
      upsertStreetViewLinkP4n();
    }, 50);
  }

  function ensureStreetViewLinkOnPlaceDetailP4n() {
    if (!isPlaceDetailPageP4n()) {
      return;
    }
    scheduleStreetViewLinkP4n();
    if (placeDetailObserverP4n) {
      return;
    }
    try {
      placeDetailObserverP4n = new MutationObserver(function () {
        scheduleStreetViewLinkP4n();
      });
      placeDetailObserverP4n.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    } catch (_o) {
      /* ignore */
    }
  }

  function findPlaceCardsP4n() {
    var out = [];
    var seen = Object.create(null);
    try {
      var anchors = document.querySelectorAll('a[href*="/place/"]');
      for (var i = 0; i < anchors.length; i++) {
        var a = anchors[i];
        var href = a.getAttribute("href") || "";
        var m = /\/place\/(\d+)/.exec(href);
        if (!m) {
          continue;
        }
        var id = m[1];
        if (seen[id]) {
          continue;
        }
        seen[id] = true;
        out.push({ anchor: a, id: id });
      }
    } catch (_pc) {
      /* ignore */
    }
    return out;
  }

  function findCardFooterRowP4n(card) {
    if (!card || !card.querySelectorAll) {
      return null;
    }
    try {
      var nodes = card.querySelectorAll("*");
      for (var i = nodes.length - 1; i >= 0; i--) {
        var el = nodes[i];
        if (!el) {
          continue;
        }
        var txt = (el.textContent || "").trim();
        if (!txt || txt.length > 12) {
          continue;
        }
        if (!/[★⭐]/.test(txt)) {
          continue;
        }
        var row = el.parentElement;
        while (row && row !== card) {
          if (row.children && row.children.length >= 2) {
            return row;
          }
          row = row.parentElement;
        }
      }
    } catch (_fr) {
      /* ignore */
    }
    return null;
  }

  function measureCardIconSizeP4n(footer) {
    if (!footer) {
      return 18;
    }
    try {
      var sample = footer.querySelector("img, svg");
      if (sample && sample.getBoundingClientRect) {
        var r = sample.getBoundingClientRect();
        if (r && r.height > 0) {
          return Math.max(14, Math.min(28, Math.round(r.height)));
        }
      }
      var fs = 0;
      try {
        fs = parseFloat(
          (window.getComputedStyle && window.getComputedStyle(footer).fontSize) || "0"
        );
      } catch (_fs) {
        fs = 0;
      }
      if (isFinite(fs) && fs > 0) {
        return Math.max(14, Math.min(28, Math.round(fs * 1.2)));
      }
    } catch (_mi) {
      /* ignore */
    }
    return 18;
  }

  function ensureSvLinkOnCardP4n(anchor, id) {
    if (!anchor) {
      return;
    }
    if (anchor.dataset && anchor.dataset.p4nSvCardDone === "1") {
      return;
    }
    var data = placesById[id];
    if (!data) {
      return;
    }
    if (!isFinite(data.lat) || !isFinite(data.lng)) {
      return;
    }
    var footer = findCardFooterRowP4n(anchor);
    if (!footer) {
      return;
    }
    if (footer.querySelector && footer.querySelector(".p4n-sv-card-link")) {
      anchor.dataset.p4nSvCardDone = "1";
      return;
    }
    var url = streetViewUrlP4n({ lat: data.lat, lng: data.lng });
    if (!url) {
      return;
    }
    var size = measureCardIconSizeP4n(footer);
    var link = document.createElement("a");
    link.className = "p4n-sv-card-link";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = "Abrir en Google Street View";
    link.setAttribute("aria-label", "Abrir en Google Street View");
    link.style.width = size + "px";
    link.style.height = size + "px";
    var img = document.createElement("img");
    img.src = P4N_SV_ICON_URL || P4N_SV_FALLBACK_URL;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.setAttribute("draggable", "false");
    link.appendChild(img);
    var stopAll = function (ev) {
      if (ev && typeof ev.stopPropagation === "function") {
        ev.stopPropagation();
      }
      if (ev && typeof ev.stopImmediatePropagation === "function") {
        ev.stopImmediatePropagation();
      }
    };
    link.addEventListener("click", stopAll, true);
    link.addEventListener("mousedown", stopAll, true);
    link.addEventListener("touchstart", stopAll, true);
    link.addEventListener("pointerdown", stopAll, true);
    try {
      footer.appendChild(link);
    } catch (_ap) {
      return;
    }
    anchor.dataset.p4nSvCardDone = "1";
  }

  function ensureSvLinksOnSidebarCardsP4n() {
    try {
      injectP4nStylesOnce();
    } catch (_is) {
      /* ignore */
    }
    var cards = findPlaceCardsP4n();
    for (var i = 0; i < cards.length; i++) {
      try {
        ensureSvLinkOnCardP4n(cards[i].anchor, cards[i].id);
      } catch (_cc) {
        /* ignore */
      }
    }
  }

  var sidebarSvScheduledP4n = false;
  function scheduleSidebarSvLinksP4n() {
    if (sidebarSvScheduledP4n) {
      return;
    }
    sidebarSvScheduledP4n = true;
    var run = function () {
      sidebarSvScheduledP4n = false;
      ensureSvLinksOnSidebarCardsP4n();
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 16);
    }
  }

  var MIN_REVIEWS_KEY = "p4nlayerMinReviews";
  var MAX_REVIEWS_FILTER = 50;
  var CREATED_MONTHS_KEY = "p4nlayerCreatedMonthsBucket";
  var MIN_CREATED_MONTHS_BUCKET = 1;
  var MAX_CREATED_MONTHS_BUCKET = 24;
  var FILTER_SECTION_ID = "p4n-review-filter";
  var minReviewsThreshold = 0;
  var createdMonthsBucket = MAX_CREATED_MONTHS_BUCKET;

  (function loadReviewsThreshold() {
    try {
      var raw = window.localStorage.getItem(MIN_REVIEWS_KEY);
      if (raw != null && raw !== "") {
        var n = Number(raw);
        if (isFinite(n)) {
          minReviewsThreshold = Math.max(
            0,
            Math.min(MAX_REVIEWS_FILTER, Math.floor(n))
          );
        }
      }
    } catch (_lt) {
      /* ignore */
    }
  })();

  (function loadCreatedMonthsBucketP4n() {
    try {
      var raw = window.localStorage.getItem(CREATED_MONTHS_KEY);
      if (raw != null && raw !== "") {
        var n = Number(raw);
        if (isFinite(n)) {
          createdMonthsBucket = Math.max(
            MIN_CREATED_MONTHS_BUCKET,
            Math.min(MAX_CREATED_MONTHS_BUCKET, Math.floor(n))
          );
        }
      }
    } catch (_lc) {
      /* ignore */
    }
  })();

  function saveReviewsThresholdP4n(v) {
    try {
      window.localStorage.setItem(MIN_REVIEWS_KEY, String(v));
    } catch (_st) {
      /* ignore */
    }
  }

  function saveCreatedMonthsBucketP4n(v) {
    try {
      window.localStorage.setItem(CREATED_MONTHS_KEY, String(v));
    } catch (_sc) {
      /* ignore */
    }
  }

  function createdAtDateP4n(place) {
    if (!place) {
      return null;
    }
    var raw = place.created_at || place.createdAt || null;
    if (!raw) {
      return null;
    }
    if (raw instanceof Date) {
      return isFinite(raw.getTime()) ? raw : null;
    }
    var d = new Date(raw);
    if (!isFinite(d.getTime())) {
      return null;
    }
    return d;
  }

  function ageMonthsP4n(place) {
    var createdAt = createdAtDateP4n(place);
    if (!createdAt) {
      return null;
    }
    var now = new Date();
    var ms = now.getTime() - createdAt.getTime();
    if (!isFinite(ms) || ms < 0) {
      return 0;
    }
    return ms / (1000 * 60 * 60 * 24 * 30.4375);
  }

  function matchesCreatedAtFilterP4n(place) {
    if (createdMonthsBucket >= MAX_CREATED_MONTHS_BUCKET) {
      return true;
    }
    var ageMonths = ageMonthsP4n(place);
    if (ageMonths == null) {
      return false;
    }
    return ageMonths < createdMonthsBucket;
  }

  function applyFiltersToMarkerP4n(m) {
    if (!m || !m.place) {
      return;
    }
    var reviews = reviewCountP4n(m.place);
    var show = reviews >= minReviewsThreshold && matchesCreatedAtFilterP4n(m.place);
    var el = m._icon;
    if (!el && typeof m.getElement === "function") {
      el = m.getElement();
    }
    if (el && el.style) {
      el.style.display = show ? "" : "none";
    }
    if (m._shadow && m._shadow.style) {
      m._shadow.style.display = show ? "" : "none";
    }
    try {
      var tip = null;
      if (typeof m.getTooltip === "function") {
        tip = m.getTooltip();
      }
      if (tip && typeof tip.getElement === "function") {
        var tipEl = tip.getElement();
        if (tipEl && tipEl.style) {
          tipEl.style.display = show ? "" : "none";
        }
      }
    } catch (_af) {
      /* ignore */
    }
  }

  function applyFiltersAllMarkersP4n() {
    for (var i = 0; i < allMarkers.length; i++) {
      applyFiltersToMarkerP4n(allMarkers[i]);
    }
    if (!isDebug()) {
      return;
    }
    var hidden = 0;
    for (var j = 0; j < allMarkers.length; j++) {
      var mm = allMarkers[j];
      if (!mm || !mm.place) {
        continue;
      }
      if (
        reviewCountP4n(mm.place) < minReviewsThreshold ||
        !matchesCreatedAtFilterP4n(mm.place)
      ) {
        hidden += 1;
      }
    }
    dlog(
      "filtros: comentarios >=",
      minReviewsThreshold,
      "| creado:",
      createdFilterValueLabelP4n(createdMonthsBucket),
      "-> ocultos:",
      hidden,
      "/",
      allMarkers.length
    );
  }

  function setMinReviewsP4n(v) {
    var n = Number(v);
    if (!isFinite(n)) {
      n = 0;
    }
    n = Math.max(0, Math.min(MAX_REVIEWS_FILTER, Math.floor(n)));
    minReviewsThreshold = n;
    saveReviewsThresholdP4n(n);
    applyFiltersAllMarkersP4n();
    syncResetButtonStateP4n();
  }

  function setCreatedMonthsBucketP4n(v) {
    var n = Number(v);
    if (!isFinite(n)) {
      n = MAX_CREATED_MONTHS_BUCKET;
    }
    n = Math.max(
      MIN_CREATED_MONTHS_BUCKET,
      Math.min(MAX_CREATED_MONTHS_BUCKET, Math.floor(n))
    );
    createdMonthsBucket = n;
    saveCreatedMonthsBucketP4n(n);
    applyFiltersAllMarkersP4n();
    syncResetButtonStateP4n();
  }

  function hasCustomFiltersActiveP4n() {
    return (
      minReviewsThreshold > 0 || createdMonthsBucket < MAX_CREATED_MONTHS_BUCKET
    );
  }

  function reviewFilterValueLabelP4n(n) {
    if (n >= MAX_REVIEWS_FILTER) {
      return MAX_REVIEWS_FILTER + "+";
    }
    return String(n);
  }

  function reviewFilterRowLabelP4n(n) {
    if (n <= 0) {
      return "Mostrar todos los lugares";
    }
    if (n >= MAX_REVIEWS_FILTER) {
      return (
        "Mostrar solo con " + MAX_REVIEWS_FILTER + " o más comentarios"
      );
    }
    return "Mostrar solo con " + n + " o más comentarios";
  }

  function createdFilterValueLabelP4n(n) {
    if (n >= MAX_CREATED_MONTHS_BUCKET) {
      return "\u221E";
    }
    return "<" + n + "m";
  }

  function createdBucketToSliderP4n(bucket) {
    return MAX_CREATED_MONTHS_BUCKET - bucket + MIN_CREATED_MONTHS_BUCKET;
  }

  function createdSliderToBucketP4n(sliderValue) {
    return MAX_CREATED_MONTHS_BUCKET - sliderValue + MIN_CREATED_MONTHS_BUCKET;
  }

  function createdFilterRowLabelP4n(n) {
    if (n >= MAX_CREATED_MONTHS_BUCKET) {
      return "Sin filtro por antigüedad";
    }
    if (n <= 1) {
      return "Mostrar solo creados hace menos de 1 mes";
    }
    return "Mostrar solo creados hace menos de " + n + " meses";
  }

  function buildReviewFilterHtmlP4n() {
    var v = minReviewsThreshold;
    var createdV = createdMonthsBucket;
    var createdSliderValue = createdBucketToSliderP4n(createdV);
    return (
      '<h3 class="p4n-rf-title">Número de comentarios</h3>' +
      '<div class="p4n-rf-row">' +
      '<span class="p4n-rf-icon">\uD83D\uDCAC</span>' +
      '<span class="p4n-rf-label" data-p4n-rf-label>' +
      escapeHtmlP4n(reviewFilterRowLabelP4n(v)) +
      "</span>" +
      '<span class="p4n-rf-value" data-p4n-rf-value>' +
      escapeHtmlP4n(reviewFilterValueLabelP4n(v)) +
      "</span>" +
      "</div>" +
      '<input type="range" class="p4n-rf-slider" min="0" max="' +
      MAX_REVIEWS_FILTER +
      '" step="1" value="' +
      v +
      '" data-p4n-rf-slider>' +
      '<div class="p4n-rf-ticks">' +
      "<span>0</span>" +
      "<span>10</span>" +
      "<span>20</span>" +
      "<span>30</span>" +
      "<span>40</span>" +
      "<span>" +
      MAX_REVIEWS_FILTER +
      "+</span>" +
      "</div>" +
      '<h3 class="p4n-rf-title">Creado hace ...</h3>' +
      '<div class="p4n-rf-row">' +
      '<span class="p4n-rf-icon">\uD83D\uDDD3\uFE0F</span>' +
      '<span class="p4n-rf-label" data-p4n-cf-label>' +
      escapeHtmlP4n(createdFilterRowLabelP4n(createdV)) +
      "</span>" +
      '<span class="p4n-rf-value" data-p4n-cf-value>' +
      escapeHtmlP4n(createdFilterValueLabelP4n(createdV)) +
      "</span>" +
      "</div>" +
      '<input type="range" class="p4n-rf-slider" min="' +
      MIN_CREATED_MONTHS_BUCKET +
      '" max="' +
      MAX_CREATED_MONTHS_BUCKET +
      '" step="1" value="' +
      createdSliderValue +
      '" data-p4n-cf-slider>' +
      '<div class="p4n-rf-ticks">' +
      "<span>\u221E</span>" +
      "<span>&lt;18m</span>" +
      "<span>&lt;12m</span>" +
      "<span>&lt;6m</span>" +
      "<span>&lt;1m</span>" +
      "</div>"
    );
  }

  function wireReviewFilterP4n(wrap) {
    if (!wrap) {
      return;
    }
    var slider = wrap.querySelector("[data-p4n-rf-slider]");
    var label = wrap.querySelector("[data-p4n-rf-label]");
    var valueEl = wrap.querySelector("[data-p4n-rf-value]");
    var createdSlider = wrap.querySelector("[data-p4n-cf-slider]");
    var createdLabel = wrap.querySelector("[data-p4n-cf-label]");
    var createdValueEl = wrap.querySelector("[data-p4n-cf-value]");
    if (!slider) {
      return;
    }
    function onChange() {
      var val = Number(slider.value);
      if (label) {
        label.textContent = reviewFilterRowLabelP4n(val);
      }
      if (valueEl) {
        valueEl.textContent = reviewFilterValueLabelP4n(val);
      }
      setMinReviewsP4n(val);
    }
    slider.addEventListener("input", onChange);
    slider.addEventListener("change", onChange);
    if (createdSlider) {
      var onCreatedChange = function () {
        var sliderVal = Number(createdSlider.value);
        var val = createdSliderToBucketP4n(sliderVal);
        if (createdLabel) {
          createdLabel.textContent = createdFilterRowLabelP4n(val);
        }
        if (createdValueEl) {
          createdValueEl.textContent = createdFilterValueLabelP4n(val);
        }
        setCreatedMonthsBucketP4n(val);
      };
      createdSlider.addEventListener("input", onCreatedChange);
      createdSlider.addEventListener("change", onCreatedChange);
    }
  }

  function syncReviewFilterUiP4n() {
    var wrap = document.getElementById(FILTER_SECTION_ID);
    if (!wrap) {
      return;
    }
    var slider = wrap.querySelector("[data-p4n-rf-slider]");
    var label = wrap.querySelector("[data-p4n-rf-label]");
    var valueEl = wrap.querySelector("[data-p4n-rf-value]");
    var createdSlider = wrap.querySelector("[data-p4n-cf-slider]");
    var createdLabel = wrap.querySelector("[data-p4n-cf-label]");
    var createdValueEl = wrap.querySelector("[data-p4n-cf-value]");
    if (slider) {
      slider.value = String(minReviewsThreshold);
    }
    if (label) {
      label.textContent = reviewFilterRowLabelP4n(minReviewsThreshold);
    }
    if (valueEl) {
      valueEl.textContent = reviewFilterValueLabelP4n(minReviewsThreshold);
    }
    if (createdSlider) {
      createdSlider.value = String(createdBucketToSliderP4n(createdMonthsBucket));
    }
    if (createdLabel) {
      createdLabel.textContent = createdFilterRowLabelP4n(createdMonthsBucket);
    }
    if (createdValueEl) {
      createdValueEl.textContent = createdFilterValueLabelP4n(createdMonthsBucket);
    }
  }

  function resetCustomFiltersP4n() {
    setMinReviewsP4n(0);
    setCreatedMonthsBucketP4n(MAX_CREATED_MONTHS_BUCKET);
    syncReviewFilterUiP4n();
    syncResetButtonStateP4n();
  }

  function isResetLabelP4n(text) {
    var t = String(text || "")
      .trim()
      .toLowerCase();
    return (
      t === "reiniciar" ||
      t === "réinitialiser" ||
      t === "reinitialiser" ||
      t === "reset"
    );
  }

  function findFilterResetControlsP4n() {
    var out = [];
    var seen = new Set();
    var cands = document.querySelectorAll("a,button,[role='button']");
    for (var i = 0; i < cands.length; i++) {
      var el = cands[i];
      if (!el || seen.has(el)) {
        continue;
      }
      if (
        typeof el.closest === "function" &&
        el.closest("#" + FILTER_SECTION_ID)
      ) {
        continue;
      }
      if (isResetLabelP4n(el.textContent || "")) {
        out.push(el);
        seen.add(el);
      }
    }
    return out;
  }

  function forceShowResetControlP4n(el) {
    if (!el || !el.style) {
      return;
    }
    if (!el.dataset.p4nResetPrevDisplay) {
      el.dataset.p4nResetPrevDisplay = el.style.display || "";
    }
    if (!el.dataset.p4nResetPrevVisibility) {
      el.dataset.p4nResetPrevVisibility = el.style.visibility || "";
    }
    el.dataset.p4nResetForced = "1";
    el.style.setProperty("display", "inline-flex", "important");
    el.style.setProperty("visibility", "visible", "important");
    el.style.setProperty("opacity", "1", "important");
    el.style.setProperty("pointer-events", "auto", "important");
  }

  function restoreResetControlP4n(el) {
    if (!el || !el.style) {
      return;
    }
    if (el.dataset && el.dataset.p4nResetForced !== "1") {
      return;
    }
    if (el.dataset && el.dataset.p4nResetPrevDisplay != null) {
      el.style.display = el.dataset.p4nResetPrevDisplay;
      delete el.dataset.p4nResetPrevDisplay;
    } else {
      el.style.removeProperty("display");
    }
    if (el.dataset && el.dataset.p4nResetPrevVisibility != null) {
      el.style.visibility = el.dataset.p4nResetPrevVisibility;
      delete el.dataset.p4nResetPrevVisibility;
    } else {
      el.style.removeProperty("visibility");
    }
    el.style.removeProperty("opacity");
    el.style.removeProperty("pointer-events");
    if (el.dataset) {
      delete el.dataset.p4nResetForced;
    }
  }

  function syncResetButtonStateP4n() {
    var controls = findFilterResetControlsP4n();
    if (!controls.length) {
      return;
    }
    var active = hasCustomFiltersActiveP4n();
    for (var i = 0; i < controls.length; i++) {
      if (active) {
        forceShowResetControlP4n(controls[i]);
      } else {
        restoreResetControlP4n(controls[i]);
      }
    }
  }

  function findLeafTextElP4n(text) {
    if (!document.body) {
      return null;
    }
    var all = document.body.querySelectorAll(
      "h1,h2,h3,h4,h5,h6,strong,b,p,span,div,label"
    );
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.children && el.children.length > 0) {
        continue;
      }
      if ((el.textContent || "").trim() === text) {
        return el;
      }
    }
    return null;
  }

  function commonAncestorP4n(a, b) {
    if (!a || !b) {
      return null;
    }
    var ancestors = new Set();
    var n = a;
    while (n) {
      ancestors.add(n);
      n = n.parentElement;
    }
    n = b;
    while (n) {
      if (ancestors.has(n)) {
        return n;
      }
      n = n.parentElement;
    }
    return null;
  }

  function tryInjectReviewFilterP4n() {
    if (document.getElementById(FILTER_SECTION_ID)) {
      return true;
    }
    var heightEl = findLeafTextElP4n("Límite de altura de su vehículo:");
    var filterByEl = findLeafTextElP4n("Filtrar por");
    if (!heightEl || !filterByEl) {
      return false;
    }
    var common = commonAncestorP4n(heightEl, filterByEl);
    if (!common) {
      return false;
    }
    var heightSection = heightEl;
    while (heightSection && heightSection.parentElement !== common) {
      heightSection = heightSection.parentElement;
    }
    if (!heightSection) {
      return false;
    }
    injectP4nStylesOnce();
    var wrap = document.createElement("div");
    wrap.id = FILTER_SECTION_ID;
    wrap.className = "p4n-rf-section";
    wrap.setAttribute("data-p4nlayer", "1");
    wrap.innerHTML = buildReviewFilterHtmlP4n();
    common.insertBefore(wrap, heightSection);
    wireReviewFilterP4n(wrap);
    syncResetButtonStateP4n();
    dlog("filtro de comentarios inyectado");
    return true;
  }

  function handleResetClickP4n(ev) {
    var t = ev && ev.target ? ev.target : null;
    if (!t || typeof t.closest !== "function") {
      return;
    }
    var clickable = t.closest("a,button,[role='button']");
    if (!clickable) {
      return;
    }
    if (!isResetLabelP4n(clickable.textContent || "")) {
      return;
    }
    if (!document.getElementById(FILTER_SECTION_ID)) {
      return;
    }
    resetCustomFiltersP4n();
  }

  document.addEventListener("click", handleResetClickP4n, true);

  var filterInjectPending = false;
  function scheduleInjectReviewFilterP4n() {
    if (filterInjectPending) {
      return;
    }
    filterInjectPending = true;
    var run = function () {
      filterInjectPending = false;
      tryInjectReviewFilterP4n();
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 16);
    }
  }

  var TYPE_FILTER_HEADING_TEXT = "Filtrar tipos de lugares:";
  var TYPE_FILTER_MIN_CHECKBOXES = 8;
  var TYPE_FILTER_EXCLUDE_MARK = "p4nExcludeInjected";

  function findParkingTypeCheckboxesP4n() {
    var heading = findLeafTextElP4n(TYPE_FILTER_HEADING_TEXT);
    if (!heading) {
      return null;
    }
    var el = heading.parentElement;
    var depth = 0;
    while (el && depth++ < 8) {
      var afterHeading = [];
      var all = el.querySelectorAll('input[type="checkbox"]');
      for (var i = 0; i < all.length; i++) {
        var cb = all[i];
        var rel = heading.compareDocumentPosition(cb);
        if (rel & Node.DOCUMENT_POSITION_FOLLOWING) {
          afterHeading.push(cb);
        }
      }
      if (afterHeading.length < TYPE_FILTER_MIN_CHECKBOXES) {
        el = el.parentElement;
        continue;
      }
      var nextHeading = null;
      var headings = el.querySelectorAll("h1,h2,h3,h4,h5,h6");
      for (var j = 0; j < headings.length; j++) {
        var h = headings[j];
        if (h === heading) {
          continue;
        }
        if (!h.textContent || !h.textContent.trim()) {
          continue;
        }
        if (heading.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING) {
          nextHeading = h;
          break;
        }
      }
      var result = [];
      for (var k = 0; k < afterHeading.length; k++) {
        var c = afterHeading[k];
        if (
          nextHeading &&
          nextHeading.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING
        ) {
          continue;
        }
        result.push(c);
      }
      if (result.length >= TYPE_FILTER_MIN_CHECKBOXES) {
        return result;
      }
      el = el.parentElement;
    }
    return null;
  }

  function findTypeRowContainerP4n(cb) {
    var el = cb;
    var depth = 0;
    while (el && depth++ < 6) {
      var tag = String(el.tagName || "").toLowerCase();
      if (tag === "li") {
        return el;
      }
      var parent = el.parentElement;
      if (!parent) {
        break;
      }
      var parentTag = String(parent.tagName || "").toLowerCase();
      if (parentTag === "ul" || parentTag === "ol") {
        return el;
      }
      el = parent;
    }
    el = cb;
    depth = 0;
    while (el && depth++ < 6) {
      if (String(el.tagName || "").toLowerCase() === "label") {
        return el;
      }
      el = el.parentElement;
    }
    return cb.parentElement;
  }

  function fireChangeP4n(cb) {
    try {
      cb.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (_i) {
      /* ignore */
    }
    try {
      cb.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (_c) {
      /* ignore */
    }
    try {
      cb.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    } catch (_ck) {
      /* ignore */
    }
  }

  function excludeParkingTypeP4n(targetCb, allCbs) {
    for (var i = 0; i < allCbs.length; i++) {
      var cb = allCbs[i];
      if (!cb || cb.disabled) {
        continue;
      }
      var shouldBeChecked = cb !== targetCb;
      if (cb.checked === shouldBeChecked) {
        continue;
      }
      try {
        cb.click();
      } catch (_ecc) {
        cb.checked = shouldBeChecked;
        fireChangeP4n(cb);
      }
    }
    dlog(
      "excluir tipo -> marcados",
      allCbs.length - 1,
      "de",
      allCbs.length
    );
  }

  function enhanceParkingTypeFiltersP4n() {
    var cbs = findParkingTypeCheckboxesP4n();
    if (!cbs || !cbs.length) {
      return false;
    }
    injectP4nStylesOnce();
    var added = 0;
    for (var i = 0; i < cbs.length; i++) {
      var cb = cbs[i];
      if (!cb || (cb.dataset && cb.dataset[TYPE_FILTER_EXCLUDE_MARK] === "1")) {
        continue;
      }
      var row = findTypeRowContainerP4n(cb);
      if (row && row.classList) {
        row.classList.add("p4n-type-row");
      }
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "p4n-exclude-btn";
      btn.setAttribute("data-p4nlayer", "1");
      btn.setAttribute("aria-label", "Excluir este tipo de aparcamiento");
      btn.title = "Seleccionar todos los demás tipos (excluir este)";
      btn.textContent = "\u2716";
      (function (targetCb, allCbs) {
        var stopAll = function (ev) {
          try {
            ev.preventDefault();
          } catch (_p) {
            /* ignore */
          }
          try {
            ev.stopPropagation();
          } catch (_s) {
            /* ignore */
          }
          try {
            ev.stopImmediatePropagation();
          } catch (_si) {
            /* ignore */
          }
        };
        btn.addEventListener("mousedown", stopAll);
        btn.addEventListener("mouseup", stopAll);
        btn.addEventListener("click", function (ev) {
          stopAll(ev);
          excludeParkingTypeP4n(targetCb, allCbs);
        });
      })(cb, cbs);
      var parent = cb.parentElement;
      if (parent) {
        parent.insertBefore(btn, cb);
        if (cb.dataset) {
          cb.dataset[TYPE_FILTER_EXCLUDE_MARK] = "1";
        }
        added += 1;
      }
    }
    if (added) {
      dlog("botones excluir inyectados:", added, "/", cbs.length);
    }
    return true;
  }

  var typeFilterInjectPending = false;
  function scheduleEnhanceParkingTypeFiltersP4n() {
    if (typeFilterInjectPending) {
      return;
    }
    typeFilterInjectPending = true;
    var run = function () {
      typeFilterInjectPending = false;
      enhanceParkingTypeFiltersP4n();
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 16);
    }
  }

  var filterModalObserver = null;
  function ensureFilterModalObserverP4n() {
    if (filterModalObserver) {
      return;
    }
    try {
      filterModalObserver = new MutationObserver(function () {
        scheduleInjectReviewFilterP4n();
        scheduleEnhanceParkingTypeFiltersP4n();
        scheduleSidebarSvLinksP4n();
        syncResetButtonStateP4n();
      });
      filterModalObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    } catch (_fo) {
      /* ignore */
    }
    scheduleInjectReviewFilterP4n();
    scheduleEnhanceParkingTypeFiltersP4n();
  }

  function extractFirstImgHtmlP4n(titleHtml) {
    if (!titleHtml) {
      return "";
    }
    try {
      var m = /<img\b[^>]*>/i.exec(String(titleHtml));
      return m ? m[0] : "";
    } catch (_ei) {
      return "";
    }
  }

  function cleanDescriptionP4n(desc) {
    if (!desc) {
      return "";
    }
    return String(desc)
      .replace(/\\r\\n|\\n|\\r/g, " ")
      .replace(/[\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function photoCountP4n(place) {
    if (!place) {
      return 0;
    }
    var n = Number(place.photo);
    if (!isFinite(n) || n < 0) {
      return 0;
    }
    return Math.floor(n);
  }

  function buildIconRowP4n(kind, codes) {
    if (!codes || !codes.length) {
      return "";
    }
    var isService = kind === "services";
    var rowClass = isService ? "p4n-preview-svc" : "p4n-preview-act";
    var items = [];
    for (var i = 0; i < codes.length; i++) {
      var code = codes[i];
      if (!code) {
        continue;
      }
      var url = isService ? serviceIconUrlP4n(code) : activityIconUrlP4n(code);
      if (!url) {
        continue;
      }
      var label = isService ? serviceLabelP4n(code) : activityLabelP4n(code);
      items.push(
        '<img class="p4n-preview-chip-ico" src="' +
          escapeHtmlP4n(url) +
          '" alt="' +
          escapeHtmlP4n(label) +
          '" title="' +
          escapeHtmlP4n(label) +
          '" loading="lazy">'
      );
    }
    if (!items.length) {
      return "";
    }
    return (
      '<div class="p4n-preview-iconrow ' +
      rowClass +
      '">' +
      items.join("") +
      "</div>"
    );
  }

  function buildPreviewHtmlP4n(place) {
    if (!place) {
      return "";
    }
    var iconUrl = iconUrlForTypeCodeP4n(place.typeCode);
    var flagHtml = extractFirstImgHtmlP4n(place.titleHtml);
    var titleText = place.titleShort || place.name || place.typeLabel || "";
    var desc = cleanDescriptionP4n(place.description);
    var ratingText = ratingTextP4n(place) || "—";
    var reviews = reviewCountP4n(place);
    var photos = photoCountP4n(place);
    var thumbUrl = place.thumbUrl || null;
    var thumbHtml = thumbUrl
      ? '<img class="p4n-preview-thumb" src="' +
        escapeHtmlP4n(thumbUrl) +
        '" alt="" loading="lazy">'
      : "";
    var head =
      '<div class="p4n-preview-head">' +
      (iconUrl
        ? '<img class="p4n-preview-icon" src="' +
          escapeHtmlP4n(iconUrl) +
          '" alt="">'
        : "") +
      '<div class="p4n-preview-title">' +
      (flagHtml ? flagHtml + " " : "") +
      escapeHtmlP4n(titleText) +
      "</div>" +
      "</div>";
    var descBlock = desc
      ? '<div class="p4n-preview-desc">' + escapeHtmlP4n(desc) + "</div>"
      : "";
    var footer =
      '<div class="p4n-preview-footer">' +
      '<span><span class="p4n-preview-ico">\uD83D\uDCF7</span> ' +
      escapeHtmlP4n(photos) +
      "</span>" +
      '<span><span class="p4n-preview-ico">\uD83D\uDCAC</span> ' +
      escapeHtmlP4n(reviews) +
      "</span>" +
      (SHOW_RATINGS_ENABLED_P4n
        ? '<span><span class="p4n-preview-ico">\u2605</span> ' +
          escapeHtmlP4n(ratingText) +
          "</span>"
        : "") +
      "</div>";
    var servicesRow = buildIconRowP4n("services", place.services);
    var activitiesRow = buildIconRowP4n("activities", place.activities);
    var body =
      '<div class="p4n-preview-body">' +
      head +
      descBlock +
      footer +
      servicesRow +
      activitiesRow +
      "</div>";
    return thumbHtml + body;
  }

  var previewCardEl = null;
  var previewHideTimer = null;

  function getPreviewCardP4n() {
    if (previewCardEl && previewCardEl.isConnected) {
      return previewCardEl;
    }
    var d = document.createElement("div");
    d.className = "p4n-preview-card";
    d.setAttribute("data-p4nlayer", "1");
    (document.body || document.documentElement).appendChild(d);
    previewCardEl = d;
    return d;
  }

  function positionPreviewCardP4n(card, x, y) {
    var pad = 14;
    var w = card.offsetWidth || 300;
    var h = card.offsetHeight || 200;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var left = x + pad;
    var top = y + pad;
    if (left + w + 4 > vw) {
      left = x - w - pad;
    }
    if (top + h + 4 > vh) {
      top = y - h - pad;
    }
    if (left < 4) {
      left = 4;
    }
    if (top < 4) {
      top = 4;
    }
    card.style.left = left + "px";
    card.style.top = top + "px";
  }

  function showPreviewP4n(place, x, y) {
    if (!place) {
      return;
    }
    fetchFiltersLabelsP4n();
    var card = getPreviewCardP4n();
    if (previewHideTimer) {
      clearTimeout(previewHideTimer);
      previewHideTimer = null;
    }
    card._p4nPlace = place;
    card.innerHTML = buildPreviewHtmlP4n(place);
    card.classList.add("p4n-preview-visible");
    positionPreviewCardP4n(card, x, y);
  }

  function refreshVisiblePreviewP4n() {
    var card = previewCardEl;
    if (!card || !card.classList.contains("p4n-preview-visible")) {
      return;
    }
    var place = card._p4nPlace;
    if (!place) {
      return;
    }
    card.innerHTML = buildPreviewHtmlP4n(place);
  }

  function hidePreviewP4n() {
    if (!previewCardEl) {
      return;
    }
    if (previewHideTimer) {
      clearTimeout(previewHideTimer);
    }
    previewHideTimer = setTimeout(function () {
      if (previewCardEl) {
        previewCardEl.classList.remove("p4n-preview-visible");
      }
    }, 60);
  }

  function bindTooltipHoverP4n(m, placeData) {
    if (!m || !placeData) {
      return;
    }
    var tip = null;
    try {
      if (typeof m.getTooltip === "function") {
        tip = m.getTooltip();
      }
    } catch (_h1) {
      tip = null;
    }
    if (!tip || typeof tip.getElement !== "function") {
      return;
    }
    var el = tip.getElement();
    if (!el) {
      return;
    }
    el._p4nlayerPlace = placeData;
    if (el.dataset.p4nlayerHoverBound === "1") {
      return;
    }
    el.dataset.p4nlayerHoverBound = "1";
    el.addEventListener("mouseenter", function (ev) {
      showPreviewP4n(el._p4nlayerPlace, ev.clientX, ev.clientY);
    });
    el.addEventListener("mousemove", function (ev) {
      var card = previewCardEl;
      if (card && card.classList.contains("p4n-preview-visible")) {
        positionPreviewCardP4n(card, ev.clientX, ev.clientY);
      }
    });
    el.addEventListener("mouseleave", function () {
      hidePreviewP4n();
    });
  }

  function bindTooltipClickP4n(m, href) {
    if (!m || !href) {
      return;
    }
    var tip = null;
    try {
      if (typeof m.getTooltip === "function") {
        tip = m.getTooltip();
      }
    } catch (_gt) {
      tip = null;
    }
    if (!tip || typeof tip.getElement !== "function") {
      return;
    }
    var el = tip.getElement();
    if (!el) {
      return;
    }
    el.dataset.p4nlayerHref = href;
    if (el.dataset.p4nlayerClickBound === "1") {
      return;
    }
    el.dataset.p4nlayerClickBound = "1";
    el.addEventListener("click", function (ev) {
      try {
        ev.preventDefault();
        ev.stopPropagation();
      } catch (_ev) {
        /* ignore */
      }
      var targetHref = el.dataset ? el.dataset.p4nlayerHref : "";
      if (!targetHref) {
        return;
      }
      try {
        window.open(targetHref, "_blank", "noopener,noreferrer");
      } catch (_op) {
        /* ignore */
      }
    });
  }

  /**
   * Usamos el mecanismo nativo de Leaflet (tooltip permanente). Se reposiciona
   * solo con pan/zoom y funciona aunque el mapa viva dentro de Shadow DOM,
   * porque Leaflet lo pinta en su propio pane del mapa.
   */
  function ensureP4nBadgeOnMarker(m) {
    if (!m || !m.place || m.place.id == null) {
      return;
    }
    injectP4nStylesOnce();
    var id = String(m.place.id);
    var data = placesById[id] || buildPlaceDataP4n(m.place, false);
    ensureTypeIconOnMarkerP4n(m, data);
    var html = contentForP4n(data);
    if (!html) {
      applyFiltersToMarkerP4n(m);
      return;
    }
    var urlInfo = urlInfoP4n(data);
    try {
      var current = null;
      if (typeof m.getTooltip === "function") {
        current = m.getTooltip();
      }
      if (
        current &&
        current.options &&
        current.options.className === "p4n-rating-tip"
      ) {
        if (typeof m.setTooltipContent === "function") {
          m.setTooltipContent(html);
        }
        if (urlInfo && urlInfo.href) {
          bindTooltipClickP4n(m, urlInfo.href);
        }
        bindTooltipHoverP4n(m, data);
        applyFiltersToMarkerP4n(m);
        return;
      }
      if (current && typeof m.unbindTooltip === "function") {
        try {
          m.unbindTooltip();
        } catch (_tu) {
          /* ignore */
        }
      }
      if (typeof m.bindTooltip === "function") {
        m.bindTooltip(html, {
          permanent: true,
          direction: "right",
          offset: [8, 0],
          className: "p4n-rating-tip",
          opacity: 1,
        });
        if (typeof m.openTooltip === "function") {
          try {
            m.openTooltip();
          } catch (_to) {
            /* ignore */
          }
        }
        if (urlInfo && urlInfo.href) {
          bindTooltipClickP4n(m, urlInfo.href);
        }
        bindTooltipHoverP4n(m, data);
      }
    } catch (_tt) {
      /* ignore */
    }
    applyFiltersToMarkerP4n(m);
  }

  function registerMarkerP4n(m) {
    if (!m || m._p4nlayerReg) {
      return;
    }
    m._p4nlayerReg = 1;
    allMarkers.push(m);
  }

  function refreshAllP4nBadges() {
    if (!allMarkers.length) {
      return;
    }
    var c = 0;
    for (var i = 0; i < allMarkers.length; i++) {
      var m = allMarkers[i];
      if (!m) {
        continue;
      }
      try {
        tryApplyP4nIdToMarker(m);
        ensureP4nBadgeOnMarker(m);
        c += 1;
      } catch (_rb) {
        /* ignore */
      }
    }
    if (isDebug() && c) {
      dlog("badges (contexto página), marcadores tocados:", c);
    }
  }

  function tryParseBody(text) {
    if (text == null || text === "") {
      return null;
    }
    const t = String(text).trim();
    if (!t) {
      return null;
    }
    if (t.startsWith("[")) {
      try {
        return JSON.parse(t);
      } catch (_) {
        return null;
      }
    }
    if (t.startsWith("{")) {
      try {
        const o = JSON.parse(t);
        if (Array.isArray(o)) {
          return o;
        }
        if (o && Array.isArray(o.places)) {
          return o.places;
        }
        if (o && Array.isArray(o.data)) {
          return o.data;
        }
        return null;
      } catch (_) {
        return null;
      }
    }
    try {
      const decoded = atob(t);
      const o = JSON.parse(decoded);
      if (Array.isArray(o)) {
        return o;
      }
      if (o && Array.isArray(o.places)) {
        return o.places;
      }
      if (o && Array.isArray(o.data)) {
        return o.data;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  function applyPlacesResponse(text) {
    const places = tryParseBody(text);
    if (Array.isArray(places) && places.length) {
      setPlacesData(places);
      dlog("around OK, lugares:", places.length, "id:", places[0] && places[0].id);
      if (isDebug()) {
        var codes = Object.create(null);
        var missing = 0;
        for (var k = 0; k < places.length; k++) {
          var pp = places[k];
          var c = pp && pp.type && pp.type.code;
          if (c) {
            codes[c] = (codes[c] || 0) + 1;
          } else {
            missing += 1;
          }
        }
        dlog("codes type.code ->", JSON.stringify(codes), "sin code:", missing);
      }
      emit(places);
      setTimeout(function () {
        refreshAllP4nBadges();
        scheduleSidebarSvLinksP4n();
      }, 0);
      setTimeout(function () {
        refreshAllP4nBadges();
        scheduleSidebarSvLinksP4n();
      }, 200);
      setTimeout(function () {
        refreshAllP4nBadges();
        applyFiltersAllMarkersP4n();
        scheduleSidebarSvLinksP4n();
      }, 800);
    } else {
      dlog("around parse vacío, muestra de body:", (text && String(text).slice(0, 80)) || null);
    }
  }

  /**
   * park4night usa fetch(urlObj) con urlObj = new URL("/api/...", host), no string.
   * URL tiene .href; Request tiene .url; string es la propia ruta o URL absoluta.
   */
  function requestUrlString(input) {
    if (input == null) {
      return "";
    }
    if (typeof input === "string") {
      return input;
    }
    try {
      if (typeof URL !== "undefined" && input instanceof URL) {
        return input.href;
      }
    } catch (_a) {
      /* ignore */
    }
    if (typeof input === "object") {
      if (typeof input.url === "string") {
        return input.url;
      }
      if (typeof input.href === "string") {
        return input.href;
      }
    }
    return "";
  }

  function buildFetchLayer(inner) {
    return function p4nFetch(input, init) {
      const p = inner.apply(this, arguments);
      var url = "";
      try {
        url = requestUrlString(input);
      } catch (_e) {
        /* ignore */
      }
      if (!url || !AROUND_RE.test(url)) {
        return p;
      }
      dlog("fetch /places/around", String(url).slice(0, 100));
      if (typeof p === "undefined" || p == null) {
        return p;
      }
      if (typeof p.then !== "function") {
        dlog("fetch: respuesta no es promesa");
        return p;
      }
      return p.then(function (response) {
        if (!response || !response.clone) {
          return response;
        }
        const copy = response.clone();
        return copy
          .text()
          .then(function (text) {
            applyPlacesResponse(text);
          })
          .catch(function (e) {
            dlog("fetch leer cuerpo:", e);
          })
          .then(function () {
            return response;
          });
      });
    };
  }

  function ensureFetchWrapped() {
    const cur = window.fetch;
    if (typeof cur !== "function") {
      return;
    }
    if (cur[FETCH_WRAPPED] === true) {
      return;
    }
    dlog("engancha window.fetch; reintento 400ms si otra app lo pisa");
    const layer = buildFetchLayer(cur);
    try {
      Object.defineProperty(layer, FETCH_WRAPPED, {
        value: true,
        enumerable: false,
        configurable: true,
        writable: false,
      });
    } catch (_) {
      layer[FETCH_WRAPPED] = true;
    }
    window.fetch = layer;
  }

  ensureFetchWrapped();
  setInterval(ensureFetchWrapped, 400);

  if (typeof XMLHttpRequest !== "undefined" && XMLHttpRequest.prototype) {
    if (!XMLHttpRequest.prototype._p4nlayerXhrPatched) {
      XMLHttpRequest.prototype._p4nlayerXhrPatched = true;
      const xopen = XMLHttpRequest.prototype.open;
      const xsend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url) {
        try {
          this._p4nlayerUrl = url == null ? "" : String(url);
        } catch (_g) {
          this._p4nlayerUrl = "";
        }
        return xopen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function () {
        var u = this._p4nlayerUrl || "";
        if (u && AROUND_RE.test(u)) {
          this.addEventListener("readystatechange", function onrs() {
            if (this.readyState === 4) {
              dlog("XHR /places/around", this.status, u.slice(0, 100));
              try {
                this.removeEventListener("readystatechange", onrs);
              } catch (_h) {
                /* ignore */
              }
              if (this.status >= 200 && this.status < 300) {
                applyPlacesResponse(this.responseText);
              }
            }
          });
        }
        return xsend.apply(this, arguments);
      };
    }
  }

  function tryApplyP4nIdToMarker(m) {
    if (!m) {
      return false;
    }
    try {
      var pl = m.place;
      if (pl == null || pl.id == null) {
        return false;
      }
      var el = m._icon;
      if (!el && typeof m.getElement === "function") {
        el = m.getElement();
      }
      if (!el) {
        return false;
      }
      if (el.setAttribute) {
        el.setAttribute(ATTR, String(pl.id));
      } else {
        return false;
      }
      try {
        ensureP4nBadgeOnMarker(m);
      } catch (_z) {
        /* ignore */
      }
      return true;
    } catch (_j) {
      return false;
    }
  }

  var RETRY_DELAYS = [0, 1, 2, 5, 10, 25, 50, 100, 200, 400];

  function scheduleP4nIdRetries(marker) {
    if (!marker) {
      return;
    }
    for (var r = 0; r < RETRY_DELAYS.length; r++) {
      (function (ms) {
        setTimeout(function () {
          if (tryApplyP4nIdToMarker(marker)) {
            return;
          }
          try {
            ensureP4nBadgeOnMarker(marker);
          } catch (_zr) {
            /* ignore */
          }
        }, ms);
      })(RETRY_DELAYS[r]);
    }
  }

  var PegmanControlClassP4n = null;

  function ensurePegmanControlClassP4n() {
    if (PegmanControlClassP4n) {
      return PegmanControlClassP4n;
    }
    var Lg = window.L;
    if (!Lg || !Lg.Control || typeof Lg.Control.extend !== "function") {
      return null;
    }
    PegmanControlClassP4n = Lg.Control.extend({
      options: { position: "bottomright" },
      onAdd: function (map) {
        var c = Lg.DomUtil.create("div", "p4n-pegman-control");
        c.setAttribute("title", "Arrastra al mapa para abrir Google Street View");
        c.setAttribute("aria-label", "Arrastra al mapa para abrir Google Street View");
        c.setAttribute("role", "button");
        c.draggable = true;
        var iconUrl = P4N_PEGMAN_ICON_URL || P4N_SV_ICON_URL || P4N_SV_FALLBACK_URL;
        if (iconUrl) {
          c.style.backgroundImage = "url('" + iconUrl + "')";
        }
        try {
          Lg.DomEvent.disableClickPropagation(c);
          Lg.DomEvent.disableScrollPropagation(c);
        } catch (_de) {
          /* ignore */
        }
        c.addEventListener("dragstart", function (ev) {
          try {
            if (ev.dataTransfer) {
              ev.dataTransfer.setData("text/plain", "p4nlayer-pegman");
              ev.dataTransfer.effectAllowed = "move";
            }
          } catch (_ds) {
            /* ignore */
          }
          c.classList.add("p4n-pegman-dragging");
          armMapDropZoneP4n(map);
        });
        c.addEventListener("dragend", function () {
          c.classList.remove("p4n-pegman-dragging");
          disarmMapDropZoneP4n(map);
        });
        return c;
      },
    });
    return PegmanControlClassP4n;
  }

  function openStreetViewAtLatLngP4n(lat, lng) {
    if (!isFinite(lat) || !isFinite(lng)) {
      return;
    }
    var url =
      "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=" +
      encodeURIComponent(Number(lat) + "," + Number(lng));
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (_ow) {
      /* ignore */
    }
  }

  function armMapDropZoneP4n(map) {
    var Lg = window.L;
    if (!map || !Lg || typeof map.getContainer !== "function") {
      return;
    }
    var el = map.getContainer();
    if (!el || el._p4nPegmanDropArmed === true) {
      return;
    }
    el._p4nPegmanDropArmed = true;
    el.classList.add("p4n-pegman-dropzone");

    var onEnter = function (ev) {
      ev.preventDefault();
      el.classList.add("p4n-pegman-dropzone-over");
    };
    var onOver = function (ev) {
      ev.preventDefault();
      try {
        if (ev.dataTransfer) {
          ev.dataTransfer.dropEffect = "move";
        }
      } catch (_do) {
        /* ignore */
      }
    };
    var onLeave = function () {
      el.classList.remove("p4n-pegman-dropzone-over");
    };
    var onDrop = function (ev) {
      ev.preventDefault();
      el.classList.remove("p4n-pegman-dropzone-over");
      var rect;
      try {
        rect = el.getBoundingClientRect();
      } catch (_r) {
        rect = null;
      }
      if (!rect) {
        return;
      }
      var x = ev.clientX - rect.left;
      var y = ev.clientY - rect.top;
      try {
        var point = Lg.point(x, y);
        var ll = map.containerPointToLatLng(point);
        if (ll && isFinite(ll.lat) && isFinite(ll.lng)) {
          openStreetViewAtLatLngP4n(ll.lat, ll.lng);
        }
      } catch (_dr) {
        /* ignore */
      }
      disarmMapDropZoneP4n(map);
    };

    el.__p4nPegmanEnter = onEnter;
    el.__p4nPegmanOver = onOver;
    el.__p4nPegmanLeave = onLeave;
    el.__p4nPegmanDropHandler = onDrop;
    el.addEventListener("dragenter", onEnter);
    el.addEventListener("dragover", onOver);
    el.addEventListener("dragleave", onLeave);
    el.addEventListener("drop", onDrop);
  }

  function disarmMapDropZoneP4n(map) {
    if (!map || typeof map.getContainer !== "function") {
      return;
    }
    var el = map.getContainer();
    if (!el) {
      return;
    }
    el.classList.remove("p4n-pegman-dropzone");
    el.classList.remove("p4n-pegman-dropzone-over");
    if (el._p4nPegmanDropArmed !== true) {
      return;
    }
    el._p4nPegmanDropArmed = false;
    if (el.__p4nPegmanEnter) {
      el.removeEventListener("dragenter", el.__p4nPegmanEnter);
    }
    if (el.__p4nPegmanOver) {
      el.removeEventListener("dragover", el.__p4nPegmanOver);
    }
    if (el.__p4nPegmanLeave) {
      el.removeEventListener("dragleave", el.__p4nPegmanLeave);
    }
    if (el.__p4nPegmanDropHandler) {
      el.removeEventListener("drop", el.__p4nPegmanDropHandler);
    }
    delete el.__p4nPegmanEnter;
    delete el.__p4nPegmanOver;
    delete el.__p4nPegmanLeave;
    delete el.__p4nPegmanDropHandler;
  }

  function ensurePegmanControlOnMapP4n(map) {
    if (!map || map._p4nPegmanAttached === true) {
      return;
    }
    var Cls = ensurePegmanControlClassP4n();
    if (!Cls) {
      return;
    }
    try {
      var ctrl = new Cls();
      ctrl.addTo(map);
      map._p4nPegmanAttached = true;
      dlog("pegman control añadido al mapa");
    } catch (_pg) {
      /* ignore */
    }
  }

  var lastAutoSearchAtP4n = 0;
  var AUTO_SEARCH_MIN_INTERVAL_MS_P4n = 1400;

  function isElementVisibleP4n(el) {
    if (!el) {
      return false;
    }
    try {
      if (!el.isConnected) {
        return false;
      }
      var style = window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (style && (style.display === "none" || style.visibility === "hidden")) {
        return false;
      }
      var rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      if (!rect) {
        return true;
      }
      return rect.width > 0 && rect.height > 0;
    } catch (_iv) {
      return false;
    }
  }

  function findMapSearchButtonP4n() {
    var btn = null;
    try {
      btn = document.querySelector("button.btn-map-search.leaflet-control");
    } catch (_q1) {
      btn = null;
    }
    if (btn && isElementVisibleP4n(btn)) {
      return btn;
    }
    try {
      var candidates = document.querySelectorAll(".btn-map-search");
      for (var i = 0; i < candidates.length; i++) {
        var el = candidates[i];
        if (isElementVisibleP4n(el)) {
          return el;
        }
      }
    } catch (_q2) {
      /* ignore */
    }
    return null;
  }

  function maybeAutoSearchMapAreaP4n() {
    if (!AUTO_SEARCH_ENABLED_P4n) {
      return false;
    }
    var now = Date.now();
    if (now - lastAutoSearchAtP4n < AUTO_SEARCH_MIN_INTERVAL_MS_P4n) {
      return false;
    }
    var btn = findMapSearchButtonP4n();
    if (!btn) {
      return false;
    }
    try {
      btn.click();
      lastAutoSearchAtP4n = now;
      dlog("auto-search área visible: click en btn-map-search");
      return true;
    } catch (_ac) {
      return false;
    }
  }

  function setupAutoMapSearchP4n() {
    if (!AUTO_SEARCH_ENABLED_P4n) {
      return;
    }
    setInterval(function () {
      maybeAutoSearchMapAreaP4n();
    }, 450);
  }

  /**
   * P4N: añade apistyle=… para ocultar poí; getTileUrl (cada petición de tile).
   * Solo con HIDE_GOOGLE_POIS_ENABLED_P4n.
   */
  function cleanExistingGoogleTileLayersP4n() {
    if (!HIDE_GOOGLE_POIS_ENABLED_P4n) {
      return;
    }
    var containers;
    try {
      containers = document.querySelectorAll(".leaflet-container");
    } catch (_q0) {
      return;
    }
    for (var c = 0; c < containers.length; c++) {
      var el = containers[c];
      var p;
      for (p in el) {
        try {
          var v = el[p];
          if (!v || !v._layers || typeof v.eachLayer !== "function") {
            continue;
          }
          v.eachLayer(function (layer) {
            var u = layer && layer._url;
            if (typeof u !== "string" || !u) {
              return;
            }
            var next = applyP4nSatelliteNoPoisToTileUrlP4n(u);
            if (next && next !== u) {
              try {
                layer.setUrl(next);
              } catch (_su) {
                /* ignore */
              }
            }
            try {
              if (typeof layer.redraw === "function") {
                layer.redraw();
              }
            } catch (_rd) {
              /* ignore */
            }
          });
        } catch (_inner) {
          /* ignore */
        }
      }
    }
  }

  function installGoogleTileLayerNoPoisP4n() {
    if (!HIDE_GOOGLE_POIS_ENABLED_P4n) {
      return true;
    }
    var Lg = window.L;
    if (!Lg || !Lg.TileLayer) {
      return false;
    }
    if (Lg.__p4nlayerGoogleTilesNoPois) {
      return true;
    }
    var tproto = Lg.TileLayer.prototype;
    if (!tproto || typeof tproto.initialize !== "function") {
      return false;
    }
    var origInit = tproto.initialize;
    tproto.initialize = function (url, options) {
      var u = url;
      if (typeof u === "string") {
        u = applyP4nSatelliteNoPoisToTileUrlP4n(u);
      }
      return origInit.call(this, u, options);
    };
    if (typeof tproto.getTileUrl === "function" && !tproto._p4nlayerGtuPatched) {
      var origGtu = tproto.getTileUrl;
      tproto.getTileUrl = function (tilePoint) {
        var out = origGtu.call(this, tilePoint);
        if (typeof out === "string") {
          return applyP4nSatelliteNoPoisToTileUrlP4n(out);
        }
        return out;
      };
      tproto._p4nlayerGtuPatched = true;
    }
    Lg.__p4nlayerGoogleTilesNoPois = true;
    dlog("Leaflet: L.TileLayer (init + getTileUrl) + apistyle s.t:2|p.v:off (POI off)");
    return true;
  }

  function patchLeafletMarker() {
    var Lg = window.L;
    if (!Lg || !Lg.Marker || !Lg.Map) {
      return false;
    }
    if (Lg.__p4nlayerLeafPatched) {
      return true;
    }
    const mproto = Lg.Marker.prototype;
    if (!mproto || typeof mproto.onAdd !== "function") {
      return false;
    }
    const maproto = Lg.Map.prototype;
    if (!maproto || typeof maproto.addLayer !== "function") {
      return false;
    }

    const origOnAdd = mproto.onAdd;
    mproto.onAdd = function (map) {
      const ret = origOnAdd.call(this, map);
      registerMarkerP4n(this);
      scheduleP4nIdRetries(this);
      try {
        ensurePegmanControlOnMapP4n(map);
      } catch (_pA) {
        /* ignore */
      }
      return ret;
    };

    const origAddLayer = maproto.addLayer;
    maproto.addLayer = function (layer) {
      const ret = origAddLayer.apply(this, arguments);
      if (layer instanceof Lg.Marker) {
        registerMarkerP4n(layer);
        scheduleP4nIdRetries(layer);
      }
      try {
        ensurePegmanControlOnMapP4n(this);
      } catch (_pB) {
        /* ignore */
      }
      return ret;
    };

    Lg.__p4nlayerLeafPatched = true;
    dlog("Leaflet: L.Marker.onAdd + L.Map.addLayer (reintentos P4N)");
    return true;
  }

  var attempts = 0;
  var fast = setInterval(function () {
    attempts += 1;
    var gOk = installGoogleTileLayerNoPoisP4n();
    var mOk = patchLeafletMarker();
    if ((mOk && gOk) || attempts >= 400) {
      clearInterval(fast);
    }
  }, 25);
  setInterval(function () {
    if (HIDE_GOOGLE_POIS_ENABLED_P4n) {
      installGoogleTileLayerNoPoisP4n();
      cleanExistingGoogleTileLayersP4n();
    }
    patchLeafletMarker();
  }, 2000);
  setupAutoMapSearchP4n();

  hookReady();
})();

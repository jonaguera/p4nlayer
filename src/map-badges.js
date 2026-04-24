(function () {
  "use strict";

  const MSG_TYPE = "p4nlayer:around-data";
  const HOOK_SOURCE = "p4nlayer-around-hook";
  const DOM_EVENT = "p4nlayer-places";
  const ATTR = "[data-p4n-id]";

  function isDebug() {
    try {
      return window.localStorage.getItem("p4nlayerDebug") === "1";
    } catch (_) {
      return false;
    }
  }

  function dlog() {
    if (!isDebug()) {
      return;
    }
    try {
      console.log.apply(
        console,
        ["[p4nlayer:ui]"].concat([].slice.call(arguments))
      );
    } catch (_) {
      /* ignore */
    }
  }

  function readEnabled(run) {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      run(true);
      return;
    }
    try {
      chrome.storage.local.get(["p4nlayerEnabled"], function (res) {
        const hasKey = res && Object.prototype.hasOwnProperty.call(res, "p4nlayerEnabled");
        run(hasKey ? res.p4nlayerEnabled !== false : true);
      });
    } catch (_) {
      run(true);
    }
  }

  if (isDebug()) {
    try {
      console.warn(
        "[p4nlayer] map-badges (extensión). Filtro: escribe p4nlayer (p-4-n-l-a-y-e-r) — el error común es pn4player (no existe)."
      );
    } catch (_) {
      /* ignore */
    }
  }

  readEnabled(function (enabled) {
    if (!enabled) {
      return;
    }

    /** @type {Map<string, { rating: number, review: number }>} */
    const byId = new Map();
    let syncScheduled = false;

    function labelFor(place) {
      if (!place) {
        return "—";
      }
      const rev = place.review;
      const r = place.rating;
      if (rev === 0 || rev === "0") {
        return "—";
      }
      if (r == null || r === "" || (typeof r === "number" && !isFinite(r))) {
        return "—";
      }
      const num = Number(r).toLocaleString("es-ES", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      });
      return "\u2605 " + num;
    }

    function ingest(places) {
      byId.clear();
      for (let i = 0; i < places.length; i++) {
        const p = places[i];
        if (!p || p.id == null) {
          continue;
        }
        byId.set(String(p.id), { rating: p.rating, review: p.review });
      }
      dlog("ingest: ids=", byId.size, "muestra id:", places[0] && places[0].id);
      schedulePings();
      scheduleSync();
    }

    function schedulePings() {
      const delays = [0, 100, 300, 600, 1200, 2500, 5000, 10000, 20000];
      for (let j = 0; j < delays.length; j++) {
        setTimeout(scheduleSync, delays[j]);
      }
    }

    function scheduleSync() {
      if (syncScheduled) {
        return;
      }
      syncScheduled = true;
      requestAnimationFrame(function () {
        syncScheduled = false;
        syncToMarkers();
      });
    }

    function findMarkerRoot(el) {
      if (!el) {
        return null;
      }
      const w = el.closest && el.closest(".leaflet-marker");
      if (w) {
        return w;
      }
      let p = el.parentElement;
      let d = 0;
      while (p && d < 8) {
        if (p.classList && p.classList.contains("leaflet-marker")) {
          return p;
        }
        p = p.parentElement;
        d += 1;
      }
      return el.parentElement;
    }

    function ensureBadgeOnMarker(wrap, id) {
      const data = byId.get(id);
      const text = labelFor(data);
      let b = wrap.querySelector(".p4n-rating-badge");
      if (!b) {
        b = document.createElement("span");
        b.className = "p4n-rating-badge";
        b.setAttribute("data-p4n-rating-for", id);
        wrap.appendChild(b);
      }
      if (b.textContent !== text) {
        b.textContent = text;
      }
      const title = data
        ? "Valoración: " +
          text +
          (data.review != null
            ? " (" + data.review + " " + (data.review === 1 ? "opinión" : "opiniones") + ")"
            : "")
        : "Sin datos de valoración";
      b.setAttribute("title", title);
    }

    /**
     * document.querySelectorAll no entra en ShadowRoot; el mapa puede estar
     * dentro de web components. Recorremos el árbol e incluimos open shadow.
     */
    function queryP4nMarkersDeep() {
      const res = [];
      function walk(root) {
        if (!root || !root.querySelectorAll) {
          return;
        }
        let matches;
        try {
          matches = root.querySelectorAll(ATTR);
        } catch (_) {
          return;
        }
        for (let i = 0; i < matches.length; i++) {
          res.push(matches[i]);
        }
        let all;
        try {
          all = root.querySelectorAll("*");
        } catch (_) {
          return;
        }
        for (let j = 0; j < all.length; j++) {
          const el = all[j];
          if (el && el.shadowRoot) {
            walk(el.shadowRoot);
          }
        }
      }
      walk(document);
      return res;
    }

    function syncToMarkers() {
      try {
        if (
          document.documentElement &&
          document.documentElement.getAttribute("data-p4nlayer-badges-page") === "1"
        ) {
          return;
        }
      } catch (_) {
        /* ignore */
      }
      const nodes = queryP4nMarkersDeep();
      if (isDebug() && byId.size > 0 && nodes.length === 0) {
        dlog(
          "sync: hay",
          byId.size,
          "en API pero 0 [data-p4n-id] (¿iframe sin script?, shadow cerrado, o aún no hay capas en el mapa)"
        );
      }
      for (let k = 0; k < nodes.length; k++) {
        const el = nodes[k];
        const id = el.getAttribute("data-p4n-id");
        if (id == null) {
          continue;
        }
        const wrap = findMarkerRoot(el);
        if (!wrap) {
          dlog("sin .leaflet-marker para nodo p4n-id", id);
          continue;
        }
        if (!wrap.classList.contains("p4n-rating-host")) {
          wrap.classList.add("p4n-rating-host");
        }
        ensureBadgeOnMarker(wrap, id);
      }
    }

    function onPlacesPayload(places) {
      if (!Array.isArray(places)) {
        dlog("payload no es array");
        return;
      }
      ingest(places);
    }

    window.addEventListener("message", function (ev) {
      if (!ev.data) {
        return;
      }
      if (ev.data.type !== MSG_TYPE || ev.data.source !== HOOK_SOURCE) {
        return;
      }
      if (ev.origin && ev.origin !== window.location.origin) {
        return;
      }
      if (!Array.isArray(ev.data.places)) {
        return;
      }
      dlog("message postMessage, lugares:", ev.data.places.length);
      onPlacesPayload(ev.data.places);
    });

    document.addEventListener(
      DOM_EVENT,
      function (ev) {
        const places = ev.detail;
        dlog("evento document", DOM_EVENT, "lugares:", places && places.length);
        onPlacesPayload(places);
      },
      true
    );

    document.addEventListener(
      "p4nlayer-hook-ready",
      function () {
        dlog("señal p4nlayer-hook-ready: el script inyectado ha arrancado");
      },
      true
    );

    setTimeout(function () {
      if (!isDebug()) {
        return;
      }
      if (!document.documentElement.getAttribute("data-p4nlayer-hook")) {
        dlog(
          "5s: sin data-p4nlayer-hook — no se ejecutó around-hook.js (¿red bloquea chrome-extension o error de carga?)"
        );
      }
    }, 5000);

    const obs = new MutationObserver(scheduleSync);
    const obsOpts = {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-p4n-id"],
    };
    if (document.body) {
      obs.observe(document.body, obsOpts);
    } else {
      document.addEventListener("DOMContentLoaded", function () {
        obs.observe(document.body, obsOpts);
        scheduleSync();
      });
    }

    dlog(
      "map-badges listo, origin:",
      window.location.origin,
      "localStorage p4nlayerDebug=1 + F5 = más trazas"
    );

    function addStatusPill() {
      if (document.getElementById("p4nlayer-ext-status")) {
        return;
      }
      const d = document.createElement("div");
      d.id = "p4nlayer-ext-status";
      d.textContent = "p4nlayer ON";
      d.title = "Extensión activa. Consola: filtro p4nlayer (8 letras).";
      d.setAttribute("aria-hidden", "true");
      d.style.cssText =
        "position:fixed;bottom:10px;right:10px;z-index:2147483640;" +
        "font:11px/1.2 system-ui,sans-serif;padding:5px 9px;border-radius:8px;" +
        "background:rgba(20,20,20,.86);color:#e8f0ff;" +
        "box-shadow:0 1px 4px rgba(0,0,0,.3);pointer-events:none;";
      (document.body || document.documentElement).appendChild(d);
    }

    if (window === window.top) {
      if (document.body) {
        addStatusPill();
      } else {
        document.addEventListener("DOMContentLoaded", addStatusPill);
      }
    }
    scheduleSync();

    /**
     * Anima una sola vez el degradado del logo de park4night (SVG inline del
     * header, stops #165dd7 → #27d9a1) hacia el rojo→naranja del icono de la
     * extensión, para señalizar visualmente que p4nlayer está activo.
     */
    function animateP4nLogo() {
      const html = document.documentElement;
      if (!html) {
        return false;
      }
      if (html.getAttribute("data-p4nlayer-logo-anim") === "1") {
        return true;
      }
      let stops;
      try {
        stops = document.querySelectorAll(
          ".pageHeader svg stop, .pageHeader-logo svg stop, .pageNav-logo svg stop, header svg stop"
        );
      } catch (_) {
        return false;
      }
      if (!stops || !stops.length) {
        return false;
      }
      const FROM_BLUE = { r: 22, g: 93, b: 215 };
      const FROM_GREEN = { r: 39, g: 217, b: 161 };
      const TO_RED = { r: 232, g: 34, b: 6 };
      const TO_ORANGE = { r: 255, g: 122, b: 26 };
      const TOL = 10;
      function closeTo(c1, c2) {
        return (
          Math.abs(c1.r - c2.r) <= TOL &&
          Math.abs(c1.g - c2.g) <= TOL &&
          Math.abs(c1.b - c2.b) <= TOL
        );
      }
      const targets = [];
      for (let i = 0; i < stops.length; i++) {
        const s = stops[i];
        let cs;
        try {
          cs = window.getComputedStyle(s).stopColor || "";
        } catch (_) {
          cs = "";
        }
        const m = cs.match(/rgba?\((\d+)[^\d]+(\d+)[^\d]+(\d+)/);
        if (!m) {
          continue;
        }
        const from = { r: +m[1], g: +m[2], b: +m[3] };
        let to = null;
        if (closeTo(from, FROM_BLUE)) {
          to = TO_RED;
        } else if (closeTo(from, FROM_GREEN)) {
          to = TO_ORANGE;
        }
        if (to) {
          targets.push({ stop: s, from: from, to: to });
        }
      }
      if (!targets.length) {
        return false;
      }
      html.setAttribute("data-p4nlayer-logo-anim", "1");
      const DUR = 1000;
      let start = 0;
      function ease(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      }
      function tick(now) {
        if (!start) {
          start = now;
        }
        const t = Math.min(1, (now - start) / DUR);
        const k = ease(t);
        for (let j = 0; j < targets.length; j++) {
          const T = targets[j];
          const r = Math.round(T.from.r + (T.to.r - T.from.r) * k);
          const g = Math.round(T.from.g + (T.to.g - T.from.g) * k);
          const b = Math.round(T.from.b + (T.to.b - T.from.b) * k);
          try {
            T.stop.style.stopColor = "rgb(" + r + "," + g + "," + b + ")";
          } catch (_) {
            /* ignore */
          }
        }
        if (t < 1) {
          requestAnimationFrame(tick);
        }
      }
      requestAnimationFrame(tick);
      dlog("logo anim: animando", targets.length, "stops → rojo/naranja");
      return true;
    }

    function scheduleLogoAnimation() {
      if (window !== window.top) {
        return;
      }
      const delays = [0, 150, 400, 900, 1800, 3500];
      let idx = 0;
      function attempt() {
        let ok = false;
        try {
          ok = animateP4nLogo();
        } catch (_) {
          /* ignore */
        }
        if (ok || idx >= delays.length) {
          return;
        }
        setTimeout(attempt, delays[idx++]);
      }
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", attempt, { once: true });
      } else {
        attempt();
      }
    }

    scheduleLogoAnimation();
  });
})();

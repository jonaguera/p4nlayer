# AGENTS.md — p4nlayer

Extensión Chrome (MV3) que enriquece el mapa de [park4night.com](https://park4night.com) añadiendo valoraciones directamente sobre los marcadores de Leaflet y un *preview card* al pasar el cursor. Este documento describe cómo está montada para poder extenderla sin romper nada.

---

## 1. Arquitectura en tres capas

park4night vive en un mundo JS con un `window.fetch` propio, `L` (Leaflet) y el DOM del mapa, que a veces está dentro de Shadow DOM. Para poder engancharnos necesitamos ejecutar código **en el mismo contexto** que la página, no en el *isolated world* de la extensión.

```
┌────────────────────────────────────┐
│ src/inject-bootstrap.js            │  content script (aislado)
│   document_start                   │  → crea un <script src=...> que apunta a
│                                    │    injected/around-hook.js usando
│                                    │    chrome.runtime.getURL
└────────────────────────────────────┘
              │ inyecta
              ▼
┌────────────────────────────────────┐
│ injected/around-hook.js            │  contexto de la página (mismo que Leaflet)
│   - intercepta fetch y XHR         │
│   - parchea L.Marker / L.Map       │
│   - pinta tooltips y preview card  │
└────────────────────────────────────┘
              │ postMessage + CustomEvent
              ▼
┌────────────────────────────────────┐
│ src/map-badges.js                  │  content script (aislado)
│   - fallback para marcadores fuera │
│     del contexto de página         │
│   - muestra la "pill" de estado    │
│   - observa MutationObserver       │
└────────────────────────────────────┘
```

El 99 % de la lógica útil vive en `injected/around-hook.js`. `src/map-badges.js` es un *fallback* por si el hook no llega (iframe sin acceso, shadow cerrado) y pinta badges vía CSS.

### Señales entre capas

- `window.postMessage({ type: "p4nlayer:around-data", source: "p4nlayer-around-hook", places })`.
- `document.dispatchEvent(new CustomEvent("p4nlayer-places", { detail: places }))`.
- Atributo `data-p4nlayer-badges-page="1"` en `<html>` para que `map-badges.js` sepa que no debe duplicar badges.
- Evento `p4nlayer-hook-ready` al cargar el hook.

---

## 2. Flujo de datos

1. `ensureFetchWrapped()` envuelve `window.fetch` (reintenta cada 400 ms por si la app lo pisa).
2. Se detectan peticiones contra `AROUND_RE = /\/api\/places\/around/i`, se clona el `Response`, se lee el cuerpo y se pasa a `applyPlacesResponse`.
3. Lo mismo se hace con `XMLHttpRequest` (algunas llamadas usan XHR).
4. `tryParseBody` soporta:
   - JSON array directo `[...]`
   - Objeto con `{ places: [...] }` o `{ data: [...] }`
   - Respuesta **base64** (el servidor muchas veces las devuelve así; hay que decodificar y volver a parsear JSON).
5. `setPlacesData(places)` rellena el mapa `placesById` con los campos relevantes (ver sección 4).
6. `patchLeafletMarker()` parchea `L.Marker.prototype.onAdd` y `L.Map.prototype.addLayer` para registrar cada marcador y, en reintentos con backoff (`RETRY_DELAYS`), asigna `data-p4n-id` al DOM del marcador y llama a `ensureP4nBadgeOnMarker(m)`.
7. `ensureP4nBadgeOnMarker`:
   - Reemplaza el icono del marcador por el SVG del tipo correcto (`iconUrlForTypeCodeP4n`).
   - Crea un tooltip permanente de Leaflet (`p4n-rating-tip`) con estrellas/comentarios.
   - Aplica el filtro por número mínimo de reviews.
   - Engancha `mouseenter` / `mousemove` / `mouseleave` del tooltip a la preview card.

---

## 3. Preview card (ficha al hover)

Pieza central para futuras mejoras visuales. Orden de los bloques dentro de `.p4n-preview-card`:

```
┌────────┬─────────────────────────────┐
│        │ head  (icono tipo + título) │
│        │ desc  (descripción, 6 líneas)│
│ thumb  │ footer (📷 fotos · 💬 coment · ★ rating)
│        │ servicios  (iconos)          │
│        │ actividades (iconos)         │
└────────┴─────────────────────────────┘
```

- Se construye en `buildPreviewHtmlP4n(place)`.
- Cada fila de iconos se genera con `buildIconRowP4n(kind, codes)`.
- Se muestra vía `showPreviewP4n(place, x, y)` (dispara también la carga perezosa de etiquetas).
- Se reposiciona siguiendo al cursor con `positionPreviewCardP4n`.

### Fila de iconos: cómo añadir otra

1. Asegurarse de que el campo existe en la respuesta del API y guardarlo en `setPlacesData` y en el *fallback* de `ensureP4nBadgeOnMarker`.
2. Crear `buildIconRowP4n("<nuevo-kind>", codes)` o reutilizarlo añadiendo otro `isX` branch.
3. Añadir su URL base y regla CSS (colores) en `injectP4nStylesOnce`.
4. Insertarla dentro del `body` en `buildPreviewHtmlP4n`.

### Street View: listado vs ficha de detalle

- **Listado (tarjeta al lado del mapa):** la ficha a menudo es un `<a href="…/place/…">` global; el icono añadido con `p4n-sv-card-link` usa `stopPropagation` en captura para no activar el enlace padre (HTML con `<a>` anidados es inválido; en la práctica se mitiga así).
- **Ficha de detalle (`ul.place-actions`):** botón con `data-p4n-sv-href` + `data-p4nlayer-sv-place-action` (no `<a>`). `ensurePlaceActionSvLinkP4n` localiza el nodo con `[data-p4nlayer-sv-place-action='1']` (Vue puede tocar clases). **MutationObserver** en esa `ul`. El delegado se registra **al inicio** del IIFE (además, `function` *hoisted*), con **click** y **pointerdown** en captura en `window` + debounce por URL ~450 ms frente a doble disparo. `window.open` + `stopPropagation()`.

---

## 4. Estructura del API `/api/places/around`

```http
GET /api/places/around?lat=<f>&lng=<f>&radius=<1-200>&lang=es
```

Respuesta: **base64 de un JSON array**. Hay que hacer `atob` + `JSON.parse`.

Campos relevantes de cada `place`:

| Campo | Tipo | Notas |
|---|---|---|
| `id` | number | clave primaria, se usa para `data-p4n-id` |
| `url` | string | ruta relativa (ej. `/es/place/401894`) |
| `type` | `{ id, code, label }` | `code` determina el SVG del pin |
| `title` | string (HTML) | contiene la bandera `<img>` del país |
| `title_short` | string | texto plano, preferido para el título |
| `description` | string | puede tener `\n` literales |
| `address` | `{ street, zipcode, city, country }` | |
| `lat` / `lng` | number | |
| `services` | `string[]` | códigos como `"poubelle"`, `"wc_public"`, `"wifi"` |
| `activities` | `string[]` | códigos como `"visites"`, `"point_de_vue"` |
| `review` | number | nº de comentarios |
| `rating` | number | 1..5 |
| `photo` | number | nº de fotos |
| `images` | `[{ url, thumb }]` | se usa la primera como miniatura |
| `isPro`, `isTop`, `online_booking` | boolean | banderas varias |

### Valores conocidos de `type.code`

`P`, `PN`, `AR`, `PJ`, `APN`, `ACC_G`, `ACC_P`, `ACC_PR`, `OR`, `F`, `C`, `ASS`, `EP`, `DS`, `PSS`, `GS`. El SVG del pin vive en `https://cdn6.park4night.com/images/bitmap/icons/pins/pins_<code>@4x.png`.

### Códigos conocidos de `services`

`animaux, boulangerie, caravaneige, donnees_mobile, douche, eau_noire, eau_usee, electricite, gaz, gpl, lavage, laverie, piscine, point_eau, poubelle, wc_public, wifi`.

### Códigos conocidos de `activities`

`baignade, eaux_vives, escalade, jeux_enfants, moto, peche, peche_pied, point_de_vue, rando, visites, vtt, windsurf`.

### URLs de iconos (con versión para cache-busting)

```
https://cdn6.park4night.com/images/svg/icons/services/service_<code>.svg?v=<version>
https://cdn6.park4night.com/images/svg/icons/activities/activity_<code>.svg?v=<version>
```

La versión (`?v=cc54b50`) la inyecta el servidor en `<meta name="version" content="...">` del HTML inicial. Se lee una sola vez con `getAppVersionP4n()` y se cachea.

### Endpoints útiles de filtros

```http
GET /api/places/filters/services?lang=<es|fr|en|de|it|nl>
GET /api/places/filters/activities?lang=...
GET /api/places/filters/type?lang=...
GET /api/places/filters/custom_type?lang=...
```

Devuelven un objeto `{ code: label }` con la traducción. También llegan en base64 unas veces y en JSON otras; siempre probar `JSON.parse` directo y, si falla, `JSON.parse(atob(txt))`.

Se cargan una sola vez con `fetchFiltersLabelsP4n()` cuando aparece la primera preview. Cuando llegan, `refreshVisiblePreviewP4n()` re-renderiza la card que esté abierta para que los `title="..."` pasen de código a etiqueta traducida.

---

## 5. Estructura de archivos

```
p4nlayer/
├── manifest.json           # MV3, matches park4night.com, web_accessible_resources
├── src/
│   ├── inject-bootstrap.js # content script que inyecta el hook en la página
│   ├── map-badges.js       # fallback con badges vía CSS en contexto aislado
│   ├── popup.html          # popup del action (toggle + preferencias)
│   └── popup.js            # lógica del popup y persistencia en chrome.storage
├── injected/
│   └── around-hook.js      # TODO el trabajo pesado vive aquí
├── styles/
│   └── badges.css          # estilos del fallback
├── assets/icons/           # iconos embebidos en la UI (Street View / pegman)
└── icons/                  # iconos de la extensión (toolbar/store)
```

### Permisos declarados (manifest.json)

- `permissions: ["storage"]` — persistir el toggle `p4nlayerEnabled`. Se evita `tabs` porque `chrome.tabs.reload(tabId)` no lo requiere.
- `host_permissions`, `content_scripts.matches` y `web_accessible_resources.matches` están limitados a `https://park4night.com/*` y `https://www.park4night.com/*`. No se pide acceso a ningún otro dominio.

---

## 6. Convenciones internas

- Todos los identificadores públicos llevan sufijo `P4n` para evitar colisiones con la app (`ensureTypeIconOnMarkerP4n`, `buildPreviewHtmlP4n`, etc.).
- Marcar DOM propio con `data-p4nlayer="1"` o `data-p4nlayerHoverBound="1"` para no re-procesar.
- `dlog(...)` solo imprime si `localStorage.p4nlayerDebug === "1"`. Útil para depurar sin llenar la consola al usuario.
- `L.Marker.onAdd` / `L.Map.addLayer` solo aplican `data-p4n-id`, icono y filtros (`applyP4nIdIconAndFilterOnlyP4n`); `bindTooltip` de estrellas/valoración y preview se hace en `refreshAllP4nBadges` tras `/around` para no bloquear el hilo con cientos de tooltips mientras se registran marcadores.
- Con estrellas activas, `refreshAllP4nBadges` reparte el bucle en trozos (`requestAnimationFrame`, `BADGE_RAF_CHUNK_P4N`); un nuevo refresh incrementa `p4nRefreshBatchSeqP4n` y deja de ejecutar trozos obsoletos. `applyPlacesResponse` pasa `onDone` para `scheduleSidebar` / filtros tras el último trozo. Cada respuesta /around incrementa un serial (`thisAroundPassP4n`); `setTimeout(0/200/800)` de una respuesta obsoleta no hace nada, y el de 800 omite el refresh completo de tooltips si 0/200 ya terminó (evita doble pase 200+800 con el mismo coste de CPU).
- Con el mismo flag, el hook emite trazas `[p4nlayer:time]`: al inicio (tiempo 0 frente a `P4N_PERF_T0`) y, por tarea, `parcial time` (duración de esa tarea) y `total time` (ms transcurridos desde la carga de `injected/around-hook.js` vía `performance.now`). Tras `/around`, cada `setTimeout` se lee en orden: `jitter: setTimeout(…)` (retraso extra del hilo respecto a la programación, ideal +0/200/800 ms), línea `cola … inicio` (`allMarkers` y `showEstrellas=0|1`), desglose de badges, y `cierre setTimeout(…)` con el coste del callback entero. La tercera línea de desglose no es “estrellas” si `showEstrellas=0` (es solo `applyFilters` en la rama corta).
- Preferencias del popup: `chrome.storage.local` (ej. `p4nlayerShowRatings`) y paso al hook por atributos `data-p4n-*` en `<html>` y en el `<script id="p4nlayer-page-hook-script">`.
- Siempre envolver llamadas a APIs externas (`try { ... } catch (_) { /* ignore */ }`) — park4night a veces reemplaza `fetch` o recrea Leaflet.
- `ensureFetchWrapped()` y el patcheo de Leaflet se reintenta periódicamente (`setInterval`) porque la SPA puede volver a pisar los globales.
- Escapar siempre con `escapeHtmlP4n` cualquier string que se meta en `innerHTML`.
- Los nombres en francés de los códigos (`poubelle`, `caravaneige`, `rando`) no son un bug: el backend de p4n está en francés.

---

## 7. Cómo probar cambios

1. Chrome → `chrome://extensions/` → **Actualizar** la tarjeta de p4nlayer (o cargar sin empaquetar apuntando a la raíz del repo).
2. Refrescar cualquier página bajo `park4night.com`.
3. Activar logs: `localStorage.setItem("p4nlayerDebug","1")` y recargar. Filtrar consola por `p4nlayer`.
4. Para inspeccionar la respuesta cruda del API:
   ```bash
   curl -s "https://park4night.com/api/places/around?lat=41.38&lng=2.17&radius=100&lang=es" \
     | python3 -c "import base64,json,sys; print(json.dumps(json.loads(base64.b64decode(sys.stdin.read().strip()))[0], indent=2, ensure_ascii=False))"
   ```
5. Si un marcador no muestra badge: verificar que tenga `data-p4n-id` en el DOM y que `placesById[id]` existe. Si no, probablemente la respuesta `/around` no se interceptó (ver trazas `fetch /places/around`).

---

## 8. Idiomas soportados

Se detectan en `currentLangP4n()` desde el *path* (`/es/...`, `/fr/...`) con fallback a `document.documentElement.lang` y luego `"en"`. Soportados: `es, fr, en, de, it, nl`.

---

## 9. Overrides del layout de park4night

`injectP4nStylesOnce` también pisa algunas reglas CSS de la app cuando molestan al mapa:

- `body.search-place-list section>.container{max-width:none}` a partir de `min-width:1400px`. Bootstrap fija `.container` a `1320px` en esa media query y deja franjas vacías a ambos lados del mapa. Lo desbloqueamos **solo** en el contenedor que envuelve a `.listmap` (selector `section>.container` dentro del body `search-place-list`), sin tocar cabecera, breadcrumbs ni footer.
- `body.search-place-list .listmap-aside{flex:0 0 25rem;max-width:25rem}`. La barra lateral nativa usa `flex:0 1 30%`, así que al soltar el cap crecería también. Se fija a ~25rem para que el espacio extra vaya siempre al mapa.

Si se añaden más overrides de este estilo, mantenerlos agrupados en el mismo bloque y siempre con selectores específicos (`body.<clase>` o `html[data-p4nlayer-*]`) para no ensuciar el resto del sitio.

## 10. Puntos de extensión sugeridos

- **Mostrar más campos en la preview**: `online_booking`, `isPro`, `isTop`, `address.city + country`. Ya llegan todos desde el API.
- **Cachear respuestas**: hoy `placesById` se resetea en cada `/around`. Se podría mantener un `Map` acumulativo.
- **Filtros extra** en el panel de la extensión: el modelo ya soporta `minReviewsThreshold` en `localStorage.p4nlayerMinReviews`; se puede extender con filtros por servicios/actividades obligatorios.
- **Popup nativo del tooltip de Leaflet**: si algún día se quiere reemplazar el HTML permanente por un `L.popup`, el enganche está centralizado en `bindTooltipHoverP4n`.
- **Internacionalizar los strings de la UI**: ahora están hardcodeados en español (ej. "Mostrar solo con N o más comentarios"). Añadir un pequeño diccionario por `currentLangP4n()`.

---

## 11. Convención de documentación (mantener actualizado)

En cada cambio de implementación, el asistente y quien toque el código deben:

- **`README.md`**: añadir o actualizar la descripción de **cualquier funcionalidad nueva** orientada al usuario (qué hace, cómo se usa, opciones en el popup, etc.) para que el repo y la Chrome Web Store sigan alineados con el producto.
- **`AGENTS.md`**: incorporar **aprendizajes o detalles técnicos** que importen a futuras extensiones del código (p. ej. señales entre capas, trucos con Shadow DOM, cambios en el API o en los selectores CSS de la web). Objetivo: no repetir arqueología en el futuro.

---

## 12. Git: commits y remoto (preferencia del mantenedor)

No ejecutar `git commit`, `git push` ni reescrituras de historia (`rebase`/`amend`/`force-push`) hacia el remoto de forma automática. 
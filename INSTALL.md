# Instalación (extensión descomprimida)

No se distribuye un archivo `.crx` ni se instala desde la Chrome Web Store en este flujo. La forma habitual de probar o usar el código es **cargar el directorio del proyecto** como *extensión desempaquetada*.

## Requisitos

- Navegador **Chromium**: Google Chrome, Microsoft Edge, Brave, Vivaldi, etc.
- Tener clonado o descargado este repositorio; en la raíz debe existir `manifest.json`.

## Chrome / Chromium

1. Abre la gestión de extensiones: escribe en la barra de direcciones `chrome://extensions` y entra.
2. Activa el interruptor **Modo de desarrollador** (arriba a la derecha).
3. Pulsa **Cargar descomprimida** (*Load unpacked*).
4. Selecciona la **carpeta raíz** del repositorio (la que contiene `manifest.json`, no una subcarpeta como `src`).

Listo: debería aparecer **P4N Extra Layer** en la lista.

## Tras cambiar código

- En `chrome://extensions`, localiza la tarjeta de la extensión y pulsa el icono de **recargar** (flecha circular).  
- Recarga también las pestañas abiertas en `park4night.com` para que apliquen content scripts e inyecciones.

## Edge (Chromium)

1. `edge://extensions`
2. Mismo flujo: **Modo de desarrollador** → **Cargar descomprimida** y elige la raíz del repo.

## Comprobación rápida

1. Abre [https://www.park4night.com](https://www.park4night.com) (o el mapa/búsqueda que uses con la extensión).
2. Comprueba que el icono de la extensión responde y, si lo tienes activado, que ves los cambios en el mapa.

## Desinstalar

En la página de extensiones, en la tarjeta de **P4N Extra Layer**, elige **Eliminar** o **Quitar** según el idioma de la UI.

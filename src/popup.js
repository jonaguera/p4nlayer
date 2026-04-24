(function () {
  "use strict";

  const KEY_ENABLED = "p4nlayerEnabled";
  const KEY_AUTO_SEARCH = "p4nlayerAutoSearchMap";
  const KEY_FULL_WIDTH = "p4nlayerFullWidthMap";
  const KEY_HIDE_GOOGLE_POIS = "p4nlayerHideGooglePois";
  const enabledInput = document.getElementById("enabled");
  const autoSearchInput = document.getElementById("autoSearch");
  const fullWidthInput = document.getElementById("fullWidth");
  const hideGooglePoisInput = document.getElementById("hideGooglePois");
  const stateEl = document.getElementById("state");

  function setStateText(enabled) {
    if (!stateEl) {
      return;
    }
    stateEl.textContent = enabled
      ? "Estado actual: activada"
      : "Estado actual: desactivada";
  }

  function readState(callback) {
    chrome.storage.local.get(
      [KEY_ENABLED, KEY_AUTO_SEARCH, KEY_FULL_WIDTH, KEY_HIDE_GOOGLE_POIS],
      function (res) {
        const hasEnabled = res && Object.prototype.hasOwnProperty.call(res, KEY_ENABLED);
        const hasAutoSearch = res && Object.prototype.hasOwnProperty.call(res, KEY_AUTO_SEARCH);
        const hasFullWidth = res && Object.prototype.hasOwnProperty.call(res, KEY_FULL_WIDTH);
        const hasHideGooglePois =
          res && Object.prototype.hasOwnProperty.call(res, KEY_HIDE_GOOGLE_POIS);
        callback({
          enabled: hasEnabled ? res[KEY_ENABLED] !== false : true,
          autoSearch: hasAutoSearch ? res[KEY_AUTO_SEARCH] !== false : false,
          fullWidth: hasFullWidth ? res[KEY_FULL_WIDTH] !== false : false,
          hideGooglePois: hasHideGooglePois ? res[KEY_HIDE_GOOGLE_POIS] === true : false,
        });
      }
    );
  }

  function reloadActiveTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      const tab = tabs && tabs[0];
      if (!tab || tab.id == null) {
        return;
      }
      chrome.tabs.reload(tab.id);
    });
  }

  function writeState(nextState) {
    chrome.storage.local.set(
      {
        [KEY_ENABLED]: Boolean(nextState.enabled),
        [KEY_AUTO_SEARCH]: Boolean(nextState.autoSearch),
        [KEY_FULL_WIDTH]: Boolean(nextState.fullWidth),
        [KEY_HIDE_GOOGLE_POIS]: Boolean(nextState.hideGooglePois),
      },
      function () {
        setStateText(Boolean(nextState.enabled));
        if (enabledInput) {
          enabledInput.checked = Boolean(nextState.enabled);
        }
        if (autoSearchInput) {
          autoSearchInput.checked = Boolean(nextState.autoSearch);
        }
        if (fullWidthInput) {
          fullWidthInput.checked = Boolean(nextState.fullWidth);
        }
        if (hideGooglePoisInput) {
          hideGooglePoisInput.checked = Boolean(nextState.hideGooglePois);
        }
        if (autoSearchInput) {
          autoSearchInput.disabled = !Boolean(nextState.enabled);
        }
        if (fullWidthInput) {
          fullWidthInput.disabled = !Boolean(nextState.enabled);
        }
        if (hideGooglePoisInput) {
          hideGooglePoisInput.disabled = !Boolean(nextState.enabled);
        }
      reloadActiveTab();
      }
    );
  }

  readState(function (state) {
    if (enabledInput) {
      enabledInput.checked = state.enabled;
      enabledInput.addEventListener("change", function () {
        writeState({
          enabled: Boolean(enabledInput.checked),
          autoSearch: autoSearchInput ? Boolean(autoSearchInput.checked) : false,
          fullWidth: fullWidthInput ? Boolean(fullWidthInput.checked) : false,
          hideGooglePois: hideGooglePoisInput ? Boolean(hideGooglePoisInput.checked) : false,
        });
      });
    }
    if (autoSearchInput) {
      autoSearchInput.checked = state.autoSearch;
      autoSearchInput.disabled = !state.enabled;
      autoSearchInput.addEventListener("change", function () {
        writeState({
          enabled: enabledInput ? Boolean(enabledInput.checked) : true,
          autoSearch: Boolean(autoSearchInput.checked),
          fullWidth: fullWidthInput ? Boolean(fullWidthInput.checked) : false,
          hideGooglePois: hideGooglePoisInput ? Boolean(hideGooglePoisInput.checked) : false,
        });
      });
    }
    if (fullWidthInput) {
      fullWidthInput.checked = state.fullWidth;
      fullWidthInput.disabled = !state.enabled;
      fullWidthInput.addEventListener("change", function () {
        writeState({
          enabled: enabledInput ? Boolean(enabledInput.checked) : true,
          autoSearch: autoSearchInput ? Boolean(autoSearchInput.checked) : false,
          fullWidth: Boolean(fullWidthInput.checked),
          hideGooglePois: hideGooglePoisInput ? Boolean(hideGooglePoisInput.checked) : false,
        });
      });
    }
    if (hideGooglePoisInput) {
      hideGooglePoisInput.checked = state.hideGooglePois;
      hideGooglePoisInput.disabled = !state.enabled;
      hideGooglePoisInput.addEventListener("change", function () {
        writeState({
          enabled: enabledInput ? Boolean(enabledInput.checked) : true,
          autoSearch: autoSearchInput ? Boolean(autoSearchInput.checked) : false,
          fullWidth: fullWidthInput ? Boolean(fullWidthInput.checked) : false,
          hideGooglePois: Boolean(hideGooglePoisInput.checked),
        });
      });
    }
    setStateText(state.enabled);
  });
})();

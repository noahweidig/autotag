/* Runs inside the preferences window once the Autotag pane is loaded. */
(function () {
  let tries = 0;
  function run() {
    try {
      if (!document.getElementById("autotag-pane")) {
        if (tries++ < 20) setTimeout(run, 100);
        return;
      }
      Zotero.Autotag.hooks.onPrefsEvent("load", { window });
    } catch (e) {
      Zotero.debug("[Autotag] prefs pane init failed: " + e);
    }
  }
  run();
})();

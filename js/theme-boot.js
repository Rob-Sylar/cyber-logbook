// Runs before the page paints so a saved light/dark choice doesn't flash the wrong theme.
(function () {
  try {
    var t = localStorage.getItem('cl-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: follow the system theme */ }
})();

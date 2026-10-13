// Loaded as a plain blocking script (not a module) so a stored "light" preference is applied
// before first paint. Kept out of index.html so the server's CSP can forbid inline scripts.
(function () {
  var theme = 'dark';
  try {
    if (localStorage.getItem('elex-theme') === 'light') theme = 'light';
  } catch {
    // Storage blocked - fall back to the default theme.
  }
  document.documentElement.setAttribute('data-theme', theme);
})();

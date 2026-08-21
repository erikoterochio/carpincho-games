(function () {
  try {
    var saved = localStorage.getItem('ranchadapp_theme');
    document.documentElement.setAttribute('data-theme', saved || 'dark');
  } catch (e) {}
})();

function themeIcon(theme) {
  return theme === 'light' ? '\u{1F319}' : '☀️';
}

function toggleTheme() {
  try {
    var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ranchadapp_theme', next);
    var icon = document.getElementById('theme-toggle-icon');
    if (icon) icon.textContent = themeIcon(next);
  } catch (e) {}
}

document.addEventListener('DOMContentLoaded', function () {
  var icon = document.getElementById('theme-toggle-icon');
  if (icon) icon.textContent = themeIcon(document.documentElement.getAttribute('data-theme'));
});

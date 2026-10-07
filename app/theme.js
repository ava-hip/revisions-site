// Thème : auto (système) → clair → sombre.
(() => {
  const root = document.documentElement;
  const apply = t => { if (t) root.dataset.theme = t; else delete root.dataset.theme; };
  let theme = App.store.get('revisions.theme', null);
  apply(theme);
  document.getElementById('theme').onclick = () => {
    theme = theme == null ? 'light' : theme === 'light' ? 'dark' : null;
    App.store.set('revisions.theme', theme);
    apply(theme);
  };
})();

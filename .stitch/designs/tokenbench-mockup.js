(() => {
  const root = document.documentElement;
  const requested = new URLSearchParams(location.search).get('theme');
  if (requested === 'light' || requested === 'dark') root.dataset.theme = requested;
  const toggle = document.querySelector('[data-theme-toggle]');
  const sync = () => {
    const dark = root.dataset.theme !== 'light';
    toggle?.setAttribute('aria-pressed', String(dark));
    toggle?.setAttribute('aria-label', dark ? 'Toggle light theme' : 'Toggle dark theme');
  };
  toggle?.addEventListener('click', () => { root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light'; sync(); });
  const menu = document.querySelector('[data-menu-toggle]');
  const nav = document.querySelector('[data-primary-nav]');
  menu?.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open));
    nav?.toggleAttribute('data-open', open);
  });
  sync();
})();

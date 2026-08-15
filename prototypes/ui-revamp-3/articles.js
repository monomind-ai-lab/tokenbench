(() => {
  setupShell();

  const state = { channel: 'all', type: 'all' };
  const cards = [...document.querySelectorAll('.article-index-card')];
  const tabs = [...document.querySelectorAll('[role="tab"][data-channel]')];
  const typeFilters = [...document.querySelectorAll('.articles-type-filter')];
  const search = document.querySelector('#article-search');
  const sort = document.querySelector('#article-sort');
  const index = document.querySelector('#article-index');
  const empty = document.querySelector('#article-empty');
  const count = document.querySelector('#article-result-count');

  const channelFromUrl = new URLSearchParams(location.search).get('channel');
  if (['guide', 'insight'].includes(channelFromUrl)) state.channel = channelFromUrl;

  function visibleCards() {
    const query = search.value.trim().toLocaleLowerCase();
    return cards.filter(card => {
      const matchesChannel = state.channel === 'all' || card.dataset.channel === state.channel;
      const matchesType = state.type === 'all' || card.dataset.type === state.type;
      const matchesQuery = !query || card.textContent.toLocaleLowerCase().includes(query);
      return matchesChannel && matchesType && matchesQuery;
    });
  }

  function compareCards(a, b) {
    if (sort.value === 'title') return a.dataset.title.localeCompare(b.dataset.title);
    if (sort.value === 'shortest') return Number(a.dataset.minutes) - Number(b.dataset.minutes);
    return sort.value === 'oldest'
      ? a.dataset.date.localeCompare(b.dataset.date)
      : b.dataset.date.localeCompare(a.dataset.date);
  }

  function render() {
    const visible = visibleCards().sort(compareCards);
    cards.forEach(card => { card.hidden = !visible.includes(card); });
    visible.forEach(card => index.append(card));
    empty.hidden = visible.length > 0;
    count.textContent = `${visible.length} ${visible.length === 1 ? 'article' : 'articles'} shown`;
    const activeTab = tabs.find(tab => tab.dataset.channel === state.channel) || tabs[0];
    tabs.forEach(tab => {
      const active = tab === activeTab;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    index.setAttribute('aria-labelledby', activeTab.id);
  }

  tabs.forEach(tab => tab.addEventListener('click', () => {
    state.channel = tab.dataset.channel;
    const url = new URL(location.href);
    if (state.channel === 'all') url.searchParams.delete('channel');
    else url.searchParams.set('channel', state.channel);
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    render();
  }));
  tabs.forEach((tab, tabIndex) => tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : (tabIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[nextIndex].click();
    tabs[nextIndex].focus();
  }));
  typeFilters.forEach(filter => filter.addEventListener('click', () => {
    state.type = filter.dataset.type;
    typeFilters.forEach(item => {
      const active = item === filter;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    render();
  }));
  search.addEventListener('input', render);
  sort.addEventListener('change', render);
  document.querySelector('#article-reset').addEventListener('click', () => {
    state.channel = 'all';
    state.type = 'all';
    search.value = '';
    sort.value = 'newest';
    history.replaceState(null, '', location.pathname);
    typeFilters.forEach(filter => {
      const active = filter.dataset.type === 'all';
      filter.classList.toggle('is-active', active);
      filter.setAttribute('aria-pressed', String(active));
    });
    render();
    tabs[0].focus();
  });

  document.querySelector('#cheatsheet-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const firstName = new FormData(form).get('firstName').trim();
    const status = document.querySelector('#signup-status');
    status.textContent = `Thanks, ${firstName}. Prototype signup recorded locally — no request was sent.`;
    status.classList.add('is-success');
    form.reset();
  });

  render();
})();

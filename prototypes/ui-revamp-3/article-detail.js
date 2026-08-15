(() => {
  setupShell();

  const page = document.querySelector('[data-article-detail]');
  if (!page) return;

  const renderChart = () => {
    const canvas = document.querySelector('#cost-chart');
    const palette = colors();
    chart(canvas, {
      type: 'bar',
      data: {
        labels: ['Single premium lane', 'Hybrid with review', 'Single economy lane'],
        datasets: [{
          label: 'Illustrative monthly cost index',
          data: [100, 62, 41],
          backgroundColor: [`${palette.plum}e6`, `${palette.plum}99`, `${palette.plum}55`],
          borderColor: palette.plum,
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: {
            beginAtZero: true,
            max: 110,
            title: { display: true, text: 'Illustrative monthly index', color: palette.muted },
            ticks: { color: palette.muted },
            grid: { color: palette.line },
          },
          y: { ticks: { color: palette.muted }, grid: { display: false } },
        },
      },
    });
  };

  window.renderPage = renderChart;
  renderChart();

  const tocLinks = [...document.querySelectorAll('.article-detail-toc a')];
  const sections = [...document.querySelectorAll('.article-detail-section[id]')];
  const setCurrentSection = (id) => tocLinks.forEach(link => {
    if (link.hash === `#${id}`) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });

  if (tocLinks.length) setCurrentSection(tocLinks[0].hash.slice(1));
  if ('IntersectionObserver' in window && sections.length) {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setCurrentSection(visible[0].target.id);
    }, { rootMargin: '-120px 0px -62% 0px', threshold: [0, .15] });
    sections.forEach(section => observer.observe(section));
  }

  const signup = document.querySelector('#cheatsheet-form');
  signup?.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const firstName = String(new FormData(form).get('firstName') || '').trim();
    const status = document.querySelector('#signup-status');
    status.textContent = `Thanks, ${firstName}. Prototype signup recorded locally — no request was sent.`;
    status.classList.add('is-success');
    form.reset();
  });
})();

(() => {
  const DOMAIN_MAX_MILLIONS = 300;
  const SAMPLE_MILLIONS = [0, 25, 50, 100, 150, 200, 250, 300];
  const PRICE_EFFECTIVE_DATE = '2026-08-15';
  const DEFAULTS = {
    seats: 5,
    seatPrice: 20,
    model: 'claude-3-5-sonnet',
    tokenVolume: 50,
    inputShare: 70,
    cacheReads: 0,
    cacheWrites: 0,
    longContext: false,
    content: 'text',
    requests: 10000,
    inputChars: 1200,
    outputChars: 600,
  };

  const controls = {
    seats: document.querySelector('#breakeven-seats'),
    seatPrice: document.querySelector('#breakeven-seat-price'),
    model: document.querySelector('#breakeven-model'),
    tokenVolume: document.querySelector('#breakeven-token-volume'),
    inputShare: document.querySelector('#breakeven-input-share'),
    cacheReads: document.querySelector('#breakeven-cache-reads'),
    cacheWrites: document.querySelector('#breakeven-cache-writes'),
    longContext: document.querySelector('#breakeven-long-context'),
    content: document.querySelector('#breakeven-content-type'),
    requests: document.querySelector('#breakeven-requests'),
    inputChars: document.querySelector('#breakeven-input-characters'),
    outputChars: document.querySelector('#breakeven-output-characters'),
  };

  const number = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const currencyValue = (value) => Math.round(value * 100) / 100;
  const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  const rate = (value) => `${money(value)} / 1M`;
  const millions = (value) => `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}M tokens`;
  const modelRates = () => (window.TB_MODELS || []).filter((model) => Number.isFinite(model.inputPrice) && Number.isFinite(model.outputPrice));
  const modelById = (id) => modelRates().find((model) => model.id === id) || modelRates()[0];
  const price = (value) => Number.isFinite(value) ? money(value) : 'Unavailable';
  const cacheFallbackNotes = (model) => [
    !Number.isFinite(model.cacheRead) ? `Cache-read price unavailable; cache reads use standard input price (${rate(model.inputPrice)}).` : '',
    !Number.isFinite(model.cacheWrite) ? `Cache-write price unavailable; cache writes use standard input price (${rate(model.inputPrice)}).` : '',
  ].filter(Boolean);
  const cachePriceEvidence = (value, kind, model) => Number.isFinite(value)
    ? price(value)
    : `Unavailable · cache-${kind} price unavailable; standard input fallback (${rate(model.inputPrice)})`;

  function buildModelOptions() {
    controls.model.innerHTML = modelRates().map((model) => `<option value="${model.id}">${model.name} — ${model.provider}</option>`).join('');
  }

  function loadState() {
    const search = new URLSearchParams(location.search);
    const state = { ...DEFAULTS };
    Object.keys(DEFAULTS).forEach((key) => {
      if (!search.has(key)) return;
      state[key] = key === 'longContext' ? search.get(key) === 'true' : search.get(key);
    });
    state.seats = clamp(Math.round(number(state.seats, DEFAULTS.seats)), 1, 50);
    state.seatPrice = Math.max(0, number(state.seatPrice, DEFAULTS.seatPrice));
    state.tokenVolume = clamp(number(state.tokenVolume, DEFAULTS.tokenVolume), 0, DOMAIN_MAX_MILLIONS);
    state.inputShare = clamp(number(state.inputShare, DEFAULTS.inputShare), 0, 100);
    state.cacheReads = clamp(number(state.cacheReads, DEFAULTS.cacheReads), 0, 100);
    state.cacheWrites = clamp(number(state.cacheWrites, DEFAULTS.cacheWrites), 0, 100 - state.cacheReads);
    state.requests = Math.max(0, Math.round(number(state.requests, DEFAULTS.requests)));
    state.inputChars = Math.max(0, number(state.inputChars, DEFAULTS.inputChars));
    state.outputChars = Math.max(0, number(state.outputChars, DEFAULTS.outputChars));
    state.content = state.content === 'code' ? 'code' : 'text';
    state.longContext = state.longContext === true || state.longContext === 'true';
    if (!modelRates().some((model) => model.id === state.model)) state.model = DEFAULTS.model;
    return state;
  }

  function writeControls(state) {
    Object.entries(controls).forEach(([key, control]) => {
      if (!control) return;
      if (key === 'longContext') control.checked = state.longContext;
      else control.value = String(state[key]);
    });
  }

  function readState() {
    const state = {
      seats: clamp(Math.round(number(controls.seats.value, DEFAULTS.seats)), 1, 50),
      seatPrice: Math.max(0, number(controls.seatPrice.value, DEFAULTS.seatPrice)),
      model: controls.model.value,
      tokenVolume: clamp(number(controls.tokenVolume.value, DEFAULTS.tokenVolume), 0, DOMAIN_MAX_MILLIONS),
      inputShare: clamp(number(controls.inputShare.value, DEFAULTS.inputShare), 0, 100),
      cacheReads: clamp(number(controls.cacheReads.value, DEFAULTS.cacheReads), 0, 100),
      cacheWrites: number(controls.cacheWrites.value, DEFAULTS.cacheWrites),
      longContext: controls.longContext.checked,
      content: controls.content.value === 'code' ? 'code' : 'text',
      requests: Math.max(0, Math.round(number(controls.requests.value, DEFAULTS.requests))),
      inputChars: Math.max(0, number(controls.inputChars.value, DEFAULTS.inputChars)),
      outputChars: Math.max(0, number(controls.outputChars.value, DEFAULTS.outputChars)),
    };
    state.cacheWrites = clamp(state.cacheWrites, 0, 100 - state.cacheReads);
    writeControls(state);
    return state;
  }

  function effectiveApiRate(state, model) {
    const inputFraction = state.inputShare / 100;
    const outputFraction = 1 - inputFraction;
    const cacheReadFraction = state.cacheReads / 100;
    const cacheWriteFraction = state.cacheWrites / 100;
    const uncachedInputFraction = 1 - cacheReadFraction - cacheWriteFraction;
    const cacheReadPrice = Number.isFinite(model.cacheRead) ? model.cacheRead : model.inputPrice;
    const cacheWritePrice = Number.isFinite(model.cacheWrite) ? model.cacheWrite : model.inputPrice;
    const effectiveInput = (uncachedInputFraction * model.inputPrice) + (cacheReadFraction * cacheReadPrice) + (cacheWriteFraction * cacheWritePrice);
    const longContextMultiplier = state.longContext ? 1.5 : 1;
    return ((inputFraction * effectiveInput) + (outputFraction * model.outputPrice)) * longContextMultiplier;
  }

  function calculate(state) {
    const model = modelById(state.model);
    const saasCost = state.seats * state.seatPrice;
    const apiRate = effectiveApiRate(state, model);
    const crossover = apiRate > 0 ? saasCost / apiRate : Infinity;
    const points = SAMPLE_MILLIONS.map((tokens) => ({ tokens, saas: currencyValue(saasCost), api: currencyValue(tokens * apiRate) }));
    return { apiRate, crossover, model, points, saasCost: currencyValue(saasCost), selectedApiCost: currencyValue(state.tokenVolume * apiRate) };
  }

  function updateUrl(state) {
    const search = new URLSearchParams();
    Object.entries(state).forEach(([key, value]) => search.set(key, String(value)));
    history.replaceState(null, '', `${location.pathname}?${search.toString()}`);
  }

  function updateOutputs(state) {
    document.querySelector('#breakeven-seats-output').textContent = `${state.seats} ${state.seats === 1 ? 'seat' : 'seats'}`;
    document.querySelector('#breakeven-token-output').textContent = millions(state.tokenVolume);
    const charactersPerToken = state.content === 'code' ? 3 : 4;
    const estimatedMillions = (state.requests * (state.inputChars + state.outputChars) / charactersPerToken) / 1000000;
    document.querySelector('#breakeven-workload-estimate').textContent = `${estimatedMillions.toLocaleString('en-US', { maximumFractionDigits: 2 })}M estimated monthly tokens from ${charactersPerToken} characters per token.`;
    return estimatedMillions;
  }

  function renderSummary(state, result) {
    const crossoverText = Number.isFinite(result.crossover) ? millions(result.crossover) : 'No API crossover';
    document.querySelector('#breakeven-crossover').textContent = crossoverText;
    const lowerCost = result.saasCost === 0
      ? result.apiRate > 0
        ? 'SaaS is equal at 0M tokens and lower cost for positive token volumes.'
        : 'SaaS and API are equal throughout the 0–300M token domain.'
      : !Number.isFinite(result.crossover)
        ? 'SaaS is lower cost throughout the 0–300M token domain.'
        : result.crossover >= DOMAIN_MAX_MILLIONS
          ? 'API is lower cost throughout the 0–300M token domain.'
          : `API is lower cost below ${millions(result.crossover)}; SaaS is lower cost at and above it.`;
    document.querySelector('#breakeven-lower-cost').textContent = lowerCost;
    document.querySelector('#breakeven-saas-cost').textContent = money(result.saasCost);
    document.querySelector('#breakeven-effective-rate').textContent = rate(result.apiRate);
    document.querySelector('#breakeven-selected-cost').textContent = `${money(result.selectedApiCost)} API · ${money(result.saasCost)} SaaS`;
    document.querySelector('#breakeven-status').textContent = `Updated for ${result.model.name}: ${crossoverText} crossover.`;
  }

  function renderPriceEvidence(result) {
    const model = result.model;
    document.querySelector('#breakeven-price-table tbody').innerHTML = `<tr><th scope="row">${model.name}</th><td>${price(model.inputPrice)}</td><td>${price(model.outputPrice)}</td><td>${cachePriceEvidence(model.cacheRead, 'read', model)}</td><td>${cachePriceEvidence(model.cacheWrite, 'write', model)}</td></tr>`;
    const fallbackNotes = cacheFallbackNotes(model);
    const fallbackDisclosure = fallbackNotes.length ? ` · ${fallbackNotes.join(' ')}` : ' · Cache-read and cache-write prices are available in this fixture.';
    document.querySelector('#breakeven-source').textContent = `Source: TB_MODELS fixture data (${model.provider}) · price effective ${PRICE_EFFECTIVE_DATE} · inspected ${new Date().toISOString()}${fallbackDisclosure}`;
  }

  function renderTable(result) {
    document.querySelector('#breakeven-table tbody').innerHTML = result.points.map((point) => {
      const lowerCost = point.api < point.saas ? 'API' : point.api > point.saas ? 'SaaS' : 'Equal';
      return `<tr><th scope="row">${point.tokens}M</th><td>${money(point.saas)}</td><td>${money(point.api)}</td><td>${lowerCost}</td></tr>`;
    }).join('');
  }

  function renderChart(result) {
    const palette = colors();
    const lines = result.points.map((point) => ({ x: point.tokens, y: point.saas }));
    const api = result.points.map((point) => ({ x: point.tokens, y: point.api }));
    const crossover = Number.isFinite(result.crossover) && result.crossover <= DOMAIN_MAX_MILLIONS
      ? [{ x: result.crossover, y: 0 }, { x: result.crossover, y: result.saasCost }]
      : [];
    const selected = [{ x: Number(document.querySelector('#breakeven-token-volume').value), y: result.selectedApiCost }];
    chart(document.querySelector('#breakeven-chart'), {
      type: 'line',
      data: {
        datasets: [
          { label: 'SaaS subscription', data: lines, borderColor: palette.ink, backgroundColor: 'transparent', borderWidth: 2, pointRadius: 3, tension: 0 },
          { label: 'API usage', data: api, borderColor: palette.accentText, backgroundColor: `${palette.plum}20`, borderWidth: 3, pointRadius: 3, tension: 0, fill: { target: { value: result.saasCost }, below: `${palette.plum}20`, above: 'transparent' } },
          { label: 'Crossover', data: crossover, borderColor: palette.muted, borderDash: [6, 5], borderWidth: 2, pointRadius: 0, tension: 0 },
          { label: 'Selected volume', data: selected, borderColor: palette.accentText, backgroundColor: palette.accentText, pointRadius: 6, pointHoverRadius: 8, showLine: false },
        ],
      },
      options: {
        parsing: false,
        plugins: {
          legend: { labels: { color: palette.muted } },
          tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${money(context.parsed.y)}` } },
        },
        scales: {
          x: { type: 'linear', min: 0, max: DOMAIN_MAX_MILLIONS, title: { display: true, text: 'Monthly tokens (millions)', color: palette.muted }, ticks: { color: palette.muted }, grid: { color: palette.line } },
          y: { beginAtZero: true, title: { display: true, text: 'Monthly cost (USD)', color: palette.muted }, ticks: { color: palette.muted, callback: (value) => money(Number(value)) }, grid: { color: palette.line } },
        },
      },
    });
  }

  function renderDisclosures(state, result) {
    const cacheTerms = state.cacheReads || state.cacheWrites ? ` Cached reads are ${state.cacheReads}% and cached writes are ${state.cacheWrites}% of input tokens.` : '';
    const fallbackNotes = cacheFallbackNotes(result.model);
    const fallbackTerms = fallbackNotes.length ? ` ${fallbackNotes.join(' ')}` : '';
    document.querySelector('#breakeven-formula').textContent = `SaaS = ${state.seats} seats × ${money(state.seatPrice)}. API = monthly tokens (in millions) × effective API rate (${rate(result.apiRate)}); crossover = SaaS ÷ effective API rate.${cacheTerms}${fallbackTerms}${state.longContext ? ' A 1.5× long-context planning multiplier is included.' : ''}`;
    document.querySelector('#breakeven-assumptions').innerHTML = [
      'Model prices are illustrative TB_MODELS fixture values, not live provider pricing or a quote.',
      `Price effective date: ${PRICE_EFFECTIVE_DATE}.`,
      'Input/output mix is applied before the optional cache and long-context adjustments.',
      'Text is estimated at 4 characters per token; code is estimated at 3 characters per token.',
      'Taxes, platform fees, volume discounts, requests that do not bill tokens, and seat-plan limits are excluded.',
      ...fallbackNotes,
    ].map((assumption) => `<li>${assumption}</li>`).join('');
    document.querySelector('#breakeven-timestamp').textContent = `Calculation timestamp: ${new Date().toISOString()} · Domain: 0–300M tokens/month.`;
  }

  function rowsForCsv() {
    return [...document.querySelectorAll('#breakeven-table tr')].map((row) => [...row.cells].map((cell) => `"${(cell.textContent || '').trim().replaceAll('"', '""')}"`).join(',')).join('\n');
  }

  async function copyLink() {
    const actionStatus = document.querySelector('#breakeven-action-status');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable');
      await navigator.clipboard.writeText(location.href);
      actionStatus.textContent = 'Share link copied to the clipboard.';
    } catch (_error) {
      actionStatus.textContent = `Copy this share link: ${location.href}`;
    }
  }

  function downloadCsv() {
    const blob = new Blob([rowsForCsv()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tokenbench-breakeven.csv';
    link.click();
    URL.revokeObjectURL(url);
    document.querySelector('#breakeven-action-status').textContent = 'CSV download created from the exact evidence table.';
  }

  function bindActions() {
    Object.values(controls).forEach((control) => control.addEventListener(control.type === 'range' || control.type === 'number' ? 'input' : 'change', window.renderPage));
    document.querySelector('#breakeven-use-estimate').addEventListener('click', () => {
      const state = readState();
      const charactersPerToken = state.content === 'code' ? 3 : 4;
      controls.tokenVolume.value = String(clamp((state.requests * (state.inputChars + state.outputChars) / charactersPerToken) / 1000000, 0, DOMAIN_MAX_MILLIONS));
      window.renderPage();
    });
    document.querySelector('#breakeven-copy-link').addEventListener('click', copyLink);
    document.querySelector('#breakeven-download-csv').addEventListener('click', downloadCsv);
    document.querySelector('#breakeven-print').addEventListener('click', () => {
      document.querySelector('#breakeven-action-status').textContent = 'Preparing print view…';
      window.print();
    });
  }

  buildModelOptions();
  writeControls(loadState());
  setupShell();
  window.renderPage = () => {
    const state = readState();
    const result = calculate(state);
    updateUrl(state);
    updateOutputs(state);
    renderSummary(state, result);
    renderPriceEvidence(result);
    renderTable(result);
    renderChart(result);
    renderDisclosures(state, result);
  };
  bindActions();
  window.renderPage();
})();

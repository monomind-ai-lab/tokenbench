// The route is published as /cost/calculator; all source rates are illustrative preview fixtures.
(() => {
  const TIERS = {
    individual: { label: 'Individual — $20 / month', monthlyPrice: 20 },
    team: { label: 'Team — $30 / month', monthlyPrice: 30 },
    enterprise: { label: 'Enterprise — $60 / month', monthlyPrice: 60 },
  };
  const DEFAULTS = {
    tier: 'individual',
    model: 'gpt-4o',
    conversationsPerDay: 5,
    messagesPerConversation: 8,
    activeDays: 22,
    inputTokensPerMessage: 1200,
    outputTokensPerMessage: 350,
    cacheReadShare: 20,
    cacheWriteShare: 5,
    longContext: false,
  };
  const NUMBER_FIELDS = {
    conversationsPerDay: { min: 0, max: 10000 },
    messagesPerConversation: { min: 0, max: 10000 },
    activeDays: { min: 1, max: 31 },
    inputTokensPerMessage: { min: 0, max: 1000000 },
    outputTokensPerMessage: { min: 0, max: 1000000 },
    cacheReadShare: { min: 0, max: 100 },
    cacheWriteShare: { min: 0, max: 100 },
  };
  const field = name => document.querySelector(`[name="${name}"]`);
  const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  const preciseMoney = value => `$${Number(value).toFixed(6)}`;
  const tokenCount = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
  const finite = value => Number.isFinite(value) ? value : null;
  const hasRate = value => finite(value) !== null && value >= 0;
  const escapeHtml = value => String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

  const eligibleModels = () => (window.TB_MODELS || []).filter(model => hasRate(model.inputPrice) && hasRate(model.outputPrice));

  function validInteger(value, bounds) {
    const number = Number(value);
    if (!Number.isFinite(number) || !Number.isInteger(number) || number < bounds.min || number > bounds.max) return null;
    return number;
  }

  function stateFromLocation() {
    const params = new URLSearchParams(location.search);
    const state = { ...DEFAULTS };
    if (TIERS[params.get('tier')]) state.tier = params.get('tier');
    if (eligibleModels().some(model => model.id === params.get('model'))) state.model = params.get('model');
    Object.entries(NUMBER_FIELDS).forEach(([name, bounds]) => {
      const value = validInteger(params.get(name), bounds);
      if (value !== null) state[name] = value;
    });
    if (params.has('longContext')) state.longContext = params.get('longContext') === '1';
    return state;
  }

  function readState() {
    const state = { tier: field('tier').value, model: field('model').value, longContext: field('longContext').checked };
    Object.entries(NUMBER_FIELDS).forEach(([name, bounds]) => {
      state[name] = validInteger(field(name).value, bounds) ?? DEFAULTS[name];
    });
    return state;
  }

  function applyState(state) {
    field('tier').value = state.tier;
    field('model').value = state.model;
    Object.keys(NUMBER_FIELDS).forEach(name => { field(name).value = String(state[name]); });
    field('longContext').checked = state.longContext;
  }

  function ratesFor(model) {
    const cacheReadAvailable = hasRate(model.cacheRead);
    const cacheWriteAvailable = hasRate(model.cacheWrite);
    return {
      input: model.inputPrice,
      output: model.outputPrice,
      cacheRead: cacheReadAvailable ? model.cacheRead : model.inputPrice,
      cacheWrite: cacheWriteAvailable ? model.cacheWrite : model.inputPrice,
      cacheReadAvailable,
      cacheWriteAvailable,
    };
  }

  function calculate(state) {
    const model = eligibleModels().find(item => item.id === state.model) || eligibleModels().find(item => item.id === DEFAULTS.model) || eligibleModels()[0];
    const tier = TIERS[state.tier] || TIERS[DEFAULTS.tier];
    const sourceRates = ratesFor(model);
    const monthlyMessages = state.conversationsPerDay * state.messagesPerConversation * state.activeDays;
    const inputMultiplier = state.longContext ? 1.5 : 1;
    const adjustedInputTokens = monthlyMessages * state.inputTokensPerMessage * inputMultiplier;
    const outputTokens = monthlyMessages * state.outputTokensPerMessage;
    const cacheReadShare = Math.min(100, Math.max(0, state.cacheReadShare));
    const cacheWriteShare = Math.min(100 - cacheReadShare, Math.max(0, state.cacheWriteShare));
    const cacheReadTokens = adjustedInputTokens * cacheReadShare / 100;
    const cacheWriteTokens = adjustedInputTokens * cacheWriteShare / 100;
    const standardInputTokens = adjustedInputTokens - cacheReadTokens - cacheWriteTokens;
    const items = [
      { id: 'input-standard', label: 'Standard input', tokens: standardInputTokens, rate: sourceRates.input, cost: standardInputTokens * sourceRates.input / 1000000 },
      { id: 'cache-read', label: 'Cache read', tokens: cacheReadTokens, rate: sourceRates.cacheRead, cost: cacheReadTokens * sourceRates.cacheRead / 1000000 },
      { id: 'cache-write', label: 'Cache write', tokens: cacheWriteTokens, rate: sourceRates.cacheWrite, cost: cacheWriteTokens * sourceRates.cacheWrite / 1000000 },
      { id: 'output', label: 'Output', tokens: outputTokens, rate: sourceRates.output, cost: outputTokens * sourceRates.output / 1000000 },
    ];
    return {
      model,
      tier,
      sourceRates,
      monthlyMessages,
      inputMultiplier,
      adjustedInputTokens,
      outputTokens,
      cacheReadShare,
      cacheWriteShare,
      items,
      apiTotal: items.reduce((total, item) => total + item.cost, 0),
    };
  }

  function writeSourceRates(result) {
    const rateRows = [
      ['Standard input', result.sourceRates.input, 'Source rate in selected model fixture'],
      ['Cache read', result.sourceRates.cacheRead, result.sourceRates.cacheReadAvailable ? 'Source rate in selected model fixture' : 'Unavailable in fixture; derived estimate uses standard input rate'],
      ['Cache write', result.sourceRates.cacheWrite, result.sourceRates.cacheWriteAvailable ? 'Source rate in selected model fixture' : 'Unavailable in fixture; derived estimate uses standard input rate'],
      ['Output', result.sourceRates.output, 'Source rate in selected model fixture'],
    ];
    document.querySelector('#source-price-lines').innerHTML = rateRows.map(([label, rate, status]) => `<tr><th scope="row">${escapeHtml(label)}</th><td>${money(rate)}</td><td>${escapeHtml(status)}</td></tr>`).join('');
    document.querySelector('#source-record-date').textContent = result.model.released || 'Unavailable';
  }

  function writeItems(result) {
    document.querySelector('#derived-monthly-line-items').innerHTML = result.items.map(item => `<tr data-line-item="${item.id}" data-value="${item.cost}"><th scope="row">${item.label}</th><td>${tokenCount(item.tokens)}</td><td>${money(item.rate)}</td><td>${money(item.cost)}</td></tr>`).join('');
  }

  function writeSummary(state, result) {
    const apiTotal = document.querySelector('#api-monthly-total');
    const saasTotal = document.querySelector('#saas-monthly-total');
    apiTotal.dataset.value = String(result.apiTotal);
    apiTotal.textContent = money(result.apiTotal);
    saasTotal.dataset.value = String(result.tier.monthlyPrice);
    saasTotal.textContent = money(result.tier.monthlyPrice);
    const delta = result.apiTotal - result.tier.monthlyPrice;
    const relation = Math.abs(delta) < 0.005 ? 'matches' : delta > 0 ? 'is above' : 'is below';
    document.querySelector('#calculator-live-summary').textContent = `${result.model.name}: API-equivalent estimate ${money(result.apiTotal)} ${relation} the ${result.tier.label} fixture (${money(result.tier.monthlyPrice)}).`;
    document.querySelector('#calculator-formula').textContent = `Monthly messages = conversations/day × messages/conversation × active days. Input tokens = monthly messages × input tokens/message × ${result.inputMultiplier} long-context factor. Input tokens are split ${result.cacheReadShare}% cache-read, ${result.cacheWriteShare}% cache-write, and ${100 - result.cacheReadShare - result.cacheWriteShare}% standard input. Each token line is multiplied by its rate per 1M tokens.`;
    document.querySelector('#calculator-assumptions').textContent = `Selected model: ${result.model.name}. Subscription tier fixture: ${result.tier.label}. Cache rates unavailable in a fixture fall back to the selected model’s standard input source rate, which is disclosed in the source table.`;
    document.querySelector('#calculation-timestamp').textContent = new Date().toISOString();
  }

  function writeUrl(state) {
    const params = new URLSearchParams();
    params.set('tier', state.tier);
    params.set('model', state.model);
    Object.keys(NUMBER_FIELDS).forEach(name => params.set(name, String(state[name])));
    params.set('longContext', state.longContext ? '1' : '0');
    history.replaceState({}, '', `${location.pathname}?${params.toString()}`);
  }

  function csvFor(result) {
    const rows = [
      ['line_item', 'monthly_tokens', 'source_rate_per_million', 'monthly_cost_usd'],
      ...result.items.map(item => [item.label, item.tokens, item.rate, item.cost]),
      ['API-equivalent total', '', '', result.apiTotal],
      ['Subscription tier fixture', '', '', result.tier.monthlyPrice],
    ];
    const quote = value => `"${String(value).replace(/"/g, '""')}"`;
    return [rows[0].join(','), ...rows.slice(1).map(row => row.map(quote).join(','))].join('\n');
  }

  function setActionStatus(message) {
    document.querySelector('#calculator-action-status').textContent = message;
  }

  function downloadCsv() {
    const result = calculate(readState());
    const blob = new Blob([csvFor(result)], { type: 'text/csv;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = 'tokenbench-monthly-cost-estimate.csv';
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
    setActionStatus('CSV download prepared for the current scenario.');
  }

  async function copyLink() {
    const url = location.href;
    setActionStatus('Copying share link for the current scenario.');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(url);
      setActionStatus('Share link copied for the current scenario.');
    } catch {
      const copyTarget = document.createElement('textarea');
      copyTarget.value = url;
      copyTarget.setAttribute('readonly', '');
      copyTarget.style.position = 'fixed';
      copyTarget.style.opacity = '0';
      document.body.append(copyTarget);
      copyTarget.select();
      const copied = document.execCommand?.('copy');
      copyTarget.remove();
      setActionStatus(copied ? 'Share link copied for the current scenario.' : 'Copy the shareable URL from the browser address bar.');
    }
  }

  function renderPage() {
    const state = readState();
    const result = calculate(state);
    writeSourceRates(result);
    writeItems(result);
    writeSummary(state, result);
    writeUrl(state);
  }

  function initialize() {
    field('tier').innerHTML = Object.entries(TIERS).map(([id, tier]) => `<option value="${id}">${tier.label}</option>`).join('');
    field('model').innerHTML = eligibleModels().map(model => `<option value="${escapeHtml(model.id)}">${escapeHtml(model.name)} — ${escapeHtml(model.provider)}</option>`).join('');
    applyState(stateFromLocation());
    setupShell();
    document.querySelector('#cost-calculator-form').addEventListener('input', renderPage);
    document.querySelector('#cost-calculator-form').addEventListener('change', renderPage);
    document.querySelector('#download-csv').addEventListener('click', downloadCsv);
    document.querySelector('#print-calculator').addEventListener('click', () => {
      setActionStatus('Opening the browser print dialog for the current scenario.');
      window.print();
    });
    document.querySelector('#copy-calculator-link').addEventListener('click', copyLink);
    renderPage();
  }

  window.renderPage = renderPage;
  initialize();
})();

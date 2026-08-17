// The route is published as /subscribe-vs-api; all source rates are illustrative preview fixtures.
(() => {
  const MAX_SELECTED_MODELS = 4;
  const BREAKEVEN_DOMAIN_MAX_MILLIONS = 300;
  const BREAKEVEN_SAMPLE_MILLIONS = [0, 25, 50, 100, 150, 200, 250, 300];
  const PROVIDERS = [
    { id: 'openai', label: 'OpenAI', plans: [
      { id: 'individual', label: 'ChatGPT Plus — $20 / month', monthlyPrice: 20 },
      { id: 'team', label: 'ChatGPT Team — $30 / month', monthlyPrice: 30 },
      { id: 'enterprise', label: 'ChatGPT Pro — $60 / month', monthlyPrice: 60 },
    ] },
    { id: 'anthropic', label: 'Anthropic', plans: [
      { id: 'anthropic-pro', label: 'Claude Pro — $20 / month', monthlyPrice: 20 },
      { id: 'anthropic-max', label: 'Claude Max — $100 / month', monthlyPrice: 100 },
    ] },
    { id: 'google', label: 'Google', plans: [
      { id: 'google-ai-pro', label: 'Google AI Pro — $20 / month', monthlyPrice: 20 },
      { id: 'google-ai-ultra', label: 'Google AI Ultra — $250 / month', monthlyPrice: 250 },
    ] },
  ];
  const DEFAULTS = {
    provider: 'openai', plan: 'individual', models: ['gpt-4o'], modelShares: { 'gpt-4o': 100 },
    conversationsPerDay: 5, messagesPerConversation: 8, activeDays: 22,
    inputTokensPerMessage: 1200, outputTokensPerMessage: 350,
    cacheReadShare: 20, cacheWriteShare: 5, longContext: false,
    contentType: 'text', inputCharactersPerMessage: 4800, outputCharactersPerMessage: 1400,
    seats: 1, subscriptionPrice: 20, tokenVolume: 0,
  };
  const NUMBER_FIELDS = {
    conversationsPerDay: { min: 0, max: 10000 }, messagesPerConversation: { min: 0, max: 10000 }, activeDays: { min: 1, max: 31 },
    inputTokensPerMessage: { min: 0, max: 1000000 }, outputTokensPerMessage: { min: 0, max: 1000000 },
    cacheReadShare: { min: 0, max: 100 }, cacheWriteShare: { min: 0, max: 100 },
  };
  const BREAKEVEN_FIELDS = {
    seats: { min: 1, max: 50, integer: true },
    tokenVolume: { min: 0, max: BREAKEVEN_DOMAIN_MAX_MILLIONS, integer: false },
  };
  const CHARACTER_FIELDS = {
    inputCharactersPerMessage: { min: 0, max: 4000000 },
    outputCharactersPerMessage: { min: 0, max: 4000000 },
  };
  const field = name => document.querySelector(`[name="${name}"]`);
  const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  const tokenCount = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
  const millions = value => `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}M tokens`;
  const finite = value => Number.isFinite(value) ? value : null;
  const hasRate = value => finite(value) !== null && value >= 0;
  const escapeHtml = value => String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const eligibleModels = () => (window.TB_MODELS || []).filter(model => hasRate(model.inputPrice) && hasRate(model.outputPrice));
  const providerById = id => PROVIDERS.find(provider => provider.id === id) || PROVIDERS[0];
  const plansForProvider = id => providerById(id).plans;
  const planById = id => PROVIDERS.flatMap(provider => provider.plans.map(plan => ({ ...plan, providerId: provider.id, providerLabel: provider.label }))).find(plan => plan.id === id) || null;

  function validInteger(value, bounds) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    if (!Number.isFinite(number) || !Number.isInteger(number) || number < bounds.min || number > bounds.max) return null;
    return number;
  }

  function validBreakevenNumber(value, bounds) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < bounds.min || number > bounds.max || (bounds.integer && !Number.isInteger(number))) return null;
    return number;
  }

  function uniqueModelIds(ids) {
    const available = new Set(eligibleModels().map(model => model.id));
    return [...new Set(ids)].filter(id => available.has(id)).slice(0, MAX_SELECTED_MODELS);
  }

  function evenShares(ids) {
    if (!ids.length) return {};
    const baseline = Math.floor(100 / ids.length);
    const remainder = 100 - baseline * ids.length;
    return Object.fromEntries(ids.map((id, index) => [id, baseline + (index < remainder ? 1 : 0)]));
  }

  function normalizeShares(ids, rawShares) {
    if (!ids.length) return {};
    const hasEveryShare = ids.every(id => Number.isInteger(Number(rawShares?.[id])) && Number(rawShares[id]) >= 0 && Number(rawShares[id]) <= 100);
    if (!hasEveryShare) return evenShares(ids);
    const shares = Object.fromEntries(ids.map(id => [id, Number(rawShares[id])]));
    return Object.values(shares).reduce((sum, share) => sum + share, 0) === 100 ? shares : evenShares(ids);
  }

  function decodeMix(value) {
    if (!value) return {};
    return Object.fromEntries(value.split(',').map(entry => {
      const separator = entry.lastIndexOf(':');
      return separator === -1 ? [entry, NaN] : [entry.slice(0, separator), Number(entry.slice(separator + 1))];
    }));
  }

  function encodeMix(ids, shares) {
    return ids.map(id => `${id}:${shares[id]}`).join(',');
  }

  function stateFromLocation() {
    const params = new URLSearchParams(location.search);
    const requestedPlan = params.get('plan') || params.get('tier');
    const requestedPlanRecord = planById(requestedPlan);
    const provider = PROVIDERS.some(item => item.id === params.get('provider'))
      ? params.get('provider')
      : requestedPlanRecord?.providerId || DEFAULTS.provider;
    const plans = plansForProvider(provider);
    const plan = plans.some(item => item.id === requestedPlan) ? requestedPlan : plans[0].id;
    const requestedModels = params.get('models')?.split(',') || (params.get('model') ? [params.get('model')] : DEFAULTS.models);
    const selectedModels = uniqueModelIds(requestedModels);
    const models = selectedModels.length ? selectedModels : uniqueModelIds(DEFAULTS.models);
    const state = { ...DEFAULTS, provider, plan, models, modelShares: normalizeShares(models, decodeMix(params.get('mix'))) };
    Object.entries(NUMBER_FIELDS).forEach(([name, bounds]) => {
      const value = validInteger(params.get(name), bounds);
      if (value !== null) state[name] = value;
    });
    Object.entries(BREAKEVEN_FIELDS).forEach(([name, bounds]) => {
      const value = validBreakevenNumber(params.get(name), bounds);
      if (value !== null) state[name] = value;
    });
    Object.entries(CHARACTER_FIELDS).forEach(([name, bounds]) => {
      const value = validInteger(params.get(name), bounds);
      if (value !== null) state[name] = value;
    });
    state.contentType = params.get('contentType') === 'code' ? 'code' : DEFAULTS.contentType;
    state.subscriptionPrice = (planById(state.plan) || planById(DEFAULTS.plan)).monthlyPrice;
    if (params.has('longContext')) state.longContext = params.get('longContext') === '1';
    return state;
  }

  function readModelShares(modelIds) {
    const controls = [...document.querySelectorAll('[data-model-share]')];
    return normalizeShares(modelIds, Object.fromEntries(controls.map(control => [control.dataset.modelShare, Number(control.value)])));
  }

  function readState() {
    const invalidFields = [];
    const provider = PROVIDERS.some(item => item.id === field('provider').value) ? field('provider').value : DEFAULTS.provider;
    const plans = plansForProvider(provider);
    const plan = plans.some(item => item.id === field('plan').value) ? field('plan').value : plans[0].id;
    const selected = uniqueModelIds([...field('models').selectedOptions].map(option => option.value));
    const models = selected.length ? selected : uniqueModelIds(DEFAULTS.models);
    const state = { provider, plan, models, modelShares: readModelShares(models), longContext: field('longContext').checked, invalidFields };
    Object.entries(NUMBER_FIELDS).forEach(([name, bounds]) => {
      const control = field(name);
      const value = validInteger(control.value, bounds);
      if (value === null) {
        state[name] = DEFAULTS[name];
        control.value = String(DEFAULTS[name]);
        invalidFields.push(name);
      } else state[name] = value;
    });
    Object.entries(BREAKEVEN_FIELDS).forEach(([name, bounds]) => {
      const control = field(name);
      const value = validBreakevenNumber(control.value, bounds);
      if (value === null) {
        state[name] = DEFAULTS[name];
        control.value = String(DEFAULTS[name]);
        invalidFields.push(name);
      } else state[name] = value;
    });
    Object.entries(CHARACTER_FIELDS).forEach(([name, bounds]) => {
      const control = field(name);
      const value = validInteger(control.value, bounds);
      if (value === null) {
        state[name] = DEFAULTS[name];
        control.value = String(DEFAULTS[name]);
        invalidFields.push(name);
      } else state[name] = value;
    });
    state.contentType = field('contentType').value === 'code' ? 'code' : 'text';
    state.subscriptionPrice = (planById(state.plan) || planById(DEFAULTS.plan)).monthlyPrice;
    field('subscriptionPrice').value = String(state.subscriptionPrice);
    return state;
  }

  function writePlanOptions(providerId, selectedPlanId) {
    const plans = plansForProvider(providerId);
    field('plan').innerHTML = plans.map(plan => `<option value="${escapeHtml(plan.id)}">${escapeHtml(plan.label)}</option>`).join('');
    field('plan').value = plans.some(plan => plan.id === selectedPlanId) ? selectedPlanId : plans[0].id;
  }

  function writeModelMixControls(state) {
    const selected = state.models.map(id => eligibleModels().find(model => model.id === id)).filter(Boolean);
    const root = document.querySelector('#model-mix-controls');
    root.innerHTML = selected.map(({ id, name }) => {
      const share = state.modelShares[id] ?? 0;
      const disabled = selected.length === 1 ? ' disabled' : '';
      return `<div class="calculator-model-mix-row"><div><label for="model-share-${escapeHtml(id)}">${escapeHtml(name)}</label><output data-model-share-output="${escapeHtml(id)}">${share}%</output></div><input id="model-share-${escapeHtml(id)}" data-model-share="${escapeHtml(id)}" type="range" min="0" max="100" step="1" value="${share}"${disabled} aria-valuetext="${share}% of workload"></div>`;
    }).join('');
    document.querySelector('#model-mix-total').textContent = '100% total';
  }

  function writeModelMixValues(shares) {
    document.querySelectorAll('[data-model-share]').forEach(control => {
      const value = shares[control.dataset.modelShare] ?? 0;
      control.value = String(value);
      control.setAttribute('aria-valuetext', `${value}% of workload`);
      const output = document.querySelector(`[data-model-share-output="${control.dataset.modelShare}"]`);
      if (output) output.textContent = `${value}%`;
    });
  }

  function rebalanceShares(ids, shares, changedId, changedValue) {
    if (ids.length <= 1) return { [ids[0]]: 100 };
    const value = Math.max(0, Math.min(100, Math.round(changedValue)));
    const remainingIds = ids.filter(id => id !== changedId);
    const remainingTotal = 100 - value;
    const previousTotal = remainingIds.reduce((sum, id) => sum + (shares[id] || 0), 0);
    const rebalanced = { [changedId]: value };
    let assigned = 0;
    remainingIds.forEach((id, index) => {
      const share = previousTotal > 0 ? Math.floor((shares[id] || 0) / previousTotal * remainingTotal) : Math.floor(remainingTotal / remainingIds.length);
      rebalanced[id] = index === remainingIds.length - 1 ? remainingTotal - assigned : share;
      assigned += rebalanced[id];
    });
    return rebalanced;
  }

  function applyState(state) {
    field('provider').value = state.provider;
    writePlanOptions(state.provider, state.plan);
    [...field('models').options].forEach(option => { option.selected = state.models.includes(option.value); });
    Object.keys(NUMBER_FIELDS).forEach(name => { field(name).value = String(state[name]); });
    Object.keys(BREAKEVEN_FIELDS).forEach(name => { field(name).value = String(state[name]); });
    Object.keys(CHARACTER_FIELDS).forEach(name => { field(name).value = String(state[name]); });
    field('contentType').value = state.contentType;
    field('subscriptionPrice').value = String((planById(state.plan) || planById(DEFAULTS.plan)).monthlyPrice);
    field('longContext').checked = state.longContext;
    writeModelMixControls(state);
  }

  function ratesFor(model) {
    const cacheReadAvailable = hasRate(model.cacheRead);
    const cacheWriteAvailable = hasRate(model.cacheWrite);
    return { input: model.inputPrice, output: model.outputPrice, cacheRead: cacheReadAvailable ? model.cacheRead : model.inputPrice, cacheWrite: cacheWriteAvailable ? model.cacheWrite : model.inputPrice, cacheReadAvailable, cacheWriteAvailable };
  }

  function calculate(state) {
    const plan = planById(state.plan) || planById(DEFAULTS.plan);
    const selectedModels = state.models.map(id => eligibleModels().find(item => item.id === id)).filter(Boolean).map(model => ({ model, share: state.modelShares[model.id] / 100, sharePercent: state.modelShares[model.id] }));
    const monthlyMessages = state.conversationsPerDay * state.messagesPerConversation * state.activeDays;
    const inputMultiplier = state.longContext ? 1.5 : 1;
    const adjustedInputTokens = monthlyMessages * state.inputTokensPerMessage * inputMultiplier;
    const outputTokens = monthlyMessages * state.outputTokensPerMessage;
    const cacheReadShare = Math.min(100, Math.max(0, state.cacheReadShare));
    const cacheWriteShare = Math.min(100 - cacheReadShare, Math.max(0, state.cacheWriteShare));
    const tokenLines = [
      { id: 'input-standard', label: 'Standard input', tokens: adjustedInputTokens * (100 - cacheReadShare - cacheWriteShare) / 100, rateKey: 'input' },
      { id: 'cache-read', label: 'Cache read', tokens: adjustedInputTokens * cacheReadShare / 100, rateKey: 'cacheRead' },
      { id: 'cache-write', label: 'Cache write', tokens: adjustedInputTokens * cacheWriteShare / 100, rateKey: 'cacheWrite' },
      { id: 'output', label: 'Output', tokens: outputTokens, rateKey: 'output' },
    ];
    const items = selectedModels.flatMap(({ model, share, sharePercent }) => {
      const rates = ratesFor(model);
      return tokenLines.map(line => ({ id: `${model.id}-${line.id}`, model, sharePercent, label: line.label, tokens: line.tokens * share, rate: rates[line.rateKey], cost: line.tokens * share * rates[line.rateKey] / 1000000 }));
    });
    const apiTotal = items.reduce((total, item) => total + item.cost, 0);
    const monthlyWorkloadTokens = adjustedInputTokens + outputTokens;
    const effectiveApiRate = monthlyWorkloadTokens > 0 ? apiTotal * 1000000 / monthlyWorkloadTokens : 0;
    return { plan, selectedModels, monthlyMessages, inputMultiplier, adjustedInputTokens, outputTokens, cacheReadShare, cacheWriteShare, items, apiTotal, monthlyWorkloadTokens, effectiveApiRate };
  }

  function calculateBreakeven(state, result) {
    const saasCost = state.seats * state.subscriptionPrice;
    const crossover = result.effectiveApiRate > 0 ? saasCost / result.effectiveApiRate : Infinity;
    const domainPoints = BREAKEVEN_SAMPLE_MILLIONS.map(tokens => ({
      tokens,
      saas: saasCost,
      api: tokens * result.effectiveApiRate,
    }));
    return {
      saasCost,
      crossover,
      domainPoints,
      points: tablePointsForBreakeven(state, { saasCost, crossover, domainPoints, selectedApiCost: state.tokenVolume * result.effectiveApiRate }, result.effectiveApiRate),
      selectedApiCost: state.tokenVolume * result.effectiveApiRate,
    };
  }

  function tablePointsForBreakeven(state, breakeven, effectiveApiRate) {
    const points = new Map();
    const add = (tokens, marker = null) => {
      if (!Number.isFinite(tokens) || tokens < 0 || tokens > BREAKEVEN_DOMAIN_MAX_MILLIONS) return;
      const existing = points.get(tokens) || { tokens, markers: [] };
      if (marker && !existing.markers.includes(marker)) existing.markers.push(marker);
      points.set(tokens, existing);
    };
    BREAKEVEN_SAMPLE_MILLIONS.forEach(tokens => add(tokens));
    add(state.tokenVolume, 'Selected volume');
    add(breakeven.crossover, 'Crossover');
    return [...points.values()]
      .sort((left, right) => left.tokens - right.tokens)
      .map(point => ({ ...point, saas: breakeven.saasCost, api: point.tokens * effectiveApiRate }));
  }

  function writeSourceRates(result) {
    const rows = result.selectedModels.flatMap(({ model, sharePercent }) => {
      const rates = ratesFor(model);
      return [
        ['Standard input', rates.input, 'Source rate in selected model fixture'],
        ['Cache read', rates.cacheRead, rates.cacheReadAvailable ? 'Source rate in selected model fixture' : 'Unavailable in fixture; derived estimate uses standard input rate'],
        ['Cache write', rates.cacheWrite, rates.cacheWriteAvailable ? 'Source rate in selected model fixture' : 'Unavailable in fixture; derived estimate uses standard input rate'],
        ['Output', rates.output, 'Source rate in selected model fixture'],
      ].map(([label, rate, status]) => `<tr><th scope="row">${escapeHtml(model.name)} <span class="fixture">${sharePercent}% mix</span></th><td>${escapeHtml(label)}</td><td>${money(rate)}</td><td>${escapeHtml(status)}</td></tr>`);
    });
    document.querySelector('#source-price-lines').innerHTML = rows.join('');
    document.querySelector('#source-record-date').textContent = result.selectedModels.map(({ model }) => model.released || 'Unavailable').join(' · ');
  }

  function writeItems(result) {
    document.querySelector('#derived-monthly-line-items').innerHTML = result.items.map(item => `<tr data-line-item="${escapeHtml(item.id)}" data-value="${item.cost}"><th scope="row">${escapeHtml(item.model.name)} · ${escapeHtml(item.label)} <span class="fixture">${item.sharePercent}% mix</span></th><td>${tokenCount(item.tokens)}</td><td>${money(item.rate)}</td><td>${money(item.cost)}</td></tr>`).join('');
  }

  function writeSummary(result) {
    const apiTotal = document.querySelector('#api-monthly-total');
    const saasTotal = document.querySelector('#saas-monthly-total');
    apiTotal.dataset.value = String(result.apiTotal);
    apiTotal.textContent = money(result.apiTotal);
    saasTotal.dataset.value = String(result.plan.monthlyPrice);
    saasTotal.textContent = money(result.plan.monthlyPrice);
    const delta = result.apiTotal - result.plan.monthlyPrice;
    const relation = Math.abs(delta) < 0.005 ? 'matches' : delta > 0 ? 'is above' : 'is below';
    const mix = result.selectedModels.map(({ model, sharePercent }) => `${model.name} ${sharePercent}%`).join(', ');
    document.querySelector('#calculator-live-summary').textContent = `${mix}: API-equivalent estimate ${money(result.apiTotal)} ${relation} the ${result.plan.label} fixture (${money(result.plan.monthlyPrice)}).`;
    document.querySelector('#calculator-formula').textContent = `Monthly messages = conversations/day × messages/conversation × active days. Input tokens = monthly messages × input tokens/message × ${result.inputMultiplier} long-context factor. Each token line is allocated to selected models by its usage ratio, then multiplied by that model’s source rate per 1M tokens. Input tokens are split ${result.cacheReadShare}% cache-read, ${result.cacheWriteShare}% cache-write, and ${100 - result.cacheReadShare - result.cacheWriteShare}% standard input.`;
    document.querySelector('#calculator-assumptions').textContent = `Selected subscription: ${result.plan.providerLabel} · ${result.plan.label}. API model mix: ${mix}. Cache rates unavailable in a fixture fall back to that model’s standard input source rate, which is disclosed in the source table.`;
    document.querySelector('#calculation-timestamp').textContent = new Date().toISOString();
  }

  function charactersPerToken(contentType) {
    return contentType === 'code' ? 3 : 4;
  }

  function writeCharacterEstimate(state) {
    const divisor = charactersPerToken(state.contentType);
    const inputTokens = Math.round(state.inputCharactersPerMessage / divisor);
    const outputTokens = Math.round(state.outputCharactersPerMessage / divisor);
    document.querySelector('#character-token-estimate').textContent = `${state.contentType === 'code' ? 'Code' : 'Text'} uses ${divisor} characters per token: ${tokenCount(inputTokens)} input and ${tokenCount(outputTokens)} output tokens per message. Select Use character estimate to apply it.`;
  }

  function writeBreakeven(state, result, breakeven) {
    document.querySelector('#breakeven-seats-output').textContent = `${state.seats} ${state.seats === 1 ? 'seat' : 'seats'}`;
    document.querySelector('#breakeven-token-output').textContent = millions(state.tokenVolume);
    document.querySelector('#breakeven-workload-estimate').textContent = `${millions(result.monthlyWorkloadTokens / 1000000)} from the current message workload (${tokenCount(result.adjustedInputTokens)} input + ${tokenCount(result.outputTokens)} output tokens).`;

    const crossoverText = Number.isFinite(breakeven.crossover) ? millions(breakeven.crossover) : 'No API crossover';
    document.querySelector('#breakeven-crossover').textContent = crossoverText;
    const lowerCost = breakeven.saasCost === 0
      ? result.effectiveApiRate > 0
        ? 'Monthly subscription is equal at 0M tokens and lower cost for positive token volumes.'
        : 'Monthly subscription and API are equal throughout the 0–300M token domain.'
      : !Number.isFinite(breakeven.crossover)
        ? 'Monthly subscription is lower cost throughout the 0–300M token domain.'
        : breakeven.crossover >= BREAKEVEN_DOMAIN_MAX_MILLIONS
          ? 'API is lower cost throughout the 0–300M token domain.'
          : `API is lower cost below ${millions(breakeven.crossover)}; Monthly subscription is lower cost at and above it.`;
    document.querySelector('#breakeven-lower-cost').textContent = lowerCost;
    document.querySelector('#breakeven-saas-cost').textContent = money(breakeven.saasCost);
    document.querySelector('#breakeven-effective-rate').textContent = `${money(result.effectiveApiRate)} / 1M`;
    document.querySelector('#breakeven-selected-cost').textContent = `${money(breakeven.selectedApiCost)} API · ${money(breakeven.saasCost)} Monthly subscription`;
    document.querySelector('#breakeven-seat-price-note').textContent = `Synced from the selected ${result.plan.providerLabel} plan: ${result.plan.label} at ${money(state.subscriptionPrice)} per seat / month.`;

    document.querySelector('#breakeven-formula').textContent = `Monthly subscription = ${state.seats} seats × ${money(state.subscriptionPrice)}. API = monthly tokens (in millions) × the effective API rate (${money(result.effectiveApiRate)} / 1M). Crossover = Monthly subscription ÷ effective API rate. The rate is derived from the selected message workload before display rounding.`;
    const cacheTerms = state.cacheReadShare || state.cacheWriteShare
      ? `Cache reads are ${result.cacheReadShare}% and cache writes are ${result.cacheWriteShare}% of adjusted input tokens.`
      : 'No cache-token share is included.';
    const contextTerms = state.longContext ? 'The 1.5× long-context input buffer is included.' : 'No long-context input buffer is included.';
    document.querySelector('#breakeven-assumptions').textContent = `${cacheTerms} ${contextTerms} Source price record dates, cache fallbacks, and the selected model mix remain itemized in the source-price table. Calculation time: ${new Date().toISOString()}.`;

    document.querySelector('#breakeven-table tbody').innerHTML = breakeven.points.map(point => {
      const lower = point.api < point.saas ? 'API' : point.api > point.saas ? 'Monthly subscription' : 'Equal';
      const marker = point.markers.length ? `${point.markers.join(' · ')} · ` : '';
      return `<tr${point.markers.length ? ` data-sample="${escapeHtml(point.markers.join(' ')).toLowerCase().replaceAll(' ', '-')}"` : ''}><th scope="row">${marker}${Number(point.tokens).toLocaleString('en-US', { maximumFractionDigits: 2 })}M</th><td>${money(point.saas)}</td><td>${money(point.api)}</td><td>${lower}</td></tr>`;
    }).join('');
    renderBreakevenChart(state, result, breakeven);
  }

  function renderBreakevenChart(state, result, breakeven) {
    const palette = colors();
    const crossover = Number.isFinite(breakeven.crossover) && breakeven.crossover <= BREAKEVEN_DOMAIN_MAX_MILLIONS
      ? [{ x: breakeven.crossover, y: 0 }, { x: breakeven.crossover, y: breakeven.saasCost }]
      : [];
    chart(document.querySelector('#breakeven-chart'), {
      type: 'line',
      data: {
        datasets: [
          { label: 'Monthly subscription', data: breakeven.domainPoints.map(point => ({ x: point.tokens, y: point.saas })), borderColor: palette.ink, backgroundColor: 'transparent', borderWidth: 2, pointRadius: 3, tension: 0 },
          { label: 'API usage', data: breakeven.domainPoints.map(point => ({ x: point.tokens, y: point.api })), borderColor: palette.accentText, backgroundColor: `${palette.plum}20`, borderWidth: 3, pointRadius: 3, tension: 0, fill: { target: { value: breakeven.saasCost }, below: `${palette.plum}20`, above: 'transparent' } },
          { label: 'Crossover', data: crossover, borderColor: palette.muted, borderDash: [6, 5], borderWidth: 2, pointRadius: 0, tension: 0 },
          { label: 'Selected volume', data: [{ x: state.tokenVolume, y: breakeven.selectedApiCost }], borderColor: palette.accentText, backgroundColor: palette.accentText, pointRadius: 6, pointHoverRadius: 8, showLine: false },
        ],
      },
      options: {
        parsing: false,
        plugins: { legend: { labels: { color: palette.muted } }, tooltip: { callbacks: { label: context => `${context.dataset.label}: ${money(context.parsed.y)}` } } },
        scales: {
          x: { type: 'linear', min: 0, max: BREAKEVEN_DOMAIN_MAX_MILLIONS, title: { display: true, text: 'Monthly tokens (millions)', color: palette.muted }, ticks: { color: palette.muted }, grid: { color: palette.line } },
          y: { beginAtZero: true, title: { display: true, text: 'Monthly cost (USD)', color: palette.muted }, ticks: { color: palette.muted, callback: value => money(Number(value)) }, grid: { color: palette.line } },
        },
      },
    });
  }

  function writeValidation(state) {
    const status = document.querySelector('#calculator-validation-status');
    if (!state.invalidFields.length) { status.hidden = true; status.textContent = ''; return; }
    const labels = state.invalidFields.map(name => field(name).labels?.[0]?.textContent?.trim() || name);
    status.hidden = false;
    status.textContent = `Invalid values reset to safe defaults: ${labels.join(', ')}.`;
  }

  function writeUrl(state) {
    const params = new URLSearchParams();
    params.set('provider', state.provider);
    params.set('plan', state.plan);
    params.set('models', state.models.join(','));
    params.set('mix', encodeMix(state.models, state.modelShares));
    Object.keys(NUMBER_FIELDS).forEach(name => params.set(name, String(state[name])));
    Object.keys(BREAKEVEN_FIELDS).forEach(name => params.set(name, String(state[name])));
    Object.keys(CHARACTER_FIELDS).forEach(name => params.set(name, String(state[name])));
    params.set('contentType', state.contentType);
    params.set('longContext', state.longContext ? '1' : '0');
    history.replaceState({}, '', `${location.pathname}?${params.toString()}`);
  }

  function csvFor(result, breakeven) {
    const rows = [
      ['model', 'model_usage_share_percent', 'line_item', 'monthly_tokens', 'source_rate_per_million', 'monthly_cost_usd'],
      ...result.items.map(item => [item.model.name, item.sharePercent, item.label, item.tokens, item.rate, item.cost]),
      ['API-equivalent total', '', '', '', '', result.apiTotal],
      [`${result.plan.providerLabel} subscription fixture`, '', result.plan.label, '', '', result.plan.monthlyPrice],
      [],
      ['breakeven_monthly_tokens_millions', 'monthly_subscription_usd', 'api_usage_usd', 'lower_cost'],
      ...breakeven.points.map(point => [point.tokens, point.saas, point.api, point.api < point.saas ? 'API' : point.api > point.saas ? 'Monthly subscription' : 'Equal']),
    ];
    const quote = value => `"${String(value).replace(/"/g, '""')}"`;
    return [rows[0].join(','), ...rows.slice(1).map(row => row.map(quote).join(','))].join('\n');
  }

  function setActionStatus(message) { document.querySelector('#calculator-action-status').textContent = message; }

  function applyCharacterEstimate() {
    const state = readState();
    const divisor = charactersPerToken(state.contentType);
    field('inputTokensPerMessage').value = String(Math.min(NUMBER_FIELDS.inputTokensPerMessage.max, Math.round(state.inputCharactersPerMessage / divisor)));
    field('outputTokensPerMessage').value = String(Math.min(NUMBER_FIELDS.outputTokensPerMessage.max, Math.round(state.outputCharactersPerMessage / divisor)));
    renderPage();
    setActionStatus('Character estimate applied to the message token controls.');
  }

  function downloadCsv() {
    const state = readState();
    const result = calculate(state);
    const blob = new Blob([csvFor(result, calculateBreakeven(state, result))], { type: 'text/csv;charset=utf-8' });
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

  function renderPage({ syncMix = false } = {}) {
    const state = readState();
    if (syncMix) {
      [...field('models').options].forEach(option => { option.selected = state.models.includes(option.value); });
      writeModelMixControls(state);
    }
    const result = calculate(state);
    writeValidation(state);
    writeSourceRates(result);
    writeItems(result);
    writeSummary(result);
    writeCharacterEstimate(state);
    writeBreakeven(state, result, calculateBreakeven(state, result));
    writeUrl(state);
  }

  function initialize() {
    field('provider').innerHTML = PROVIDERS.map(provider => `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.label)}</option>`).join('');
    field('models').innerHTML = eligibleModels().map(model => `<option value="${escapeHtml(model.id)}">${escapeHtml(model.name)} — ${escapeHtml(model.provider)}</option>`).join('');
    applyState(stateFromLocation());
    setupShell();
    const form = document.querySelector('#cost-calculator-form');
    const breakevenControls = document.querySelector('#breakeven-calculator');
    const update = event => {
      const target = event.target;
      if (target.name === 'provider') { writePlanOptions(target.value); renderPage(); return; }
      if (target.name === 'models') { renderPage({ syncMix: true }); return; }
      if (target.matches?.('[data-model-share]')) {
        const state = readState();
        writeModelMixValues(rebalanceShares(state.models, state.modelShares, target.dataset.modelShare, Number(target.value)));
      }
      renderPage();
    };
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    breakevenControls.addEventListener('input', update);
    breakevenControls.addEventListener('change', update);
    document.querySelector('#download-csv').addEventListener('click', downloadCsv);
    document.querySelector('#use-character-estimate').addEventListener('click', applyCharacterEstimate);
    document.querySelector('#print-calculator').addEventListener('click', () => { setActionStatus('Opening the browser print dialog for the current scenario.'); window.print(); });
    document.querySelector('#copy-calculator-link').addEventListener('click', copyLink);
    renderPage();
  }

  window.renderPage = renderPage;
  initialize();
})();

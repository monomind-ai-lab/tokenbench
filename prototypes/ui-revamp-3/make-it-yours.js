// The route is published as /make-it-yours; this script stays path-relative so the preview bundle is self-contained.
(() => {
  setupShell();

  const domains = ['agentic', 'coding', 'reasoning', 'math', 'multimodal', 'throughput'];
  const maxRankedModels = 20;
  const providers = [...new Set(TB_MODELS.map(model => model.provider))].sort((a, b) => a.localeCompare(b));
  let view = 'rows';
  let ttft = .8;
  let tps = 60;
  let showExcluded = true;
  let accessFilter = 'all';
  let providerFilters = new Set();
  let addedModelIds = [];
  let comparisonWasVisible = false;
  let leaderboardQuickRadar = null;
  let visibleModels = [];
  let filteredCandidates = [];
  const chartSelectionControllers = new WeakMap();

  const sumWeights = () => Object.values(TB.weights).reduce((total, value) => total + value, 0);
  const isOpenWeight = model => String(model.access).toLowerCase().includes('open');
  const meetsSla = model => model.ttft <= ttft && model.tps >= tps;
  const ranked = () => [...TB_MODELS].sort((a, b) => score(b) - score(a));
  const matchesAccess = model => accessFilter === 'all' || (accessFilter === 'open' ? isOpenWeight(model) : !isOpenWeight(model));
  const matchesProvider = model => providerFilters.size === 0 || providerFilters.has(model.provider);
  const defaultCandidates = () => ranked().filter(model => matchesAccess(model) && matchesProvider(model)).slice(0, maxRankedModels);
  const currentCandidates = () => {
    const defaults = defaultCandidates();
    const defaultIds = new Set(defaults.map(model => model.id));
    const additions = addedModelIds.map(id => TB_MODELS.find(model => model.id === id)).filter(model => model && matchesAccess(model) && matchesProvider(model) && !defaultIds.has(model.id));
    return [...defaults, ...additions].sort((a, b) => score(b) - score(a));
  };
  const accessLabel = () => accessFilter === 'open' ? 'Open weight' : accessFilter === 'closed' ? 'Closed' : 'All access';
  const providerLabel = () => {
    const selected = [...providerFilters];
    if (!selected.length) return 'All providers';
    if (selected.length <= 2) return selected.join(' + ');
    return `${selected.length} providers`;
  };
  const escapeHtml = value => String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const formatWeight = value => Number(value).toFixed(Number.isInteger(value) ? 0 : 1);

  function parseSharedState() {
    const params = new URLSearchParams(location.search);
    if (['all', 'open', 'closed'].includes(params.get('access'))) accessFilter = params.get('access');
    const sharedProviders = String(params.get('provider') || '').split(',').map(value => value.trim()).filter(value => providers.includes(value));
    providerFilters = new Set(sharedProviders);
    addedModelIds = normalizeModelIds(String(params.get('models') || '').split(',').filter(Boolean), TB_MODELS.length);
    if (params.has('outside')) showExcluded = params.get('outside') !== '0';
    if (['cards', 'rows'].includes(params.get('view'))) view = params.get('view');

    const sharedTtft = Number(params.get('ttft'));
    const sharedTps = Number(params.get('tps'));
    if (Number.isFinite(sharedTtft) && sharedTtft >= .2 && sharedTtft <= 1.2) ttft = sharedTtft;
    if (Number.isFinite(sharedTps) && sharedTps >= 20 && sharedTps <= 140) tps = sharedTps;

    const weights = String(params.get('weights') || '').split(',');
    weights.forEach(pair => {
      const [domain, rawValue] = pair.split(':');
      const value = Number(rawValue);
      if (domains.includes(domain) && Number.isFinite(value) && value >= 0 && value <= 100) TB.weights[domain] = value;
    });
  }

  function initSliders() {
    const root = $('#sliders');
    if (root.children.length) return;
    root.innerHTML = domains.map(domain => `<label for="weight-${domain}"><span class="toolbar"><span class="label">${domain}</span><b id="v-${domain}"></b></span><input id="weight-${domain}" data-k="${domain}" type="range" min="0" max="100"></label>`).join('');
    $$('#sliders input').forEach(input => {
      input.addEventListener('input', () => {
        TB.weights[input.dataset.k] = Number(input.value);
        renderPage(false);
      });
    });
  }

  function syncControls() {
    domains.forEach(domain => {
      const input = $(`[data-k="${domain}"]`);
      if (input !== document.activeElement) input.value = TB.weights[domain];
      $(`#v-${domain}`).textContent = `${Math.round(TB.weights[domain])}%`;
    });
    if ($('#ttft') !== document.activeElement) $('#ttft').value = ttft;
    if ($('#tps') !== document.activeElement) $('#tps').value = tps;
    $('#show-excluded').checked = showExcluded;
  }

  function chartHeight(canvas, modelCount) {
    const rankingChart = canvas.id === 'ranking';
    const weightedCostChart = canvas.id === 'weighted-cost-ranking-chart';
    const perRow = weightedCostChart ? 44 : rankingChart ? 28 : 24;
    const verticalChartChrome = weightedCostChart ? 176 : 84;
    const minimum = weightedCostChart ? 420 : rankingChart ? 360 : 300;
    const maximum = rankingChart ? 680 : 560;
    const height = Math.max(minimum, modelCount * perRow + verticalChartChrome);
    canvas.closest('.chart-wrap').style.height = `${weightedCostChart ? height : Math.min(maximum, height)}px`;
  }

  function openModelProfile(model) {
    if (model) location.href = `/model-profile?model=${encodeURIComponent(model.id)}`;
  }

  function modelForChartRow(instance, event, models) {
    const area = instance.chartArea;
    if (!area || event.y < area.top || event.y > area.bottom || !models.length) return null;
    const index = Math.min(models.length - 1, Math.floor((event.y - area.top) / ((area.bottom - area.top) / models.length)));
    return models[index] || null;
  }

  function horizontal(id, models, getValue, label, passes) {
    const palette = colors();
    const canvas = $('#' + id);
    if (!canvas) return;
    chartHeight(canvas, models.length);
    const baseLabel = canvas.dataset.baseAriaLabel || canvas.getAttribute('aria-label') || `${label} by model`;
    canvas.dataset.baseAriaLabel = baseLabel;
    canvas.setAttribute('aria-label', `${baseLabel}. ${models.length} models. Select a row to open its profile.`);
    canvas.title = 'Select a model name or bar to open its profile';
    chart(canvas, {
      type: 'bar',
      data: {
        labels: models.map(model => model.name),
        datasets: [{
          label,
          data: models.map(getValue),
          backgroundColor: models.map(model => passes(model) ? model.color : palette.line),
          borderColor: models.map(model => passes(model) ? model.color : palette.muted),
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        layout: { padding: { right: 8 } },
        onHover: (event, _active, instance) => {
          const target = event.native?.target;
          if (target) target.style.cursor = modelForChartRow(instance, event, models) ? 'pointer' : 'default';
        },
        onClick: (event, _active, instance) => {
          const model = modelForChartRow(instance, event, models);
          openModelProfile(model);
        },
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { color: palette.muted }, grid: { color: palette.line } },
          y: { ticks: { color: palette.accentText, font: { size: 10, weight: 600 } }, grid: { display: false } }
        }
      }
    });
  }

  function weightedFrontier(models) {
    let bestScore = Number.NEGATIVE_INFINITY;
    return [...models]
      .sort((left, right) => left.cost - right.cost)
      .filter(model => {
        const currentScore = score(model);
        if (currentScore <= bestScore) return false;
        bestScore = currentScore;
        return true;
      });
  }

  function mountWeightedChartSelection(id, models, label) {
    const root = $(`#${id}-selection`);
    const options = $('.weighted-chart-selection-options', root);
    const activeCopy = $(`#${id}-selection-active`);
    chartSelectionControllers.get(root)?.abort();
    const controller = new AbortController();
    chartSelectionControllers.set(root, controller);

    if (!models.length) {
      options.innerHTML = '';
      root.removeAttribute('aria-activedescendant');
      root.removeAttribute('data-active-model-id');
      activeCopy.textContent = '';
      return;
    }

    const previousId = root.dataset.activeModelId;
    let activeIndex = Math.max(0, models.findIndex(model => model.id === previousId));
    options.innerHTML = models.map(model => `<span id="${id}-option-${escapeHtml(model.id)}" role="option" aria-selected="false">${escapeHtml(model.name)} · ${escapeHtml(model.provider)}</span>`).join('');

    const select = index => {
      activeIndex = Math.max(0, Math.min(index, models.length - 1));
      const model = models[activeIndex];
      root.dataset.activeModelId = model.id;
      root.setAttribute('aria-activedescendant', `${id}-option-${model.id}`);
      root.setAttribute('aria-label', `${label} chart model selection. ${model.name} selected. Use Left and Right Arrow to choose a model, then Enter or Space to open its profile.`);
      $$('[role="option"]', options).forEach((option, optionIndex) => option.setAttribute('aria-selected', String(optionIndex === activeIndex)));
      activeCopy.textContent = `${model.name} selected.`;
    };

    root.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        select(activeIndex + 1);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        select(activeIndex - 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        select(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        select(models.length - 1);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openModelProfile(models[activeIndex]);
      }
    }, { signal: controller.signal });

    select(activeIndex);
  }

  function renderWeightedInsightTable(models, { cheapestFirst = false } = {}) {
    const orderedModels = cheapestFirst ? [...models].sort((left, right) => left.cost - right.cost) : models;
    const frontierIds = new Set(weightedFrontier(models).map(model => model.id));
    return `<div class="table-wrap" role="region" aria-label="Exact weighted score and cost values" tabindex="0"><table><thead><tr><th scope="col">${cheapestFirst ? 'Cost rank' : 'Weighted rank'}</th><th scope="col">Model / profile</th><th scope="col">Provider</th><th scope="col">Weighted score</th><th scope="col">Blended $ / 1M</th><th scope="col">Frontier</th><th scope="col">SLA result</th></tr></thead><tbody>${orderedModels.map((model, index) => `<tr><td>${index + 1}</td><th scope="row">${link(model)}</th><td><span class="provider-dot" style="background:${model.color}"></span>${escapeHtml(model.provider)}</td><td>${score(model).toFixed(1)}</td><td>$${model.cost.toFixed(2)}</td><td>${frontierIds.has(model.id) ? 'Weighted frontier' : 'Dominated'}</td><td>${meetsSla(model) ? 'Pass' : 'Outside threshold'}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderWeightedScoreCostChart(models) {
    const palette = colors();
    const frontier = weightedFrontier(models);
    const canvas = $('#weighted-score-cost-chart');
    const point = model => ({ x: model.cost, y: score(model), modelId: model.id, name: model.name });
    chart(canvas, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Visible models',
            data: models.map(point),
            backgroundColor: models.map(model => model.color),
            borderColor: palette.line,
            borderWidth: 1,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointHitRadius: 22
          },
          {
            label: 'Weighted frontier',
            data: frontier.map(point),
            backgroundColor: palette.plum,
            borderColor: palette.plum,
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointHitRadius: 22,
            showLine: true,
            tension: 0
          }
        ]
      },
      options: {
        onHover: (event, elements) => {
          const target = event.native?.target;
          if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
        },
        onClick: (_event, elements, instance) => {
          const active = elements[0];
          const selected = active && instance.data.datasets[active.datasetIndex]?.data[active.index];
          openModelProfile(models.find(model => model.id === selected?.modelId));
        },
        plugins: {
          legend: { labels: { color: palette.muted, usePointStyle: true, boxWidth: 10 } },
          tooltip: {
            callbacks: {
              label: context => `${context.raw.name}: ${context.raw.y.toFixed(1)} score · $${context.raw.x.toFixed(2)} / 1M`
            }
          }
        },
        scales: {
          x: {
            type: 'logarithmic',
            title: { display: true, text: 'Blended $ / 1M', color: palette.muted },
            ticks: { color: palette.muted },
            grid: { color: palette.line }
          },
          y: {
            title: { display: true, text: 'Weighted score', color: palette.muted },
            ticks: { color: palette.muted },
            grid: { color: palette.line }
          }
        }
      }
    });
  }

  function renderWeightedInsights(models) {
    const scatterCanvas = $('#weighted-score-cost-chart');
    const costCanvas = $('#weighted-cost-ranking-chart');
    if (!models.length) {
      if (typeof Chart !== 'undefined') {
        Chart.getChart(scatterCanvas)?.destroy();
        Chart.getChart(costCanvas)?.destroy();
      }
      const message = 'No visible weighted results. Reset a filter or show outside-SLA models to restore the score and cost evidence.';
      $('#weighted-score-cost-table').innerHTML = emptyState(message);
      $('#weighted-cost-ranking-table').innerHTML = emptyState(message);
      $('#weighted-insight-status').textContent = 'Weighted score and cost insights are paused until a visible result is available.';
      mountWeightedChartSelection('weighted-score-cost', [], 'Weighted score versus blended cost');
      mountWeightedChartSelection('weighted-cost-ranking', [], 'Cheapest-first score ranking');
      return;
    }

    const cheapestFirst = [...models].sort((left, right) => left.cost - right.cost);
    $('#weighted-score-cost-table').innerHTML = renderWeightedInsightTable(models);
    $('#weighted-cost-ranking-table').innerHTML = renderWeightedInsightTable(models, { cheapestFirst: true });
    $('#weighted-insight-status').textContent = `${models.length} visible model${models.length === 1 ? '' : 's'} · ${weightedFrontier(models).length} on the weighted frontier.`;
    renderWeightedScoreCostChart(models);
    mountWeightedChartSelection('weighted-score-cost', models, 'Weighted score versus blended cost');
    horizontal('weighted-cost-ranking-chart', cheapestFirst, model => score(model), 'Weighted score', () => true);
    mountWeightedChartSelection('weighted-cost-ranking', cheapestFirst, 'Cheapest-first score ranking');
  }

  function emptyState(message) {
    return `<div class="leaderboard-empty empty"><p>${escapeHtml(message)}</p><button class="toggle" type="button" data-reset-leaderboard-filters>Reset filters</button></div>`;
  }

  function renderOutput(models) {
    const outputRoot = $('#output');
    outputRoot.innerHTML = view === 'rows' ? table(models, { costMode: 'input-output' }) : `<div class="grid-3">${models.map((model, index) => modelCard(model, { rank: index + 1 })).join('')}</div>`;
    bindCompare(outputRoot);
    bindCompare($('#rank-alt'));
  }

  function renderLeaderboardCompare() {
    leaderboardQuickRadar?.destroy();
    leaderboardQuickRadar = null;
    if (typeof Chart !== 'undefined') Chart.getChart($('#leaderboard-radar'))?.destroy();
    TB.selected = normalizeModelIds(TB.selected);
    const models = TB.selected.map(id => TB_MODELS.find(model => model.id === id)).filter(Boolean);
    const show = models.length >= 2;
    const shouldReveal = show && !comparisonWasVisible;
    $('#tray').classList.toggle('show', show);
    $('#selected-names').innerHTML = selectedModelChips(models);
    bindComparisonRemovals($('#selected-names'), id => {
      TB.selected = TB.selected.filter(candidate => candidate !== id);
      renderPage(false);
    });
    mountModelPicker($('#leaderboard-compare-picker-host'), {
      id: 'leaderboard-compare-picker',
      selectedIds: TB.selected,
      onAdd: id => {
        TB.selected = normalizeModelIds([...TB.selected, id]);
        renderPage(false);
      }
    });
    $('#compare-summary').textContent = show ? `${models.length} candidates selected · current ranking weights remain applied` : 'Select two to four models from Cards or Table.';
    $('#compare-more').href = previewComparisonHref(TB.selected);
    $('#compare-more').setAttribute('aria-label', `More details for ${models.length} selected models`);
    if (show) {
      $('#comparison').innerHTML = `<div class="panel soft"><h3 class="subhead">Capability overlay</h3><div class="chart-wrap short quick-comparison-radar"><canvas id="leaderboard-radar" role="img" aria-label="Selected model capability radar"></canvas></div><details class="quick-comparison-details"><summary>Exact capability values</summary>${comparisonMatrix(models, comparisonCapabilityRows(), {id: 'leaderboard-capability-matrix', ariaLabel: 'Exact capability comparison'})}</details></div><div class="panel"><h3 class="subhead">Decision matrix</h3>${comparisonMatrix(models, comparisonDecisionRows(models), {id: 'leaderboard-decision-matrix', ariaLabel: 'Ranked candidate decision matrix'})}</div>`;
      leaderboardQuickRadar = radar($('#leaderboard-radar'), models);
    } else {
      $('#comparison').innerHTML = '';
    }
    comparisonWasVisible = show;
    if (shouldReveal) requestAnimationFrame(() => $('#tray').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));
  }

  function renderSlaTable(models) {
    if (!models.length) {
      $('#sla-table').innerHTML = emptyState(`No models match ${accessLabel()} and ${providerLabel()}.`);
      return;
    }
    $('#sla-table').innerHTML = `<div class="table-wrap" role="region" aria-label="Exact SLA measurements" tabindex="0"><table><thead><tr><th scope="col">Model</th><th scope="col">TTFT</th><th scope="col">TTFT result</th><th scope="col">Throughput</th><th scope="col">Throughput result</th><th scope="col">Eligibility</th></tr></thead><tbody>${models.map(model => `<tr><th scope="row">${link(model)}</th><td>${model.ttft.toFixed(2)}s</td><td>${model.ttft <= ttft ? 'Pass' : 'Outside threshold'}</td><td>${model.tps} tok/s</td><td>${model.tps >= tps ? 'Pass' : 'Outside threshold'}</td><td>${meetsSla(model) ? 'Eligible' : 'Excluded when outside-SLA models are hidden'}</td></tr>`).join('')}</tbody></table></div><p class="fixture">Representative hosted-route fixtures · p50 · streaming · 1× concurrency · observed 15 Aug 2026</p>`;
  }

  function renderFilterState() {
    $$('#access-filter [data-access]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.access === accessFilter)));
    $('#provider-filter-value').textContent = providerFilters.size === 0 ? 'All providers' : providerFilters.size === 1 ? [...providerFilters][0] : `${providerFilters.size} selected`;
    $('#provider-filter-toggle').setAttribute('aria-label', `Filter by provider, ${providerLabel()}`);
    $('#cards').setAttribute('aria-pressed', String(view === 'cards'));
    $('#rows').setAttribute('aria-pressed', String(view === 'rows'));
  }

  function renderRankingModelPicker() {
    const addedModels = addedModelIds.map(id => TB_MODELS.find(model => model.id === id)).filter(Boolean);
    const addedRoot = $('#ranking-added-models');
    addedRoot.innerHTML = addedModels.length ? `<span class="label ranking-added-models-label">Added models</span>${selectedModelChips(addedModels)}` : '';
    bindComparisonRemovals(addedRoot, id => {
      addedModelIds = addedModelIds.filter(candidate => candidate !== id);
      renderPage(false);
    });
    mountModelPicker($('#ranking-model-picker-host'), {
      id: 'ranking-model-picker',
      selectedIds: addedModelIds,
      excludedIds: defaultCandidates().map(model => model.id),
      max: TB_MODELS.length,
      reopenAfterAdd: false,
      onAdd: id => {
        addedModelIds = normalizeModelIds([...addedModelIds, id], TB_MODELS.length);
        renderPage(false);
      }
    });
  }

  function renderPage() {
    initSliders();
    syncControls();
    renderFilterState();

    const valid = sumWeights() > 0;
    filteredCandidates = valid ? currentCandidates() : [];
    const qualified = filteredCandidates.filter(meetsSla);
    visibleModels = showExcluded ? filteredCandidates : qualified;
    $('#zero').hidden = valid;
    renderRankingModelPicker();

    if (valid && visibleModels.length) {
      horizontal('ranking', visibleModels, model => score(model), 'Composite', meetsSla);
      $('#rank-alt').innerHTML = table(visibleModels, { costMode: 'input-output' });
      renderOutput(visibleModels);
    } else {
      if (typeof Chart !== 'undefined') Chart.getChart($('#ranking'))?.destroy();
      const message = !valid ? 'Ranking is paused until at least one capability weight is above zero.' : !filteredCandidates.length ? `No top-20 candidates match ${accessLabel()} and ${providerLabel()}.` : 'No candidates meet both SLA thresholds. Show outside-SLA models or loosen a threshold.';
      $('#rank-alt').innerHTML = emptyState(message);
      $('#output').innerHTML = emptyState(message);
    }
    renderWeightedInsights(visibleModels);

    $('#pass').textContent = `${qualified.length} / ${filteredCandidates.length} pass`;
    if (filteredCandidates.length) {
      horizontal('ttft-chart', [...filteredCandidates].sort((a, b) => a.ttft - b.ttft), model => model.ttft, 'TTFT', model => model.ttft <= ttft);
      horizontal('tps-chart', [...filteredCandidates].sort((a, b) => b.tps - a.tps), model => model.tps, 'TPS', model => model.tps >= tps);
    } else if (typeof Chart !== 'undefined') {
      Chart.getChart($('#ttft-chart'))?.destroy();
      Chart.getChart($('#tps-chart'))?.destroy();
    }

    $('#ttftv').textContent = `≤ ${ttft.toFixed(2)}s`;
    $('#tpsv').textContent = `≥ ${tps} tok/s`;
    renderSlaTable(filteredCandidates);

    const filterPhrase = `${accessLabel()} · ${providerLabel()}`;
    if (!valid) {
      $('#rank-status').textContent = 'Live result paused because all six weights are zero.';
    } else if (!filteredCandidates.length) {
      $('#rank-status').textContent = `No top-20 candidates match ${filterPhrase}. Reset a filter to recover.`;
    } else if (!visibleModels.length) {
      $('#rank-status').textContent = `No candidates meet both SLA thresholds. ${filteredCandidates.length} match ${filterPhrase}.`;
    } else {
      $('#rank-status').textContent = `Live result: ${visibleModels[0].name} leads at ${score(visibleModels[0]).toFixed(1)}. Showing ${visibleModels.length} of ${filteredCandidates.length} filtered candidates; ${qualified.length} ${qualified.length === 1 ? 'meets' : 'meet'} both SLA thresholds. ${filterPhrase}.`;
    }

    $('#weight-summary').textContent = domains.map(domain => `${domain} ${formatWeight(TB.weights[domain])}`).join(' · ');
    renderLeaderboardCompare();
  }

  function renderProviderOptions(query = '') {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const options = [
      { value: 'all', label: 'All providers', count: TB_MODELS.length },
      ...providers.map(provider => ({ value: provider, label: provider, count: TB_MODELS.filter(model => model.provider === provider).length }))
    ].filter(option => option.label.toLocaleLowerCase().includes(normalizedQuery));

    $('#provider-filter-options').innerHTML = options.length ? options.map((option, index) => {
      const selected = option.value === 'all' ? providerFilters.size === 0 : providerFilters.has(option.value);
      const modelCopy = `${option.count} model${option.count === 1 ? '' : 's'} available`;
      return `<button class="provider-filter-option compare-model-picker-option" id="provider-filter-option-${index}" type="button" role="option" aria-selected="${selected}" data-provider="${escapeHtml(option.value)}"><span><strong>${escapeHtml(option.label)}</strong><small>${modelCopy}</small></span><small>${option.count}</small></button>`;
    }).join('') : '<p class="compare-model-picker-empty provider-filter-empty">No providers match this search.</p>';
    $('#provider-filter-status').textContent = `${providers.length} providers available · ${providerFilters.size || 'all'} selected.`;
  }

  function closeProviderFilter({ restoreFocus = false } = {}) {
    $('#provider-filter-panel').hidden = true;
    $('#provider-filter-toggle').setAttribute('aria-expanded', 'false');
    $('#provider-filter-search').setAttribute('aria-expanded', 'false');
    $('#provider-filter-search').removeAttribute('aria-activedescendant');
    if (restoreFocus) $('#provider-filter-toggle').focus();
  }

  function selectProvider(value) {
    if (value === 'all') providerFilters.clear();
    else if (providerFilters.has(value)) providerFilters.delete(value);
    else providerFilters.add(value);
    renderProviderOptions($('#provider-filter-search').value);
    renderPage(false);
  }

  function setupProviderFilter() {
    const toggle = $('#provider-filter-toggle');
    const panel = $('#provider-filter-panel');
    const search = $('#provider-filter-search');
    renderProviderOptions();

    toggle.addEventListener('click', () => {
      const opening = panel.hidden;
      panel.hidden = !opening;
      toggle.setAttribute('aria-expanded', String(opening));
      search.setAttribute('aria-expanded', String(opening));
      if (opening) {
        search.value = '';
        renderProviderOptions();
        requestAnimationFrame(() => search.focus());
      }
    });
    search.addEventListener('input', () => renderProviderOptions(search.value));
    search.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
      const options = $$('#provider-filter-options [data-provider]');
      if (!options.length) return;
      event.preventDefault();
      if (event.key === 'Enter' && options.length === 1) selectProvider(options[0].dataset.provider);
      else (event.key === 'ArrowUp' ? options.at(-1) : options[0]).focus();
    });
    $('#provider-filter-options').addEventListener('click', event => {
      const option = event.target.closest('[data-provider]');
      if (!option) return;
      selectProvider(option.dataset.provider);
    });
    $('#provider-filter-options').addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
      const options = $$('#provider-filter-options [data-provider]');
      const currentIndex = options.indexOf(document.activeElement);
      if (currentIndex < 0) return;
      event.preventDefault();
      if (event.key === 'Enter' || event.key === ' ') selectProvider(options[currentIndex].dataset.provider);
      else if (event.key === 'Home') options[0]?.focus();
      else if (event.key === 'End') options.at(-1)?.focus();
      else if (event.key === 'ArrowDown') (options[currentIndex + 1] || options[0])?.focus();
      else (options[currentIndex - 1] || search).focus();
    });
    document.addEventListener('pointerdown', event => {
      if (!panel.hidden && !$('#provider-filter').contains(event.target)) closeProviderFilter();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) closeProviderFilter({ restoreFocus: true });
    });
  }

  function resetLeaderboardFilters() {
    accessFilter = 'all';
    providerFilters.clear();
    addedModelIds = [];
    showExcluded = true;
    $('#provider-filter-search').value = '';
    renderProviderOptions();
    renderPage(false);
    announce('Filters reset. Showing the full top-20 candidate set.');
  }

  function shareUrl(anchor = 'weighted-ranking') {
    const url = new URL(location.origin + location.pathname);
    url.searchParams.set('access', accessFilter);
    if (providerFilters.size) url.searchParams.set('provider', [...providerFilters].join(','));
    if (addedModelIds.length) url.searchParams.set('models', addedModelIds.join(','));
    url.searchParams.set('outside', showExcluded ? '1' : '0');
    url.searchParams.set('ttft', ttft.toFixed(2));
    url.searchParams.set('tps', String(tps));
    url.searchParams.set('view', view);
    url.searchParams.set('weights', domains.map(domain => `${domain}:${Number(TB.weights[domain]).toFixed(2)}`).join(','));
    url.hash = anchor;
    return url;
  }

  function announce(message, error = false) {
    const status = $('#leaderboard-action-status');
    status.textContent = message;
    status.classList.toggle('is-error', error);
  }

  function fallbackCopy(text) {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    if (!copied) throw new Error('Copy was not available');
  }

  async function copyLeaderboardLink() {
    const url = shareUrl();
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url.href);
      else fallbackCopy(url.href);
      history.replaceState(null, '', url);
      announce('Link copied with the current filters, weights, thresholds, and view.');
    } catch {
      announce('The link could not be copied. Copy the address from the browser bar instead.', true);
    }
  }

  async function copyWeightedInsightLink() {
    const url = shareUrl('weighted-score-cost');
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url.href);
      else fallbackCopy(url.href);
      history.replaceState(null, '', url);
      announce('Weighted score insight link copied with the current visible result set.');
    } catch {
      announce('The weighted score insight link could not be copied. Copy the address from the browser bar instead.', true);
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const linkElement = document.createElement('a');
    linkElement.href = url;
    linkElement.download = filename;
    document.body.append(linkElement);
    linkElement.click();
    linkElement.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function csvCell(value) {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function downloadCsv() {
    if (!visibleModels.length) {
      announce('There are no visible models to export. Reset a filter or show outside-SLA models.', true);
      return;
    }
    const headers = ['Rank', 'Model', 'Provider', 'Access', 'Composite', 'TTFT seconds', 'Throughput tok/s', 'Input per 1M', 'Output per 1M', 'Context', 'SLA result'];
    const rows = visibleModels.map((model, index) => [index + 1, model.name, model.provider, isOpenWeight(model) ? 'Open weight' : 'Closed', score(model).toFixed(1), model.ttft.toFixed(2), model.tps, model.inputPrice.toFixed(2), model.outputPrice.toFixed(2), model.context, meetsSla(model) ? 'Pass' : 'Outside threshold']);
    const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
    downloadBlob(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }), `tokenbench-top-20-${new Date().toISOString().slice(0, 10)}.csv`);
    announce(`CSV downloaded with ${visibleModels.length} visible model${visibleModels.length === 1 ? '' : 's'}.`);
  }

  function downloadWeightedInsightCsv() {
    if (!visibleModels.length) {
      announce('There are no weighted score insights to export. Reset a filter or show outside-SLA models.', true);
      return;
    }
    const frontierIds = new Set(weightedFrontier(visibleModels).map(model => model.id));
    const headers = ['Cost rank', 'Model', 'Provider', 'Weighted score', 'Blended $ per 1M', 'Weighted frontier', 'SLA result'];
    const rows = [...visibleModels]
      .sort((left, right) => left.cost - right.cost)
      .map((model, index) => [index + 1, model.name, model.provider, score(model).toFixed(1), model.cost.toFixed(2), frontierIds.has(model.id) ? 'Yes' : 'No', meetsSla(model) ? 'Pass' : 'Outside threshold']);
    const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
    downloadBlob(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }), `tokenbench-weighted-score-cost-${new Date().toISOString().slice(0, 10)}.csv`);
    announce(`Weighted score and cost CSV downloaded with ${visibleModels.length} visible model${visibleModels.length === 1 ? '' : 's'}.`);
  }

  function drawChartPanel(context, source, label, x, y, width) {
    const root = getComputedStyle(document.documentElement);
    const panel = root.getPropertyValue('--panel').trim();
    const line = root.getPropertyValue('--line').trim();
    const ink = root.getPropertyValue('--ink').trim();
    const inset = 24;
    const labelHeight = 58;
    const chartWidth = width - inset * 2;
    const chartHeight = Math.max(280, Math.round(source.height / source.width * chartWidth));
    const height = labelHeight + chartHeight + inset;
    context.fillStyle = panel;
    context.beginPath();
    context.roundRect(x, y, width, height, 12);
    context.fill();
    context.strokeStyle = line;
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = ink;
    context.font = '700 24px system-ui, sans-serif';
    context.fillText(label, x + inset, y + 36);
    context.drawImage(source, x + inset, y + labelHeight, chartWidth, chartHeight);
    return height;
  }

  async function downloadPng() {
    const button = $('#download-leaderboard-png');
    if (!visibleModels.length) {
      announce('There are no visible models to render. Reset a filter or show outside-SLA models.', true);
      return;
    }
    if (typeof Chart === 'undefined') {
      announce('Chart.js is unavailable. Download the CSV for exact values instead.', true);
      return;
    }

    const rankingCanvas = $('#ranking');
    const ttftCanvas = $('#ttft-chart');
    const tpsCanvas = $('#tps-chart');
    if (![rankingCanvas, ttftCanvas, tpsCanvas].every(canvas => Chart.getChart(canvas))) {
      announce('The chart image is not ready yet. Try again after the charts finish rendering.', true);
      return;
    }

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    announce('Preparing PNG…');
    try {
      [rankingCanvas, ttftCanvas, tpsCanvas].forEach(canvas => Chart.getChart(canvas)?.update('none'));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const root = getComputedStyle(document.documentElement);
      const canvasColor = root.getPropertyValue('--canvas').trim();
      const ink = root.getPropertyValue('--ink').trim();
      const muted = root.getPropertyValue('--muted').trim();
      const exportCanvas = document.createElement('canvas');
      const context = exportCanvas.getContext('2d');
      const width = 1200;
      const padding = 48;
      const gap = 24;
      const contentWidth = width - padding * 2;
      const serviceWidth = (contentWidth - gap) / 2;
      const headerHeight = 170;
      const rankingHeight = 58 + Math.max(280, Math.round(rankingCanvas.height / rankingCanvas.width * (contentWidth - 48))) + 24;
      const ttftHeight = 58 + Math.max(280, Math.round(ttftCanvas.height / ttftCanvas.width * (serviceWidth - 48))) + 24;
      const tpsHeight = 58 + Math.max(280, Math.round(tpsCanvas.height / tpsCanvas.width * (serviceWidth - 48))) + 24;
      exportCanvas.width = width;
      exportCanvas.height = padding + headerHeight + rankingHeight + gap + Math.max(ttftHeight, tpsHeight) + padding;

      context.fillStyle = canvasColor;
      context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      context.fillStyle = ink;
      context.font = '800 42px system-ui, sans-serif';
      context.fillText('TokenBench — Make it yours', padding, padding + 46);
      context.fillStyle = muted;
      context.font = '600 22px ui-monospace, monospace';
      context.fillText(`${accessLabel()} · ${providerLabel()} · ${visibleModels.length} visible`, padding, padding + 88);
      context.fillText(`TTFT ≤ ${ttft.toFixed(2)}s · throughput ≥ ${tps} tok/s · illustrative prototype data`, padding, padding + 124);

      const rankingY = padding + headerHeight;
      const renderedRankingHeight = drawChartPanel(context, rankingCanvas, 'Weighted composite', padding, rankingY, contentWidth);
      const serviceY = rankingY + renderedRankingHeight + gap;
      drawChartPanel(context, ttftCanvas, 'TTFT (seconds)', padding, serviceY, serviceWidth);
      drawChartPanel(context, tpsCanvas, 'Output speed (tok/s)', padding + serviceWidth + gap, serviceY, serviceWidth);

      const blob = await new Promise((resolve, reject) => exportCanvas.toBlob(result => result ? resolve(result) : reject(new Error('PNG encoding failed')), 'image/png'));
      downloadBlob(blob, `tokenbench-top-20-${new Date().toISOString().slice(0, 10)}.png`);
      announce(`PNG downloaded with ${visibleModels.length} visible model${visibleModels.length === 1 ? '' : 's'}.`);
    } catch {
      announce('The PNG could not be generated. Download the CSV for exact values instead.', true);
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }

  async function downloadWeightedInsightPng() {
    const button = $('#download-weighted-insight-png');
    if (!visibleModels.length) {
      announce('There are no weighted score insights to render. Reset a filter or show outside-SLA models.', true);
      return;
    }
    if (typeof Chart === 'undefined') {
      announce('Chart.js is unavailable. Download the weighted score CSV for exact values instead.', true);
      return;
    }

    const scatterCanvas = $('#weighted-score-cost-chart');
    const costCanvas = $('#weighted-cost-ranking-chart');
    if (![scatterCanvas, costCanvas].every(canvas => Chart.getChart(canvas))) {
      announce('The weighted score chart image is not ready yet. Try again after the charts finish rendering.', true);
      return;
    }

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    announce('Preparing weighted score PNG…');
    try {
      [scatterCanvas, costCanvas].forEach(canvas => Chart.getChart(canvas)?.update('none'));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const root = getComputedStyle(document.documentElement);
      const canvasColor = root.getPropertyValue('--canvas').trim();
      const ink = root.getPropertyValue('--ink').trim();
      const muted = root.getPropertyValue('--muted').trim();
      const exportCanvas = document.createElement('canvas');
      const context = exportCanvas.getContext('2d');
      const width = 1200;
      const padding = 48;
      const gap = 24;
      const contentWidth = width - padding * 2;
      const headerHeight = 150;
      const panelHeight = source => 58 + Math.max(280, Math.round(source.height / source.width * (contentWidth - 48))) + 24;
      exportCanvas.width = width;
      exportCanvas.height = padding + headerHeight + panelHeight(scatterCanvas) + gap + panelHeight(costCanvas) + padding;

      context.fillStyle = canvasColor;
      context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      context.fillStyle = ink;
      context.font = '800 42px system-ui, sans-serif';
      context.fillText('TokenBench — Weighted score vs. cost', padding, padding + 46);
      context.fillStyle = muted;
      context.font = '600 22px ui-monospace, monospace';
      context.fillText(`${visibleModels.length} visible · ${weightedFrontier(visibleModels).length} weighted frontier · illustrative prototype data`, padding, padding + 88);
      context.fillText(`${accessLabel()} · ${providerLabel()} · TTFT ≤ ${ttft.toFixed(2)}s · throughput ≥ ${tps} tok/s`, padding, padding + 124);

      const scatterY = padding + headerHeight;
      const renderedScatterHeight = drawChartPanel(context, scatterCanvas, 'Weighted score versus blended cost', padding, scatterY, contentWidth);
      drawChartPanel(context, costCanvas, 'Weighted score, cheapest first', padding, scatterY + renderedScatterHeight + gap, contentWidth);

      const blob = await new Promise((resolve, reject) => exportCanvas.toBlob(result => result ? resolve(result) : reject(new Error('PNG encoding failed')), 'image/png'));
      downloadBlob(blob, `tokenbench-weighted-score-cost-${new Date().toISOString().slice(0, 10)}.png`);
      announce(`Weighted score and cost PNG downloaded with ${visibleModels.length} visible model${visibleModels.length === 1 ? '' : 's'}.`);
    } catch {
      announce('The weighted score PNG could not be generated. Download the CSV for exact values instead.', true);
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }

  parseSharedState();
  initSliders();
  setupProviderFilter();

  $('#ttft').addEventListener('input', event => { ttft = Number(event.target.value); renderPage(false); });
  $('#tps').addEventListener('input', event => { tps = Number(event.target.value); renderPage(false); });
  $('#reset').addEventListener('click', () => { domains.forEach(domain => { TB.weights[domain] = 100 / domains.length; }); renderPage(false); });
  $('#cards').addEventListener('click', () => { view = 'cards'; renderPage(false); });
  $('#rows').addEventListener('click', () => { view = 'rows'; renderPage(false); });
  $('#show-excluded').addEventListener('change', event => { showExcluded = event.target.checked; renderPage(false); });
  $('#clear').addEventListener('click', () => { TB.selected = []; renderPage(false); });
  $('#access-filter').addEventListener('click', event => {
    const button = event.target.closest('[data-access]');
    if (!button) return;
    accessFilter = button.dataset.access;
    renderProviderOptions($('#provider-filter-search').value);
    renderPage(false);
  });
  document.addEventListener('click', event => {
    if (event.target.closest('[data-reset-leaderboard-filters]')) resetLeaderboardFilters();
  });
  $('#copy-leaderboard-link').addEventListener('click', copyLeaderboardLink);
  $('#download-leaderboard-csv').addEventListener('click', downloadCsv);
  $('#download-leaderboard-png').addEventListener('click', downloadPng);
  $('#copy-weighted-insight-link').addEventListener('click', copyWeightedInsightLink);
  $('#download-weighted-insight-csv').addEventListener('click', downloadWeightedInsightCsv);
  $('#download-weighted-insight-png').addEventListener('click', downloadWeightedInsightPng);

  window.renderPage = renderPage;
  renderPage();
})();

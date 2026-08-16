const MAX_COMPARE_MODELS=4;
// Keep the self-contained prototype shell pointed at the combined preview
// routes. These are intentionally separate from the production React route
// contracts so a preview click never leaves the preview deployment.
const PREVIEW_PATHS={home:'/',models:'/#catalog',compare:'/compare',modelProfile:'/model-profile',modelLifecycle:'/model-lifecycle',popularModels:'/popular-models/',makeItYours:'/make-it-yours',guides:'/guides/',articles:'/articles',calculator:'/tools/subscriptions-vs-apis/',pricePerformance:'/llm-price-performance/',methodology:'/methodology/benchalign/',privacy:'/privacy/'};
const previewModelProfilePath=slug=>`${PREVIEW_PATHS.modelProfile}?model=${encodeURIComponent(slug)}`;
const TB={charts:[],weights:{agentic:20,coding:20,reasoning:20,math:15,multimodal:15,throughput:10},selected:[],theme:localStorage.tbTheme||'light'};
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
function domainScore(m,key){return key==='throughput'?Math.min(100,m.tps/120*100):m[key]}
function score(m,w=TB.weights){let sum=Object.values(w).reduce((a,b)=>a+b,0);return sum?Object.entries(w).reduce((n,[k,v])=>n+domainScore(m,k)*v,0)/sum:null}
function colors(){let s=getComputedStyle(document.documentElement),read=name=>s.getPropertyValue(name).trim();return{ink:read('--ink'),muted:read('--muted'),line:read('--line'),plum:read('--plum'),accentText:read('--accent-text')||read('--plum')}}
function chart(canvas,config){if(!canvas)return null;if(typeof Chart==='undefined'){canvas.hidden=true;if(!canvas.parentElement.querySelector('.chart-failure'))canvas.insertAdjacentHTML('afterend','<p class="empty chart-failure" role="status">Chart.js did not load. Use the exact evidence table on this page.</p>');return null}canvas.hidden=false;canvas.parentElement.querySelector('.chart-failure')?.remove();let old=Chart.getChart(canvas);if(old)old.destroy();config.options={responsive:true,maintainAspectRatio:false,animation:matchMedia('(prefers-reduced-motion: reduce)').matches?false:{duration:250},...config.options};return new Chart(canvas,config)}
function setupShell(){document.documentElement.dataset.theme=TB.theme;let current=location.pathname.split('/').pop()||'index.html',theme=$('#theme');if(current==='article-hybrid-router.html'||current==='article-hybrid-router'){let metadata=$('article header .label'),fixture=$('article header .fixture');if(metadata)metadata.textContent='Guide · Published 12 Aug 2026 · Updated 15 Aug 2026 · Review status: current';if(fixture&&!$('#article-evidence-cue'))fixture.insertAdjacentHTML('afterend','<p id="article-evidence-cue" class="fixture">Evidence cue · route-price and SLA fixtures observed 15 Aug 2026 · sources itemized below</p>')}if(theme){let syncTheme=()=>{let dark=TB.theme==='dark';theme.textContent='Theme';theme.setAttribute('aria-pressed',String(dark));theme.setAttribute('aria-label',dark?'Switch to light theme':'Switch to dark theme')};syncTheme();theme.addEventListener('click',()=>{TB.theme=TB.theme==='dark'?'light':'dark';localStorage.tbTheme=TB.theme;document.documentElement.dataset.theme=TB.theme;syncTheme();window.renderPage?.()})}}
const baseShellSetup=setupShell;setupShell=function(){baseShellSetup();if((location.pathname.endsWith('article-hybrid-router.html')||location.pathname.endsWith('/article-hybrid-router'))&&!$('#mobile-toc')){let header=$('article header');header?.insertAdjacentHTML('afterend','<details id="mobile-toc" class="mobile-toc panel soft"><summary>On this page</summary><nav aria-label="Article sections"><a href="#question">Decision question</a><a href="#recommendation">Recommendation</a><a href="#assumptions">Assumptions</a><a href="#evidence">Evidence framing</a><a href="#cost">Cost comparison</a><a href="#matrix">Decision matrix</a><a href="#next">Internal tools</a></nav></details>')}};function link(m){return `<a class="model-name" href="${previewModelProfilePath(m.id)}">${m.name}</a>`}
function modelOptions(){return TB_MODELS.map(m=>`<option value="${m.id}">${m.name} — ${m.provider}</option>`).join('')}
function radar(canvas,models){let c=colors(),keys=['agentic','coding','reasoning','math','multimodal','throughput'],series=[{color:c.plum,dash:[],point:'circle'},{color:'#f97316',dash:[7,3],point:'rectRounded'},{color:'#10b981',dash:[2,3],point:'triangle'},{color:'#d946ef',dash:[10,3,2,3],point:'rectRot'}];return chart(canvas,{type:'radar',data:{labels:['Agentic','Coding','Reasoning','Math','Multimodal','Throughput'],datasets:models.map((m,i)=>{let style=series[i%series.length];return{label:m.name,data:keys.map(k=>domainScore(m,k)),borderColor:style.color,backgroundColor:style.color+'20',borderDash:style.dash,pointStyle:style.point,pointRadius:3,borderWidth:2}})},options:{plugins:{legend:{labels:{color:c.muted,font:{size:11},usePointStyle:true,boxWidth:10,padding:12}}},scales:{r:{min:45,max:100,ticks:{display:false},grid:{color:c.line},angleLines:{color:c.line},pointLabels:{color:c.muted,font:{size:10}}}}}})}
function normalizeModelIds(ids,max=MAX_COMPARE_MODELS){let known=new Set((window.TB_MODELS||[]).map(model=>model.id)),seen=new Set();return (ids||[]).filter(id=>{if(!known.has(id)||seen.has(id))return false;seen.add(id);return true}).slice(0,max)}
function table(models,{showCompare=true,ariaLabel='Ranked model evidence',costMode='blended'}={}){let compareHead=showCompare?'<th scope="col">Compare</th>':'',compareCell=m=>showCompare?`<td><button class="toggle compare" aria-pressed="${TB.selected.includes(m.id)}" data-id="${m.id}">${TB.selected.includes(m.id)?'Selected':'Compare'}</button></td>`:'',costHead=costMode==='input-output'?'$ Cost In/Out':'Blended $/1M',costCell=m=>costMode==='input-output'?`$${m.inputPrice.toFixed(2)} / $${m.outputPrice.toFixed(2)}`:`$${m.cost.toFixed(2)}`;return `<div class="table-wrap" role="region" aria-label="${ariaLabel}" tabindex="0"><table><thead><tr><th scope="col">Rank</th><th scope="col">Model / profile</th><th scope="col">Provider</th><th scope="col">Composite</th><th scope="col">${costHead}</th><th scope="col">TTFT</th><th scope="col">Throughput</th><th scope="col">Lifecycle</th>${compareHead}</tr></thead><tbody>${models.map((m,i)=>`<tr><td>${i+1}</td><th scope="row">${link(m)}</th><td><span class="provider-dot" style="background:${m.color}"></span>${m.provider}</td><td>${score(m).toFixed(1)}</td><td>${costCell(m)}</td><td>${m.ttft}s</td><td>${m.tps} tok/s</td><td>${m.lifecycle||'Not reported'}</td>${compareCell(m)}</tr>`).join('')}</tbody></table></div>`}
function modelCard(m,{rank=null}={}){let selected=TB.selected.includes(m.id),meta=rank?`#${rank} · ${m.provider}`:`<span class="provider-dot" style="background:${m.color}"></span>${m.provider} · ${m.access}`;return `<article class="panel rank-card model-card"><span class="tag">${meta}</span><h3 class="subhead rank-card-title">${link(m)}</h3><button class="toggle compare rank-card-compare" aria-pressed="${selected}" aria-label="${selected?'Remove':'Add'} ${m.name} ${selected?'from':'to'} comparison" data-id="${m.id}">${selected?'Selected':'Compare'}</button><div class="metrics rank-metrics"><div class="metric"><span class="label">Score</span><b>${score(m).toFixed(1)}</b></div><div class="metric"><span class="label">TTFT</span><b>${m.ttft}s</b></div><div class="metric"><span class="label">TPS</span><b>${m.tps}</b></div><div class="metric"><span class="label">Input / 1M</span><b>$${m.inputPrice.toFixed(2)}</b></div><div class="metric"><span class="label">Output / 1M</span><b>$${m.outputPrice.toFixed(2)}</b></div><div class="metric"><span class="label">Context</span><b>${m.context}</b></div></div></article>`}
const compareRoots=new WeakSet();function bindCompare(root=document){if(compareRoots.has(root))return;compareRoots.add(root);root.addEventListener('click',event=>{let b=event.target.closest?.('.compare');if(!b||!root.contains(b))return;let id=b.dataset.id,target=root===document?document.body:root;$('.compare-limit',target)?.remove();TB.selected=normalizeModelIds(TB.selected);if(TB.selected.includes(id)){TB.selected=TB.selected.filter(x=>x!==id)}else if(TB.selected.length<MAX_COMPARE_MODELS){TB.selected.push(id)}else{target.insertAdjacentHTML('afterbegin','<p class="error compare-limit" role="status">Comparison is limited to four models. Remove one selected model before adding another.</p>');return}window.renderPage?.()})}

function compareHtml(value){return String(value).replace(/[&<>'"]/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[character])}

function comparisonDecisionRows(models){
  const rankById=new Map(models.map((model,index)=>[model.id,index+1]));
  return [
    ['Rank',model=>`#${rankById.get(model.id)}`],
    ['Provider',model=>`<span class="provider-dot" style="background:${compareHtml(model.color)}"></span>${compareHtml(model.provider)}`],
    ['Composite',model=>score(model).toFixed(1)],
    ['Input / output · $/1M',model=>`$${model.inputPrice.toFixed(2)} / $${model.outputPrice.toFixed(2)}`],
    ['Blended cost · $/1M',model=>`$${model.cost.toFixed(2)}`],
    ['TTFT',model=>`${model.ttft}s`],
    ['Throughput',model=>`${model.tps} tok/s`],
    ['Context window',model=>compareHtml(model.context)],
    ['Lifecycle',model=>compareHtml(model.lifecycle||'Not reported')]
  ];
}

function comparisonMatrix(models,rows,{ariaLabel='Selected model comparison',id='comparison-matrix',allowRemove=false}={}){
  if(!models.length)return '<p class="empty">Select models to compare.</p>';
  const modelHeading=model=>`<div class="comparison-model-heading"><span class="comparison-model-provider"><span class="provider-dot" style="background:${compareHtml(model.color)}"></span>${compareHtml(model.provider)}</span>${link(model)}${allowRemove?`<button class="text-action comparison-remove-model" type="button" data-remove-comparison-model="${compareHtml(model.id)}" aria-label="Remove ${compareHtml(model.name)} from comparison">${shellIcons.close}<span>Remove</span></button>`:''}</div>`;
  const tableRows=rows.map(([label,value])=>`<tr><th scope="row">${compareHtml(label)}</th>${models.map(model=>`<td>${value(model)}</td>`).join('')}</tr>`).join('');
  const mobileRows=rows.map(([label,value])=>`<section class="comparison-metric-card" role="listitem"><h4>${compareHtml(label)}</h4><dl>${models.map(model=>`<div><dt>${link(model)}</dt><dd>${value(model)}</dd></div>`).join('')}</dl></section>`).join('');
  return `<div class="comparison-matrix" style="--comparison-model-count:${models.length}"><div class="comparison-matrix-scroll table-wrap" role="region" aria-label="${compareHtml(ariaLabel)}" aria-describedby="${compareHtml(id)}-scroll-help" tabindex="0"><table><thead><tr><th class="comparison-metric-column" scope="col">Metric</th>${models.map(model=>`<th scope="col">${modelHeading(model)}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table></div><p class="sr-only" id="${compareHtml(id)}-scroll-help">Scroll horizontally to view every selected model.</p><div class="comparison-matrix-mobile" role="list" aria-label="${compareHtml(ariaLabel)} by metric">${mobileRows}</div></div>`;
}

function selectedModelChips(models,{removable=true}={}){
  return models.map(model=>`<span class="compare-model-chip" role="listitem"><a class="model-name" href="${previewModelProfilePath(model.id)}">${compareHtml(model.name)}</a>${removable?`<button type="button" data-remove-comparison-model="${compareHtml(model.id)}" aria-label="Remove ${compareHtml(model.name)} from comparison" title="Remove ${compareHtml(model.name)}">${shellIcons.close}</button>`:''}</span>`).join('');
}

const comparisonRemovalControllers=new WeakMap();
function bindComparisonRemovals(root,onRemove){
  comparisonRemovalControllers.get(root)?.abort();
  const controller=new AbortController();
  comparisonRemovalControllers.set(root,controller);
  root.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-remove-comparison-model]');
    if(!button||!root.contains(button))return;
    onRemove(button.dataset.removeComparisonModel);
  },{signal:controller.signal});
}

const modelPickerControllers=new WeakMap();
function mountModelPicker(root,{id,selectedIds,onAdd,max=MAX_COMPARE_MODELS}={}){
  modelPickerControllers.get(root)?.abort();
  const controller=new AbortController();
  modelPickerControllers.set(root,controller);
  const selected=normalizeModelIds(selectedIds,max);
  const available=TB_MODELS.filter(model=>!selected.includes(model.id));
  const atLimit=selected.length>=max;
  const limitCopy=`${selected.length} of ${max} models selected${atLimit?'; remove a model to add another.':'.'}`;
  root.innerHTML=`<div class="compare-model-picker" id="${compareHtml(id)}"><button class="button compare-model-picker-toggle${atLimit?' is-disabled':''}" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="${compareHtml(id)}-panel" aria-disabled="${atLimit}" title="${compareHtml(atLimit?limitCopy:'Search and add a model')}">${shellIcons.plus}<span>Add a model</span></button><div class="compare-model-picker-panel" id="${compareHtml(id)}-panel" role="dialog" aria-label="Add a model" hidden><label class="compare-model-picker-search">${shellIcons.search}<span class="sr-only">Search models or providers</span><input type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${compareHtml(id)}-options" autocomplete="off" placeholder="Search models or providers"></label><div class="compare-model-picker-options" id="${compareHtml(id)}-options" role="listbox" aria-label="Available models"></div><p class="compare-model-picker-status" role="status" aria-live="polite"></p></div><p class="sr-only compare-model-picker-limit" aria-live="polite">${compareHtml(limitCopy)}</p></div>`;
  const picker=$('.compare-model-picker',root);
  const toggle=$('.compare-model-picker-toggle',picker);
  const panel=$('.compare-model-picker-panel',picker);
  const input=$('input',picker);
  const optionsRoot=$('.compare-model-picker-options',picker);
  const status=$('.compare-model-picker-status',picker);
  let matches=[];
  let activeIndex=-1;

  const setActive=index=>{
    const optionButtons=$$('[role=option]',optionsRoot);
    activeIndex=optionButtons.length?Math.max(0,Math.min(index,optionButtons.length-1)):-1;
    optionButtons.forEach((button,buttonIndex)=>button.setAttribute('aria-selected',String(buttonIndex===activeIndex)));
    const active=optionButtons[activeIndex];
    input.setAttribute('aria-activedescendant',active?.id||'');
    active?.scrollIntoView({block:'nearest'});
  };
  const renderOptions=()=>{
    const query=input.value.trim().toLowerCase();
    matches=available.filter(model=>`${model.name} ${model.provider} ${model.access}`.toLowerCase().includes(query));
    optionsRoot.innerHTML=matches.length?matches.map((model,index)=>`<button class="compare-model-picker-option" id="${compareHtml(id)}-option-${index}" type="button" role="option" aria-selected="false" data-add-comparison-model="${compareHtml(model.id)}"><span><strong>${compareHtml(model.name)}</strong><small>${compareHtml(model.provider)} · ${compareHtml(model.access)}</small></span><span class="provider-dot" style="background:${compareHtml(model.color)}"></span></button>`).join(''):`<p class="compare-model-picker-empty">${query?'No models match this search.':'Every available model is already selected.'}</p>`;
    status.textContent=matches.length?`${matches.length} model${matches.length===1?'':'s'} available.`:'No models available.';
    setActive(matches.length?0:-1);
  };
  const close=({restoreFocus=false}={})=>{
    panel.hidden=true;
    toggle.setAttribute('aria-expanded','false');
    input.setAttribute('aria-expanded','false');
    input.setAttribute('aria-activedescendant','');
    if(restoreFocus)toggle.focus();
  };
  const open=()=>{
    if(atLimit){$('.compare-model-picker-limit',picker).textContent=limitCopy;return}
    panel.hidden=false;
    toggle.setAttribute('aria-expanded','true');
    input.setAttribute('aria-expanded','true');
    input.value='';
    renderOptions();
    requestAnimationFrame(()=>input.focus());
  };
  const choose=modelId=>{
    if(!modelId||selected.includes(modelId)||selected.length>=max)return;
    close();
    onAdd(modelId);
    requestAnimationFrame(()=>{
      const nextPicker=document.getElementById(id);
      const nextToggle=$('.compare-model-picker-toggle',nextPicker);
      if(nextToggle?.getAttribute('aria-disabled')==='false')nextToggle.click();
      else nextToggle?.focus();
    });
  };

  toggle.addEventListener('click',()=>panel.hidden?open():close({restoreFocus:true}),{signal:controller.signal});
  input.addEventListener('input',renderOptions,{signal:controller.signal});
  input.addEventListener('keydown',event=>{
    if(event.key==='ArrowDown'){event.preventDefault();setActive(activeIndex+1)}
    else if(event.key==='ArrowUp'){event.preventDefault();setActive(activeIndex-1)}
    else if(event.key==='Home'){event.preventDefault();setActive(0)}
    else if(event.key==='End'){event.preventDefault();setActive(matches.length-1)}
    else if(event.key==='Enter'&&activeIndex>=0){event.preventDefault();choose(matches[activeIndex]?.id)}
    else if(event.key==='Escape'){event.preventDefault();close({restoreFocus:true})}
  },{signal:controller.signal});
  optionsRoot.addEventListener('click',event=>choose(event.target.closest?.('[data-add-comparison-model]')?.dataset.addComparisonModel),{signal:controller.signal});
  document.addEventListener('pointerdown',event=>{if(!picker.contains(event.target)&&!panel.hidden)close()},{signal:controller.signal});
}

window.TB={...TB,$,$$,domainScore,score,colors,chart,setupShell,link,modelOptions,radar,table,modelCard,bindCompare,normalizeModelIds,comparisonDecisionRows,comparisonMatrix,selectedModelChips,bindComparisonRemovals,mountModelPicker,MAX_COMPARE_MODELS};

const shellIcons={
  moon:'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.3 15.4A8.5 8.5 0 0 1 8.6 3.7 8.5 8.5 0 1 0 20.3 15.4Z"/></svg>',
  sun:'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  globe:'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  close:'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  plus:'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  search:'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>',
  menu:'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  chevron:'<svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m4 6 4 4 4-4"/></svg>',
  grid:'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><rect x="14" y="14" width="6.5" height="6.5" rx="1"/></svg>',
  list:'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none"/></svg>'
};

const topModelProfiles=[
  {rank:1,slug:'claude-mythos-5',name:'Claude Mythos 5',provider:'Anthropic',score:82.87},
  {rank:2,slug:'claude-opus-5',name:'Claude Opus 5',provider:'Anthropic',score:82.80},
  {rank:3,slug:'claude-fable',name:'Claude Fable 5',provider:'Anthropic',score:82.62},
  {rank:4,slug:'gpt-5-6-sol',name:'GPT-5.6 Sol',provider:'OpenAI',score:81.79},
  {rank:5,slug:'kimi-3',name:'Kimi K3',provider:'Moonshot AI',score:80.21},
  {rank:6,slug:'qwen3-8-max',name:'Qwen3.8 Max',provider:'Alibaba',score:79.63},
  {rank:7,slug:'claude-opus-4-8',name:'Claude Opus 4.8',provider:'Anthropic',score:76.84},
  {rank:8,slug:'muse-spark-1-1',name:'Muse Spark 1.1',provider:'Meta',score:76.57},
  {rank:9,slug:'grok-4-5',name:'Grok 4.5',provider:'xAI',score:75.10},
  {rank:10,slug:'gemini-3-6-flash',name:'Gemini 3.6 Flash',provider:'Google',score:75.25}
];

const priorityLanguages=[
  {code:'en',name:'English'},
  {code:'ko',name:'Korean'},
  {code:'zh-TW',name:'Traditional Chinese'},
  {code:'zh-CN',name:'Simplified Chinese'},
  {code:'vi',name:'Vietnamese'},
  {code:'es',name:'Spanish'},
  {code:'pt',name:'Portuguese'},
  {code:'de',name:'German'},
  {code:'fr',name:'French'},
  {code:'ru',name:'Russian'},
  {code:'th',name:'Thai'},
  {code:'id',name:'Indonesian'}
];

function setupHeaderTools(){
  const theme=$('#theme');
  const actions=$('.header-actions');
  if(!theme||!actions)return;

  const syncThemeIcon=()=>{
    const dark=TB.theme==='dark';
    theme.innerHTML=dark?shellIcons.sun:shellIcons.moon;
    theme.setAttribute('aria-label',dark?'Switch to light theme':'Switch to dark theme');
    theme.title=theme.getAttribute('aria-label');
  };
  theme.classList.add('theme-toggle');
  syncThemeIcon();
  theme.addEventListener('click',syncThemeIcon);

  if($('#language-picker'))return;
  const picker=document.createElement('div');
  picker.className='language-picker';
  picker.id='language-picker';
  picker.innerHTML=`<button class="icon-button" id="language-toggle" type="button" aria-label="Choose language" aria-haspopup="dialog" aria-expanded="false" aria-controls="language-panel">${shellIcons.globe}</button><div class="language-panel" id="language-panel" role="dialog" aria-label="Choose language" hidden><div class="language-panel-head"><div><strong>Language</strong><span>Translate this page</span></div><button class="language-close" id="language-close" type="button" aria-label="Close language selector">${shellIcons.close}</button></div><label class="language-search"><span class="sr-only">Search languages</span><input id="language-search" type="search" autocomplete="off" placeholder="Search languages"></label><p class="language-group-label" id="preferred-language-label">Preferred languages</p><div class="language-list" id="preferred-language-list" role="menu" aria-labelledby="preferred-language-label"></div><p class="language-group-label" id="other-language-label">More languages supported by Google Translate</p><div class="language-list" id="other-language-list" role="menu" aria-labelledby="other-language-label"><p class="language-loading">Open the selector to load the current language catalog.</p></div><p class="language-status" id="language-status" aria-live="polite">Translations are provided by Google Translate.</p></div><div class="google-translate-host" id="google_translate_element" aria-hidden="true"></div>`;
  actions.insertBefore(picker,theme);

  const toggle=$('#language-toggle');
  const panel=$('#language-panel');
  const close=$('#language-close');
  const search=$('#language-search');
  const preferredList=$('#preferred-language-list');
  const otherList=$('#other-language-list');
  const preferredLabel=$('#preferred-language-label');
  const otherLabel=$('#other-language-label');
  const status=$('#language-status');
  let providerLanguages=[];
  let catalogRequested=false;
  let currentLanguage=localStorage.tbLanguage||'en';

  const createLanguageButton=language=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='language-option';
    button.dataset.language=language.code;
    button.setAttribute('role','menuitemradio');
    button.setAttribute('aria-checked',String(currentLanguage.toLowerCase()===language.code.toLowerCase()));
    const name=document.createElement('span');
    name.textContent=language.name;
    const code=document.createElement('span');
    code.className='language-code';
    code.textContent=language.code;
    button.append(name,code);
    button.addEventListener('click',()=>selectLanguage(language));
    return button;
  };

  const renderLanguageMenu=()=>{
    const query=search.value.trim().toLocaleLowerCase();
    const matches=language=>`${language.name} ${language.code}`.toLocaleLowerCase().includes(query);
    const preferred=priorityLanguages.filter(matches);
    const priorityCodes=new Set(priorityLanguages.map(language=>language.code.toLowerCase()));
    const other=providerLanguages.filter(language=>!priorityCodes.has(language.code.toLowerCase())&&matches(language));
    preferredList.replaceChildren(...preferred.map(createLanguageButton));
    preferredLabel.hidden=!preferred.length;
    preferredList.hidden=!preferred.length;
    otherLabel.hidden=!other.length;
    otherList.hidden=!other.length;
    if(other.length)otherList.replaceChildren(...other.map(createLanguageButton));
    else if(!providerLanguages.length){
      const message=document.createElement('p');
      message.className='language-loading';
      message.textContent=catalogRequested?'Loading the current Google Translate language catalog…':'Open the selector to load the current language catalog.';
      otherList.hidden=false;
      otherLabel.hidden=false;
      otherList.replaceChildren(message);
    }
    if(query&&!preferred.length&&!other.length&&providerLanguages.length){
      const message=document.createElement('p');
      message.className='language-loading';
      message.textContent='No matching language.';
      otherList.hidden=false;
      otherList.replaceChildren(message);
    }
  };

  const readGoogleCatalog=()=>{
    const combo=$('.goog-te-combo');
    if(!combo)return false;
    const options=[...combo.options].filter(option=>option.value);
    if(!options.length)return false;
    const englishNames=typeof Intl.DisplayNames==='function'?new Intl.DisplayNames(['en'],{type:'language'}):null;
    providerLanguages=options.map(option=>{
      let name=option.textContent.trim();
      try{
        const englishName=englishNames?.of(option.value);
        if(englishName&&englishName.toLowerCase()!==option.value.toLowerCase())name=englishName;
      }catch(error){}
      return {code:option.value,name};
    }).sort((a,b)=>a.name.localeCompare(b.name));
    status.textContent=`${providerLanguages.length+1} languages available · translations provided by Google Translate.`;
    renderLanguageMenu();
    return true;
  };

  const loadGoogleCatalog=()=>{
    if(catalogRequested)return;
    catalogRequested=true;
    renderLanguageMenu();
    const initialize=()=>{
      try{
        if(!$('.goog-te-combo'))new google.translate.TranslateElement({pageLanguage:'en',autoDisplay:false,multilanguagePage:true},'google_translate_element');
        let attempts=0;
        const waitForCatalog=setInterval(()=>{
          attempts+=1;
          if(readGoogleCatalog()||attempts>=100){
            clearInterval(waitForCatalog);
            if(!providerLanguages.length){status.textContent='The live Google Translate catalog could not be loaded. Preferred languages remain available.';renderLanguageMenu()}
          }
        },100);
      }catch(error){
        status.textContent='The live Google Translate catalog could not be loaded. Preferred languages remain available.';
        renderLanguageMenu();
      }
    };
    window.googleTranslateElementInit=initialize;
    if(window.google?.translate?.TranslateElement){initialize();return}
    const script=document.createElement('script');
    script.id='google-translate-loader';
    script.src='https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    script.async=true;
    script.onerror=()=>{status.textContent='The live Google Translate catalog could not be loaded. Preferred languages remain available.';renderLanguageMenu()};
    document.head.append(script);
  };

  function closePicker(){
    panel.hidden=true;
    toggle.setAttribute('aria-expanded','false');
  }

  function selectLanguage(language){
    currentLanguage=language.code;
    localStorage.tbLanguage=currentLanguage;
    renderLanguageMenu();
    if(language.code==='en'){
      document.cookie='googtrans=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
      document.cookie=`googtrans=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.${location.hostname}`;
      closePicker();
      if($('.goog-te-combo')?.value)location.reload();
      return;
    }
    const combo=$('.goog-te-combo');
    if(combo&&[...combo.options].some(option=>option.value===language.code)){
      combo.value=language.code;
      combo.dispatchEvent(new Event('change'));
      closePicker();
      return;
    }
    location.href=`https://translate.google.com/translate?sl=en&tl=${encodeURIComponent(language.code)}&u=${encodeURIComponent(location.href)}`;
  }

  toggle.addEventListener('click',()=>{
    const opening=panel.hidden;
    if(opening)document.dispatchEvent(new CustomEvent('tb:close-megamenus'));
    panel.hidden=!opening;
    toggle.setAttribute('aria-expanded',String(opening));
    if(opening){loadGoogleCatalog();renderLanguageMenu();requestAnimationFrame(()=>search.focus())}
  });
  close.addEventListener('click',()=>{closePicker();toggle.focus()});
  search.addEventListener('input',renderLanguageMenu);
  document.addEventListener('click',event=>{if(!picker.contains(event.target))closePicker()});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){closePicker();toggle.focus()}});
  document.addEventListener('tb:close-language',closePicker);
  renderLanguageMenu();
}

function setupBrand(){
  const brand=$('.brand');
  if(!brand)return;
  brand.setAttribute('aria-label','TokenBench home');
  brand.innerHTML='<img class="brand-logo" src="assets/monomind-tokenbench.png" width="32" height="32" alt=""><span class="brand-name">TokenBench</span>';
}

function setupNavigation(){
  const nav=$('.nav');
  const shell=$('.topbar .shell');
  if(!nav||!shell)return;

  const current=location.pathname.replace(/\/+$/, '').split('/').pop()||'index';
  const modelsActive=['index','model-profile','model-lifecycle'].includes(current);
  const leaderboardActive=current==='make-it-yours';
  const articlesActive=['article-hybrid-router','articles'].includes(current);
  const currentAttribute=active=>active?' aria-current="page"':'';
  nav.setAttribute('aria-label','Primary');
  nav.id='primary-navigation';
  nav.innerHTML=`<a href="${PREVIEW_PATHS.home}">Home</a><button class="nav-trigger" id="nav-models" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="mega-models" data-menu="models"${currentAttribute(modelsActive)}>Models${shellIcons.chevron}</button><button class="nav-trigger" id="nav-leaderboards" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="mega-leaderboards" data-menu="leaderboards"${currentAttribute(leaderboardActive)}>Leaderboards${shellIcons.chevron}</button><a href="${PREVIEW_PATHS.compare}"${currentAttribute(current==='compare')}>Compare</a><a href="${PREVIEW_PATHS.calculator}">Subscribe vs API</a><button class="nav-trigger" id="nav-articles" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="mega-articles" data-menu="articles"${currentAttribute(articlesActive)}>Articles${shellIcons.chevron}</button>`;

  let menuToggle=$('#mobile-nav-toggle',shell);
  if(!menuToggle){
    menuToggle=document.createElement('button');
    menuToggle.className='icon-button mobile-nav-toggle';
    menuToggle.id='mobile-nav-toggle';
    menuToggle.type='button';
    menuToggle.setAttribute('aria-label','Open navigation');
    menuToggle.setAttribute('aria-controls',nav.id);
    menuToggle.setAttribute('aria-expanded','false');
    menuToggle.innerHTML=shellIcons.menu;
    shell.insertBefore(menuToggle,nav);
  }
  const setMobileNavigation=open=>{
    nav.dataset.open=String(open);
    menuToggle.setAttribute('aria-expanded',String(open));
    menuToggle.setAttribute('aria-label',open?'Close navigation':'Open navigation');
    menuToggle.innerHTML=open?shellIcons.close:shellIcons.menu;
  };
  setMobileNavigation(false);
  menuToggle.onclick=()=>{
    const opening=menuToggle.getAttribute('aria-expanded')!=='true';
    document.dispatchEvent(new CustomEvent('tb:close-megamenus'));
    setMobileNavigation(opening);
  };

  $('.mega-panels',shell)?.remove();
  const topModels=topModelProfiles.slice(0,10).map(model=>`<a class="mega-model-link" href="${previewModelProfilePath(model.slug)}"><span class="mega-rank">#${model.rank}</span><span class="mega-model-copy"><strong>${model.name}</strong><small>${model.provider}</small></span><span class="mega-score">${model.score.toFixed(1)}</span></a>`).join('');
  const panels=document.createElement('div');
  panels.className='mega-panels';
  panels.innerHTML=`<div class="mega-panel mega-panel-models" id="mega-models" role="region" aria-labelledby="nav-models" data-menu-panel="models" hidden><div class="mega-layout"><section class="mega-section"><div class="mega-section-head"><h2>Explore models</h2><span>Decision surfaces</span></div><div class="mega-destinations"><a href="${PREVIEW_PATHS.models}"><strong>Models workbench</strong><span>Price, performance and catalog filters</span></a><a href="${PREVIEW_PATHS.models}"><strong>Model catalog</strong><span>Search, filter and compare model evidence</span></a><a href="${PREVIEW_PATHS.modelLifecycle}"><strong>Lifecycle radar</strong><span>Retirements, sunset dates and migration paths</span></a></div></section><section class="mega-section mega-top-models"><div class="mega-section-head"><h2>Top Models</h2><span>Live weekly rank · 12 Aug 2026</span></div><div class="mega-model-grid">${topModels}</div></section></div></div><div class="mega-panel mega-panel-compact" id="mega-leaderboards" role="region" aria-labelledby="nav-leaderboards" data-menu-panel="leaderboards" hidden><div class="mega-section-head"><h2>Leaderboards</h2><span>Rank and re-rank models</span></div><div class="mega-destinations"><a href="${PREVIEW_PATHS.popularModels}"><strong>Popular Models</strong><span>Browse top models by quality, performance, and cost.</span></a><a href="${PREVIEW_PATHS.makeItYours}"><strong>Make it yours</strong><span>Adjust six capability weights and SLA thresholds</span></a></div></div><div class="mega-panel mega-panel-compact" id="mega-articles" role="region" aria-labelledby="nav-articles" data-menu-panel="articles" hidden><div class="mega-section-head"><h2>Articles & guides</h2><span>Decision-oriented research</span></div><div class="mega-destinations"><a href="${PREVIEW_PATHS.guides}openrouter-guide-model-routing-cost-controls/"><strong>Model routing guide</strong><span>Route work by capability, cost and operational risk</span></a><a href="${PREVIEW_PATHS.guides}"><strong>All guides</strong><span>Browse the current article library</span></a></div></div>`;
  shell.append(panels);

  const triggers=$$('.nav-trigger',nav);
  const menuPanels=$$('.mega-panel',panels);
  let activeMenu=null;
  const closeMenus=({restoreFocus=false}={})=>{
    const trigger=activeMenu?$(`[data-menu="${activeMenu}"]`,nav):null;
    triggers.forEach(item=>item.setAttribute('aria-expanded','false'));
    menuPanels.forEach(panel=>panel.hidden=true);
    activeMenu=null;
    if(restoreFocus)trigger?.focus();
  };
  const openMenu=(key,{focusFirst=false}={})=>{
    const trigger=$(`[data-menu="${key}"]`,nav);
    const panel=$(`[data-menu-panel="${key}"]`,panels);
    if(!trigger||!panel)return;
    document.dispatchEvent(new CustomEvent('tb:close-language'));
    closeMenus();
    activeMenu=key;
    trigger.setAttribute('aria-expanded','true');
    panel.hidden=false;
    if(focusFirst)requestAnimationFrame(()=>$('a,button',panel)?.focus());
  };

  triggers.forEach(trigger=>{
    trigger.addEventListener('click',()=>{
      const key=trigger.dataset.menu;
      if(activeMenu===key)closeMenus();else openMenu(key);
    });
    trigger.addEventListener('keydown',event=>{
      if(event.key==='ArrowDown'){
        event.preventDefault();
        openMenu(trigger.dataset.menu,{focusFirst:true});
      }else if(event.key==='Escape'&&activeMenu){
        event.preventDefault();
        closeMenus({restoreFocus:true});
      }
    });
  });
  panels.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      event.preventDefault();
      closeMenus({restoreFocus:true});
    }
  });
  nav.addEventListener('click',event=>{if(event.target.closest('a'))setMobileNavigation(false)});
  panels.addEventListener('click',event=>{if(event.target.closest('a')){closeMenus();setMobileNavigation(false)}});
  document.addEventListener('click',event=>{if(!nav.contains(event.target)&&!panels.contains(event.target))closeMenus()});
  shell.addEventListener('keydown',event=>{if(event.key==='Escape')setMobileNavigation(false)});
  document.addEventListener('tb:close-megamenus',()=>closeMenus());
}

function setupGlobalFooter(){
  if($('.articles-footer'))return;
  const footer=document.createElement('footer');
  footer.className='articles-footer';
  footer.innerHTML=`<div class="shell articles-footer-grid"><section class="articles-footer-brand" aria-label="About TokenBench"><a class="brand" href="${PREVIEW_PATHS.home}"><img class="brand-logo" src="/brand/monomind-tokenbench.png" width="32" height="32" alt=""><span class="brand-name">TokenBench</span></a><p>Source-aware model, pricing, and workload evidence for practical AI decisions.</p><p class="articles-evidence-warning">Verify provider evidence before purchasing.</p></section><nav class="articles-footer-links" aria-label="Explore"><strong>Explore</strong><a href="${PREVIEW_PATHS.calculator}">Subscribe vs API</a><a href="${PREVIEW_PATHS.pricePerformance}">Price vs performance</a><a href="${PREVIEW_PATHS.popularModels}">Popular models</a><a href="${PREVIEW_PATHS.makeItYours}">Make it yours</a><a href="${PREVIEW_PATHS.compare}">Compare models</a><a href="${PREVIEW_PATHS.guides}">Guides</a></nav><nav class="articles-footer-links" aria-label="Trust"><strong>Trust</strong><a href="${PREVIEW_PATHS.methodology}">Methodology</a><a href="${PREVIEW_PATHS.privacy}">Privacy</a></nav><section class="articles-signup" aria-labelledby="global-signup-title"><h2 id="global-signup-title">LLM API Cost &amp; Benchmark Cheatsheet</h2><p>Preview the monthly model-cost and benchmark cheatsheet signup flow. This prototype does not send a request.</p><form><label>First name <input name="firstName" autocomplete="given-name" required></label><label>Company <input name="company" autocomplete="organization" required></label><label>Email <input name="email" type="email" autocomplete="email" required></label><label class="articles-consent"><input name="consent" type="checkbox"> <span>Notify me when new models are added to TokenBench.</span></label><button class="button primary" type="submit">Preview signup</button><p class="articles-signup-status" aria-live="polite"></p></form></section></div><div class="shell articles-footer-meta"><a href="https://monomind.one/">Powered by MonoMind AI Lab</a></div>`;
  document.body.append(footer);
  const form=$('form',footer),status=$('.articles-signup-status',footer);
  form?.addEventListener('submit',event=>{event.preventDefault();if(!form.reportValidity())return;status.textContent='Preview complete — no information was sent.'});
}

const shellWithHeaderTools=setupShell;
setupShell=function(){shellWithHeaderTools();setupBrand();setupHeaderTools();setupNavigation();setupGlobalFooter()};
window.TB.setupShell=setupShell;

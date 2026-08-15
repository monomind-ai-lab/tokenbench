const MAX_COMPARE_MODELS=4;
const TB={charts:[],weights:{agentic:20,coding:20,reasoning:20,math:15,multimodal:15,throughput:10},selected:[],theme:localStorage.tbTheme||'light'};
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
function domainScore(m,key){return key==='throughput'?Math.min(100,m.tps/120*100):m[key]}
function score(m,w=TB.weights){let sum=Object.values(w).reduce((a,b)=>a+b,0);return sum?Object.entries(w).reduce((n,[k,v])=>n+domainScore(m,k)*v,0)/sum:null}
function colors(){let s=getComputedStyle(document.documentElement),read=name=>s.getPropertyValue(name).trim();return{ink:read('--ink'),muted:read('--muted'),line:read('--line'),plum:read('--plum'),accentText:read('--accent-text')||read('--plum')}}
function chart(canvas,config){if(!canvas)return null;if(typeof Chart==='undefined'){canvas.hidden=true;if(!canvas.parentElement.querySelector('.chart-failure'))canvas.insertAdjacentHTML('afterend','<p class="empty chart-failure" role="status">Chart.js did not load. Use the exact evidence table on this page.</p>');return null}canvas.hidden=false;canvas.parentElement.querySelector('.chart-failure')?.remove();let old=Chart.getChart(canvas);if(old)old.destroy();config.options={responsive:true,maintainAspectRatio:false,animation:matchMedia('(prefers-reduced-motion: reduce)').matches?false:{duration:250},...config.options};return new Chart(canvas,config)}
function setupShell(){document.documentElement.dataset.theme=TB.theme;let current=location.pathname.split('/').pop()||'index.html',theme=$('#theme'),nav=$('.nav'),modelPages=['index.html','model-profile.html','model-lifecycle.html'];let navItems=[{label:'Home',pending:true},{label:'Models',href:'index.html#catalog',active:modelPages.includes(current)},{label:'Leaderboards',href:'custom-leaderboard.html',active:current==='custom-leaderboard.html'},{label:'Compare',href:'compare.html',active:current==='compare.html'},{label:'Subscribe vs API',pending:true},{label:'Articles',href:'article-hybrid-router.html',active:current==='article-hybrid-router.html'}];if(nav)nav.innerHTML=navItems.map(item=>item.pending?`<span class="nav-pending" aria-disabled="true" title="Not included in this proof batch">${item.label}</span>`:`<a href="${item.href}"${item.active?' aria-current="page"':''}>${item.label}</a>`).join('');if(current==='article-hybrid-router.html'){let metadata=$('article header .label'),fixture=$('article header .fixture');if(metadata)metadata.textContent='Guide · Published 12 Aug 2026 · Updated 15 Aug 2026 · Review status: current';if(fixture&&!$('#article-evidence-cue'))fixture.insertAdjacentHTML('afterend','<p id="article-evidence-cue" class="fixture">Evidence cue · route-price and SLA fixtures observed 15 Aug 2026 · sources itemized below</p>')}if(theme){let syncTheme=()=>{let dark=TB.theme==='dark';theme.textContent='Theme';theme.setAttribute('aria-pressed',String(dark));theme.setAttribute('aria-label',dark?'Switch to light theme':'Switch to dark theme')};syncTheme();theme.addEventListener('click',()=>{TB.theme=TB.theme==='dark'?'light':'dark';localStorage.tbTheme=TB.theme;document.documentElement.dataset.theme=TB.theme;syncTheme();window.renderPage?.()})}}
const baseShellSetup=setupShell;setupShell=function(){baseShellSetup();if(location.pathname.endsWith('article-hybrid-router.html')&&!$('#mobile-toc')){let header=$('article header');header?.insertAdjacentHTML('afterend','<details id="mobile-toc" class="mobile-toc panel soft"><summary>On this page</summary><nav aria-label="Article sections"><a href="#question">Decision question</a><a href="#recommendation">Recommendation</a><a href="#assumptions">Assumptions</a><a href="#evidence">Evidence framing</a><a href="#cost">Cost comparison</a><a href="#matrix">Decision matrix</a><a href="#next">Internal tools</a></nav></details>')}};function link(m){return `<a class="model-name" href="model-profile.html?model=${encodeURIComponent(m.id)}">${m.name}</a>`}
function modelOptions(){return TB_MODELS.map(m=>`<option value="${m.id}">${m.name} — ${m.provider}</option>`).join('')}
function radar(canvas,models){let c=colors(),keys=['agentic','coding','reasoning','math','multimodal','throughput'],series=[{color:c.plum,dash:[],point:'circle'},{color:'#f97316',dash:[7,3],point:'rectRounded'},{color:'#10b981',dash:[2,3],point:'triangle'},{color:'#d946ef',dash:[10,3,2,3],point:'rectRot'}];return chart(canvas,{type:'radar',data:{labels:['Agentic','Coding','Reasoning','Math','Multimodal','Throughput'],datasets:models.map((m,i)=>{let style=series[i%series.length];return{label:m.name,data:keys.map(k=>domainScore(m,k)),borderColor:style.color,backgroundColor:style.color+'20',borderDash:style.dash,pointStyle:style.point,pointRadius:3,borderWidth:2}})},options:{plugins:{legend:{labels:{color:c.muted,font:{size:11},usePointStyle:true,boxWidth:10,padding:12}}},scales:{r:{min:45,max:100,ticks:{display:false},grid:{color:c.line},angleLines:{color:c.line},pointLabels:{color:c.muted,font:{size:10}}}}}})}
function normalizeModelIds(ids,max=MAX_COMPARE_MODELS){let known=new Set((window.TB_MODELS||[]).map(model=>model.id)),seen=new Set();return (ids||[]).filter(id=>{if(!known.has(id)||seen.has(id))return false;seen.add(id);return true}).slice(0,max)}
function table(models,{showCompare=true,ariaLabel='Ranked model evidence',costMode='blended'}={}){let compareHead=showCompare?'<th scope="col">Compare</th>':'',compareCell=m=>showCompare?`<td><button class="toggle compare" aria-pressed="${TB.selected.includes(m.id)}" data-id="${m.id}">${TB.selected.includes(m.id)?'Selected':'Compare'}</button></td>`:'',costHead=costMode==='input-output'?'$ Cost In/Out':'Blended $/1M',costCell=m=>costMode==='input-output'?`$${m.inputPrice.toFixed(2)} / $${m.outputPrice.toFixed(2)}`:`$${m.cost.toFixed(2)}`;return `<div class="table-wrap" role="region" aria-label="${ariaLabel}" tabindex="0"><table><thead><tr><th scope="col">Rank</th><th scope="col">Model / profile</th><th scope="col">Provider</th><th scope="col">Composite</th><th scope="col">${costHead}</th><th scope="col">TTFT</th><th scope="col">Throughput</th><th scope="col">Lifecycle</th>${compareHead}</tr></thead><tbody>${models.map((m,i)=>`<tr><td>${i+1}</td><th scope="row">${link(m)}</th><td><span class="provider-dot" style="background:${m.color}"></span>${m.provider}</td><td>${score(m).toFixed(1)}</td><td>${costCell(m)}</td><td>${m.ttft}s</td><td>${m.tps} tok/s</td><td>${m.lifecycle||'Not reported'}</td>${compareCell(m)}</tr>`).join('')}</tbody></table></div>`}
function modelCard(m,{rank=null}={}){let selected=TB.selected.includes(m.id),meta=rank?`#${rank} · ${m.provider}`:`<span class="provider-dot" style="background:${m.color}"></span>${m.provider} · ${m.access}`;return `<article class="panel rank-card model-card"><span class="tag">${meta}</span><h3 class="subhead rank-card-title">${link(m)}</h3><button class="toggle compare rank-card-compare" aria-pressed="${selected}" aria-label="${selected?'Remove':'Add'} ${m.name} ${selected?'from':'to'} comparison" data-id="${m.id}">${selected?'Selected':'Compare'}</button><div class="metrics rank-metrics"><div class="metric"><span class="label">Score</span><b>${score(m).toFixed(1)}</b></div><div class="metric"><span class="label">TTFT</span><b>${m.ttft}s</b></div><div class="metric"><span class="label">TPS</span><b>${m.tps}</b></div><div class="metric"><span class="label">Input / 1M</span><b>$${m.inputPrice.toFixed(2)}</b></div><div class="metric"><span class="label">Output / 1M</span><b>$${m.outputPrice.toFixed(2)}</b></div><div class="metric"><span class="label">Context</span><b>${m.context}</b></div></div></article>`}
const compareRoots=new WeakSet();function bindCompare(root=document){if(compareRoots.has(root))return;compareRoots.add(root);root.addEventListener('click',event=>{let b=event.target.closest?.('.compare');if(!b||!root.contains(b))return;let id=b.dataset.id,target=root===document?document.body:root;$('.compare-limit',target)?.remove();TB.selected=normalizeModelIds(TB.selected);if(TB.selected.includes(id)){TB.selected=TB.selected.filter(x=>x!==id)}else if(TB.selected.length<MAX_COMPARE_MODELS){TB.selected.push(id)}else{target.insertAdjacentHTML('afterbegin','<p class="error compare-limit" role="status">Comparison is limited to four models. Remove one selected model before adding another.</p>');return}window.renderPage?.()})}
window.TB={...TB,$,$$,domainScore,score,colors,chart,setupShell,link,modelOptions,radar,table,modelCard,bindCompare,normalizeModelIds,MAX_COMPARE_MODELS};

const shellIcons={
  moon:'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.3 15.4A8.5 8.5 0 0 1 8.6 3.7 8.5 8.5 0 1 0 20.3 15.4Z"/></svg>',
  sun:'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  globe:'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  close:'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>',
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

  const current=(location.pathname.split('/').pop()||'index.html').replace(/\.html$/,'');
  const modelsActive=['index','model-profile','model-lifecycle'].includes(current);
  const leaderboardActive=current==='custom-leaderboard';
  const articlesActive=['article-hybrid-router','articles'].includes(current);
  const currentAttribute=active=>active?' aria-current="page"':'';
  nav.setAttribute('aria-label','Primary');
  nav.innerHTML=`<a href="https://tokenbench.monomind.one/">Home</a><button class="nav-trigger" id="nav-models" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="mega-models" data-menu="models"${currentAttribute(modelsActive)}>Models${shellIcons.chevron}</button><button class="nav-trigger" id="nav-leaderboards" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="mega-leaderboards" data-menu="leaderboards"${currentAttribute(leaderboardActive)}>Leaderboards${shellIcons.chevron}</button><a href="compare.html"${currentAttribute(current==='compare')}>Compare</a><a href="https://tokenbench.monomind.one/tools/subscriptions-vs-apis/">Subscribe vs API</a><button class="nav-trigger" id="nav-articles" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="mega-articles" data-menu="articles"${currentAttribute(articlesActive)}>Articles${shellIcons.chevron}</button>`;

  $('.mega-panels',shell)?.remove();
  const topModels=topModelProfiles.slice(0,10).map(model=>`<a class="mega-model-link" href="https://tokenbench.monomind.one/models/${encodeURIComponent(model.slug)}/"><span class="mega-rank">#${model.rank}</span><span class="mega-model-copy"><strong>${model.name}</strong><small>${model.provider}</small></span><span class="mega-score">${model.score.toFixed(1)}</span></a>`).join('');
  const panels=document.createElement('div');
  panels.className='mega-panels';
  panels.innerHTML=`<div class="mega-panel mega-panel-models" id="mega-models" role="region" aria-labelledby="nav-models" data-menu-panel="models" hidden><div class="mega-layout"><section class="mega-section"><div class="mega-section-head"><h2>Explore models</h2><span>Decision surfaces</span></div><div class="mega-destinations"><a href="index.html"><strong>Models workbench</strong><span>Price, performance and catalog filters</span></a><a href="index.html#catalog"><strong>Model catalog</strong><span>Search, filter and compare model fixtures</span></a><a href="model-lifecycle.html"><strong>Lifecycle radar</strong><span>Retirements, sunset dates and migration paths</span></a></div></section><section class="mega-section mega-top-models"><div class="mega-section-head"><h2>Top Models</h2><span>Live weekly rank · 12 Aug 2026</span></div><div class="mega-model-grid">${topModels}</div></section></div></div><div class="mega-panel mega-panel-compact" id="mega-leaderboards" role="region" aria-labelledby="nav-leaderboards" data-menu-panel="leaderboards" hidden><div class="mega-section-head"><h2>Leaderboards</h2><span>Rank and re-rank models</span></div><div class="mega-destinations"><a href="index.html#catalog"><strong>Popular Models</strong><span>Browse top models by quality, performance, and cost.</span></a><a href="custom-leaderboard.html"><strong>Custom Leaderboard</strong><span>Adjust six capability weights and SLA thresholds</span></a></div></div><div class="mega-panel mega-panel-compact" id="mega-articles" role="region" aria-labelledby="nav-articles" data-menu-panel="articles" hidden><div class="mega-section-head"><h2>Articles & guides</h2><span>Decision-oriented research</span></div><div class="mega-destinations"><a href="article-hybrid-router.html"><strong>Hybrid router guide</strong><span>Route work by capability, cost and operational risk</span></a><a href="articles.html"><strong>All guides</strong><span>Browse the current production article library</span></a></div></div>`;
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
  panels.addEventListener('click',event=>{if(event.target.closest('a'))closeMenus()});
  document.addEventListener('click',event=>{if(!nav.contains(event.target)&&!panels.contains(event.target))closeMenus()});
  document.addEventListener('tb:close-megamenus',()=>closeMenus());
}

const shellWithHeaderTools=setupShell;
setupShell=function(){shellWithHeaderTools();setupBrand();setupHeaderTools();setupNavigation()};
window.TB.setupShell=setupShell;

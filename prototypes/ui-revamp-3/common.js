const TB={charts:[],weights:{agentic:20,coding:20,reasoning:20,math:15,multimodal:15,throughput:10},selected:[],theme:localStorage.tbTheme||'light'};
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
function domainScore(m,key){return key==='throughput'?Math.min(100,m.tps/120*100):m[key]}
function score(m,w=TB.weights){let sum=Object.values(w).reduce((a,b)=>a+b,0);return sum?Object.entries(w).reduce((n,[k,v])=>n+domainScore(m,k)*v,0)/sum:null}
function colors(){let d=document.documentElement.dataset.theme==='dark';return{ink:d?'#f8fafc':'#0f172a',muted:d?'#cbd5e1':'#475569',line:d?'#334155':'#e2e8f0',plum:d?'#e879f9':'#741a66'}}
function chart(canvas,config){if(!canvas)return null;if(typeof Chart==='undefined'){canvas.hidden=true;if(!canvas.parentElement.querySelector('.chart-failure'))canvas.insertAdjacentHTML('afterend','<p class="empty chart-failure" role="status">Chart.js did not load. Use the exact evidence table on this page.</p>');return null}canvas.hidden=false;canvas.parentElement.querySelector('.chart-failure')?.remove();let old=Chart.getChart(canvas);if(old)old.destroy();config.options={responsive:true,maintainAspectRatio:false,animation:matchMedia('(prefers-reduced-motion: reduce)').matches?false:{duration:250},...config.options};return new Chart(canvas,config)}
function setupShell(){document.documentElement.dataset.theme=TB.theme;let current=location.pathname.split('/').pop()||'index.html',theme=$('#theme'),nav=$('.nav'),modelPages=['index.html','model-profile.html','model-lifecycle.html'];let navItems=[{label:'Home',pending:true},{label:'Models',href:'index.html#catalog',active:modelPages.includes(current)},{label:'Leaderboards',href:'custom-leaderboard.html',active:current==='custom-leaderboard.html'},{label:'Compare',pending:true},{label:'Subscribe vs API',pending:true},{label:'Articles',href:'article-hybrid-router.html',active:current==='article-hybrid-router.html'}];if(nav)nav.innerHTML=navItems.map(item=>item.pending?`<span class="nav-pending" aria-disabled="true" title="Not included in this proof batch">${item.label}</span>`:`<a href="${item.href}"${item.active?' aria-current="page"':''}>${item.label}</a>`).join('');if(current==='article-hybrid-router.html'){let metadata=$('article header .label'),fixture=$('article header .fixture');if(metadata)metadata.textContent='Guide · Published 12 Aug 2026 · Updated 15 Aug 2026 · Review status: current';if(fixture&&!$('#article-evidence-cue'))fixture.insertAdjacentHTML('afterend','<p id="article-evidence-cue" class="fixture">Evidence cue · route-price and SLA fixtures observed 15 Aug 2026 · sources itemized below</p>')}if(theme){let syncTheme=()=>{let dark=TB.theme==='dark';theme.textContent='Theme';theme.setAttribute('aria-pressed',String(dark));theme.setAttribute('aria-label',dark?'Switch to light theme':'Switch to dark theme')};syncTheme();theme.addEventListener('click',()=>{TB.theme=TB.theme==='dark'?'light':'dark';localStorage.tbTheme=TB.theme;document.documentElement.dataset.theme=TB.theme;syncTheme();window.renderPage?.()})}}
const baseShellSetup=setupShell;setupShell=function(){baseShellSetup();if(location.pathname.endsWith('article-hybrid-router.html')&&!$('#mobile-toc')){let header=$('article header');header?.insertAdjacentHTML('afterend','<details id="mobile-toc" class="mobile-toc panel soft"><summary>On this page</summary><nav aria-label="Article sections"><a href="#question">Decision question</a><a href="#recommendation">Recommendation</a><a href="#assumptions">Assumptions</a><a href="#evidence">Evidence framing</a><a href="#cost">Cost comparison</a><a href="#matrix">Decision matrix</a><a href="#next">Internal tools</a></nav></details>')}};function link(m){return `<a class="model-name" href="model-profile.html?model=${encodeURIComponent(m.id)}">${m.name}</a>`}
function modelOptions(){return TB_MODELS.map(m=>`<option value="${m.id}">${m.name} — ${m.provider}</option>`).join('')}
function radar(canvas,models){let c=colors(),keys=['agentic','coding','reasoning','math','multimodal','throughput'];return chart(canvas,{type:'radar',data:{labels:['Agentic','Coding','Reasoning','Math','Multimodal','Throughput'],datasets:models.map((m,i)=>({label:m.name,data:keys.map(k=>domainScore(m,k)),borderColor:[m.color,c.plum,'#f97316'][i],backgroundColor:([m.color,c.plum,'#f97316'][i])+'26',borderWidth:2}))},options:{plugins:{legend:{labels:{color:c.muted,font:{size:11}}}},scales:{r:{min:45,max:100,ticks:{display:false},grid:{color:c.line},angleLines:{color:c.line},pointLabels:{color:c.muted,font:{size:10}}}}}})}
function table(models){return `<div class="table-wrap" role="region" aria-label="Ranked model evidence" tabindex="0"><table><thead><tr><th>Rank</th><th>Model / profile</th><th>Provider</th><th>Composite</th><th>Blended $/1M</th><th>TTFT</th><th>Throughput</th><th>Lifecycle</th><th>Compare</th></tr></thead><tbody>${models.map((m,i)=>`<tr><td>${i+1}</td><td>${link(m)}</td><td><span class="provider-dot" style="background:${m.color}"></span>${m.provider}</td><td>${score(m).toFixed(1)}</td><td>$${m.cost.toFixed(2)}</td><td>${m.ttft}s</td><td>${m.tps} tok/s</td><td>${m.lifecycle||'Not reported'}</td><td><button class="toggle compare" aria-pressed="${TB.selected.includes(m.id)}" data-id="${m.id}">${TB.selected.includes(m.id)?'Selected':'Compare'}</button></td></tr>`).join('')}</tbody></table></div>`}
const compareRoots=new WeakSet();function bindCompare(root=document){if(compareRoots.has(root))return;compareRoots.add(root);root.addEventListener('click',event=>{let b=event.target.closest?.('.compare');if(!b||!root.contains(b))return;let id=b.dataset.id,target=root===document?document.body:root;$('.compare-limit',target)?.remove();if(TB.selected.includes(id)){TB.selected=TB.selected.filter(x=>x!==id)}else if(TB.selected.length<3){TB.selected.push(id)}else{target.insertAdjacentHTML('afterbegin','<p class="error compare-limit" role="status">Comparison is limited to three models. Remove one selected model before adding another.</p>');return}window.renderPage?.()})}
window.TB={...TB,$,$$,domainScore,score,colors,chart,setupShell,link,modelOptions,radar,table,bindCompare};
document.head.append(Object.assign(document.createElement('style'),{textContent:'@media(max-width:800px){.nav{width:calc(100vw - 1px);max-width:calc(100vw - 1px);box-sizing:border-box;overflow-x:auto;contain:layout paint;justify-content:flex-start}.nav a{flex:0 0 auto}}'}));

const shellIcons={
  moon:'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.3 15.4A8.5 8.5 0 0 1 8.6 3.7 8.5 8.5 0 1 0 20.3 15.4Z"/></svg>',
  sun:'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  globe:'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  close:'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>'
};

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
    panel.hidden=!opening;
    toggle.setAttribute('aria-expanded',String(opening));
    if(opening){loadGoogleCatalog();renderLanguageMenu();requestAnimationFrame(()=>search.focus())}
  });
  close.addEventListener('click',()=>{closePicker();toggle.focus()});
  search.addEventListener('input',renderLanguageMenu);
  document.addEventListener('click',event=>{if(!picker.contains(event.target))closePicker()});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){closePicker();toggle.focus()}});
  renderLanguageMenu();
}

const shellWithHeaderTools=setupShell;
setupShell=function(){shellWithHeaderTools();setupHeaderTools()};
window.TB.setupShell=setupShell;

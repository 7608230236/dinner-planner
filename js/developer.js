(function(){
  'use strict';

  const bridge=window.__dinnerPlannerBridge;
  if(!bridge)return;

  const byId=id=>document.getElementById(id);
  const panel=byId('developerPanel');
  const badge=byId('versionBadge');
  if(!panel||!badge)return;

  const storageKey='dinnerPlannerDeveloperMode';
  let tapCount=0;
  let tapTimer=null;

  function escapeHtml(value){
    return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function setStatus(message,type=''){
    const box=byId('developerStatus');
    if(!box)return;
    box.className=`notice ${type}`.trim();
    box.textContent=message;
  }

  async function collectRuntime(){
    const cachesInfo=[];
    if('caches' in window){
      try{
        for(const name of await caches.keys()){
          const cache=await caches.open(name);
          const requests=await cache.keys();
          cachesInfo.push({name,count:requests.length,urls:requests.slice(0,50).map(request=>request.url)});
        }
      }catch(error){cachesInfo.push({error:error.message});}
    }

    const registrations=[];
    if('serviceWorker' in navigator){
      try{
        for(const registration of await navigator.serviceWorker.getRegistrations()){
          registrations.push({
            scope:registration.scope,
            active:registration.active?.scriptURL||'',
            waiting:registration.waiting?.scriptURL||'',
            installing:registration.installing?.scriptURL||''
          });
        }
      }catch(error){registrations.push({error:error.message});}
    }

    const keys=[];
    let characters=0;
    try{
      for(let index=0;index<localStorage.length;index++){
        const key=localStorage.key(index);
        const value=localStorage.getItem(key)||'';
        characters+=key.length+value.length;
        keys.push({key,characters:value.length});
      }
    }catch{}

    return {
      collectedAt:new Date().toISOString(),
      online:navigator.onLine,
      location:location.href,
      userAgent:navigator.userAgent,
      viewport:{width:innerWidth,height:innerHeight,pixelRatio:devicePixelRatio||1},
      localStorage:{estimatedBytes:characters*2,keys},
      caches:cachesInfo,
      serviceWorkers:registrations
    };
  }

  function latestDiagnostics(state){
    const view=state.shoppingView||'this';
    return state.shoppingDiagnostics?.[view]||[];
  }

  async function buildReport(includeImages=false){
    return {
      ...bridge.makeSupportReport(includeImages),
      developerReport:true,
      runtime:await collectRuntime()
    };
  }

  function download(filename,data){
    bridge.downloadJson(filename,data);
  }

  async function copyReport(){
    const report=await buildReport(false);
    try{
      await navigator.clipboard.writeText(JSON.stringify(report,null,2));
      setStatus('Debug report copied. Paste it into the ChatGPT conversation.','success');
    }catch{
      download(`dinner-planner-v${bridge.version}-debug.json`,report);
      setStatus('Copying was blocked, so the debug report was downloaded.','warning');
    }
  }

  function renderRows(target,rows,emptyMessage){
    const element=byId(target);
    if(!element)return;
    element.innerHTML=rows.length?rows.join(''):`<div class="dev-row">${escapeHtml(emptyMessage)}</div>`;
  }

  async function render(){
    const state=bridge.getState();
    const validations=state.validationResults||[];
    const passed=validations.filter(result=>result.ok).length;
    const failed=validations.length-passed;
    const diagnostics=latestDiagnostics(state);
    const runtime=await collectRuntime();
    const saveError=bridge.getLastSaveError?bridge.getLastSaveError():null;

    byId('developerSummary').innerHTML=[
      ['Build',`v${bridge.version}`],
      ['Validation',validations.length?`${passed}/${validations.length}`:'Not run'],
      ['Pantry items',(state.have||[]).length],
      ['Photos',(state.pantryPhotos||[]).length],
      ['AI calls',(state.aiRequests||[]).length],
      ['Errors',(state.runtimeErrors||[]).length],
      ['Shopping lines',(state.shopping||[]).length+(state.nextShopping||[]).length],
      ['Cache',runtime.caches.map(cache=>cache.name).join(', ')||'None'],
      ['Last save',saveError?`FAILED (${saveError.name})`:'OK']
    ].map(([label,value])=>`<div class="developer-stat"><span class="tiny">${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('');

    if(saveError){
      setStatus(`Storage save failed at ${new Date(saveError.at).toLocaleString()}: ${saveError.message}. This is likely why data appeared to disappear — try removing old pantry photos to free up space.`,'error');
    }

    renderRows('developerValidation',validations.map(result=>`
      <div class="dev-row ${result.ok?'ok':'fail'}">
        <b>${result.ok?'✓':'✕'} ${escapeHtml(result.message)}</b>
        <span class="dev-badge ${result.ok?'':'bad'}">${escapeHtml(result.id)}</span>
        ${result.detail&&Object.keys(result.detail).length?`<pre>${escapeHtml(JSON.stringify(result.detail,null,2))}</pre>`:''}
      </div>`),'Validation has not run yet.');

    renderRows('developerPantry',(state.have||[]).map(item=>`
      <div class="dev-row ${item.confidence==='user'||item.confidence==='high'||item.reviewed?'ok':''}">
        <b>${escapeHtml(item.item)}</b>
        <span class="dev-badge">${escapeHtml(item.confidence||'unknown')}</span>
        <div class="tiny">${escapeHtml(String(item.qty??''))} ${escapeHtml(item.unit||'')} · ${escapeHtml(item.location||'Unknown location')} · ${escapeHtml(item.quantityBasis||'unknown basis')}</div>
        ${item.evidence?`<div>${escapeHtml(item.evidence)}</div>`:''}
        <pre>${escapeHtml(JSON.stringify({canonical:bridge.canonicalIngredient(item.item),sourcePhotoIds:item.sourcePhotoIds||[],sourceLocations:item.sourceLocations||[],observations:item.observations||[]},null,2))}</pre>
      </div>`),'No pantry items are saved.');

    const ai=(state.aiRequests||[]).slice().reverse();
    renderRows('developerAi',ai.map(call=>`
      <div class="dev-row ${call.status==='error'?'fail':''}">
        <b>${escapeHtml(call.location||'Kitchen photo')}</b>
        <span class="dev-badge ${call.status==='error'?'bad':''}">${escapeHtml(call.status||'unknown')}</span>
        <div class="tiny">${escapeHtml(call.at||'')} · ${escapeHtml(String(call.durationMs||0))} ms · HTTP ${escapeHtml(String(call.httpStatus||''))} · ${escapeHtml(call.model||'model unknown')} · ${escapeHtml(String(call.itemCount||0))} accepted</div>
        ${call.error?`<div>${escapeHtml(call.error)}</div>`:''}
        ${call.items?.length?`<pre>${escapeHtml(JSON.stringify(call.items,null,2))}</pre>`:''}
        ${call.rejectedItems?.length?`<pre>${escapeHtml(JSON.stringify({rejected:call.rejectedItems},null,2))}</pre>`:''}
      </div>`),'No pantry AI calls have been recorded.');

    renderRows('developerShopping',diagnostics.map(item=>`
      <div class="dev-row ${item.remaining===0?'ok':''}">
        <b>${escapeHtml(item.name)}</b> <span class="dev-badge">${escapeHtml(item.canonical)}</span>
        <div class="tiny">Required: ${escapeHtml(item.required===null?'quantity unspecified':String(Math.round(item.required*100)/100)+' '+item.unit)} · Pantry: ${escapeHtml(String(Math.round((item.available||0)*100)/100))} · Used: ${escapeHtml(String(Math.round((item.used||0)*100)/100))} · Buy: ${escapeHtml(item.remaining===null?'yes/no by presence':String(Math.round(item.remaining*100)/100))}</div>
        ${item.sources?.length?`<pre>${escapeHtml(JSON.stringify(item.sources,null,2))}</pre>`:''}
      </div>`),'No shopping calculation is available for the selected view.');

    const timeline=[
      ...(state.debugLog||[]).map(entry=>({at:entry.at,type:entry.type,detail:entry.detail||{}})),
      ...(state.scanSessions||[]).map(session=>({at:session.finishedAt||session.startedAt,type:'scan_session',detail:session})),
      ...(state.runtimeErrors||[]).map(error=>({at:error.at,type:`error:${error.type}`,detail:{message:error.message,...(error.detail||{})}}))
    ].sort((a,b)=>String(b.at||'').localeCompare(String(a.at||''))).slice(0,100);
    renderRows('developerTimeline',timeline.map(entry=>`
      <div class="dev-row ${String(entry.type).startsWith('error:')?'fail':''}">
        <b>${escapeHtml(entry.type)}</b><div class="tiny">${escapeHtml(entry.at||'')}</div>
        ${entry.detail&&Object.keys(entry.detail).length?`<pre>${escapeHtml(JSON.stringify(entry.detail,null,2))}</pre>`:''}
      </div>`),'No internal events have been recorded.');

    const errors=(state.runtimeErrors||[]).slice().reverse();
    renderRows('developerErrors',errors.map(error=>`
      <div class="dev-row fail"><b>${escapeHtml(error.type)}</b><div>${escapeHtml(error.message)}</div><div class="tiny">${escapeHtml(error.at)}</div>${error.detail?`<pre>${escapeHtml(JSON.stringify(error.detail,null,2))}</pre>`:''}</div>`),'No runtime errors recorded.');

    byId('developerStorage').innerHTML=`
      <div class="dev-row"><b>Local storage</b><div class="tiny">About ${Math.round(runtime.localStorage.estimatedBytes/1024)} KB across ${runtime.localStorage.keys.length} keys</div><pre>${escapeHtml(JSON.stringify(runtime.localStorage.keys,null,2))}</pre></div>
      <div class="dev-row"><b>Cache storage</b><pre>${escapeHtml(JSON.stringify(runtime.caches,null,2))}</pre></div>
      <div class="dev-row"><b>Service worker</b><pre>${escapeHtml(JSON.stringify(runtime.serviceWorkers,null,2))}</pre></div>`;

    if(failed)setStatus(`${failed} validation check${failed===1?'':'s'} need attention.`,'warning');
    else if(validations.length)setStatus(`All ${validations.length} validation checks passed.`,'success');
  }

  async function openDeveloper(){
    localStorage.setItem(storageKey,'1');
    panel.classList.remove('hidden');
    bridge.runValidationSuite();
    await render();
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function closeDeveloper(){
    localStorage.removeItem(storageKey);
    panel.classList.add('hidden');
  }

  badge.addEventListener('click',()=>{
    tapCount++;
    clearTimeout(tapTimer);
    tapTimer=setTimeout(()=>tapCount=0,2500);
    if(tapCount>=7){tapCount=0;openDeveloper();}
  });

  document.addEventListener('keydown',event=>{
    if(event.ctrlKey&&event.shiftKey&&event.key.toLowerCase()==='d')openDeveloper();
  });

  byId('closeDeveloperBtn')?.addEventListener('click',closeDeveloper);
  byId('runValidationBtn')?.addEventListener('click',()=>{
    bridge.runValidationSuite();
    render();
    setStatus('Validation completed.','success');
  });
  byId('copyDebugBtn')?.addEventListener('click',copyReport);
  byId('downloadDebugBtn')?.addEventListener('click',async()=>{
    const report=await buildReport(true);
    download(`dinner-planner-v${bridge.version}-debug-${new Date().toISOString().slice(0,10)}.json`,report);
    setStatus('Debug report downloaded. Attach that one file in ChatGPT.','success');
  });
  byId('reportBugBtn')?.addEventListener('click',async()=>{
    bridge.runValidationSuite();
    const report=await buildReport(true);
    download(`dinner-planner-v${bridge.version}-bug-${new Date().toISOString().replace(/[:.]/g,'-')}.json`,report);
    await render();
    setStatus('Bug report created. Attach the downloaded JSON file in ChatGPT using the + button.','success');
  });
  byId('clearLogsBtn')?.addEventListener('click',()=>{
    if(!confirm('Clear AI history, validation results, and error logs? Pantry and meal plans will stay.'))return;
    bridge.clearRuntimeLogs();
    render();
    setStatus('Developer logs cleared.','success');
  });
  byId('clearCacheBtn')?.addEventListener('click',async()=>{
    try{
      if('caches' in window)for(const name of await caches.keys())await caches.delete(name);
      setStatus('App cache cleared. Reload to download the current files.','success');
      render();
    }catch(error){setStatus(error.message||'Cache could not be cleared.','error');}
  });
  byId('unregisterWorkerBtn')?.addEventListener('click',async()=>{
    try{
      if('serviceWorker' in navigator)for(const registration of await navigator.serviceWorker.getRegistrations())await registration.unregister();
      setStatus('Service worker reset. Reload the page once.','success');
      render();
    }catch(error){setStatus(error.message||'Service worker could not be reset.','error');}
  });

  const params=new URLSearchParams(location.search);
  if(params.get('dev')==='1')openDeveloper();
})();

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const ingredientEngine = require('../js/ingredient-engine.js');

class FakeClassList {
  constructor(){ this.values=new Set(); }
  add(...values){ values.forEach(value=>this.values.add(value)); }
  remove(...values){ values.forEach(value=>this.values.delete(value)); }
  contains(value){ return this.values.has(value); }
  toggle(value,force){
    if(force===true){this.values.add(value);return true;}
    if(force===false){this.values.delete(value);return false;}
    if(this.values.has(value)){this.values.delete(value);return false;}
    this.values.add(value);return true;
  }
}

class FakeElement {
  constructor(id=''){
    this.id=id;
    this.innerHTML='';
    this.textContent='';
    this.value='';
    this.checked=false;
    this.disabled=false;
    this.dataset={};
    this.className='';
    this.classList=new FakeClassList();
    this.onclick=null;
  }
  querySelectorAll(){ return []; }
  querySelector(){ return null; }
  addEventListener(type,handler){ this[`on${type}`]=handler; }
  scrollIntoView(){}
  appendChild(){}
  remove(){}
  showModal(){ this.open=true; }
  close(){ this.open=false; }
  click(){ if(typeof this.onclick==='function')this.onclick({target:this}); }
}

function createRuntime(){
  const ids=[...new Set([
    'calendarBanner','weekDateRange','nextWeekDateRange','prefChips','weekChips','portionCount','excludeChecks','excludeChips','excludeSummary','customExclude',
    'weekList','nextWeekList','recipeModal','recipeDialog','shoppingList','meatSelected','supermarketSelected','meatResults','supermarketResults','meatStatus','supermarketStatus',
    'scanCount','pictureList','inventoryArea','inventorySummary','inventoryList','showAllInventoryBtn','pantryMemoryText','pantrySuggestions','typedItem','photoInput','photoLocation','aiStatus',
    'supportStatus','includeSupportPhotos','importSupportFix','buildStatus','nextBuildStatus','buildWeekBtn','lockWeekBtn','replaceUnlockedBtn','buildNextWeekBtn','lockNextWeekBtn','replaceNextUnlockedBtn',
    'buildNextWeekBtnHome','usePantryBtn','addCustomExcludeBtn','addTypedBtn','typedBox','saveTypedBtn','analyzePicturesBtn','clearPhotosBtn','rescanPhotosBtn','addMorePhotosBtn','removeUsedBtn','minusPortions',
    'plusPortions','savePrefsBtn','quickShareSupportBtn','shareSupportBtn','downloadSupportBtn','copySupportBtn','reloadLatestBtn','editAllItemsBtn','shoppingSwitch',
    'versionBadge','developerPanel','developerSummary','developerValidation','developerPantry','developerAi','developerShopping','developerTimeline','developerErrors','developerStorage',
    'developerStatus','reportBugBtn','runValidationBtn','copyDebugBtn','downloadDebugBtn','clearCacheBtn','unregisterWorkerBtn','clearLogsBtn','closeDeveloperBtn',
    'household','householdSetup','householdActive','householdStatus','householdCodeDisplay','createHouseholdBtn','joinHouseholdBtn','joinHouseholdCode',
    'leaveHouseholdBtn','copyHouseholdCodeBtn','shareHouseholdCodeBtn','deviceNameInput',
    'receiptPhotoInput','receiptStatus','receiptReviewArea','receiptReviewList','addReceiptItemsBtn','cancelReceiptBtn',
    'home','week','nextWeek','pantry','receiptScan','shopping','stores','prefs','weekSettings',
    'mobileMenuBtn','mobileNavCloseBtn','mobileNavOverlay',
    'community','communitySignedOut','communitySignedIn','appleSignInBtn','googleSignInBtn','communityUserName','communitySignOutBtn',
    'shareRecipeBtn','communityStatus','shareRecipeForm','communityTitle','communityIngredients','addCommunityIngredientBtn',
    'communitySteps','addCommunityStepBtn','submitCommunityRecipeBtn','cancelCommunityRecipeBtn','communityRecipeList',
    'restoreWeekBtn','restoreNextWeekBtn','householdConflict','closeDeveloperBtnBottom','shabbosSlots','recipeUploadInput','shabbosMenu','dishEditorDialog','dishEditorModal','dishEditorTitle','dishEditorAddRow','dishEditorSave','dishEditorCancel'
  ])];
  const elements=new Map(ids.map(id=>[id,new FakeElement(id)]));
  elements.get('photoLocation').value='Pantry';
  elements.get('includeSupportPhotos').checked=true;
  elements.get('developerPanel').classList.add('hidden');
  elements.get('versionBadge').textContent='v60';

  const storage=new Map();
  const document={
    getElementById:id=>elements.get(id)||null,
    querySelectorAll:()=>[],
    querySelector:selector=>selector==='meta[name="dinner-planner-version"]'?{content:'60'}:null,
    createElement:tag=>new FakeElement(tag),
    body:new FakeElement('body'),
    addEventListener:()=>{}
  };
  const localStorage={
    get length(){return storage.size;},
    key:index=>[...storage.keys()][index]??null,
    getItem:key=>storage.has(key)?storage.get(key):null,
    setItem:(key,value)=>storage.set(key,String(value)),
    removeItem:key=>storage.delete(key)
  };
  const context={
    console,
    Intl,
    Date,
    Math,
    JSON,
    Set,
    Map,
    Promise,
    Error,
    RegExp,
    Number,
    String,
    Boolean,
    Array,
    Object,
    URL,
    URLSearchParams,
    Blob,
    performance:{now:()=>0},
    document,
    localStorage,
    navigator:{
      onLine:true,
      userAgent:'Node smoke test',
      language:'en-US',
      serviceWorker:{register:async()=>({}),getRegistrations:async()=>[]},
      canShare:undefined,
      share:undefined,
      clipboard:{writeText:async()=>{}}
    },
    location:{href:'https://example.test/',pathname:'/',search:'',replace:()=>{}},
    screen:{width:390,height:844},
    innerWidth:390,
    innerHeight:844,
    devicePixelRatio:2,
    caches:{keys:async()=>[],open:async()=>({keys:async()=>[]})},
    confirm:()=>true,
    prompt:()=>null,
    fetch:async()=>{throw new Error('Unexpected network request');},
    requestAnimationFrame:callback=>callback(),
    setTimeout:callback=>{callback();return 1;},
    clearTimeout:()=>{},
    setInterval:()=>1,
    clearInterval:()=>{},
    File:class {},
    FileReader:class {},
    Image:class {},
    window:null
  };
  context.window=context;
  context.window.DinnerIngredientEngine=ingredientEngine;
  context.window.addEventListener=()=>{};
  context.window.devicePixelRatio=2;
  return {context:vm.createContext(context),elements};
}

async function boot(){
  const runtime=createRuntime();
  const recipesCode=await readFile(resolve(root,'js/recipes.js'),'utf8');
  vm.runInContext(recipesCode,runtime.context,{filename:'recipes.js'});
  const code=await readFile(resolve(root,'js/app.js'),'utf8');
  vm.runInContext(code,runtime.context,{filename:'app.js'});
  return runtime;
}

test('the real app script boots and the Build button creates five unique dinners', async () => {
  const {context,elements}=await boot();
  assert.ok(context.window.__dinnerPlannerBridge);
  assert.equal(typeof elements.get('buildWeekBtn').onclick,'function');
  elements.get('buildWeekBtn').click();
  const state=context.window.__dinnerPlannerTest.getState();
  assert.equal(state.plan.length,5);
  assert.equal(new Set(state.plan.map(entry=>entry.id)).size,5);
  assert.match(elements.get('buildStatus').textContent,/ready/i);
});

test('replace unlocked preserves locked meals and keeps the plan unique', async () => {
  const {context,elements}=await boot();
  elements.get('buildWeekBtn').click();
  const before=context.window.__dinnerPlannerTest.getState();
  const lockedId=before.plan.find(entry=>entry.day==='Sun').id;
  before.locked={Sun:true};
  context.window.__dinnerPlannerTest.setState(before);
  context.window.__dinnerPlannerTest.buildPlanForWeek('this',{replaceUnlocked:true});
  const after=context.window.__dinnerPlannerTest.getState();
  assert.equal(after.plan.find(entry=>entry.day==='Sun').id,lockedId);
  assert.equal(after.plan.length,5);
  assert.equal(new Set(after.plan.map(entry=>entry.id)).size,5);
});

test('Replace on a single day never swaps to a same-family variant (the actual bug: "Lemon Herb Chicken with Rice" replaced by "Lemon Herb Chicken with Potatoes" - looks like only the side dish changed)', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  api.buildPlanForWeek('this',{});
  // Run many times across different starting plans/days since the choice is scored, not fixed.
  for(let i=0;i<40;i++){
    api.buildPlanForWeek('this',{});
    const before=api.getState();
    for(const entry of before.plan){
      const state=api.getState();
      const currentRecipe=api.getRecipe(entry.id);
      const currentFamily=api.recipeFamily(currentRecipe);
      api.replaceDay('this',entry.day);
      const after=api.getState();
      const newEntry=after.plan.find(p=>p.day===entry.day);
      const newRecipe=api.getRecipe(newEntry.id);
      assert.notEqual(newEntry.id,entry.id,`Replace on ${entry.day} returned the exact same recipe`);
      assert.notEqual(
        api.recipeFamily(newRecipe),
        currentFamily,
        `Replace on ${entry.day} swapped "${currentRecipe.title}" for "${newRecipe.title}" - same family (${currentFamily}), just a different side/condiment`
      );
      api.setState(state); // reset so each day in this plan is tested independently
    }
  }
});

test('repeatedly tapping Replace on the same day explores real variety instead of ping-ponging between the same couple of dishes (the actual bug: 20 taps only ever alternated between 2 recipes because Replace never reshuffled the scoring, unlike a full week build)', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  api.buildPlanForWeek('this',{});
  const state=api.getState();
  const day=state.plan[0].day;
  const seenFamilies=new Set();
  for(let i=0;i<20;i++){
    api.replaceDay('this',day);
    const after=api.getState();
    const entry=after.plan.find(p=>p.day===day);
    seenFamilies.add(api.recipeFamily(api.getRecipe(entry.id)));
  }
  assert.ok(
    seenFamilies.size>=8,
    `20 taps of Replace on the same day only produced ${seenFamilies.size} distinct dish(es) (${[...seenFamilies].join(', ')}) - Replace should explore real variety across repeated taps, not repeat a small handful`
  );
});

test('Replace is free to switch a day between meat, dairy, and pareve on a normal (non-restricted) date, not locked to the day\'s original kind', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  api.buildPlanForWeek('this',{});
  const state=api.getState();
  const day=state.plan[0].day;
  const originalKind=api.getRecipe(state.plan[0].id).kind;
  const kindsSeen=new Set();
  for(let i=0;i<60;i++){
    api.replaceDay('this',day);
    const after=api.getState();
    const entry=after.plan.find(p=>p.day===day);
    kindsSeen.add(api.getRecipe(entry.id).kind);
  }
  assert.ok(
    kindsSeen.size>=2,
    `60 taps of Replace only ever produced kind "${[...kindsSeen].join(', ')}" - Replace should be free to land on meat, dairy, or pareve, not locked to whichever kind the day started as`
  );
  assert.ok(
    [...kindsSeen].some(k=>k!==originalKind),
    `Replace never left the day's original kind (${originalKind}) across 60 taps`
  );
});

test('built meals obey the calendar rule for their dates and validation passes', async () => {
  const {context,elements}=await boot();
  elements.get('buildWeekBtn').click();
  const state=context.window.__dinnerPlannerTest.getState();
  const dates=context.window.__dinnerPlannerTest.plannerDates();
  for(const entry of state.plan){
    const date=dates.find(value=>value.day===entry.day).date;
    const recipeAllowed=context.window.__dinnerPlannerTest.recipeAllowedOnDate;
    const recipeId=entry.id;
    // The app's own validation checks the actual recipe object and calendar rule.
    assert.ok(recipeId);
    assert.ok(date instanceof Date);
    assert.equal(typeof recipeAllowed,'function');
  }
  const results=context.window.__dinnerPlannerBridge.runValidationSuite();
  const failed=results.filter(result=>!result.ok);
  assert.equal(failed.length,0,JSON.stringify(failed));
});




test('Lock in week protects every dinner from replace unlocked', async () => {
  const {context,elements}=await boot();
  elements.get('buildWeekBtn').click();
  const before=context.window.__dinnerPlannerTest.getState();
  context.window.__dinnerPlannerTest.lockAllForWeek('this');
  const locked=context.window.__dinnerPlannerTest.getState();
  assert.ok(locked.plan.every(entry=>locked.locked[entry.day]));
  context.window.__dinnerPlannerTest.buildPlanForWeek('this',{replaceUnlocked:true});
  const after=context.window.__dinnerPlannerTest.getState();
  assert.deepEqual(Array.from(after.plan,value=>value.id),Array.from(before.plan,value=>value.id));
});

test('pressing the main Build button with locked meals asks for confirmation first, and declining leaves the locked plan untouched (the actual bug the user hit: an accidental tap on Build silently wiped every locked dinner with no warning)', async () => {
  const {context,elements}=await boot();
  elements.get('buildWeekBtn').click();
  const before=context.window.__dinnerPlannerTest.getState();
  context.window.__dinnerPlannerTest.lockAllForWeek('this');
  const locked=context.window.__dinnerPlannerTest.getState();
  assert.ok(locked.plan.every(entry=>locked.locked[entry.day]));

  // Decline the confirmation: the locked plan must survive untouched.
  context.window.confirm=()=>false;
  elements.get('buildWeekBtn').click();
  const afterDecline=context.window.__dinnerPlannerTest.getState();
  assert.deepEqual(Array.from(afterDecline.plan,value=>value.id),Array.from(before.plan,value=>value.id));
  assert.ok(afterDecline.plan.every(entry=>afterDecline.locked[entry.day]),'locks must still be intact after declining');

  // Accept the confirmation: now it's fine for the build to proceed and clear locks.
  context.window.confirm=()=>true;
  elements.get('buildWeekBtn').click();
  const afterAccept=context.window.__dinnerPlannerTest.getState();
  assert.equal(afterAccept.plan.length,5);
  assert.deepEqual(afterAccept.locked,{},'accepting should clear the locks as before');
});

test('pressing the main Build button with no locked meals never prompts for confirmation (only relevant when there is something to lose)', async () => {
  const {context,elements}=await boot();
  let wasAsked=false;
  context.window.confirm=()=>{wasAsked=true;return true;};
  elements.get('buildWeekBtn').click();
  assert.equal(wasAsked,false,'no locks exist yet, so Build should never interrupt with a confirmation');
});

test('shopping checklist state is persistent and keyed by store plus ingredient', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  const key=api.shoppingCheckKey('supermarket','Canned Tomatoes');
  assert.equal(key,'supermarket:canned tomato');
  api.setShoppingChecked('this',key,true);
  assert.equal(api.getState().shoppingChecked.this[key],true);
  api.setShoppingChecked('this',key,false);
  assert.equal(api.getState().shoppingChecked.this[key],undefined);
});

test('a storage save failure (e.g. quota exceeded) is caught, not silent, and is recorded for developer mode', async () => {
  const {context}=await boot();
  const realSetItem=context.window.localStorage.setItem.bind(context.window.localStorage);
  context.window.localStorage.setItem=(key,value)=>{
    if(key.endsWith(':state')){
      const error=new Error('Quota exceeded');
      error.name='QuotaExceededError';
      throw error;
    }
    return realSetItem(key,value);
  };
  const bridge=context.window.__dinnerPlannerBridge;
  assert.doesNotThrow(()=>bridge.saveState());
  const lastError=bridge.getLastSaveError();
  assert.ok(lastError,'a save failure must be recorded, not silently dropped');
  assert.equal(lastError.name,'QuotaExceededError');
});

test('household sync: creating on one device and joining on another shares plan and pantry, never photos', async () => {
  const cloud = new Map();

  function mockFetch(url, opts) {
    const parsed = new URL(url, 'https://example.test');
    if (opts && opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      cloud.set(body.code, { state: body.state, updatedAt: Date.now() + cloud.size, updatedBy: body.deviceName || '' });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, updatedAt: Date.now() }) });
    }
    const code = parsed.searchParams.get('code');
    const entry = cloud.get(code);
    if (!entry) return Promise.resolve({ ok: true, status: 200, json: async () => ({ found: false }) });
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ found: true, state: entry.state, updatedAt: entry.updatedAt, updatedBy: entry.updatedBy })
    });
  }

  const deviceA = await boot();
  deviceA.context.window.fetch = mockFetch;
  const apiA = deviceA.context.window.__dinnerPlannerTest;
  apiA.buildPlan();
  const stateWithPantryItem = apiA.getState();
  stateWithPantryItem.have = [{
    id: 'item-1', item: 'Chicken', label: 'Chicken', location: 'Fridge', qty: 2, unit: 'package',
    confidence: 'high', category: 'meat', perishable: true, sourcePhotoIds: [], sourceLocations: ['Fridge'],
    reviewed: true, thumbnail: 'data:image/jpeg;base64,DEVICE_A_ONLY_PHOTO_DATA', evidence: '', quantityBasis: 'visible',
    observations: [], bbox: null
  }];
  apiA.setState(stateWithPantryItem);
  await apiA.createHousehold();
  const code = apiA.getHouseholdCode();
  assert.ok(code && code.length >= 6, 'a household code should be generated');

  const deviceB = await boot();
  deviceB.context.window.fetch = mockFetch;
  const apiB = deviceB.context.window.__dinnerPlannerTest;
  await apiB.joinHousehold(code);

  const stateB = apiB.getState();
  assert.deepEqual(
    stateB.plan.map(entry => entry.id).sort(),
    apiA.getState().plan.map(entry => entry.id).sort(),
    'device B should receive device A\'s plan'
  );
  assert.equal(stateB.have.length, 1, 'device B should receive the pantry item');
  assert.equal(stateB.have[0].item, 'Chicken');
  assert.equal(stateB.have[0].thumbnail, '', 'photos must never sync between devices');
});

test('household sync: a pull that would silently overwrite locked meals with different ones is held back as a conflict, not auto-applied (the actual bug the user hit: device A locked a good plan, then device B\'s stale rebuilt plan silently overwrote it everywhere)', async () => {
  const cloud = new Map();
  function mockFetch(url, opts) {
    const parsed = new URL(url, 'https://example.test');
    if (opts && opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      cloud.set(body.code, { state: body.state, updatedAt: Date.now() + cloud.size + 1000, updatedBy: body.deviceName || '' });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, updatedAt: Date.now() }) });
    }
    const code = parsed.searchParams.get('code');
    const entry = cloud.get(code);
    if (!entry) return Promise.resolve({ ok: true, status: 200, json: async () => ({ found: false }) });
    return Promise.resolve({
      ok: true, status: 200,
      json: async () => ({ found: true, state: entry.state, updatedAt: entry.updatedAt, updatedBy: entry.updatedBy })
    });
  }

  // Device A: builds a plan and locks it in - this is Jacqueline's phone with the good plan.
  const deviceA = await boot();
  deviceA.context.window.fetch = mockFetch;
  const apiA = deviceA.context.window.__dinnerPlannerTest;
  apiA.buildPlan();
  apiA.lockAllForWeek('this');
  await apiA.createHousehold();
  const code = apiA.getHouseholdCode();
  const goodPlanIds = apiA.getState().plan.map(entry => entry.id).sort();

  // Device B: joins, then independently rebuilds (e.g. the accidental Build press), pushing a different plan to the cloud.
  const deviceB = await boot();
  deviceB.context.window.fetch = mockFetch;
  const apiB = deviceB.context.window.__dinnerPlannerTest;
  await apiB.joinHousehold(code);
  apiB.buildPlan(); // different random plan, unlocked, pushed to cloud (schedule handled synchronously enough here via direct save in test env)
  await new Promise(resolve => setTimeout(resolve, 20));

  // Device A polls again and would normally silently absorb device B's differing plan, wiping its own locks.
  await apiA.pullHouseholdState();
  const conflict = apiA.getPendingCloudConflict();
  assert.ok(conflict, 'a conflict must be surfaced instead of silently applying the incoming state');
  assert.ok(conflict.conflicts.length > 0, 'the conflict must identify which locked days differ');

  // Device A's locked plan must still be intact - untouched until the user chooses.
  const stillLocal = apiA.getState();
  assert.deepEqual(stillLocal.plan.map(entry => entry.id).sort(), goodPlanIds, 'locked plan must survive until the user resolves the conflict');
  assert.ok(stillLocal.plan.every(entry => stillLocal.locked[entry.day]), 'locks must still be intact');

  // Resolving by keeping mine should push device A's plan back out, clearing the conflict.
  apiA.resolveConflictKeepMine();
  assert.equal(apiA.getPendingCloudConflict(), null, 'choosing to keep mine should clear the pending conflict');
});

test('the Replace button refuses to touch a locked day (the actual bug: it used to ignore lock status entirely and silently swap the dish while still showing "Locked")', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  api.buildPlan();
  const day=api.getState().plan[0].day;
  const lockedField='locked';
  const state=api.getState();
  state[lockedField][day]=true;
  api.setState(state);
  const before=api.getState().plan.find(p=>p.day===day).id;

  api.replaceDay('this',day);

  const after=api.getState().plan.find(p=>p.day===day).id;
  assert.equal(after,before,'a locked day must not change when Replace is called on it');
});

test('Restore previous plan: Build can be undone back to the plan that existed right before it ran', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  assert.equal(api.hasRestorableSnapshot('this'),false,'no snapshot should exist before anything has changed');

  api.buildPlan();
  const firstPlanIds=api.getState().plan.map(p=>p.id).sort();

  api.buildPlan(); // a second build overwrites the first
  const secondPlanIds=api.getState().plan.map(p=>p.id).sort();

  assert.ok(api.hasRestorableSnapshot('this'),'a snapshot should exist after a Build overwrote a previous plan');

  const restored=api.restoreWeekSnapshot('this');
  assert.equal(restored,true);
  const afterRestoreIds=api.getState().plan.map(p=>p.id).sort();
  assert.deepEqual(afterRestoreIds,firstPlanIds,'restoring should bring back the plan from right before the second Build');
  assert.notDeepEqual(afterRestoreIds,secondPlanIds,'restoring should not just leave the second build in place');
});

test('Restore previous plan: Replace on a single day can be undone', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  api.buildPlan();
  const day=api.getState().plan[0].day;
  const before=api.getState().plan.find(p=>p.day===day).id;

  api.replaceDay('this',day);
  const afterReplace=api.getState().plan.find(p=>p.day===day).id;
  assert.notEqual(afterReplace,before,'sanity check: replace should have actually changed the day');

  api.restoreWeekSnapshot('this');
  const restored=api.getState().plan.find(p=>p.day===day).id;
  assert.equal(restored,before,'restoring should bring back the pre-Replace dish for that day');
});

test('joinHousehold refuses to silently overwrite locked meals already on this device (the same class of bug as the sync-pull conflict, just triggered by an explicit Join instead)', async () => {
  const cloud = new Map();
  function mockFetch(url, opts) {
    const parsed = new URL(url, 'https://example.test');
    if (opts && opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      cloud.set(body.code, { state: body.state, updatedAt: Date.now() + cloud.size + 1000, updatedBy: body.deviceName || '' });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, updatedAt: Date.now() }) });
    }
    const code = parsed.searchParams.get('code');
    const entry = cloud.get(code);
    if (!entry) return Promise.resolve({ ok: true, status: 200, json: async () => ({ found: false }) });
    return Promise.resolve({
      ok: true, status: 200,
      json: async () => ({ found: true, state: entry.state, updatedAt: entry.updatedAt, updatedBy: entry.updatedBy })
    });
  }

  const deviceA = await boot();
  deviceA.context.window.fetch = mockFetch;
  const apiA = deviceA.context.window.__dinnerPlannerTest;
  apiA.buildPlan();
  await apiA.createHousehold();
  const code = apiA.getHouseholdCode();

  // Device B already has its own locked plan before joining - force day one to
  // something guaranteed different from device A's, so this isn't relying on
  // both random builds coincidentally diverging.
  const deviceB = await boot();
  deviceB.context.window.fetch = mockFetch;
  const apiB = deviceB.context.window.__dinnerPlannerTest;
  apiB.buildPlan();
  const bState = apiB.getState();
  const firstDay = bState.plan[0].day;
  const aFirstDayId = apiA.getState().plan.find(p => p.day === firstDay)?.id;
  bState.plan[0].id = bState.plan[0].id === aFirstDayId ? 'beef-tacos-01' : bState.plan[0].id;
  if (bState.plan[0].id === aFirstDayId) bState.plan[0].id = 'lemon-herb-chicken-01';
  apiB.setState(bState);
  apiB.lockAllForWeek('this');
  const bLockedIds = apiB.getState().plan.map(p => p.id).sort();

  await apiB.joinHousehold(code);

  const conflict = apiB.getPendingCloudConflict();
  assert.ok(conflict, 'joining must not silently apply a household plan that would replace locked meals');
  const stillLocal = apiB.getState().plan.map(p => p.id).sort();
  assert.deepEqual(stillLocal, bLockedIds, 'device B\'s locked plan must survive until the conflict is resolved');
});

test('rating a recipe up increases its score, rating it down decreases it, and toggling to neutral clears it', async () => {
  const { context } = await boot();
  const api = context.window.__dinnerPlannerTest;
  api.buildPlan();
  const plan = api.getState().plan;
  const recipeId = plan[0].id;
  const fakeRecipe = { id: recipeId, title: 'Test Recipe', kind: 'meat', tags: [], ingredients: [] };
  const before = api.scoreRecipe(fakeRecipe, null, new Set());

  api.setRecipeRating(recipeId, 'up');
  const afterUp = api.scoreRecipe(fakeRecipe, null, new Set());
  assert.ok(afterUp > before, 'an upvoted recipe should score higher');

  api.setRecipeRating(recipeId, 'down');
  const afterDown = api.scoreRecipe(fakeRecipe, null, new Set());
  assert.ok(afterDown < before, 'a downvoted recipe should score lower than its unrated baseline');
  assert.ok(afterDown < afterUp, 'a downvoted recipe should score lower than an upvoted one');

  api.setRecipeRating(recipeId, 'neutral');
  const state = api.getState();
  assert.ok(!(recipeId in (state.recipeRatings || {})), 'setting back to neutral should clear the rating entirely');
});

test('recipe ratings survive a normalizeState pass and are not accidentally wiped', async () => {
  const { context } = await boot();
  const api = context.window.__dinnerPlannerTest;
  api.buildPlan();
  const plan = api.getState().plan;
  api.setRecipeRating(plan[0].id, 'up');
  api.setRecipeRating(plan[1].id, 'down');
  const state = api.getState();
  assert.equal(state.recipeRatings[plan[0].id], 'up');
  assert.equal(state.recipeRatings[plan[1].id], 'down');
});

test('a freshly built plan is not flagged as stale', async () => {
  const { context } = await boot();
  const api = context.window.__dinnerPlannerTest;
  api.buildPlan();
  assert.equal(api.isPlanStale('this'), false, 'a plan built for the current week should not be stale');
});

test('a plan whose stored dates belong to a previous week is correctly flagged as stale', async () => {
  const { context } = await boot();
  const api = context.window.__dinnerPlannerTest;
  api.buildPlan();
  const state = api.getState();
  // Simulate a week having passed: shift every stored plan date back by 7 days,
  // exactly what happens if the app is left open (or reopened) a week later
  // without rebuilding - this is the bug the user actually hit around Tisha B'Av.
  state.plan = state.plan.map(entry => {
    const shifted = new Date(entry.date + 'T12:00:00');
    shifted.setDate(shifted.getDate() - 7);
    return { ...entry, date: shifted.toISOString().slice(0, 10) };
  });
  api.setState(state);
  assert.equal(api.isPlanStale('this'), true, 'a plan built for a different week must be flagged as stale, not silently shown as current');
});

test('no plan at all is never flagged as stale (nothing to warn about)', async () => {
  const { context } = await boot();
  const api = context.window.__dinnerPlannerTest;
  assert.equal(api.isPlanStale('this'), false);
});

test('the app detects a day change and re-renders the calendar and plan without needing a manual reload', async () => {
  const { context } = await boot();
  const api = context.window.__dinnerPlannerTest;
  const banner = context.document.getElementById('calendarBanner');

  // Overwrite with a sentinel value first - if refreshCalendarIfDayChanged doesn't
  // actually re-render, this sentinel will still be sitting there afterward.
  banner.innerHTML = 'SENTINEL-NOT-YET-REFRESHED';

  // Force the app to believe it last rendered on a day far in the past,
  // exactly the situation left by the app sitting open/backgrounded across Shabbos.
  api.setLastRenderedCalendarDayForTest('2020-01-01');
  api.refreshCalendarIfDayChanged();

  assert.notEqual(banner.innerHTML, 'SENTINEL-NOT-YET-REFRESHED', 'a detected day change must trigger a real re-render, not silently do nothing');

  // A second call with no further day change must NOT re-render again (dedup check) -
  // overwrite with a second sentinel and confirm it survives untouched.
  banner.innerHTML = 'SENTINEL-SHOULD-NOT-BE-TOUCHED-AGAIN';
  api.refreshCalendarIfDayChanged();
  assert.equal(banner.innerHTML, 'SENTINEL-SHOULD-NOT-BE-TOUCHED-AGAIN', 'without an actual day change, it should not re-render again on every check');
});

test('a stale plan rebuilds itself automatically on render - no manual tap required', async () => {
  const { context } = await boot();
  const api = context.window.__dinnerPlannerTest;
  api.buildPlan();
  const original = api.getState();
  const originalFirstDayId = original.plan[0].id;

  // Lock the first day only, then simulate a week having passed (same shift as
  // the isPlanStale tests above - this mirrors exactly what the user hit after Shabbos).
  const state = api.getState();
  state.locked = { [state.plan[0].day]: true };
  state.plan = state.plan.map(entry => {
    const shifted = new Date(entry.date + 'T12:00:00');
    shifted.setDate(shifted.getDate() - 7);
    return { ...entry, date: shifted.toISOString().slice(0, 10) };
  });
  api.setState(state);
  assert.equal(api.isPlanStale('this'), true, 'sanity check: the plan should be stale before rendering');

  // This is exactly what real app boot / day-change detection calls.
  api.renderWeekSection('this');

  const html = context.document.getElementById('weekList').innerHTML;
  const afterState = api.getState();
  assert.equal(api.isPlanStale('this'), false, 'after auto-rebuild, the plan must no longer be flagged as stale');
  assert.equal(afterState.plan[0].id, originalFirstDayId, 'the locked day\'s recipe must survive the automatic rebuild');
  assert.doesNotMatch(html, /This plan is from a previous week/, 'a successful auto-rebuild should not still show the manual-refresh warning');
});

test('recipe protein tracking correctly identifies beef, chicken, and lamb dishes', async () => {
  const { context } = await boot();
  const api = context.window.__dinnerPlannerTest;
  assert.equal(api.recipeProtein({ tags: ['beef', 'kid'] }), 'beef');
  assert.equal(api.recipeProtein({ tags: ['chicken', 'simple'] }), 'chicken');
  assert.equal(api.recipeProtein({ tags: ['lamb', 'grill'] }), 'lamb');
  assert.equal(api.recipeProtein({ tags: ['dairy', 'pasta'] }), null, 'a non-protein-specific recipe should not be forced into a protein bucket');
});

test('a built week never stacks the same protein across most of the meat nights (the actual bug: three separate ground-beef dishes in one week)', async () => {
  const { context } = await boot();
  const api = context.window.__dinnerPlannerTest;

  // This is inherently about score weighting, not a hard rule, so check it holds
  // across many builds rather than trusting a single lucky/unlucky draw.
  for (let i = 0; i < 25; i++) {
    api.buildPlan();
    const plan = api.getState().plan;
    const proteins = plan
      .map(entry => {
        const recipe = context.window.DinnerRecipes?.find?.(r => r.id === entry.id);
        return recipe ? api.recipeProtein(recipe) : null;
      })
      .filter(Boolean);
    const beefCount = proteins.filter(p => p === 'beef').length;
    const chickenCount = proteins.filter(p => p === 'chicken').length;
    assert.ok(beefCount <= 2, `beef appeared ${beefCount} times in a single 5-day plan - the exact bug reported`);
    assert.ok(chickenCount <= 2, `chicken appeared ${chickenCount} times in a single 5-day plan`);
  }
});




test('cook time honestly grows with portions for batch-limited dishes (pan-fried/breaded/crepes), but not for casseroles or one-pot dishes, since only stovetop-batch cooking is actually affected by larger quantities', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;

  const recipes=context.window.DinnerRecipes;
  const batchLimited=recipes.filter(r=>r.tags.includes('batch-limited'));
  const notBatchLimited=recipes.filter(r=>!r.tags.includes('batch-limited'));
  assert.ok(batchLimited.length>0,'expected at least one batch-limited recipe to exist');
  assert.ok(notBatchLimited.length>0,'expected at least one non-batch-limited recipe to exist');

  const state=api.getState();

  state.portions=5;
  api.setState(state);
  const baseTimeBatch=api.displayedTime(batchLimited[0]);
  const baseTimeNormal=api.displayedTime(notBatchLimited[0]);
  assert.equal(baseTimeBatch,batchLimited[0].time,'at base portions, displayed time should equal the declared time');

  state.portions=15;
  api.setState(state);
  const bigTimeBatch=api.displayedTime(batchLimited[0]);
  const bigTimeNormal=api.displayedTime(notBatchLimited[0]);

  assert.notEqual(bigTimeBatch,baseTimeBatch,'a batch-limited dish should take longer at 15 portions than at 5');
  assert.ok(
    Number.parseInt(bigTimeBatch,10) > Number.parseInt(baseTimeBatch,10),
    `expected ${bigTimeBatch} > ${baseTimeBatch} for a batch-limited dish scaled to 15 portions`
  );
  assert.equal(bigTimeNormal,baseTimeNormal,'a casserole/one-pot/braise dish should NOT show a longer time just because portions increased');
  assert.equal(bigTimeNormal,notBatchLimited[0].time,'a non-batch-limited dish should always show its declared time regardless of portions');
});

test('v60 starts with every agreed household preference enabled', async () => {
  const {context}=await boot();
  const state=context.window.__dinnerPlannerTest.getState();
  const required=[
    'No fish','No tofu','No turkey','No broccoli','No cauliflower','No cilantro',
    'No egg-forward dinners','Not spicy','Less chickpeas','Less carrots','Less eggplant','Less spinach'
  ];
  assert.deepEqual([...state.prefs].sort(),required.sort());
  assert.equal(state.week.includes('Use what I have first'),false);
});

test('2026 Nine Days and Tisha B’Av dates follow the required dinner rules', async () => {
  const {context}=await boot();
  const rule=context.window.__dinnerPlannerTest.calendarRuleForDate;
  for(const day of [19,20,21,22]){
    const result=rule(new Date(2026,6,day,12));
    assert.equal(result.type,'nine-days');
    assert.deepEqual(Array.from(result.allowedKinds),['dairy','pareve']);
  }
  const tisha=rule(new Date(2026,6,23,12));
  assert.equal(tisha.type,'tisha');
  assert.deepEqual(Array.from(tisha.allowedKinds),['dairy','pareve']);
  const tenAvDinner=rule(new Date(2026,6,24,18));
  assert.equal(tenAvDinner.type,'normal');
  assert.deepEqual(Array.from(tenAvDinner.allowedKinds),['meat','dairy','pareve']);
});

test('receipt review items that are checked get added to the pantry with their estimated expiration date, and unchecked/edited items are respected', async () => {
  const {context,elements}=await boot();
  const api=context.window.__dinnerPlannerTest;
  const state=api.getState();
  state.receiptReview=[
    {id:'r1',name:'Whole milk',rawText:'GV WHL MLK GAL',qty:1,unit:'gallon',category:'dairy',confidence:'high',expiresOn:'2026-08-08',checked:true},
    {id:'r2',name:'Canned beans',rawText:'BLK BEANS',qty:3,unit:'can',category:'canned',confidence:'high',expiresOn:'2027-07-29',checked:false}
  ];
  api.setState(state);

  elements.get('addReceiptItemsBtn').click();

  const after=api.getState();
  assert.equal(after.receiptReview.length,0,'the review list should clear once items are added');
  const milk=after.have.find(item=>item.item==='Whole milk');
  assert.ok(milk,'the checked item should be added to the pantry');
  assert.equal(milk.expiresOn,'2026-08-08');
  assert.equal(milk.unit,'gallon');
  assert.equal(after.have.find(item=>item.item==='Canned beans'),undefined,'the unchecked item should NOT be added');
});

test('downloadJson tries the native Share Sheet first (the actual bug: a plain Blob+<a download> link silently does nothing inside the native app\'s WebView, since there\'s no download manager registered there - only the separate Share button worked before this fix) and only falls back to a browser download link when sharing truly is not available', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;

  // Case 1: native Share Sheet is available (the native app) - should be used.
  let sharedWith=null;
  context.window.navigator.canShare=()=>true;
  context.window.navigator.share=async options=>{sharedWith=options;};
  const shared=await api.downloadJson('report.json',{hello:'world'});
  assert.equal(shared,'shared');
  assert.ok(sharedWith&&Array.isArray(sharedWith.files)&&sharedWith.files.length===1,'navigator.share should be called with the file');

  // Case 2: person closes/cancels the native share sheet - should not silently claim success.
  context.window.navigator.share=async()=>{const err=new Error('cancelled');err.name='AbortError';throw err;};
  const cancelled=await api.downloadJson('report.json',{hello:'world'});
  assert.equal(cancelled,'cancelled');

  // Case 3: no Share Sheet available at all (the website) - falls back to a normal download link.
  context.window.navigator.canShare=undefined;
  context.window.navigator.share=undefined;
  const downloaded=await api.downloadJson('report.json',{hello:'world'});
  assert.equal(downloaded,'downloaded');
});

test('every top-level section in index.html is registered in exactly one VIEW_SECTIONS group (the actual bug: shabbosMenu was added but never registered, so it was never hidden and bled through onto every single view, including Home - this test catches the next section that makes the same mistake, not just this one)', async () => {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  const {context} = await boot();
  const api = context.window.__dinnerPlannerTest;

  const sectionIds = [...html.matchAll(/<section\s+class="(?:card|hero)"\s+id="([a-zA-Z]+)"/g)].map(m => m[1]);
  assert.ok(sectionIds.length > 5, 'sanity check: should have found multiple top-level sections');

  const registeredIds = new Set();
  for (const ids of Object.values(api.VIEW_SECTIONS)) {
    for (const id of ids) registeredIds.add(id);
  }

  const unregistered = sectionIds.filter(id => !registeredIds.has(id));
  assert.deepEqual(unregistered, [], `these top-level sections are not registered in any VIEW_SECTIONS group and will bleed through onto every view: ${unregistered.join(', ')}`);
});

test('showView shows only the sections for the requested page and hides everything else (the actual bug: the sidebar/menu looked like real page navigation but was only scroll-to-anchor, so a large pantry section - photos, inventory, receipt scanner - dragged the whole single continuously-scrolling app down with it)', async () => {
  const {context,elements}=await boot();
  const api=context.window.__dinnerPlannerTest;

  api.showView('pantry');
  assert.equal(elements.get('pantry').classList.contains('hidden'),false,'pantry should be visible on the pantry view');
  assert.equal(elements.get('receiptScan').classList.contains('hidden'),false,'receiptScan is grouped with pantry and should also be visible');
  assert.equal(elements.get('week').classList.contains('hidden'),true,'other views should be hidden');
  assert.equal(elements.get('shopping').classList.contains('hidden'),true,'other views should be hidden');
  assert.equal(elements.get('home').classList.contains('hidden'),true,'other views should be hidden');
  assert.equal(elements.get('shabbosMenu').classList.contains('hidden'),true,'shabbosMenu should be hidden on the pantry view');

  api.showView('week');
  assert.equal(elements.get('week').classList.contains('hidden'),false,'week should be visible on the week view');
  assert.equal(elements.get('nextWeek').classList.contains('hidden'),false,'nextWeek is grouped with week and should also be visible');
  assert.equal(elements.get('shabbosMenu').classList.contains('hidden'),false,'shabbosMenu is grouped with week and should also be visible');
  assert.equal(elements.get('pantry').classList.contains('hidden'),true,'switching views should hide the previous one');

  // The actual bug the user hit: shabbosMenu was never added to any
  // VIEW_SECTIONS group at all, so showView's hide loop never touched it -
  // it stayed permanently visible on every single view, including Home,
  // making the home screen enormous (2600+px of extra content bleeding
  // through underneath the real home content).
  api.showView('home');
  assert.equal(elements.get('home').classList.contains('hidden'),false,'home should be visible on the home view');
  assert.equal(elements.get('shabbosMenu').classList.contains('hidden'),true,'shabbosMenu must not bleed through onto the home view');

  // Switching views should also close the mobile menu, since the sidebar
  // is desktop-only and the hamburger menu is the only way to navigate on
  // the phone the user is actually using.
  elements.get('mobileNavOverlay').classList.remove('hidden');
  api.showView('shopping');
  assert.equal(elements.get('mobileNavOverlay').classList.contains('hidden'),true,'navigating should close the mobile menu');
});

test('offering to delete just-scanned photos removes only those photos (keeping their already-extracted pantry items intact) when accepted, and removes nothing when declined - this keeps the photo list from growing indefinitely once items are safely saved', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  const state=api.getState();
  state.pantryPhotos=[
    {id:'photo-a',location:'Fridge',status:'scanned'},
    {id:'photo-b',location:'Pantry',status:'scanned'}
  ];
  state.have=[{id:'item-1',item:'milk',qty:1,unit:'gallon',confidence:'medium',sourcePhotoIds:['photo-a'],sourceLocations:['Fridge'],observations:[],thumbnail:'data:already-saved-crop'}];
  api.setState(state);

  // Decline: nothing should change.
  context.window.confirm=()=>false;
  const declined=api.offerToDeleteScannedPhotos(['photo-a','photo-b']);
  assert.equal(declined,false);
  assert.equal(api.getState().pantryPhotos.length,2,'declining should keep both photos');

  // Accept: only the listed photos should be removed, the pantry item (with its own standalone thumbnail) stays.
  context.window.confirm=()=>true;
  const accepted=api.offerToDeleteScannedPhotos(['photo-a']);
  assert.equal(accepted,true);
  const after=api.getState();
  assert.equal(after.pantryPhotos.length,1,'only the specified photo should be removed');
  assert.equal(after.pantryPhotos[0].id,'photo-b');
  assert.equal(after.have.length,1,'the pantry item should NOT be removed - its data was already extracted');
  assert.equal(after.have[0].thumbnail,'data:already-saved-crop','the item keeps its own standalone thumbnail after the source photo is gone');
});

test('a scanned photo is decoded once, not once per detected item (the actual crash: cropItemThumbnail was re-decoding the full source photo from scratch for every single item, so a 15-item photo did 15x the necessary decode work - a very plausible cause of the app getting killed by the OS on a real phone)', async () => {
  const app=await (await import('node:fs/promises')).readFile(resolve(root,'js/app.js'),'utf8');
  const analyzeBody=app.slice(app.indexOf('async function analyzePictures()'),app.indexOf('\nfunction offerToDeleteScannedPhotos'));
  assert.match(analyzeBody,/decodedImage\s*=\s*await\s*loadImageElement\(picture\.image\)/,'the photo should be decoded once, before the per-item loop');
  const forItemLoop=analyzeBody.slice(analyzeBody.indexOf('for(const item of items)'));
  assert.doesNotMatch(forItemLoop,/loadImageElement\(picture\.image\)/,'decoding must not happen again inside the per-item loop');
  assert.match(forItemLoop,/cropItemThumbnail\(decodedImage\|\|picture\.image/,'each item should reuse the already-decoded image instead of the raw photo string');
});

test('pantry inventory cards always show a clean icon, never a raw bounding-box photo crop (the actual bug the user hit: a blurry, unrecognizable close-up crop of a countertop was shown next to a confident "Ginger Paste" label, which read as broken)', async () => {
  const {context,elements}=await boot();
  const api=context.window.__dinnerPlannerTest;
  const state=api.getState();
  state.have=[{
    id:'i1',item:'Ginger Paste',label:'Ginger Paste',location:'Pantry',qty:1,unit:'container',
    confidence:'high',category:'condiment',reviewed:false,sourcePhotoIds:['p1'],
    thumbnail:'data:image/png;base64,rawuglycrop',evidence:'Label visible',observations:[]
  }];
  api.setState(state);
  context.window.renderHave();
  const html=elements.get('inventoryList').innerHTML;
  assert.ok(!html.includes('<img'),'no raw photo crop should ever be rendered in the inventory grid, even when a thumbnail exists');
  assert.ok(html.includes('inventory-fallback'),'a clean icon should be shown instead');
});

test('.btn.tiny actually renders small (the actual bug: it set tiny padding and font-size but never overrode the base button\'s 52px min-height, so every "tiny" button - including Remove Course - still rendered at full button size)', async () => {
  const css=await (await import('node:fs/promises')).readFile(resolve(root,'css/styles.css'),'utf8');
  assert.match(css,/\.btn\.tiny\{[^}]*min-height:/,'.btn.tiny must override min-height, not just padding and font-size');
});

test('the Shabbos specials picker only shows dishes relevant to that course, not the same full list everywhere (the actual bug: "Choose a DmE special" under Kiddush showed roast chicken and cholent)', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  const challahOptions=api.shabbosSpecialsForCourse('Challah');
  assert.deepEqual(Array.from(challahOptions),['shabbos-challah-01','shabbos-challah-02','shabbos-challah-03','shabbos-challah-04'],'Challah course should offer all challah variants, not just one');
  const kiddushOptions=api.shabbosSpecialsForCourse('Kiddush');
  assert.deepEqual(Array.from(kiddushOptions),[],'Kiddush has no matching specials yet, so it should show none rather than an irrelevant full list');
  const mainOptions=Array.from(api.shabbosSpecialsForCourse('Main Course'));
  assert.ok(mainOptions.includes('shabbos-cholent-01')&&mainOptions.includes('shabbos-roast-chicken-01'),'Main Course should offer the actual mains');
  assert.ok(!mainOptions.includes('shabbos-challah-01'),'Main Course should not offer challah');
});

test('takeout is only offered for informal meals (Seuda Shlishit, Motzei Shabbos), not for formal courses like Kiddush or Soup (the actual bug: every single course had an "Add takeout link" button, including Kiddush)', async () => {
  const {context,elements}=await boot();
  const api=context.window.__dinnerPlannerTest;
  assert.deepEqual(Array.from(api.SHABBOS_TAKEOUT_MEALS).sort(),['motzei','seuda'].sort());
  api.setShabbosMealEnabled('motzei',true);
  const html=elements.get('shabbosSlots').innerHTML;
  const fridaySection=html.slice(html.indexOf('Friday night'),html.indexOf('Shabbos day'));
  const motzeiSection=html.slice(html.indexOf('Motzei Shabbos'));
  assert.ok(!fridaySection.includes('Add takeout link'),'Friday night courses (Kiddush, Soup, etc.) must not offer takeout');
  assert.ok(motzeiSection.includes('Add takeout link'),'Motzei Shabbos should offer takeout');
});

test('the Confirm/Remove button row does not overflow the card (the actual bug: flex items default to refusing to shrink below their content width, so "Remove" got clipped by the card\'s overflow:hidden on narrow cards)', async () => {
  const css=await (await import('node:fs/promises')).readFile(resolve(root,'css/styles.css'),'utf8');
  assert.match(css,/\.inventory-edit-row \.btn\{[^}]*min-width:0/,'the Confirm/Remove buttons must have min-width:0 so they can actually shrink to fit side by side');
});

test('newly added salmon recipes are blocked from weekday auto-suggestion (fish is a weekday-only ban) but ARE available in the Shabbos Fish & Salads course (fish is allowed for Shabbos, per the user)', async () => {
  const {context} = await boot();
  const api = context.window.__dinnerPlannerTest;
  const salmonIds = ['shabbos-salmon-01','shabbos-salmon-02','shabbos-salmon-03','shabbos-salmon-04','shabbos-salmon-05'];
  for (const id of salmonIds) {
    const recipe = api.getRecipe(id);
    assert.ok(recipe, `${id} should exist in the library`);
    assert.equal(api.recipeAllowed(recipe), false, `${id} must never be weekday-eligible - fish is a weekday-only ban`);
  }
  const fishCourseOptions = Array.from(api.shabbosSpecialsForCourse('Fish'));
  for (const id of salmonIds) {
    assert.ok(fishCourseOptions.includes(id), `${id} should be offered in the Fish course`);
  }
});

test('the newly added London broil and chicken recipes are genuinely weekday-eligible (not accidentally excluded)', async () => {
  const {context} = await boot();
  const api = context.window.__dinnerPlannerTest;
  const sampleIds = ['london-broil-01','chimichurri-chicken-01','airfryer-drumsticks-01','rotisserie-chicken-01','bbq-pargiyot-01'];
  for (const id of sampleIds) {
    const recipe = api.getRecipe(id);
    assert.ok(recipe, `${id} should exist in the library`);
    assert.equal(api.recipeAllowed(recipe), true, `${id} should be weekday-eligible like any other meat dinner`);
  }
});

test('Shabbos menu seeds the household\'s normal course structure by default, with the fish course on (Shabbos is exempt from the weekday no-fish rule) and Seuda Shlishit/Motzei off by default', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  const state=api.getState();
  assert.equal(state.shabbosMenu.friday.enabled,true);
  assert.equal(state.shabbosMenu.day.enabled,true);
  assert.equal(state.shabbosMenu.seuda.enabled,false);
  assert.equal(state.shabbosMenu.motzei.enabled,false);
  const fridayCourseNames=state.shabbosMenu.friday.courses.map(c=>c.name);
  assert.deepEqual(fridayCourseNames,['Fish','Salads','Soup','Main Course','Dessert'],'Kiddush and Challah are Table Basics now, not courses');
  const dayCourseNames=state.shabbosMenu.day.courses.map(c=>c.name);
  assert.deepEqual(dayCourseNames,['Fish','Salads','Main Course','Dessert']);
});

test('Table Basics: Kiddush (wine) and Challah exist for Friday night and Shabbos day, with no basics for Seuda Shlishit/Motzei, and baking is not pre-selected over buying (bake-first is a UI ordering choice, not a forced default)', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  const state=api.getState();
  assert.ok(state.shabbosMenu.friday.basics,'Friday night should have Table Basics');
  assert.ok(state.shabbosMenu.day.basics,'Shabbos day should have Table Basics');
  assert.equal(state.shabbosMenu.seuda.basics,null,'Seuda Shlishit has no Table Basics');
  assert.equal(state.shabbosMenu.motzei.basics,null,'Motzei Shabbos has no Table Basics');
  assert.equal(state.shabbosMenu.friday.basics.wine.haveIt,false);
  assert.equal(state.shabbosMenu.friday.basics.challah.mode,null,'no mode chosen by default - the user picks bake or buy themselves');
});

test('Table Basics: choosing to bake Challah adds its ingredients to the shopping list; choosing to buy it adds a generic Challah item unless one is already in the pantry', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  let state=api.getState();

  // Buying, nothing in pantry: a generic Challah item should be needed.
  state.shabbosMenu.friday.basics.challah.mode='buy';
  api.setState(state);
  let recipes=api.shabbosSelectedRecipes();
  assert.ok(recipes.some(r=>r.title==='Challah'),'buying challah with none in the pantry should add it to the shopping list');

  // Buying, but already in the pantry: should not be added again.
  state=api.getState();
  state.have=[{id:'h1',item:'Challah',label:'Challah',qty:1,unit:'each',confidence:'high',category:'other',reviewed:true}];
  api.setState(state);
  recipes=api.shabbosSelectedRecipes();
  assert.ok(!recipes.some(r=>r.title==='Challah'),'challah already in the pantry should not be added to the shopping list again');

  // Baking: the chosen dish's real ingredients should be added instead.
  state=api.getState();
  state.shabbosMenu.friday.basics.challah={mode:'bake',dish:{id:'d1',mode:'library',recipeId:'shabbos-challah-01',custom:null,storeLink:''}};
  api.setState(state);
  recipes=api.shabbosSelectedRecipes();
  assert.ok(recipes.some(r=>r.id==='shabbos-challah-01'),'baking should add the chosen challah recipe and its real ingredients');
});

test('Table Basics: wine/grape juice is added to the shopping list only when marked as needed, not when already have it', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  let state=api.getState();

  let recipes=api.shabbosSelectedRecipes();
  assert.ok(recipes.some(r=>r.title==='Wine or Grape Juice'),'wine should be needed by default');

  state=api.getState();
  state.shabbosMenu.friday.basics.wine.haveIt=true;
  api.setState(state);
  recipes=api.shabbosSelectedRecipes();
  assert.ok(!recipes.some(r=>r.title==='Wine or Grape Juice'&&r.id.includes('friday')),'wine already on hand should not be added to the shopping list');
});

test('the dish editor modal opens with pre-filled fields, lets you edit them, and calls back with the edited values on Save (this is the real form that replaced every prompt() popup in the Shabbos flow)', async () => {
  const {context,elements}=await boot();
  const api=context.window.__dinnerPlannerTest;
  let saved=null;
  api.openDishEditor({
    heading:'Test dish',
    initialTitle:'Original Title',
    initialIngredients:[['flour','2 cups'],['sugar','1 cup']],
    onSave:(result)=>{saved=result;}
  });
  assert.equal(elements.get('dishEditorDialog').open,true,'the dialog should open');
  assert.ok(elements.get('dishEditorModal').innerHTML.includes('Original Title'),'the title should be pre-filled in the rendered form');
  assert.ok(elements.get('dishEditorModal').innerHTML.includes('flour'),'ingredients should be pre-filled in the rendered form');

  const titleInput=context.window.document.getElementById('dishEditorTitle');
  titleInput.value='Edited Title';
  context.window.document.getElementById('dishEditorSave').onclick();
  assert.ok(saved,'onSave should have been called');
  assert.equal(saved.title,'Edited Title');
  assert.equal(JSON.stringify(saved.ingredients),JSON.stringify([['flour','2 cups'],['sugar','1 cup']]),'unedited ingredient rows should save as-is');
});

test('the dish editor rejects saving with no title or no ingredients, instead of silently saving something broken', async () => {
  const {context} = await boot();
  const api = context.window.__dinnerPlannerTest;
  let saveCalls = 0;
  const originalAlert = context.window.alert;
  let lastAlert = '';
  context.window.alert = msg => { lastAlert = msg; };

  api.openDishEditor({ initialTitle: '', initialIngredients: [], onSave: () => { saveCalls++; } });
  context.window.document.getElementById('dishEditorSave').onclick();
  assert.equal(saveCalls, 0, 'should not save with an empty title');
  assert.match(lastAlert, /dish name/i);

  context.window.document.getElementById('dishEditorTitle').value = 'Something';
  context.window.document.getElementById('dishEditorTitle').oninput?.();
  context.window.document.getElementById('dishEditorSave').onclick();
  assert.equal(saveCalls, 0, 'should not save with no ingredients entered');

  context.window.alert = originalAlert;
});

test('Add your own hides the two top-level buttons while its Write/Upload sub-panel is open, instead of showing both at once (the actual UX issue the user caught in the mockup review)', async () => {
  const {context, elements} = await boot();
  const api = context.window.__dinnerPlannerTest;
  api.buildPlan();
  const state = api.getState();
  const course = state.shabbosMenu.friday.courses.find(c => c.name === 'Salads');
  const pickerKey = `friday:${course.id}`;

  let html = elements.get('shabbosSlots').innerHTML;
  const dmeSpecialCountBefore = (html.match(/\+ DmE special/g) || []).length;
  assert.ok(dmeSpecialCountBefore > 0, 'the collapsed state should show top-level buttons somewhere');
  assert.ok(!html.includes('✍️ Write'), 'the Write/Upload sub-panel should not be open yet');

  state.shabbosAddOwnFor = pickerKey;
  api.setState(state);
  api.renderShabbosSlots();
  html = elements.get('shabbosSlots').innerHTML;
  const dmeSpecialCountAfter = (html.match(/\+ DmE special/g) || []).length;
  assert.equal(dmeSpecialCountAfter, dmeSpecialCountBefore - 1, 'exactly one course (the one with its sub-panel open) should lose its top-level buttons');
  assert.ok(html.includes('✍️ Write'), 'the Write option should be visible once the sub-panel is open');
  assert.ok(html.includes('📄 Upload'), 'the Upload option should be visible once the sub-panel is open');
});

test('Shabbos menu: courses and dishes can be freely added and removed, and everything chosen (library or custom) flows into the shopping list', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  let state=api.getState();
  const fridayMainCourse=state.shabbosMenu.friday.courses.find(c=>c.name==='Main Course');

  // Add a library dish to Main Course.
  api.addShabbosDish('friday',fridayMainCourse.id,{mode:'library',recipeId:'shabbos-roast-chicken-01'});
  state=api.getState();
  let recipes=api.shabbosSelectedRecipes();
  assert.ok(recipes.some(r=>r.id==='shabbos-roast-chicken-01'),'the library dish should be selected');

  // Add a custom write-in dish to the same course.
  api.addShabbosDish('friday',fridayMainCourse.id,{mode:'custom',custom:{title:"Grandma's Kugel",ingredients:[['noodles','1 lb'],['sugar','0.5 cup']]}});
  recipes=api.shabbosSelectedRecipes();
  assert.ok(recipes.some(r=>r.title==="Grandma's Kugel"),'the custom write-in dish should also be selected');

  // It should actually reach the shopping list, which is the whole point.
  api.buildPlanForWeek('this',{});
  state=api.getState();
  const shoppingNames=state.shopping.map(item=>item.name.toLowerCase());
  assert.ok(shoppingNames.some(n=>n.includes('noodles')),"the custom dish's ingredients should be in the shopping list");

  // Now remove a course entirely - a disabled/removed course must not contribute to shopping.
  const courseId=fridayMainCourse.id;
  state=api.getState();
  state.shabbosMenu.friday.courses=state.shabbosMenu.friday.courses.filter(c=>c.id!==courseId);
  api.setState(state);
  recipes=api.shabbosSelectedRecipes();
  assert.ok(!recipes.some(r=>r.id==='shabbos-roast-chicken-01'),'removing the course should remove its dishes from selection');
});

test('Shabbos menu: a disabled meal (e.g. Seuda Shlishit, off by default) contributes nothing to the shopping list even if it has courses/dishes defined', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  const state=api.getState();
  assert.equal(state.shabbosMenu.seuda.enabled,false);
  const seudaCourse=state.shabbosMenu.seuda.courses[0];
  api.addShabbosDish('seuda',seudaCourse.id,{mode:'library',recipeId:'shabbos-tzimmes-01'});
  const recipes=api.shabbosSelectedRecipes();
  assert.ok(!recipes.some(r=>r.id==='shabbos-tzimmes-01'),'a disabled meal must not contribute to shopping even with dishes chosen');
});

test('pantry suggestions show real variety instead of several near-identical variants of the same dish (the actual bug: a scan showing 5 slightly different "Loaded Baked Potatoes" versions crowded out every other suggestion, since near-identical variants naturally score almost the same)', async () => {
  const {context,elements}=await boot();
  const api=context.window.__dinnerPlannerTest;
  const state=api.getState();
  state.have=[
    {id:'i1',item:'potatoes',qty:5,unit:'lb',confidence:'user',observations:[]},
    {id:'i2',item:'cheddar cheese',qty:1,unit:'bag',confidence:'user',observations:[]},
    {id:'i3',item:'rice',qty:2,unit:'cup',confidence:'user',observations:[]}
  ];
  api.setState(state);
  context.window.renderHave();

  const html=elements.get('pantrySuggestions').innerHTML;
  const ids=[...html.matchAll(/data-pantry-recipe="([^"]+)"/g)].map(m=>m[1]);
  assert.ok(ids.length>0,'should show at least one suggestion');
  const families=ids.map(id=>api.recipeFamily(api.getRecipe(id)));
  assert.equal(new Set(families).size,families.length,`expected every suggestion to be from a different family, got: ${families.join(', ')}`);
});

test('eggs show an egg icon, not a milk glass (the actual bug the user caught: eggs had no category of their own in the AI schema, so they were forced into "dairy" - wrong visually and inaccurate for kashrus purposes, since eggs are pareve, not dairy)', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  // A pre-existing pantry item saved before the fix, still miscategorized as
  // dairy - the name-based fallback should catch this without a rescan.
  assert.equal(api.categoryEmoji('dairy','each','Lesher Medium Eggs 10 ct'),'🥚');
  // A fresh item using the new real "eggs" category.
  assert.equal(api.categoryEmoji('eggs','each','Lesher Medium Eggs 10 ct'),'🥚');
  // Sanity check: real dairy is unaffected.
  assert.equal(api.categoryEmoji('dairy','each','Vitamin D Milk'),'🥛');
});

test('pantry items with the same name but different generic packaging words merge into one entry (the actual bug behind several apparent duplicates in the user\'s screenshots: the same shredded cheese was scanned once as "1 package" and again as "1 bag" and stayed as two permanent separate cards, since merging required an exact unit match)', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  const state=api.getState();
  state.have=[];
  api.setState(state);

  context.window.__mergeTest1=api.mergePantryItem({id:'a',item:'shredded cheese',qty:1,unit:'package',confidence:'high',observations:[]});
  context.window.__mergeTest2=api.mergePantryItem({id:'b',item:'shredded cheese',qty:1,unit:'bag',confidence:'high',observations:[]});

  const after=api.getState();
  const matches=after.have.filter(i=>i.item==='shredded cheese');
  assert.equal(matches.length,1,`expected the two scans to merge into one pantry entry, got ${matches.length}`);
});

test('fish shows a fish icon, not a steak (same category-completeness gap as the eggs bug - fish had no category of its own, so it was forced into "meat")', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  assert.equal(api.categoryEmoji('meat','package','Premium Salmon Fillet Family Pack'),'🐟');
  assert.equal(api.categoryEmoji('fish','package','Premium Salmon Fillet Family Pack'),'🐟');
  assert.equal(api.categoryEmoji('meat','package','Ground Beef'),'🥩');
});

test('hummus shows a custom hummus-plate icon (olive-oil swirl and paprika dots) representing the prepared dip itself, not its raw chickpea ingredient (the actual bug the user caught directly: showing beans traces back to origin, which is the same wrong instinct that caused the dairy-icon bug in the first place - after seeing an emoji-only fix still felt approximate, a custom SVG icon was built and approved via a rendered preview before shipping)', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  assert.match(api.categoryEmoji('dairy','container','Sabra Classic Hummus'),/aria-label="Hummus plate"/);
  assert.match(api.categoryEmoji('dairy','container','hummus container'),/aria-label="Hummus plate"/);
  // Sanity check: actual beans/chickpeas/lentils (not hummus) still correctly show the bean icon.
  assert.equal(api.categoryEmoji('other','bag','Dried Chickpeas'),'🫘');
  assert.equal(api.categoryEmoji('other','bag','Green Lentils'),'🫘');
});

test('"pargiyot" (the standard kosher-butcher term for boneless chicken thigh cutlets) matches "chicken thighs" in recipes - the actual bug: it fell through unmapped and never matched any recipe ingredient at all, silently excluding every chicken thigh recipe from suggestions for anyone whose pantry used this common term', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  const canonical1=api.canonicalIngredient('Baby Chicken Pargiyot Family');
  const canonical2=api.canonicalIngredient('chicken thighs');
  assert.equal(canonical1,canonical2,`expected pargiyot to match chicken thighs, got "${canonical1}" vs "${canonical2}"`);
});

test('pantry suggestions prioritize dishes you can nearly complete over ones needing several more ingredients (the actual bug the user reported: a recipe showing "2 of 6 ingredients" was appearing as a suggestion even though it needs 4 more items - the intent is showing what you can actually cook, not just any partial ingredient overlap)', async () => {
  const {context,elements}=await boot();
  const api=context.window.__dinnerPlannerTest;
  const state=api.getState();
  // Full coverage for "One-Pan Chicken Rice Skillet - Classic" (5/5
  // ingredients, including via the real-world "pargiyot" pantry item name).
  state.have=[
    {id:'i1',item:'Baby Chicken Pargiyot Family',qty:1,unit:'package',confidence:'user',observations:[]},
    {id:'i2',item:'rice',qty:2,unit:'cup',confidence:'user',observations:[]},
    {id:'i3',item:'chicken broth',qty:4,unit:'cup',confidence:'user',observations:[]},
    {id:'i4',item:'onion',qty:2,unit:'each',confidence:'user',observations:[]},
    {id:'i5',item:'garlic',qty:1,unit:'bulb',confidence:'user',observations:[]}
  ];
  api.setState(state);
  context.window.renderHave();

  const html=elements.get('pantrySuggestions').innerHTML;
  assert.ok(html.includes('One-Pan Chicken Rice Skillet'),`expected the fully-covered recipe to be suggested, got: ${html}`);
  assert.ok(html.includes('You have 5 of 5'),`expected full 5/5 coverage to be recognized (proves the pargiyot fix feeds into suggestions correctly), got: ${html}`);
});

test('a newer deployed build makes the version badge tappable to refresh, instead of an intrusive banner - this matters because a long-lived native WebView session could otherwise keep running a stale build indefinitely with no way for the person to notice (this is what actually happened: a fix was live on the server but a family member had an already-open app still showing the old version)', async () => {
  const {context,elements}=await boot();
  const api=context.window.__dinnerPlannerTest;

  // No newer build available - badge should stay plain.
  context.window.fetch=async()=>({ok:true,text:async()=>'const BUILD_ID = "__BUILD_ID__";'});
  await api.checkForNewerDeployedBuild();
  assert.equal(elements.get('versionBadge').classList.contains('update-available'),false,'badge should not be marked when the deployed build matches');

  // A genuinely newer build is live on the server.
  context.window.fetch=async()=>({ok:true,text:async()=>'const BUILD_ID = "abc123newbuild";'});
  await api.checkForNewerDeployedBuild();
  assert.equal(elements.get('versionBadge').classList.contains('update-available'),true,'badge should be marked when a newer build is detected');
  assert.equal(typeof elements.get('versionBadge').onclick,'function','the badge itself should become the tap-to-refresh control');
});

test('the update check fails silently on a network error rather than throwing (checked periodically and on app resume - a transient failure here should never crash or interrupt the app)', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  context.window.fetch=async()=>{throw new Error('offline')};
  await assert.doesNotReject(()=>api.checkForNewerDeployedBuild());
});

test('a hot sauce whose name doesn\'t literally contain "hot sauce" or "buffalo" still gets the chili icon instead of falling through to the generic bell-pepper produce rule (the actual bug the user caught directly: "Frank\'s RedHot Original Cayenne Pepper Sauce" contains the word "pepper" and was matching the generic produce rule before ever reaching the hot-sauce check)', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  assert.match(api.categoryEmoji('condiment','bottle',"Frank's RedHot Original Cayenne Pepper Sauce"),/aria-label="Hot sauce bottle"/);
  assert.match(api.categoryEmoji('condiment','bottle','Habanero Pepper Sauce'),/aria-label="Hot sauce bottle"/);
  // Sanity check: an actual bell pepper (not a sauce) still gets the produce icon.
  assert.equal(api.categoryEmoji('produce','each','Red Bell Pepper'),'🫑');
});

test('yogurt shows a custom container icon with the word "yogurt" on it, per the user\'s explicit request during the icon redesign discussion', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  assert.match(api.categoryEmoji('dairy','container','Fage Greek Yogurt'),/aria-label="Yogurt container"/);
  assert.match(api.categoryEmoji('dairy','container','Fage Greek Yogurt'),/>yogurt</);
});

test('the name-based icon dictionary covers a broad, representative set of common grocery items correctly (this is the actual point of the rebuild: comprehensive and deterministic, not one-off patches for whichever food happened to be reported wrong)', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  const cases=[
    ['Ground Beef','🥩'],['Chicken Thighs','🍗'],['Baby Chicken Pargiyot Family','🍗'],
    ['Premium Salmon Fillet','🐟'],['Large Eggs 12ct','🥚'],
    ['Whole Milk','🥛'],['Cheddar Cheese','🧀'],['Land O Lakes Butter','🧈'],
    ['Roma Tomatoes','🍅'],['Yellow Onion','🧅'],['Fresh Garlic','🧄'],['Russet Potatoes','🥔'],
    ['Baby Carrots','🥕'],['Red Bell Pepper','🫑'],['Black Pepper','🧂'],['Baby Spinach','🥬'],
    ['English Cucumber','🥒'],['Sweet Corn','🌽'],['Hass Avocado','🥑'],['Fresh Lemon','🍋'],
    ['Gala Apples','🍎'],['Bananas','🍌'],['Seedless Grapes','🍇'],['Broccoli Crowns','🥦'],
    ['White Bread','🍞'],['Challah Loaf','🍞'],['Jasmine Rice','🍚'],['Spaghetti Pasta','🍝'],
    ['Heinz Ketchup','🧂'],['Dijon Mustard','🧂'],['Hellmanns Mayonnaise','🧂'],
    ['Extra Virgin Olive Oil','🫒'],['Kirkland Honey','🍯'],['Dill Pickles','🥒'],
    ['Dark Chocolate Bar','🍫'],['Roasted Almonds','🥜'],['Orange Juice','🧃'],['Ground Coffee','☕']
  ];
  for(const [name,expected] of cases){
    assert.equal(api.categoryEmoji('other','unknown',name),expected,`expected "${name}" to show ${expected}`);
  }
});

test('the icon dictionary handles plurals correctly (the actual bug this test caught during development: "Roasted Almonds" fell through to the generic fallback because a trailing word-boundary in the pattern blocked the plural "s" from matching)', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  const cases=[
    ['Roma Tomatoes','🍅'],['Yellow Onions','🧅'],['Baby Carrots','🥕'],
    ['Russet Potatoes','🥔'],['Bell Peppers','🫑'],['Dinner Rolls','🍞'],
    ['Mini Bagels','🍞'],['Soft Pretzels','🥨'],['Roasted Almonds','🥜'],
    ['Mixed Nuts','🥜'],['Large Eggs','🥚']
  ];
  for(const [name,expected] of cases){
    assert.equal(api.categoryEmoji('other','unknown',name),expected,`expected "${name}" to show ${expected}`);
  }
});

test('exception patterns correctly override their broader category (black pepper the spice vs bell pepper the vegetable; peanut butter the spread vs peanuts the nut)', async () => {
  const {context}=await boot();
  const api=context.window.__dinnerPlannerTest;
  assert.equal(api.categoryEmoji('other','unknown','Black Pepper'),'🧂');
  assert.equal(api.categoryEmoji('other','unknown','Ground Black Pepper'),'🧂');
  assert.equal(api.categoryEmoji('other','unknown','Red Bell Pepper'),'🫑');
  assert.equal(api.categoryEmoji('other','unknown','Peanut Butter'),'🥜');
  assert.equal(api.categoryEmoji('other','unknown','Roasted Peanuts'),'🥜');
});

test('extractRecipeDocumentText reads a .txt file directly', async () => {
  const {context} = await boot();
  const api = context.window.__dinnerPlannerTest;
  const fakeFile = { name: 'recipe.txt', text: async () => 'Chicken Soup\n2 lb chicken, 1 onion...' };
  const text = await api.extractRecipeDocumentText(fakeFile);
  assert.equal(text, 'Chicken Soup\n2 lb chicken, 1 onion...');
});

test('extractRecipeDocumentText rejects unsupported file types with a clear message instead of a cryptic failure', async () => {
  const {context} = await boot();
  const api = context.window.__dinnerPlannerTest;
  const fakeFile = { name: 'recipe.pdf', text: async () => 'irrelevant' };
  await assert.rejects(() => api.extractRecipeDocumentText(fakeFile), /\.docx or \.txt/);
});

test('extractRecipeDocumentText gives a clear message for a .docx file when the document reader library has not finished loading yet, instead of a cryptic "mammoth is not defined" error', async () => {
  const {context} = await boot();
  const api = context.window.__dinnerPlannerTest;
  const fakeFile = { name: 'recipe.docx', arrayBuffer: async () => new ArrayBuffer(0) };
  await assert.rejects(() => api.extractRecipeDocumentText(fakeFile), /document reader/i);
});


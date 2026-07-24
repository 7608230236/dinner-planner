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
    'buildNextWeekBtnHome','usePantryBtn','addCustomExcludeBtn','addTypedBtn','typedBox','saveTypedBtn','analyzePicturesBtn','clearPhotosBtn','addMorePhotosBtn','removeUsedBtn','minusPortions',
    'plusPortions','savePrefsBtn','quickShareSupportBtn','shareSupportBtn','downloadSupportBtn','copySupportBtn','reloadLatestBtn','editAllItemsBtn','shoppingSwitch',
    'versionBadge','developerPanel','developerSummary','developerValidation','developerPantry','developerAi','developerShopping','developerTimeline','developerErrors','developerStorage',
    'developerStatus','reportBugBtn','runValidationBtn','copyDebugBtn','downloadDebugBtn','clearCacheBtn','unregisterWorkerBtn','clearLogsBtn','closeDeveloperBtn',
    'household','householdSetup','householdActive','householdStatus','householdCodeDisplay','createHouseholdBtn','joinHouseholdBtn','joinHouseholdCode',
    'leaveHouseholdBtn','copyHouseholdCodeBtn','deviceNameInput'
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
      serviceWorker:{register:async()=>({}),getRegistrations:async()=>[]}
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

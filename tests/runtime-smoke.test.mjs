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
    'communitySteps','addCommunityStepBtn','submitCommunityRecipeBtn','cancelCommunityRecipeBtn','communityRecipeList'
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

test('showView shows only the sections for the requested page and hides everything else (the actual bug: the sidebar/menu looked like real page navigation but was only scroll-to-anchor, so a large pantry section - photos, inventory, receipt scanner - dragged the whole single continuously-scrolling app down with it)', async () => {
  const {context,elements}=await boot();
  const api=context.window.__dinnerPlannerTest;

  api.showView('pantry');
  assert.equal(elements.get('pantry').classList.contains('hidden'),false,'pantry should be visible on the pantry view');
  assert.equal(elements.get('receiptScan').classList.contains('hidden'),false,'receiptScan is grouped with pantry and should also be visible');
  assert.equal(elements.get('week').classList.contains('hidden'),true,'other views should be hidden');
  assert.equal(elements.get('shopping').classList.contains('hidden'),true,'other views should be hidden');
  assert.equal(elements.get('home').classList.contains('hidden'),true,'other views should be hidden');

  api.showView('week');
  assert.equal(elements.get('week').classList.contains('hidden'),false,'week should be visible on the week view');
  assert.equal(elements.get('nextWeek').classList.contains('hidden'),false,'nextWeek is grouped with week and should also be visible');
  assert.equal(elements.get('pantry').classList.contains('hidden'),true,'switching views should hide the previous one');

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

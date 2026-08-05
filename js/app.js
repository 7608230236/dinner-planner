const APP_VERSION="60";
// APP_VERSION is the user-facing feature version (only bumped for real releases).
// BUILD_ID changes on every single deploy automatically (injected at Netlify build
// time from the git commit) - this is what actually detects "a new deploy happened"
// and triggers a cache/service-worker refresh, since APP_VERSION alone doesn't
// change often enough to catch every deploy.
const BUILD_ID="__BUILD_ID__";
// DEPLOY_NUMBER is a simple auto-incrementing count (total commits at deploy
// time), shown in the version badge so the user can tell whether a given
// push actually went live without anyone needing to remember to bump a
// version number by hand. See scripts/inject-build-id.mjs.
const DEPLOY_NUMBER="__DEPLOY_NUMBER__";
const SUPPORT_SCHEMA=2;
// When running as a packaged native app (Capacitor), there is no local server to answer
// relative /.netlify/functions/* requests, so those calls need to point at the real deployed
// site. On the web, this stays empty so requests remain same-origin as before.
const API_ORIGIN=(typeof window!=="undefined"&&window.Capacitor)?"https://cheerful-conkies-96998f.netlify.app":"";
const IngredientEngine=window.DinnerIngredientEngine;
if(!IngredientEngine)throw new Error("Ingredient engine failed to load.");
const RECIPES=window.DinnerRecipes;
if(!Array.isArray(RECIPES)||RECIPES.length<500)throw new Error("Recipe library failed to load.");
const INGREDIENT_OPTIONS = ["cabbage", "mushrooms", "zucchini", "spinach", "eggplant", "carrots", "chickpeas", "beans", "lentils", "rice", "pasta", "potatoes", "onion", "garlic", "tomato", "bell peppers", "cucumber", "cheese", "milk", "cream", "eggs", "chicken", "beef", "ground beef", "BBQ", "orzo", "noodles", "soup", "wraps", "sweet potato", "celery", "parsley", "dill", "ginger", "soy sauce"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu"];
const PREFS = ["No fish","No tofu","No turkey","No broccoli","No cauliflower","No cilantro","No egg-forward dinners","Not spicy","Less chickpeas","Less carrots","Less eggplant","Less spinach"];
const WEEK = ["Kid-friendly","More dairy","More meat/chicken","Simple week"];
const K="dinnerPlannerV51:";
const $=id=>document.getElementById(id);
const load=(k,d)=>{try{return JSON.parse(localStorage.getItem(K+k))??d}catch{return d}};
let householdCode=load("householdCode",null);
let deviceName=load("deviceName","");
let cloudPushTimer=null;
let cloudSyncStatus={state:"idle",message:"",at:0}; // idle | syncing | synced | error
const save=(k,v,opts={})=>{
  try{
    if(k==="state"&&opts.bumpTimestamp!==false&&v&&typeof v==="object"){
      v.updatedAt=Date.now();
    }
    localStorage.setItem(K+k,JSON.stringify(v));
    if(k==="state"&&householdCode&&opts.skipCloudPush!==true)scheduleCloudPush();
    return true;
  }catch(error){
    try{
      localStorage.setItem(`${K}lastSaveError`,JSON.stringify({
        at:new Date().toISOString(),
        key:k,
        message:error?.message||String(error),
        name:error?.name||"Error"
      }));
    }catch{}
    if(typeof console!=="undefined"&&console.error)console.error("Save failed:",k,error);
    return false;
  }
};
let state=load("state",{
  portions:5,
  prefs:[...PREFS],
  week:["Kid-friendly"],
  exclude:[],
  stores:{meat:null,supermarket:null},
  plan:[],
  locked:{},
  nextPlan:[],
  nextLocked:{},
  have:[],
  pantryPhotos:[],
  pantryLastScan:null,
  pantryExpanded:false,
  scanSessions:[],
  debugLog:[],
  runtimeErrors:[],
  aiRequests:[],
  validationResults:[],
  shoppingDiagnostics:{this:[],next:[],combined:[]},
  developerEnabled:false,
  shopping:[],
  nextShopping:[],
  shoppingChecked:{this:{},next:{},combined:{}},
  shoppingView:"this",
  recentPlans:[],
  receiptReview:[],
  weekSubView:"this"
});

function normalizeState(raw){
  const clean = raw && typeof raw === "object" ? raw : {};
  const validPlan = arr => Array.isArray(arr) ? arr.filter(p=>p && DAYS.includes(p.day) && RECIPES.some(r=>r.id===p.id)) : [];
  return {
    portions: Number.isFinite(Number(clean.portions)) ? Math.max(1, Math.min(20, Number(clean.portions))) : 5,
    prefs: Array.isArray(clean.prefs) ? clean.prefs : [],
    week: Array.isArray(clean.week) ? clean.week : [],
    exclude: Array.isArray(clean.exclude) ? clean.exclude : [],
    stores: clean.stores && typeof clean.stores === "object"
      ? {meat: clean.stores.meat || null, supermarket: clean.stores.supermarket || null}
      : {meat:null, supermarket:null},
    plan: validPlan(clean.plan),
    locked: clean.locked && typeof clean.locked === "object" ? clean.locked : {},
    nextPlan: validPlan(clean.nextPlan),
    nextLocked: clean.nextLocked && typeof clean.nextLocked === "object" ? clean.nextLocked : {},
    have: Array.isArray(clean.have)
      ? clean.have.filter(h=>h && !h.image).map((h,index)=>({
          id:h.id||`legacy-item-${index}`,
          item:String(h.item||h.label||"Item"),
          label:String(h.label||h.item||"Item"),
          location:h.location||"Typed",
          qty:h.qty!==undefined?h.qty:1,
          unit:h.unit||"each",
          confidence:h.confidence||"user",
          category:h.category||"other",
          perishable:Boolean(h.perishable),
          sourcePhotoIds:Array.isArray(h.sourcePhotoIds)?h.sourcePhotoIds:[],
          sourceLocations:Array.isArray(h.sourceLocations)?h.sourceLocations:[h.location||"Typed"],
          reviewed:Boolean(h.reviewed||h.confidence==="user"),
          thumbnail:typeof h.thumbnail==="string"?h.thumbnail:"",
          evidence:typeof h.evidence==="string"?h.evidence:"",
          quantityBasis:h.quantityBasis||"user",
          observations:Array.isArray(h.observations)?h.observations:[],
          bbox:Array.isArray(h.bbox)?h.bbox:null
        }))
      : [],
    pantryPhotos: Array.isArray(clean.pantryPhotos)
      ? clean.pantryPhotos.filter(p=>p && p.image).map((p,index)=>({
          id:p.id||`photo-${index}`,
          location:p.location||"Other",
          label:p.label||"Kitchen photo",
          image:p.image,
          status:p.status||"pending",
          addedAt:p.addedAt||Date.now(),
          scannedAt:p.scannedAt||null,
          detectedCount:Number(p.detectedCount)||0,
          error:p.error||"",
          rawItems:Array.isArray(p.rawItems)?p.rawItems:[],
          rejectedItems:Array.isArray(p.rejectedItems)?p.rejectedItems:[],
          requestId:p.requestId||"",
          model:p.model||""
        }))
      : (Array.isArray(clean.have)?clean.have.filter(h=>h && h.image).map((h,index)=>({
          id:h.id||`legacy-photo-${index}`,
          location:h.location||"Other",
          label:h.label||"Picture added",
          image:h.image,
          status:"pending",
          addedAt:Date.now(),
          rawItems:[]
        })):[]),
    pantryLastScan: clean.pantryLastScan || null,
    pantryExpanded: Boolean(clean.pantryExpanded),
    scanSessions:Array.isArray(clean.scanSessions)?clean.scanSessions.slice(-20):[],
    debugLog:Array.isArray(clean.debugLog)?clean.debugLog.slice(-300):[],
    runtimeErrors:Array.isArray(clean.runtimeErrors)?clean.runtimeErrors.slice(-100):[],
    aiRequests:Array.isArray(clean.aiRequests)?clean.aiRequests.slice(-50):[],
    validationResults:Array.isArray(clean.validationResults)?clean.validationResults.slice(-50):[],
    shoppingDiagnostics:clean.shoppingDiagnostics&&typeof clean.shoppingDiagnostics==="object"?clean.shoppingDiagnostics:{this:[],next:[],combined:[]},
    developerEnabled:Boolean(clean.developerEnabled),
    shopping: Array.isArray(clean.shopping) ? clean.shopping : [],
    nextShopping: Array.isArray(clean.nextShopping) ? clean.nextShopping : [],
    shoppingChecked: clean.shoppingChecked && typeof clean.shoppingChecked === "object"
      ? {
          this: clean.shoppingChecked.this && typeof clean.shoppingChecked.this === "object" ? clean.shoppingChecked.this : {},
          next: clean.shoppingChecked.next && typeof clean.shoppingChecked.next === "object" ? clean.shoppingChecked.next : {},
          combined: clean.shoppingChecked.combined && typeof clean.shoppingChecked.combined === "object" ? clean.shoppingChecked.combined : {}
        }
      : {this:{},next:{},combined:{}},
    shoppingView: ["this","next","combined"].includes(clean.shoppingView) ? clean.shoppingView : (Array.isArray(clean.nextPlan) && clean.nextPlan.length ? "combined" : "this"),
    recentPlans: Array.isArray(clean.recentPlans) ? clean.recentPlans : [],
    receiptReview: Array.isArray(clean.receiptReview) ? clean.receiptReview : [],
    recipeRatings: (clean.recipeRatings && typeof clean.recipeRatings === "object" && !Array.isArray(clean.recipeRatings)) ? clean.recipeRatings : {},
    planNonce: Number.isFinite(Number(clean.planNonce)) ? Number(clean.planNonce) : 0,
    updatedAt: Number.isFinite(Number(clean.updatedAt)) ? Number(clean.updatedAt) : 0,
    // Device-local "undo" snapshot, taken right before anything that could replace
    // the current week's plan (Build, Replace, or an incoming/joined sync). Never
    // included in buildSyncPayload and never read from incoming cloud data - this
    // stays local to this device on purpose, so restoring it can't itself become
    // another silent overwrite risk shared across devices.
    planSnapshot: (clean.planSnapshot && typeof clean.planSnapshot === "object") ? clean.planSnapshot : {},
    // A durable record of locked meals, separate from the single-step undo
    // snapshot above. Updated whenever a day is locked or unlocked, and never
    // cleared by an unrelated action (Build, Replace, a sync, etc.) - so a
    // locked meal can be restored no matter how many other things happened
    // since it was locked, not just the single most recent one.
    durableLocks: normalizeDurableLocks(clean.durableLocks),
    shabbosMenu: normalizeShabbosMenu(clean.shabbosMenu),
    // A durable snapshot of the Shabbos menu, updated after every explicit
    // add/remove action. Protects against a sync overwrite or a bug silently
    // dropping something the user actually chose - not against the user's
    // own explicit removal, which is intentional. Same protection model as
    // durableLocks above, applied to the Shabbos menu's dishes.
    shabbosDurableBackup: (clean.shabbosDurableBackup && typeof clean.shabbosDurableBackup === "object") ? clean.shabbosDurableBackup : null,
    // Which of the three stacked cards (This Week / Shabbos / Next Week) is
    // currently shown inside the "week" view. Added because everything used
    // to render as one long scrolling page, so building next week's plan
    // looked like nothing happened - the fresh plan was there, just scrolled
    // out of view below This Week and Shabbos.
    weekSubView: ["this","shabbos","next"].includes(clean.weekSubView) ? clean.weekSubView : "this"
  };
}

function normalizeDurableLocks(raw){
  const src=(raw&&typeof raw==="object")?raw:{};
  const out={};
  for(const weekKey of ["this","next"]){
    const week=(src[weekKey]&&typeof src[weekKey]==="object")?src[weekKey]:{};
    out[weekKey]={};
    for(const [day,recipeId] of Object.entries(week)){
      if(DAYS.includes(day)&&typeof recipeId==="string")out[weekKey][day]=recipeId;
    }
  }
  return out;
}

const SHABBOS_DEFAULT_COURSES={
  friday:["Fish","Salads","Soup","Main Course","Dessert"],
  day:["Fish","Salads","Main Course","Dessert"],
  seuda:["Light Bites"],
  motzei:["Light Meal"]
};

function shabbosUid(){return `sc-${Date.now()}-${Math.random().toString(36).slice(2,8)}`}

function normalizeShabbosDish(raw){
  if(!raw||typeof raw!=="object")return null;
  const mode=["library","custom","store"].includes(raw.mode)?raw.mode:null;
  if(!mode)return null;
  if(mode==="library"&&typeof raw.recipeId!=="string")return null;
  if(mode==="custom"&&!(raw.custom&&typeof raw.custom.title==="string"&&Array.isArray(raw.custom.ingredients)))return null;
  return {
    id: typeof raw.id==="string"?raw.id:shabbosUid(),
    mode,
    recipeId: mode==="library"?raw.recipeId:null,
    custom: mode==="custom"?{
      title:raw.custom.title,
      ingredients:raw.custom.ingredients.filter(pair=>Array.isArray(pair)&&pair[0]).map(pair=>[String(pair[0]),String(pair[1]||"")]),
      steps:Array.isArray(raw.custom.steps)?raw.custom.steps.map(s=>String(s||"").trim()).filter(Boolean):[]
    }:null,
    storeLink: mode==="store"?String(raw.storeLink||""):""
  };
}

function normalizeShabbosCourse(raw){
  const name=(raw&&typeof raw.name==="string"&&raw.name.trim())?raw.name.trim():"Course";
  const dishes=Array.isArray(raw?.dishes)?raw.dishes.map(normalizeShabbosDish).filter(Boolean):[];
  return {id:(raw&&typeof raw.id==="string")?raw.id:shabbosUid(),name,dishes};
}

function normalizeShabbosBasics(raw){
  const src=(raw&&typeof raw==="object")?raw:{};
  const wine=(src.wine&&typeof src.wine==="object")?src.wine:{};
  const challah=(src.challah&&typeof src.challah==="object")?src.challah:{};
  const challahMode=["bake","buy"].includes(challah.mode)?challah.mode:null;
  return {
    wine:{haveIt: typeof wine.haveIt==="boolean" ? wine.haveIt : false},
    challah:{
      mode: challahMode,
      dish: challahMode==="bake" ? normalizeShabbosDish(challah.dish) : null
    }
  };
}

function normalizeShabbosMeal(raw,mealKey,defaultEnabled){
  const src=(raw&&typeof raw==="object")?raw:{};
  const courses=Array.isArray(src.courses)&&src.courses.length
    ? src.courses.map(normalizeShabbosCourse)
    : (SHABBOS_DEFAULT_COURSES[mealKey]||[]).map(name=>({id:shabbosUid(),name,dishes:[]}));
  const hasBasics=mealKey==="friday"||mealKey==="day";
  return {
    enabled: typeof src.enabled==="boolean" ? src.enabled : defaultEnabled,
    courses,
    basics: hasBasics ? normalizeShabbosBasics(src.basics) : null
  };
}

function normalizeShabbosMenu(raw){
  const src=(raw && typeof raw==="object") ? raw : {};
  return {
    friday: normalizeShabbosMeal(src.friday,"friday",true),
    day: normalizeShabbosMeal(src.day,"day",true),
    seuda: normalizeShabbosMeal(src.seuda,"seuda",false),
    motzei: normalizeShabbosMeal(src.motzei,"motzei",false)
  };
}
state = normalizeState(state);
save("state",state,{bumpTimestamp:false,skipCloudPush:true});

// ---- Household sync ----
// Shared family data (plan, pantry list, shopping, preferences) syncs through a
// small Netlify Function backed by Netlify Blobs, keyed by a short household code.
// Photos never leave the device that took them - only the structured pantry data
// (names/qty/confidence) syncs, so this stays fast and small.
const HOUSEHOLD_SYNC_URL=`${API_ORIGIN}/.netlify/functions/household-sync`;
const HOUSEHOLD_POLL_MS=45000;
let householdPollTimer=null;

function buildSyncPayload(){
  return {
    portions:state.portions,
    prefs:state.prefs,
    week:state.week,
    exclude:state.exclude,
    stores:state.stores,
    plan:state.plan,
    locked:state.locked,
    nextPlan:state.nextPlan,
    nextLocked:state.nextLocked,
    have:(state.have||[]).map(item=>({...item,thumbnail:""})),
    pantryLastScan:state.pantryLastScan,
    shopping:state.shopping,
    nextShopping:state.nextShopping,
    shoppingChecked:state.shoppingChecked,
    recentPlans:state.recentPlans,
    planNonce:state.planNonce,
    recipeRatings:state.recipeRatings,
    shabbosMenu:state.shabbosMenu,
    durableLocks:state.durableLocks,
    shabbosDurableBackup:state.shabbosDurableBackup,
    updatedAt:state.updatedAt
  };
}

function applyCloudState(cloudState){
  const localThumbnails=new Map((state.have||[]).map(item=>[item.id,item.thumbnail]));
  const mergedHave=(cloudState.have||[]).map(item=>({
    ...item,
    thumbnail:item.thumbnail||localThumbnails.get(item.id)||""
  }));
  state=normalizeState({
    ...state,
    ...cloudState,
    have:mergedHave,
    pantryPhotos:state.pantryPhotos // photos are device-local, never overwritten by cloud
  });
  save("state",state,{bumpTimestamp:false,skipCloudPush:true});
  renderPrefs();
  renderExclusionChips();
  renderWeekSection("this");
  renderWeekSection("next");
  renderHave();
  renderShopping();
  renderStoreSelection("meat");
  renderStoreSelection("supermarket");
}

function setHouseholdStatus(state,message){
  cloudSyncStatus={state,message,at:Date.now()};
  renderHouseholdStatus();
}

function scheduleCloudPush(){
  clearTimeout(cloudPushTimer);
  cloudPushTimer=setTimeout(pushHouseholdState,1500);
}

async function pushHouseholdState(){
  if(!householdCode)return;
  setHouseholdStatus("syncing","Syncing…");
  try{
    const response=await fetch(HOUSEHOLD_SYNC_URL,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({code:householdCode,state:buildSyncPayload(),deviceName})
    });
    if(!response.ok){
      const detail=await response.json().catch(()=>({}));
      throw new Error(detail.error||`Sync failed (${response.status})`);
    }
    setHouseholdStatus("synced","Synced just now.");
    logEvent("household_push_success",{code:householdCode});
  }catch(error){
    setHouseholdStatus("error","Could not sync. Will try again.");
    logEvent("household_push_failed",{code:householdCode,message:error?.message||String(error)});
  }
}

async function pullHouseholdState(){
  if(!householdCode)return;
  try{
    const response=await fetch(`${HOUSEHOLD_SYNC_URL}?code=${encodeURIComponent(householdCode)}`);
    if(!response.ok){
      const detail=await response.json().catch(()=>({}));
      throw new Error(detail.error||`Fetch failed (${response.status})`);
    }
    const data=await response.json();
    if(data.found&&Number(data.updatedAt)>Number(state.updatedAt||0)){
      const conflicts=cloudConflictsWithLocalLocks(data.state);
      if(conflicts.length){
        pendingCloudState=data.state;
        pendingCloudUpdatedBy=data.updatedBy||"";
        setHouseholdStatus("error","Your household has changes that would replace locked meals. Review below before anything is applied.");
        renderHouseholdConflict(conflicts);
        logEvent("household_pull_conflict",{code:householdCode,updatedBy:data.updatedBy||"",conflicts:conflicts.length});
        return;
      }
      snapshotWeek("this","before household sync applied");
      snapshotWeek("next","before household sync applied");
      applyCloudState(data.state);
      setHouseholdStatus("synced",data.updatedBy?`Updated from ${data.updatedBy}.`:"Updated from your household.");
      logEvent("household_pull_applied",{code:householdCode,updatedBy:data.updatedBy||""});
    }else if(data.found){
      setHouseholdStatus("synced","Up to date.");
    }
  }catch(error){
    setHouseholdStatus("error","Could not check for updates.");
    logEvent("household_pull_failed",{code:householdCode,message:error?.message||String(error)});
  }
}

function startHouseholdPolling(){
  clearInterval(householdPollTimer);
  if(!householdCode)return;
  householdPollTimer=setInterval(pullHouseholdState,HOUSEHOLD_POLL_MS);
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible"&&householdCode)pullHouseholdState();
  });
}

function generateHouseholdCode(){
  const chars="ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code="";
  for(let i=0;i<8;i++)code+=chars[Math.floor(Math.random()*chars.length)];
  return code;
}

async function createHousehold(){
  const code=generateHouseholdCode();
  householdCode=code;
  save("householdCode",code);
  logEvent("household_created",{code});
  setHouseholdStatus("syncing","Setting up your household…");
  await pushHouseholdState();
  startHouseholdPolling();
  renderHouseholdSection();
}

async function joinHousehold(rawCode){
  const code=String(rawCode||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
  if(code.length<6){
    setHouseholdStatus("error","That code doesn't look right. Check it and try again.");
    renderHouseholdSection();
    return;
  }
  householdCode=code;
  save("householdCode",code);
  logEvent("household_join_attempt",{code});
  setHouseholdStatus("syncing","Joining household…");
  renderHouseholdSection();
  try{
    const response=await fetch(`${HOUSEHOLD_SYNC_URL}?code=${encodeURIComponent(code)}`);
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`Join failed (${response.status})`);
    if(data.found){
      const conflicts=cloudConflictsWithLocalLocks(data.state);
      snapshotWeek("this","before joining household");
      snapshotWeek("next","before joining household");
      if(conflicts.length){
        pendingCloudState=data.state;
        pendingCloudUpdatedBy=data.updatedBy||"";
        setHouseholdStatus("error","This household's plan would replace locked meals already on this device. Review below before anything is applied.");
        renderHouseholdConflict(conflicts);
        logEvent("household_join_conflict",{code,conflicts:conflicts.length});
        startHouseholdPolling();
        renderHouseholdSection();
        return;
      }
      applyCloudState(data.state);
      setHouseholdStatus("synced","Joined! You're now seeing your household's shared plan.");
      logEvent("household_join_success",{code});
    }else{
      // No household exists yet at this code - this device becomes the first one.
      await pushHouseholdState();
      logEvent("household_join_created_new",{code});
    }
  }catch(error){
    setHouseholdStatus("error","Could not join. Check your connection and try again.");
    logEvent("household_join_failed",{code,message:error?.message||String(error)});
  }
  startHouseholdPolling();
  renderHouseholdSection();
}

function leaveHousehold(){
  if(!confirm("Stop syncing with your household? This device's data stays, but it will no longer share updates with anyone else."))return;
  householdCode=null;
  save("householdCode",null);
  clearInterval(householdPollTimer);
  setHouseholdStatus("idle","");
  renderHouseholdSection();
}

function snapshotWeek(weekKey,label){
  state.planSnapshot=state.planSnapshot||{};
  state.planSnapshot[weekKey]={
    plan:JSON.parse(JSON.stringify(state[planProp(weekKey)]||[])),
    locked:JSON.parse(JSON.stringify(state[lockedProp(weekKey)]||{})),
    shopping:JSON.parse(JSON.stringify(state[shoppingProp(weekKey)]||[])),
    label:label||"",
    at:Date.now()
  };
}

function hasRestorableSnapshot(weekKey){
  return Boolean(state.planSnapshot?.[weekKey]?.plan?.length);
}

function restoreWeekSnapshot(weekKey){
  const snap=state.planSnapshot?.[weekKey];
  if(!snap||!snap.plan?.length)return false;
  state[planProp(weekKey)]=JSON.parse(JSON.stringify(snap.plan));
  state[lockedProp(weekKey)]=JSON.parse(JSON.stringify(snap.locked||{}));
  state[shoppingProp(weekKey)]=JSON.parse(JSON.stringify(snap.shopping||[]));
  delete state.planSnapshot[weekKey];
  save("state",state);
  renderWeekSection(weekKey);
  renderShopping();
  return true;
}

function localLockedPlanFor(weekKey,fromState){
  const plan=fromState[planProp(weekKey)]||[];
  const locks=fromState[lockedProp(weekKey)]||{};
  return plan.filter(entry=>locks[entry.day]);
}

function shabbosDishSignature(dish){
  if(!dish)return null;
  if(dish.mode==="library"&&dish.recipeId)return `library:${dish.recipeId}`;
  if(dish.mode==="custom"&&dish.custom?.title)return `custom:${dish.custom.title.toLowerCase().trim()}`;
  if(dish.mode==="store")return `store:${dish.storeLink}`;
  return null;
}

function cloudConflictsWithLocalLocks(cloudState){
  const conflicts=[];
  for(const weekKey of ["this","next"]){
    const localLocked=localLockedPlanFor(weekKey,state);
    const durable=state.durableLocks?.[weekKey]||{};
    const protectedDays=new Map(localLocked.map(entry=>[entry.day,entry.id]));
    for(const [day,recipeId] of Object.entries(durable)){
      if(!protectedDays.has(day))protectedDays.set(day,recipeId);
    }
    if(!protectedDays.size)continue;
    const cloudPlan=cloudState[planProp(weekKey)]||[];
    for(const [day,recipeId] of protectedDays){
      const cloudEntry=cloudPlan.find(p=>p.day===day);
      if(!cloudEntry||cloudEntry.id!==recipeId){
        conflicts.push({weekKey,day,mine:getRecipe(recipeId)?.title||recipeId,theirs:cloudEntry?getRecipe(cloudEntry.id)?.title||cloudEntry.id:"(no dinner)"});
      }
    }
  }

  const backup=state.shabbosDurableBackup;
  if(backup){
    const cloudMenu=cloudState.shabbosMenu||{};
    for(const mealKey of Object.keys(SHABBOS_MEAL_LABELS)){
      const localMeal=backup[mealKey];
      if(!localMeal?.enabled)continue;
      const cloudMeal=cloudMenu[mealKey];
      for(const course of localMeal.courses||[]){
        const cloudCourse=(cloudMeal?.courses||[]).find(c=>c.name===course.name);
        const cloudSignatures=new Set((cloudCourse?.dishes||[]).map(shabbosDishSignature).filter(Boolean));
        for(const dish of course.dishes||[]){
          const signature=shabbosDishSignature(dish);
          if(signature&&!cloudSignatures.has(signature)){
            conflicts.push({weekKey:`shabbos-${mealKey}`,day:course.name,mine:shabbosDishSummary(dish),theirs:cloudCourse?`(${cloudCourse.dishes.length} dish${cloudCourse.dishes.length===1?"":"es"} instead)`:"(course missing)"});
          }
        }
      }
    }
  }

  return conflicts;
}

let pendingCloudState=null;
let pendingCloudUpdatedBy="";

function renderHouseholdConflict(conflicts){
  const box=$("householdConflict");
  if(!box)return;
  if(!conflicts||!conflicts.length){
    box.classList.add("hidden");
    box.innerHTML="";
    return;
  }
  box.classList.remove("hidden");
  const rows=conflicts.map(c=>`<div class="tiny">${c.day}: you have <b>${c.mine}</b> locked, but ${pendingCloudUpdatedBy||"your household"} has <b>${c.theirs}</b>.</div>`).join("");
  box.innerHTML=`
    <div style="border:1px solid #d97706;background:#fff7ed;color:#7c2d12;border-radius:12px;padding:12px;margin-top:10px">
      <b>Your locked dinners don't match what came in from your household.</b>
      ${rows}
      <div class="row" style="margin-top:10px;gap:8px">
        <button class="btn small" id="conflictKeepMineBtn" type="button">Keep my locked meals</button>
        <button class="btn small secondary" id="conflictUseTheirsBtn" type="button">Use their version instead</button>
      </div>
    </div>`;
  $("conflictKeepMineBtn").onclick=()=>{
    // Re-push this device's current (locked) state so it becomes the version everyone gets.
    pendingCloudState=null;
    renderHouseholdConflict(null);
    setHouseholdStatus("syncing","Keeping your locked meals and syncing…");
    save("state",state); // bumps timestamp and schedules a push
  };
  $("conflictUseTheirsBtn").onclick=()=>{
    if(pendingCloudState){
      snapshotWeek("this","before resolving sync conflict (used theirs)");
      snapshotWeek("next","before resolving sync conflict (used theirs)");
      applyCloudState(pendingCloudState);
      setHouseholdStatus("synced",pendingCloudUpdatedBy?`Updated from ${pendingCloudUpdatedBy}.`:"Updated from your household.");
    }
    pendingCloudState=null;
    renderHouseholdConflict(null);
  };
}

function renderHouseholdStatus(){
  const box=$("householdStatus");
  if(!box)return;
  box.className=`status ${cloudSyncStatus.state==="error"?"error":""}`.trim();
  box.textContent=cloudSyncStatus.message;
}

function renderHouseholdSection(){
  const setupBox=$("householdSetup");
  const activeBox=$("householdActive");
  if(!setupBox||!activeBox||!$("householdCodeDisplay"))return;
  if(householdCode){
    setupBox.classList.add("hidden");
    activeBox.classList.remove("hidden");
    $("householdCodeDisplay").textContent=householdCode;
    if($("deviceNameInput")&&!$("deviceNameInput").value)$("deviceNameInput").value=deviceName;
  }else{
    setupBox.classList.remove("hidden");
    activeBox.classList.add("hidden");
  }
  renderHouseholdStatus();
}


const HEBREW_FMT = new Intl.DateTimeFormat("en-u-ca-hebrew", {day:"numeric",month:"long",year:"numeric"});
const GREGORIAN_FMT = new Intl.DateTimeFormat("en-US", {month:"short",day:"numeric"});
const FULL_DATE_FMT = new Intl.DateTimeFormat("en-US", {weekday:"short",month:"short",day:"numeric"});

function dateAtNoon(date){
  const d=new Date(date);
  d.setHours(12,0,0,0);
  return d;
}
function addCalendarDays(date,days){
  const d=dateAtNoon(date);
  d.setDate(d.getDate()+days);
  return d;
}
function startOfCurrentWeek(base=new Date()){
  const d=dateAtNoon(base);
  d.setDate(d.getDate()-d.getDay());
  return d;
}
function plannerDates(base=new Date(),weekOffset=0){
  const start=addCalendarDays(startOfCurrentWeek(base), weekOffset*7);
  return DAYS.map((day,index)=>({day,date:addCalendarDays(start,index)}));
}
function weekOffsetFor(weekKey){return weekKey==="next"?1:0}
function planProp(weekKey){return weekKey==="next"?"nextPlan":"plan"}
function lockedProp(weekKey){return weekKey==="next"?"nextLocked":"locked"}
function shoppingProp(weekKey){return weekKey==="next"?"nextShopping":"shopping"}
function plannerDatesForWeek(weekKey,base=new Date()){
  return plannerDates(base,weekOffsetFor(weekKey));
}
function isoLocalDate(date){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,"0");
  const d=String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function hebrewDateParts(date){
  const parts=HEBREW_FMT.formatToParts(dateAtNoon(date));
  const value=type=>parts.find(p=>p.type===type)?.value||"";
  return {day:Number(value("day")),month:value("month"),year:Number(value("year")),label:HEBREW_FMT.format(dateAtNoon(date))};
}
function isObservedTishaBAv(date){
  const h=hebrewDateParts(date);
  if(h.month!=="Av") return false;
  if(h.day===9 && date.getDay()!==6) return true;
  if(h.day===10){
    const prior=addCalendarDays(date,-1);
    const ph=hebrewDateParts(prior);
    return ph.month==="Av" && ph.day===9 && prior.getDay()===6;
  }
  return false;
}
function calendarRuleForDate(date){
  const h=hebrewDateParts(date);
  if(isObservedTishaBAv(date)) return {type:"tisha",note:"Tisha B’Av — light break-fast",allowedKinds:["dairy","pareve"]};
  if(h.month==="Av" && h.day>=1 && h.day<=9){
    return {type:"nine-days",note:"Nine Days — meat-free",allowedKinds:["dairy","pareve"]};
  }
  return {type:"normal",note:"",allowedKinds:["meat","dairy","pareve"]};
}
function kindLabel(kind){return kind==="meat"?"Meat":kind==="dairy"?"Dairy":"Pareve"}
function recipeAllowedOnDate(recipe,date){
  const rule=calendarRuleForDate(date);
  if(!rule.allowedKinds.includes(recipe.kind)) return false;
  if(rule.type==="tisha" && !recipe.tags.includes("break-fast")) return false;
  return true;
}
function localSolarMidday(date,longitude){
  if(!Number.isFinite(Number(longitude))) return null;
  const d=dateAtNoon(date);
  const start=new Date(d.getFullYear(),0,0);
  const dayOfYear=Math.floor((d-start)/86400000);
  const gamma=2*Math.PI/365*(dayOfYear-1);
  const eqtime=229.18*(0.000075+0.001868*Math.cos(gamma)-0.032077*Math.sin(gamma)-0.014615*Math.cos(2*gamma)-0.040849*Math.sin(2*gamma));
  const timezoneMinutes=-d.getTimezoneOffset();
  const minutes=720-4*Number(longitude)-eqtime+timezoneMinutes;
  const hh=Math.floor(minutes/60)%24;
  const mm=Math.round(minutes%60);
  const out=new Date(d); out.setHours(hh,mm,0,0); return out;
}
function renderCalendar(base=new Date()){
  const dates=plannerDates(base);
  const rules=dates.map(x=>calendarRuleForDate(x.date));
  const start=dates[0].date,end=dates[dates.length-1].date;
  let note="Jewish calendar rules are applied automatically before your plan is built.";
  if(rules.some(r=>r.type==="tisha")) note="Tisha B’Av week — the fast day receives a light break-fast meal.";
  else if(rules.some(r=>r.type==="nine-days")) note="Nine Days — meat-free dinners are applied automatically.";
  const tenAv=dates.find(x=>{const h=hebrewDateParts(x.date);return h.month==="Av"&&h.day===10});
  if(tenAv && !isObservedTishaBAv(tenAv.date)){
    const loc=load("location",null);
    const midday=loc?localSolarMidday(tenAv.date,Number(loc.lng)):null;
    note += ` Meat remains restricted through halachic midday on ${FULL_DATE_FMT.format(tenAv.date)}${midday?` (about ${midday.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})})`:""}.`;
  }
  $("calendarBanner").innerHTML=`<div class="calendar-week">${GREGORIAN_FMT.format(start)}–${GREGORIAN_FMT.format(end)} · ${hebrewDateParts(start).label}–${hebrewDateParts(end).label}</div><div class="calendar-note">${esc(note)}</div>`;
  $("weekDateRange").textContent=`${FULL_DATE_FMT.format(start)} through ${FULL_DATE_FMT.format(end)}`;
}


function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function scrollToSection(id){$(id)?.scrollIntoView({behavior:"smooth",block:"start"})}

// Every nav link points at one of these views. Sections that live under the
// same nav item (e.g. this week + next week, or preferences + weekly
// settings) are grouped together so they show/hide as one unit. This is
// the actual fix for the app feeling impossible to use once the pantry
// grew large: previously every section sat on one continuously scrolling
// page, so a big pantry (photos + inventory + receipt scanner) dragged the
// whole app down with it. Now only the active view's sections are visible.
const VIEW_SECTIONS={
  home:["home"],
  week:["weekSubNav","week","shabbosMenu","nextWeek"],
  pantry:["pantry","receiptScan"],
  shopping:["shopping"],
  community:["community"],
  stores:["stores"],
  household:["household"],
  prefs:["prefs","weekSettings"]
};
function showView(view){
  if(!VIEW_SECTIONS[view])view="home";
  for(const [key,ids] of Object.entries(VIEW_SECTIONS)){
    for(const id of ids){
      const el=$(id);
      if(el)el.classList.toggle("hidden",key!==view);
    }
  }
  closeMobileNav();
  // The "week" group is really three stacked cards (This Week / Shabbos /
  // Next Week). Showing the whole group above just unhid all three again -
  // reapply whichever one tab is actually active so navigating here doesn't
  // silently undo the tab selection.
  if(view==="week")showWeekSubView(state.weekSubView||"this");
  if(typeof window!=="undefined"&&window.scrollTo)window.scrollTo({top:0,behavior:"instant"});
  state.activeView=view;
}
const WEEK_SUBVIEW_SECTIONS={this:"week",shabbos:"shabbosMenu",next:"nextWeek"};
function showWeekSubView(sub){
  if(!WEEK_SUBVIEW_SECTIONS[sub])sub="this";
  if(state.weekSubView!==sub){
    state.weekSubView=sub;
    save("state",state,{skipCloudPush:true});
  }
  for(const [key,id] of Object.entries(WEEK_SUBVIEW_SECTIONS)){
    $(id)?.classList.toggle("hidden",key!==sub);
  }
  $("weekSubNav")?.querySelectorAll("[data-weeksubview]").forEach(btn=>{
    btn.classList.toggle("on",btn.dataset.weeksubview===sub);
  });
  if(typeof window!=="undefined"&&window.scrollTo)window.scrollTo({top:0,behavior:"instant"});
}
$("weekSubNav")?.querySelectorAll("[data-weeksubview]").forEach(btn=>{
  btn.onclick=()=>showWeekSubView(btn.dataset.weeksubview);
});
function openMobileNav(){$("mobileNavOverlay")?.classList.remove("hidden")}
function closeMobileNav(){$("mobileNavOverlay")?.classList.add("hidden")}

function renderChips(container, items, selected, onClick){
  $(container).innerHTML=items.map(x=>`<button type="button" class="chip ${selected.includes(x)?'on':''}" data-chip="${esc(x)}">${esc(x)}</button>`).join("");
  $(container).querySelectorAll("[data-chip]").forEach(b=>b.onclick=()=>onClick(b.dataset.chip));
}
function toggle(arr,x){return arr.includes(x)?arr.filter(v=>v!==x):[...arr,x]}

function renderPrefs(){
  renderChips("prefChips",PREFS,state.prefs,x=>{state.prefs=toggle(state.prefs,x);save("state",state);renderPrefs()});
  renderChips("weekChips",WEEK,state.week,x=>{state.week=toggle(state.week,x);save("state",state);renderPrefs()});
  $("portionCount").textContent=state.portions;
  renderExclusions();
}

function renderExclusions(){
  $("excludeChecks").innerHTML=INGREDIENT_OPTIONS.map(x=>`
    <label class="check-row">
      <input type="checkbox" data-exclude-check="${esc(x)}" ${state.exclude.includes(x)?"checked":""}>
      <span>${esc(x)}</span>
    </label>`).join("");

  document.querySelectorAll("[data-exclude-check]").forEach(box=>{
    box.onchange=()=>{
      const value=box.dataset.excludeCheck;
      if(box.checked && !state.exclude.includes(value)) state.exclude.push(value);
      if(!box.checked) state.exclude=state.exclude.filter(v=>v!==value);
      save("state",state);
      renderExclusionChips();
    };
  });
  renderExclusionChips();
}

function renderExclusionChips(){
  $("excludeChips").innerHTML=state.exclude.length
    ? state.exclude.map(x=>`<button type="button" class="chip on" data-remove-exclude="${esc(x)}">${esc(x)} ×</button>`).join("")
    : '<span class="tiny">Nothing excluded this week.</span>';

  document.querySelectorAll("[data-remove-exclude]").forEach(btn=>{
    btn.onclick=()=>{
      state.exclude=state.exclude.filter(v=>v!==btn.dataset.removeExclude);
      save("state",state);
      renderExclusions();
    };
  });

  $("excludeSummary").textContent=state.exclude.length
    ? `${state.exclude.length} selected`
    : "Select ingredients to avoid";
}

function addCustomExclude(){
  const value=$("customExclude").value.trim().toLowerCase();
  if(!value)return;
  if(!state.exclude.includes(value)) state.exclude.push(value);
  $("customExclude").value="";
  save("state",state);
  renderExclusions();
}

// Recipes are static once loaded - the same object never needs restringifying
// on every call. recipeAllowed and scoreRecipe both need a lowercase, full-text
// searchable blob per recipe; caching it here was most of the remaining cost
// after fixing the sort-comparator bug above (each JSON.stringify was ~0.5ms,
// run for every recipe on every single build).
const recipeTextCache=new Map();
function recipeSearchText(r){
  let cached=recipeTextCache.get(r.id);
  if(cached===undefined){
    cached=JSON.stringify(r).toLowerCase();
    recipeTextCache.set(r.id,cached);
  }
  return cached;
}

function recipeAllowed(r){
  const text=recipeSearchText(r);
  const prefs=state.prefs.map(x=>x.toLowerCase());
  if(prefs.includes("no fish") && /fish|salmon|tuna/.test(text)) return false;
  if(prefs.includes("no tofu") && text.includes("tofu")) return false;
  if(prefs.includes("no turkey") && text.includes("turkey")) return false;
  if(prefs.includes("no broccoli") && text.includes("broccoli")) return false;
  if(prefs.includes("no cauliflower") && text.includes("cauliflower")) return false;
  if(prefs.includes("no cilantro") && text.includes("cilantro")) return false;
  if(prefs.includes("no egg-forward dinners") && /omelet|omelette|frittata|quiche|egg-forward/.test(text)) return false;
  if(prefs.includes("not spicy") && /hot sauce|jalape|habanero|serrano|cayenne|very spicy/.test(text)) return false;
  return !(state.exclude||[]).some(ex=>ex && text.includes(ex.toLowerCase()));
}

function getRecipe(id){return RECIPES.find(r=>r.id===id)}

// A small curated list of Shabbos-appropriate dishes - kept separate from the
// weekday library since Shabbos dishes are made ahead and aren't bound by the
// weekday quick-prep rules. Grows over time.
const SHABBOS_SPECIALS=["shabbos-roast-chicken-01","shabbos-chicken-soup-01","shabbos-cholent-01","shabbos-cholent-kishke-01","shabbos-cholent-hungarian-01","shabbos-cholent-sweet-01","shabbos-challah-01","shabbos-challah-02","shabbos-challah-03","shabbos-challah-04","shabbos-tzimmes-01","shabbos-roast-beef-01","bbq-beef-brisket-01","shabbos-potato-kugel-01","shabbos-sweet-kugel-01","shabbos-salmon-01","shabbos-salmon-02","shabbos-salmon-03","shabbos-salmon-04","shabbos-salmon-05","shabbos-gefilte-fish-01","shabbos-herring-01","shabbos-israeli-salad-01","shabbos-pomegranate-salad-01","shabbos-roasted-veg-salad-01","shabbos-hummus-01","shabbos-matbucha-01","shabbos-potato-salad-01","shabbos-pareve-chocolate-cake-01","shabbos-fruit-compote-01","shabbos-apple-crumble-01","shabbos-fruit-sorbet-01"].filter(id=>RECIPES.some(r=>r.id===id));

// Which specials make sense for which course. Courses not listed here (custom
// courses the user names themselves) fall back to showing everything, since
// there's no way to know intent for a course we don't recognize.
const SHABBOS_COURSE_ICONS={
  "Fish":"🐟",
  "Salads":"🥗",
  "Soup":"🍲",
  "Main Course":"🍗",
  "Dessert":"🍰",
  "Light Bites":"🍪",
  "Light Meal":"🍕"
};

const SHABBOS_COURSE_SPECIALS={
  "Challah":["shabbos-challah-01","shabbos-challah-02","shabbos-challah-03","shabbos-challah-04"],
  "Soup":["shabbos-chicken-soup-01"],
  "Main Course":["shabbos-roast-chicken-01","shabbos-cholent-01","shabbos-cholent-kishke-01","shabbos-cholent-hungarian-01","shabbos-cholent-sweet-01","shabbos-roast-beef-01","bbq-beef-brisket-01","shabbos-tzimmes-01","shabbos-potato-kugel-01","shabbos-sweet-kugel-01"],
  "Kiddush":[],
  "Fish":["shabbos-salmon-01","shabbos-salmon-02","shabbos-salmon-03","shabbos-salmon-04","shabbos-salmon-05","shabbos-gefilte-fish-01","shabbos-herring-01"],
  "Salads":["shabbos-israeli-salad-01","shabbos-pomegranate-salad-01","shabbos-roasted-veg-salad-01","shabbos-hummus-01","shabbos-matbucha-01","shabbos-potato-salad-01"],
  "Dessert":["shabbos-pareve-chocolate-cake-01","shabbos-fruit-compote-01","shabbos-apple-crumble-01","shabbos-fruit-sorbet-01"]
};

function shabbosSpecialsForCourse(courseName){
  if(Object.prototype.hasOwnProperty.call(SHABBOS_COURSE_SPECIALS,courseName))return SHABBOS_COURSE_SPECIALS[courseName];
  return SHABBOS_SPECIALS;
}

// Takeout only makes sense for an informal, unstructured meal - not a course
// inside a formal Friday night/Shabbos day table like Kiddush or Soup.
const SHABBOS_TAKEOUT_MEALS=["seuda","motzei"];

const SHABBOS_MEAL_LABELS={friday:"Friday night",day:"Shabbos day",seuda:"Seuda Shlishit",motzei:"Motzei Shabbos"};

function shabbosMeal(key){
  state.shabbosMenu=state.shabbosMenu||normalizeShabbosMenu(null);
  return state.shabbosMenu[key];
}

// Returns a real recipe (library pick) or a lightweight recipe-shaped object
// (custom write-in) for a single dish, or null for an empty/takeout dish
// (nothing to shop or cook for).
function shabbosRecipeForDish(dish,courseName){
  if(!dish)return null;
  if(dish.mode==="library"&&dish.recipeId)return getRecipe(dish.recipeId)||null;
  if(dish.mode==="custom"&&dish.custom)return {id:`shabbos-custom-${dish.id}`,title:dish.custom.title,ingredients:dish.custom.ingredients,steps:dish.custom.steps||[],tags:["shabbos","custom"],kind:"other",courseName};
  return null;
}

function shabbosSelectedRecipes(){
  const menu=state.shabbosMenu||normalizeShabbosMenu(null);
  const out=[];
  for(const key of Object.keys(SHABBOS_MEAL_LABELS)){
    const meal=menu[key];
    if(!meal?.enabled)continue;
    for(const course of meal.courses||[]){
      for(const dish of course.dishes||[]){
        const recipe=shabbosRecipeForDish(dish,course.name);
        if(recipe)out.push(recipe);
      }
    }
    if(meal.basics){
      if(!meal.basics.wine.haveIt){
        out.push({id:`shabbos-basics-wine-${key}`,title:"Wine or Grape Juice",ingredients:[["wine or grape juice","1 bottle"]],steps:[],tags:["shabbos"],kind:"pareve"});
      }
      const challah=meal.basics.challah;
      if(challah.mode==="bake"&&challah.dish){
        const recipe=shabbosRecipeForDish(challah.dish,"Challah");
        if(recipe)out.push(recipe);
      }else if(challah.mode==="buy"&&!inventoryMatchesIngredient("challah")){
        out.push({id:`shabbos-basics-challah-${key}`,title:"Challah",ingredients:[["challah","1 loaf"]],steps:[],tags:["shabbos"],kind:"pareve"});
      }
    }
  }
  return out;
}


function stableJitter(text){
  let h = 2166136261;
  for(let i=0;i<text.length;i++){
    h ^= text.charCodeAt(i);
    h = Math.imul(h,16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function recipeProtein(r){
  if(r.tags.includes("beef"))return "beef";
  if(r.tags.includes("chicken"))return "chicken";
  if(r.tags.includes("lamb"))return "lamb";
  return null;
}

function scoreRecipe(r,targetKind,usedFamilies,usedProteins=new Set()){
  let score=stableJitter(`${r.id}:${state.planNonce||0}`);
  if(targetKind && r.kind===targetKind) score+=4;
  if(state.week.includes("Kid-friendly") && r.tags.includes("kid")) score+=3;
  if(state.week.includes("More dairy") && r.kind==="dairy") score+=2;
  if(state.week.includes("More meat/chicken") && r.kind==="meat") score+=2;
  if(state.week.includes("Simple week") && (r.tags.includes("simple")||r.tags.includes("kid"))) score+=1.5;

  // Pantry-first is automatic whenever the kitchen inventory is available.
  if((state.have||[]).length){
    r.ingredients.forEach(([name])=>{
      if(inventoryMatchesIngredient(name)) score+=1.1;
    });
  }

  const preferenceText=recipeSearchText(r);
  const softPreferences={
    "Less chickpeas":/chickpea|garbanzo/,
    "Less carrots":/carrot/,
    "Less eggplant":/eggplant|aubergine/,
    "Less spinach":/spinach/
  };
  for(const [preference,pattern] of Object.entries(softPreferences)){
    if(state.prefs.includes(preference) && pattern.test(preferenceText)) score-=3;
  }

  const family=recipeFamily(r);
  if(usedFamilies.has(family)) score-=6;
  if((state.recentPlans||[]).flat().includes(r.id)) score-=1;

  // Family alone isn't enough: "Beef Burgers", "Beef Tacos", and "Mini Meatloaves"
  // are three different families but the same protein, and would otherwise happily
  // stack in the same week. Penalize repeating the same protein across the week.
  const protein=recipeProtein(r);
  if(protein && usedProteins.has(protein)) score-=3;

  const rating=(state.recipeRatings||{})[r.id];
  if(rating==="up") score+=5;
  if(rating==="down") score-=8;

  return score;
}

function recipeFamily(r){
  if(r.family)return r.family;
  const title=r.title.toLowerCase();
  if(title.includes("sloppy")) return "sloppy";
  if(title.includes("burger")) return "burger";
  if(title.includes("meatball")) return "meatball";
  if(title.includes("pasta")||title.includes("ziti")||title.includes("mac")) return "pasta";
  if(title.includes("rice")) return "rice";
  if(title.includes("soup")) return "soup";
  if(title.includes("schnitzel")) return "schnitzel";
  if(title.includes("shawarma")) return "shawarma";
  return r.id;
}

function targetKinds(dates=plannerDates()){
  const normal=state.week.includes("More dairy")
    ? ["dairy","meat","dairy","meat","dairy"]
    : state.week.includes("More meat/chicken")
      ? ["meat","meat","dairy","meat","meat"]
      : ["meat","dairy","meat","dairy","meat"];
  return dates.map((entry,index)=>{
    const rule=calendarRuleForDate(entry.date);
    if(rule.type==="tisha") return "pareve";
    if(rule.type==="nine-days") return index%2===0?"dairy":"pareve";
    return normal[index];
  });
}

function chooseUniqueRecipe({usedIds,usedFamilies,usedProteins=new Set(),targetKind,date,bannedIds=new Set(),bannedFamilies=new Set(),prefAllowed=null}){
  // prefAllowed lets a caller building a whole week (5 calls) pass in the
  // already-computed household-rules filter once, instead of re-running
  // recipeAllowed's JSON.stringify-per-recipe check across the full library
  // on every single day.
  const prefsPass=prefAllowed||RECIPES.filter(recipeAllowed);
  const allowed=prefsPass.filter(r=>recipeAllowedOnDate(r,date));
  // Recipe families each contain many near-identical variants that only swap
  // a side dish (e.g. "Lemon Herb Chicken — with Rice" vs "— with Potatoes").
  // When replacing one specific day, first try to exclude the current dish's
  // own family too, so "Replace" gives a genuinely different meal instead of
  // the same base dish with a different condiment. Only fall back to
  // allowing that family again if nothing else fits the day's restrictions.
  let candidates=allowed.filter(r=>!usedIds.has(r.id)&&!bannedIds.has(r.id)&&!bannedFamilies.has(recipeFamily(r)));
  if(!candidates.length) candidates=allowed.filter(r=>!usedIds.has(r.id)&&!bannedIds.has(r.id));
  if(!candidates.length) candidates=allowed.filter(r=>!usedIds.has(r.id));
  if(!candidates.length) candidates=allowed;
  // Score each candidate exactly once, then sort by the cached number.
  // The actual bug that made "Build" and "Replace" take 20-30+ seconds with
  // the ~800-recipe library: Array.sort's comparator runs roughly
  // n*log2(n) times, not n times - scoring inside the comparator (as this
  // used to) turned ~800 recipes into ~15,000 scoreRecipe calls, each doing
  // a fresh JSON.stringify of the recipe plus a pantry-matching loop.
  // Scoring first drops that back down to ~800 calls.
  const scored=candidates.map(r=>({r,score:scoreRecipe(r,targetKind,usedFamilies,usedProteins)}));
  scored.sort((a,b)=>b.score-a.score);
  return scored[0]?.r;
}

function buildPlanForWeek(weekKey="this",{replaceUnlocked=false}={}){
  snapshotWeek(weekKey,replaceUnlocked?"before replace unlocked":"before build");
  state.planNonce=(state.planNonce||0)+1;
  const allowed=RECIPES.filter(recipeAllowed);
  const planField=planProp(weekKey);
  const lockedField=lockedProp(weekKey);
  if(!allowed.length){
    const target = weekKey==="next" ? "nextWeekList" : "weekList";
    $(target).innerHTML='<div class="notice">No recipes match these choices. Remove an exclusion and try again.</div>';
    return false;
  }

  const oldPlan=[...(state[planField]||[])];
  const lockMap=state[lockedField]||{};
  const usedIds=new Set();
  const usedFamilies=new Set();
  const usedProteins=new Set();
  const dates=plannerDatesForWeek(weekKey);
  const kinds=targetKinds(dates);
  const newPlan=[];

  for(let i=0;i<DAYS.length;i++){
    const day=DAYS[i];
    const date=dates[i].date;
    const old=oldPlan.find(p=>p.day===day);
    if(replaceUnlocked && old && lockMap[day]){
      const r=getRecipe(old.id);
      if(r && recipeAllowed(r) && recipeAllowedOnDate(r,date)){
        newPlan.push({...old,date:isoLocalDate(date)});
        usedIds.add(r.id);
        usedFamilies.add(recipeFamily(r));
        const lockedProtein=recipeProtein(r);
        if(lockedProtein)usedProteins.add(lockedProtein);
        continue;
      }
    }

    const banned=new Set();
    if(replaceUnlocked && old) banned.add(old.id);

    const chosen=chooseUniqueRecipe({
      usedIds,
      usedFamilies,
      usedProteins,
      targetKind:kinds[i],
      date,
      bannedIds:banned,
      prefAllowed:allowed
    });

    if(chosen){
      newPlan.push({day,id:chosen.id,date:isoLocalDate(date)});
      usedIds.add(chosen.id);
      usedFamilies.add(recipeFamily(chosen));
      const chosenProtein=recipeProtein(chosen);
      if(chosenProtein)usedProteins.add(chosenProtein);
    }
  }

  state[planField]=newPlan;
  if(!replaceUnlocked) state[lockedField]={};
  state.recentPlans=[...(state.recentPlans||[]).slice(-3),newPlan.map(p=>p.id)];
  buildShoppingForWeek(weekKey);
  if(weekKey==="next" && (!state.shoppingView || state.shoppingView==="this")) state.shoppingView="combined";
  save("state",state);
  renderWeekSection(weekKey);
  renderShopping();
  return true;
}

function replaceDay(weekKey,day){
  const planField=planProp(weekKey);
  const plan=state[planField]||[];
  const index=plan.findIndex(p=>p.day===day);
  if(index<0)return;

  // A locked day is a promise to the user that this dish won't change out from
  // under them. Replace must refuse to touch it - this is the actual bug the
  // user hit: the button used to ignore lock status entirely.
  const locks=state[lockedProp(weekKey)]||{};
  if(locks[day])return;

  snapshotWeek(weekKey,`before replacing ${day}`);

  // Without reshuffling here, every Replace click re-scores with the exact
  // same jitter and just ping-pongs between the same 2-3 top-scoring dishes
  // for that day's kind (meat/dairy/pareve), no matter how large the
  // library is. Bump it on every click so Replace actually explores the
  // full library over repeated taps, the same way building a whole new
  // week already does.
  state.planNonce=(state.planNonce||0)+1;

  const current=plan[index];
  const dates=plannerDatesForWeek(weekKey);
  const date=dates[index].date;
  const usedIds=new Set(plan.filter(p=>p.day!==day).map(p=>p.id));
  const usedFamilies=new Set(plan.filter(p=>p.day!==day).map(p=>recipeFamily(getRecipe(p.id))));
  const usedProteins=new Set(plan.filter(p=>p.day!==day).map(p=>recipeProtein(getRecipe(p.id))).filter(Boolean));
  const currentRecipe=getRecipe(current.id);
  // Deliberately no targetKind here: the meat/dairy/pareve pattern per day
  // (e.g. "Monday is a meat night") is just an internal habit used when
  // auto-building a whole week for variety - it isn't a rule the user set.
  // Replace should be free to land on any kind, limited only by what the
  // user actually controls: permanent household rules, this week's
  // settings, and the Jewish calendar (recipeAllowed/recipeAllowedOnDate,
  // both still applied inside chooseUniqueRecipe below).
  const chosen=chooseUniqueRecipe({
    usedIds,
    usedFamilies,
    usedProteins,
    date,
    bannedIds:new Set([current.id]),
    bannedFamilies:new Set([recipeFamily(currentRecipe)])
  });

  if(chosen){
    plan[index]={day,id:chosen.id,date:isoLocalDate(date)};
    state[planField]=plan;
    buildShoppingForWeek(weekKey);
    save("state",state);
    renderWeekSection(weekKey);
    renderShopping();
  }
}

function renderWeekDateRange(weekKey){
  const dates=plannerDatesForWeek(weekKey);
  const start=dates[0].date,end=dates[dates.length-1].date;
  const target=weekKey==="next"?"nextWeekDateRange":"weekDateRange";
  $(target).textContent=`${FULL_DATE_FMT.format(start)} through ${FULL_DATE_FMT.format(end)}`;
}

function recordDurableLock(weekKey,day,recipeId){
  state.durableLocks=state.durableLocks||{this:{},next:{}};
  state.durableLocks[weekKey][day]=recipeId;
}

function clearDurableLock(weekKey,day){
  state.durableLocks=state.durableLocks||{this:{},next:{}};
  delete state.durableLocks[weekKey][day];
}

function hasDurableLocks(weekKey){
  return Object.keys(state.durableLocks?.[weekKey]||{}).length>0;
}

// Restores every durably-locked meal, no matter how many other actions
// (Build, Replace, a sync) happened since it was locked - unlike Restore
// Previous Plan, which only remembers the single most recent change.
function restoreDurableLocks(weekKey){
  const locks=state.durableLocks?.[weekKey]||{};
  if(!Object.keys(locks).length)return false;
  const planField=planProp(weekKey);
  const lockedField=lockedProp(weekKey);
  const plan=state[planField]||[];
  const dates=plannerDatesForWeek(weekKey);
  for(const [day,recipeId] of Object.entries(locks)){
    if(!getRecipe(recipeId))continue;
    const dateEntry=dates.find(d=>d.day===day);
    const existing=plan.find(p=>p.day===day);
    if(existing){
      existing.id=recipeId;
      if(dateEntry)existing.date=isoLocalDate(dateEntry.date);
    }else if(dateEntry){
      plan.push({day,id:recipeId,date:isoLocalDate(dateEntry.date)});
    }
    state[lockedField][day]=true;
  }
  state[planField]=plan;
  buildShoppingForWeek(weekKey);
  save("state",state);
  renderWeekSection(weekKey);
  renderShopping();
  return true;
}

function lockAllForWeek(weekKey="this"){
  const plan=state[planProp(weekKey)]||[];
  if(!plan.length)return false;
  const field=lockedProp(weekKey);
  const allLocked=plan.every(entry=>Boolean(state[field]?.[entry.day]));
  state[field]=Object.fromEntries(plan.map(entry=>[entry.day,!allLocked]));
  if(!allLocked){
    for(const entry of plan)recordDurableLock(weekKey,entry.day,entry.id);
  }else{
    for(const entry of plan)clearDurableLock(weekKey,entry.day);
  }
  save("state",state);
  renderWeekSection(weekKey);
  return !allLocked;
}

function ratingButtons(recipeId,context){
  const rating=(state.recipeRatings||{})[recipeId]||"neutral";
  const options=[["up","👍","Loved it"],["neutral","😐","It's fine"],["down","👎","Not again"]];
  return `<div class="rating-row" role="group" aria-label="Rate this dish">
    ${options.map(([value,icon,label])=>
      `<button type="button" class="rating-btn ${rating===value?'on':''}" data-rating="${context}:${recipeId}:${value}" aria-label="${label}" aria-pressed="${rating===value}">${icon}</button>`
    ).join("")}
  </div>`;
}

function setRecipeRating(recipeId,value){
  state.recipeRatings=state.recipeRatings||{};
  if(value==="neutral")delete state.recipeRatings[recipeId];
  else state.recipeRatings[recipeId]=value;
  save("state",state);
}

function isPlanStale(weekKey){
  const plan=state[planProp(weekKey)]||[];
  if(!plan.length)return false;
  const currentDates=plannerDatesForWeek(weekKey);
  return plan.some((entry,i)=>entry.date && currentDates[i] && entry.date!==isoLocalDate(currentDates[i].date));
}

function shabbosDishSummary(dish){
  if(dish.mode==="library"&&dish.recipeId){
    const r=getRecipe(dish.recipeId);
    return r?r.title:"Recipe not found";
  }
  if(dish.mode==="custom"&&dish.custom)return `${dish.custom.title} (your own recipe)`;
  if(dish.mode==="store")return dish.storeLink?`Takeout: ${dish.storeLink}`:"Takeout - no link saved yet";
  return "";
}

let dishEditorRows=[];
let dishEditorOnSave=null;

function openDishEditor({heading="Write your own recipe",helpText="",initialTitle="",initialIngredients=[],initialSteps=[],onSave}){
  dishEditorRows=(initialIngredients.length?initialIngredients:[["",""]]).map(([name,qty])=>({id:shabbosUid(),name,qty}));
  dishEditorOnSave=onSave;
  renderDishEditor(heading,helpText,initialTitle,initialSteps.join("\n"));
  $("dishEditorDialog").showModal();
}

function renderDishEditor(heading,helpText,titleValue,stepsValue){
  const modal=$("dishEditorModal");
  modal.innerHTML=`
    <div class="recipe-head" style="margin-top:16px">
      <h2 style="margin:0">${esc(heading)}</h2>
      ${helpText?`<p class="muted">${esc(helpText)}</p>`:""}
    </div>
    <div style="margin:14px 0">
      <label class="tiny muted" for="dishEditorTitle">Dish name</label>
      <input type="text" class="text-input" id="dishEditorTitle" value="${esc(titleValue)}" placeholder="e.g. Grandma's Kugel" style="margin-top:4px">
    </div>
    <div>
      <label class="tiny muted">Ingredients</label>
      <div id="dishEditorRows" style="display:grid;gap:8px;margin-top:6px">
        ${dishEditorRows.map(row=>`
          <div class="row" style="gap:6px;flex-wrap:nowrap" data-dish-row="${row.id}">
            <input type="text" class="text-input" data-dish-row-name="${row.id}" value="${esc(row.name)}" placeholder="Ingredient" style="flex:2">
            <input type="text" class="text-input" data-dish-row-qty="${row.id}" value="${esc(row.qty)}" placeholder="Amount" style="flex:1">
            <button type="button" class="btn tiny ghost" data-dish-row-remove="${row.id}" aria-label="Remove ingredient row">✕</button>
          </div>
        `).join("")}
      </div>
      <button type="button" class="btn tiny secondary" id="dishEditorAddRow" style="margin-top:8px">+ Add ingredient</button>
    </div>
    <div style="margin-top:14px">
      <label class="tiny muted" for="dishEditorSteps">Instructions (optional, one step per line)</label>
      <textarea class="text-input" id="dishEditorSteps" rows="4" placeholder="e.g.&#10;Preheat the oven to 375°F.&#10;Mix everything together and pour into a pan.&#10;Bake 40 minutes." style="margin-top:4px;resize:vertical">${esc(stepsValue||"")}</textarea>
    </div>
    <div class="row modal-close-row-bottom" style="justify-content:space-between">
      <button type="button" class="btn small secondary" id="dishEditorCancel">Cancel</button>
      <button type="button" class="btn small" id="dishEditorSave">Save</button>
    </div>`;

  modal.querySelectorAll("[data-dish-row-name]").forEach(input=>{
    input.oninput=()=>{const row=dishEditorRows.find(r=>r.id===input.dataset.dishRowName);if(row)row.name=input.value;};
  });
  modal.querySelectorAll("[data-dish-row-qty]").forEach(input=>{
    input.oninput=()=>{const row=dishEditorRows.find(r=>r.id===input.dataset.dishRowQty);if(row)row.qty=input.value;};
  });
  modal.querySelectorAll("[data-dish-row-remove]").forEach(btn=>{
    btn.onclick=()=>{
      dishEditorRows=dishEditorRows.filter(r=>r.id!==btn.dataset.dishRowRemove);
      if(!dishEditorRows.length)dishEditorRows=[{id:shabbosUid(),name:"",qty:""}];
      renderDishEditor(heading,helpText,$("dishEditorTitle").value,$("dishEditorSteps").value);
    };
  });
  $("dishEditorAddRow").onclick=()=>{
    dishEditorRows.push({id:shabbosUid(),name:"",qty:""});
    renderDishEditor(heading,helpText,$("dishEditorTitle").value,$("dishEditorSteps").value);
  };
  $("dishEditorCancel").onclick=()=>{$("dishEditorDialog").close();dishEditorOnSave=null;};
  $("dishEditorSave").onclick=()=>{
    const title=$("dishEditorTitle").value.trim();
    if(!title){alert("Please enter a dish name.");return;}
    const ingredients=dishEditorRows.map(r=>[r.name.trim(),r.qty.trim()]).filter(([name])=>name);
    if(!ingredients.length){alert("Please enter at least one ingredient.");return;}
    const steps=$("dishEditorSteps").value.split("\n").map(s=>s.trim()).filter(Boolean);
    const callback=dishEditorOnSave;
    $("dishEditorDialog").close();
    dishEditorOnSave=null;
    if(callback)callback({title,ingredients,steps});
  };
}

async function extractRecipeDocumentText(file){
  const name=(file.name||"").toLowerCase();
  if(name.endsWith(".txt")){
    return await file.text();
  }
  if(name.endsWith(".docx")){
    if(typeof window.mammoth==="undefined"){
      throw new Error("The document reader hasn't finished loading yet - wait a moment and try again.");
    }
    const arrayBuffer=await file.arrayBuffer();
    const result=await window.mammoth.extractRawText({arrayBuffer});
    return result.value;
  }
  if(name.endsWith(".pdf")){
    if(typeof window.pdfjsLib==="undefined"){
      throw new Error("The document reader hasn't finished loading yet - wait a moment and try again.");
    }
    window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const arrayBuffer=await file.arrayBuffer();
    const pdf=await window.pdfjsLib.getDocument({data:arrayBuffer}).promise;
    const pageTexts=[];
    for(let pageNum=1;pageNum<=pdf.numPages;pageNum++){
      const page=await pdf.getPage(pageNum);
      const content=await page.getTextContent();
      pageTexts.push(content.items.map(item=>item.str).join(" "));
    }
    return pageTexts.join("\n\n");
  }
  throw new Error("Please upload a .docx, .pdf, or .txt file.");
}

function recordShabbosDurableBackup(){
  state.shabbosDurableBackup=JSON.parse(JSON.stringify(state.shabbosMenu));
}

function hasShabbosDurableBackup(){
  return Boolean(state.shabbosDurableBackup);
}

function restoreShabbosDurableBackup(){
  if(!state.shabbosDurableBackup)return false;
  state.shabbosMenu=normalizeShabbosMenu(state.shabbosDurableBackup);
  refreshPantryDependencies({renderInventoryToo:false});
  renderShabbosSlots();
  return true;
}

function renderShabbosChallahStatus(mealKey,basics){
  const challah=basics.challah;
  const pantryHasIt=inventoryMatchesIngredient("challah");
  if(challah.mode==="bake"){
    if(challah.dish){
      return `<div class="shabbos-basics-status">Baking: ${esc(shabbosDishSummary(challah.dish))}</div>`;
    }
    return `<div class="shabbos-basics-status need">Choose what you're baking below</div>`;
  }
  if(challah.mode==="buy"){
    return `<div class="shabbos-basics-status">✓ Marked as bought${pantryHasIt?" - and it's in your pantry":""}</div>`;
  }
  return `<div class="shabbos-basics-status need">${pantryHasIt?"✓ Found in your pantry":"Not chosen yet"}</div>`;
}

function renderShabbosBasics(mealKey,basics){
  const wine=basics.wine;
  const challah=basics.challah;
  const showChallahPicker=challah.mode==="bake"&&!challah.dish;
  const pickerKey=`${mealKey}:__challah__`;
  return `<div class="shabbos-table-basics">
    <div class="shabbos-basics-row">
      <div class="shabbos-basics-icon">🍷</div>
      <div class="shabbos-basics-body">
        <div class="shabbos-basics-name">Wine / Grape Juice</div>
        <div class="shabbos-basics-status${wine.haveIt?"":" need"}">${wine.haveIt?"✓ Have it":"Need to buy"}</div>
      </div>
    </div>
    <button type="button" class="btn small secondary" data-shabbos-wine-toggle="${mealKey}" style="margin-bottom:12px">${wine.haveIt?"Mark as needed":"Mark as have it"}</button>
    <div class="shabbos-basics-row">
      <div class="shabbos-basics-icon">🍞</div>
      <div class="shabbos-basics-body">
        <div class="shabbos-basics-name">Challah</div>
        ${renderShabbosChallahStatus(mealKey,basics)}
      </div>
      ${challah.mode?`<button type="button" class="btn tiny ghost" data-shabbos-challah-change="${mealKey}">Change</button>`:""}
    </div>
    ${!challah.mode?`<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px">
      <button type="button" class="btn small" data-shabbos-challah-bake="${mealKey}">🍞 I'll bake it</button>
      <button type="button" class="btn small secondary" data-shabbos-challah-buy="${mealKey}">Mark as bought</button>
    </div>`:""}
    ${showChallahPicker?renderShabbosPicker(pickerKey,"Challah"):""}
  </div>`;
}

function renderShabbosPicker(pickerKey,courseName){
  const relevantSpecials=shabbosSpecialsForCourse(courseName);
  if(state.shabbosAddOwnFor===pickerKey){
    return `<div class="shabbos-addown-panel">
      ${state.shabbosImportBusy===pickerKey?`<div class="tiny" style="padding:6px 4px">⏳ Reading${state.shabbosImportBusyKind==="photo"?" your photo":" your file"}…</div>`:`
      <button type="button" class="btn tiny secondary" data-shabbos-own-write="${pickerKey}">✍️ Write</button>
      <button type="button" class="btn tiny secondary" data-shabbos-own-scan="${pickerKey}">📷 Scan</button>
      <button type="button" class="btn tiny secondary" data-shabbos-own-upload="${pickerKey}">📄 Upload</button>
      <button type="button" class="btn tiny ghost" data-shabbos-own-cancel="${pickerKey}">✕ Cancel</button>
      `}
    </div>`;
  }
  const openPanel=state.shabbosPickerFor===pickerKey
    ?`<div class="shabbos-special-picker">${relevantSpecials.length?relevantSpecials.map(id=>{const r=getRecipe(id);return r?`<button type="button" class="btn tiny secondary" data-shabbos-choose="${pickerKey}:${id}">${esc(r.title)}</button>`:"";}).join(""):`<div class="tiny muted">No DmE specials yet - try "Add your own".</div>`}</div>`
    :"";
  return `<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px">
    <button type="button" class="btn tiny secondary" data-shabbos-add-library="${pickerKey}">+ DmE special</button>
    <button type="button" class="btn tiny secondary" data-shabbos-add-own="${pickerKey}">+ Add your own</button>
  </div>${openPanel}`;
}

function shabbosResolveTarget(pickerKey){
  const [mealKey,courseId]=pickerKey.split(":");
  return {mealKey,courseId};
}

function shabbosSaveDish(pickerKey,dish){
  const {mealKey,courseId}=shabbosResolveTarget(pickerKey);
  if(courseId==="__challah__"){
    state.shabbosMenu[mealKey].basics.challah.dish=dish;
    return;
  }
  const course=state.shabbosMenu[mealKey].courses.find(c=>c.id===courseId);
  if(course)course.dishes.push(dish);
}

async function importRecipeAndOpenEditor(pickerKey,payload,kind,notFoundMessage){
  state.shabbosImportBusy=pickerKey;
  state.shabbosImportBusyKind=kind;
  renderShabbosSlots();
  let data;
  try{
    const response=await fetch(`${API_ORIGIN}/.netlify/functions/recipe-import`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload)
    });
    data=await response.json().catch(()=>({}));
    if(!response.ok||!data.recipe){
      alert(data.error||notFoundMessage);
      return;
    }
  }finally{
    state.shabbosImportBusy=null;
    state.shabbosImportBusyKind=null;
    renderShabbosSlots();
  }
  openDishEditor({
    heading:"Here's what we found",
    helpText:"Edit anything before saving.",
    initialTitle:data.recipe.title||"",
    initialIngredients:data.recipe.ingredients||[],
    initialSteps:data.recipe.steps||[],
    onSave:({title,ingredients,steps})=>{
      shabbosSaveDish(pickerKey,{id:shabbosUid(),mode:"custom",recipeId:null,custom:{title,ingredients,steps},storeLink:""});
      state.shabbosAddOwnFor=null;
      recordShabbosDurableBackup();
      refreshPantryDependencies({renderInventoryToo:false});
      renderShabbosSlots();
      offerCommunityShare({title,ingredients,steps});
    }
  });
}

async function offerCommunityShare(customDish){
  if(!customDish.steps||!customDish.steps.length)return;
  if(!communitySession?.sessionToken){
    if(confirm(`Share "${customDish.title}" with the community too? You'll need to sign in first - go to Community now?`)){
      showView("community");
    }
    return;
  }
  if(!confirm(`Share "${customDish.title}" with the community?`))return;
  try{
    const response=await fetch(`${API_ORIGIN}/.netlify/functions/community-recipes`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        sessionToken:communitySession.sessionToken,
        title:customDish.title,
        ingredients:customDish.ingredients.map(([name,amount])=>({name,amount})),
        steps:customDish.steps
      })
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Could not publish this recipe.");
    alert(`"${customDish.title}" was shared with the community!`);
    loadCommunityRecipes();
  }catch(error){
    alert(error?.message||"Could not share this recipe with the community.");
  }
}

function renderShabbosSlots(){
  const menu=state.shabbosMenu||normalizeShabbosMenu(null);
  const container=$("shabbosSlots");
  if(!container)return;

  const restoreShabbosButton=$("restoreShabbosBtn");
  if(restoreShabbosButton){
    restoreShabbosButton.hidden=!hasShabbosDurableBackup();
    restoreShabbosButton.onclick=()=>{
      if(!confirm("Bring back everything you've added to your Shabbos menu, exactly as it was? This works no matter what else has changed since."))return;
      restoreShabbosDurableBackup();
    };
  }

  container.innerHTML=Object.entries(SHABBOS_MEAL_LABELS).map(([mealKey,label])=>{
    const meal=menu[mealKey];
    return `<div class="shabbos-slot-card">
      <label class="row" style="align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" data-shabbos-meal-enable="${mealKey}" ${meal.enabled?"checked":""}>
        <b>${esc(label)}</b>
      </label>
      ${meal.enabled?`
        ${meal.basics?renderShabbosBasics(mealKey,meal.basics):""}
        <div class="shabbos-course-list">
          ${meal.courses.map(course=>{
            const showTakeout=SHABBOS_TAKEOUT_MEALS.includes(mealKey);
            const pickerKey=`${mealKey}:${course.id}`;
            return `
            <div class="shabbos-course-card">
              <div class="shabbos-course-head" style="justify-content:space-between">
                <span class="row" style="gap:10px;align-items:center">
                  <span class="shabbos-course-icon">${SHABBOS_COURSE_ICONS[course.name]||"🍽️"}</span>
                  <span class="shabbos-course-name">${esc(course.name)}</span>
                </span>
                <button type="button" class="shabbos-remove-course" data-shabbos-remove-course="${mealKey}:${course.id}">Remove course</button>
              </div>
              ${course.dishes.length?`<div class="shabbos-dish-chips">${course.dishes.map(dish=>`
                <span class="chip on">${esc(shabbosDishSummary(dish))}
                  ${dish.mode==="library"&&dish.recipeId?`<button type="button" class="btn tiny ghost" data-shabbos-show-dish="${dish.recipeId}" aria-label="Show recipe for ${esc(shabbosDishSummary(dish))}" style="margin-left:4px">Show</button>`:""}
                  <button type="button" class="btn tiny ghost" data-shabbos-remove-dish="${mealKey}:${course.id}:${dish.id}" aria-label="Remove ${esc(shabbosDishSummary(dish))}" style="margin-left:4px">✕</button>
                </span>
              `).join("")}</div>`:`<div class="tiny muted" style="margin-top:8px">No dish added yet</div>`}
              ${renderShabbosPicker(pickerKey,course.name)}
              ${showTakeout?`<div style="margin-top:6px"><button type="button" class="btn tiny secondary" data-shabbos-add-store="${mealKey}:${course.id}">+ Add takeout link</button></div>`:""}
            </div>
          `;
          }).join("")}
        </div>
        <button type="button" class="btn small secondary" data-shabbos-add-course="${mealKey}" style="margin-top:6px">+ Add course</button>
      `:""}
    </div>`;
  }).join("");

  const rerender=()=>{recordShabbosDurableBackup();refreshPantryDependencies({renderInventoryToo:false});renderShabbosSlots();};

  container.querySelectorAll("[data-shabbos-meal-enable]").forEach(box=>{
    box.onchange=()=>{state.shabbosMenu[box.dataset.shabbosMealEnable].enabled=box.checked;rerender();};
  });

  container.querySelectorAll("[data-shabbos-wine-toggle]").forEach(btn=>{
    btn.onclick=()=>{
      const meal=state.shabbosMenu[btn.dataset.shabbosWineToggle];
      meal.basics.wine.haveIt=!meal.basics.wine.haveIt;
      rerender();
    };
  });
  container.querySelectorAll("[data-shabbos-challah-bake]").forEach(btn=>{
    btn.onclick=()=>{
      state.shabbosMenu[btn.dataset.shabbosChallahBake].basics.challah.mode="bake";
      rerender();
    };
  });
  container.querySelectorAll("[data-shabbos-challah-buy]").forEach(btn=>{
    btn.onclick=()=>{
      state.shabbosMenu[btn.dataset.shabbosChallahBuy].basics.challah.mode="buy";
      rerender();
    };
  });
  container.querySelectorAll("[data-shabbos-challah-change]").forEach(btn=>{
    btn.onclick=()=>{
      const meal=state.shabbosMenu[btn.dataset.shabbosChallahChange];
      meal.basics.challah={mode:null,dish:null};
      rerender();
    };
  });

  container.querySelectorAll("[data-shabbos-add-course]").forEach(btn=>{
    btn.onclick=()=>{
      const name=prompt("What's this course called? (e.g. \"Salads\", \"Second Main\")");
      if(!name||!name.trim())return;
      state.shabbosMenu[btn.dataset.shabbosAddCourse].courses.push({id:shabbosUid(),name:name.trim(),dishes:[]});
      rerender();
    };
  });
  container.querySelectorAll("[data-shabbos-remove-course]").forEach(btn=>{
    btn.onclick=()=>{
      const [mealKey,courseId]=btn.dataset.shabbosRemoveCourse.split(":");
      if(!confirm("Remove this course and everything in it?"))return;
      const meal=state.shabbosMenu[mealKey];
      meal.courses=meal.courses.filter(c=>c.id!==courseId);
      rerender();
    };
  });
  container.querySelectorAll("[data-shabbos-remove-dish]").forEach(btn=>{
    btn.onclick=()=>{
      const [mealKey,courseId,dishId]=btn.dataset.shabbosRemoveDish.split(":");
      const course=state.shabbosMenu[mealKey].courses.find(c=>c.id===courseId);
      if(course)course.dishes=course.dishes.filter(d=>d.id!==dishId);
      rerender();
    };
  });
  container.querySelectorAll("[data-shabbos-add-library]").forEach(btn=>{
    btn.onclick=()=>{
      state.shabbosPickerFor=state.shabbosPickerFor===btn.dataset.shabbosAddLibrary?null:btn.dataset.shabbosAddLibrary;
      state.shabbosAddOwnFor=null;
      renderShabbosSlots();
    };
  });
  container.querySelectorAll("[data-shabbos-choose]").forEach(btn=>{
    btn.onclick=()=>{
      const [mealKey,courseId,recipeId]=btn.dataset.shabbosChoose.split(":");
      shabbosSaveDish(`${mealKey}:${courseId}`,{id:shabbosUid(),mode:"library",recipeId,custom:null,storeLink:""});
      state.shabbosPickerFor=null;
      rerender();
    };
  });
  container.querySelectorAll("[data-shabbos-add-own]").forEach(btn=>{
    btn.onclick=()=>{
      state.shabbosAddOwnFor=state.shabbosAddOwnFor===btn.dataset.shabbosAddOwn?null:btn.dataset.shabbosAddOwn;
      state.shabbosPickerFor=null;
      renderShabbosSlots();
    };
  });
  container.querySelectorAll("[data-shabbos-own-cancel]").forEach(btn=>{
    btn.onclick=()=>{state.shabbosAddOwnFor=null;renderShabbosSlots();};
  });
  container.querySelectorAll("[data-shabbos-own-write]").forEach(btn=>{
    btn.onclick=()=>{
      const pickerKey=btn.dataset.shabbosOwnWrite;
      openDishEditor({
        heading:"Write your own recipe",
        onSave:({title,ingredients,steps})=>{
          shabbosSaveDish(pickerKey,{id:shabbosUid(),mode:"custom",recipeId:null,custom:{title,ingredients,steps},storeLink:""});
          state.shabbosAddOwnFor=null;
          rerender();
          offerCommunityShare({title,ingredients,steps});
        }
      });
    };
  });
  container.querySelectorAll("[data-shabbos-own-upload]").forEach(btn=>{
    btn.onclick=()=>{
      const pickerKey=btn.dataset.shabbosOwnUpload;
      const input=$("recipeUploadInput");
      input.value="";
      input.onchange=async()=>{
        const file=input.files?.[0];
        if(!file)return;
        try{
          const text=await extractRecipeDocumentText(file);
          if(!text||!text.trim()){
            alert("Couldn't read any text from that file. Try a .docx, .pdf, or .txt file with the recipe in it.");
            return;
          }
          await importRecipeAndOpenEditor(pickerKey,{text:text.slice(0,60000)},"file","Could not read a recipe from that document. Try a file with just one recipe, or write it in by hand.");
        }catch(error){
          console.error(error);
          alert("Something went wrong reading that document. Try a .docx, .pdf, or .txt file, or write the recipe in by hand.");
        }
      };
      input.click();
    };
  });
  container.querySelectorAll("[data-shabbos-own-scan]").forEach(btn=>{
    btn.onclick=()=>{
      const pickerKey=btn.dataset.shabbosOwnScan;
      const input=$("recipeScanInput");
      input.value="";
      input.onchange=async()=>{
        const file=input.files?.[0];
        if(!file)return;
        try{
          const image=await compressKitchenPhoto(file,1600,.82);
          await importRecipeAndOpenEditor(pickerKey,{image},"photo","Could not read a recipe from that photo. Try a clearer, closer photo, or write it in by hand.");
        }catch(error){
          console.error(error);
          alert("Something went wrong reading that photo. Try again with a clearer photo, or write the recipe in by hand.");
        }
      };
      input.click();
    };
  });
  container.querySelectorAll("[data-shabbos-add-store]").forEach(btn=>{
    btn.onclick=()=>{
      const [mealKey,courseId]=btn.dataset.shabbosAddStore.split(":");
      const link=prompt("Link or name of where you're getting this (e.g. a pizza shop's phone number or website):");
      if(link===null||!link.trim())return;
      const course=state.shabbosMenu[mealKey].courses.find(c=>c.id===courseId);
      if(course)course.dishes.push({id:shabbosUid(),mode:"store",recipeId:null,custom:null,storeLink:link.trim()});
      rerender();
    };
  });
  container.querySelectorAll("[data-shabbos-show-dish]").forEach(btn=>{
    btn.onclick=()=>showRecipe(btn.dataset.shabbosShowDish,"this");
  });
}

function renderWeekSection(weekKey="this",{alreadyRebuilt=false}={}){
  const plan=state[planProp(weekKey)]||[];
  const locks=state[lockedProp(weekKey)]||{};

  if(plan.length && !alreadyRebuilt && isPlanStale(weekKey)){
    // The stored plan belongs to a previous week. Rebuild it automatically -
    // replaceUnlocked keeps any locked meals (just moving them to the new
    // week's matching date) while refreshing everything else, so this is
    // never a silent full wipe of choices the user deliberately locked in.
    const rebuilt=buildPlanForWeek(weekKey,{replaceUnlocked:true});
    if(rebuilt)return; // buildPlanForWeek already re-rendered with fresh data
    // If it couldn't rebuild (e.g. no recipes match current exclusions), fall
    // through and render the stale plan with a warning rather than looping.
  }

  const target=weekKey==="next"?"nextWeekList":"weekList";
  const lockAllButton=$(weekKey==="next"?"lockNextWeekBtn":"lockWeekBtn");
  const allLocked=plan.length>0&&plan.every(entry=>Boolean(locks[entry.day]));
  if(lockAllButton){
    lockAllButton.disabled=!plan.length;
    lockAllButton.textContent=allLocked?"Unlock week":"Lock in week";
  }
  renderWeekDateRange(weekKey);

  const restoreButton=$(weekKey==="next"?"restoreNextWeekBtn":"restoreWeekBtn");
  if(restoreButton){
    restoreButton.hidden=!hasRestorableSnapshot(weekKey);
    restoreButton.onclick=()=>{
      if(!confirm("Restore the previous version of this week's plan? This replaces what's currently shown."))return;
      restoreWeekSnapshot(weekKey);
    };
  }

  const restoreLockedButton=$(weekKey==="next"?"restoreLockedNextWeekBtn":"restoreLockedWeekBtn");
  if(restoreLockedButton){
    restoreLockedButton.hidden=!hasDurableLocks(weekKey);
    restoreLockedButton.onclick=()=>{
      if(!confirm("Bring back every meal you've locked, exactly as locked? This works no matter what else has changed since."))return;
      restoreDurableLocks(weekKey);
    };
  }

  if(!plan.length){
    $(target).innerHTML=weekKey==="next"
      ? '<div class="notice">Build next week when you want to shop ahead.</div>'
      : '<div class="notice">Press Build this week’s dinners to create a plan.</div>';
    return;
  }

  const staleNotice=isPlanStale(weekKey)
    ? `<div class="notice" style="border:1px solid #d97706;background:#fff7ed;color:#7c2d12">
        <b>This plan is from a previous week.</b> The dates shown below no longer match today's calendar — tap "Build this week's dinners" to refresh it.
      </div>`
    : "";

  $(target).innerHTML=staleNotice+plan.map(p=>{
    const r=getRecipe(p.id);
    if(!r)return "";
    const locked=!!locks[p.day];
    const date=p.date?dateAtNoon(`${p.date}T12:00:00`):plannerDatesForWeek(weekKey)[DAYS.indexOf(p.day)].date;
    const rule=calendarRuleForDate(date);
    return `<div class="meal-card">
      <div class="day">${p.day}</div>
      <div>
        <div class="meal-title">${esc(r.title)}</div>
        <div class="hebrew-date">${esc(FULL_DATE_FMT.format(date))} · ${esc(hebrewDateParts(date).label)}</div>
        <div class="meal-meta">${kindLabel(r.kind)} · ${esc(displayedTime(r))} · ${esc(r.cost||"")} · ${esc(r.desc)}</div>
        ${rule.note?`<div class="observance ${rule.type==='tisha'?'tisha':''}">${esc(rule.note)}</div>`:""}
      </div>
      <div class="meal-actions">
        <button type="button" class="btn small ${locked?'soft':'secondary'} lock ${locked?'on':''}" data-lock="${weekKey}:${p.day}">${locked?'Locked':'Lock'}</button>
        <button type="button" class="btn small secondary" data-replace="${weekKey}:${p.day}" ${locked?'disabled title="Unlock this day to replace it"':''}>Replace</button>
        <button type="button" class="btn small ghost" data-recipe="${weekKey}:${r.id}">Show recipe</button>
      </div>
      ${ratingButtons(r.id,weekKey)}
    </div>`;
  }).join("");

  $(target).querySelectorAll("[data-lock]").forEach(btn=>{
    btn.onclick=()=>{
      const [wk,day]=btn.dataset.lock.split(":");
      const field=lockedProp(wk);
      state[field][day]=!state[field][day];
      if(state[field][day]){
        const entry=(state[planProp(wk)]||[]).find(p=>p.day===day);
        if(entry)recordDurableLock(wk,day,entry.id);
      }else{
        clearDurableLock(wk,day);
      }
      save("state",state);
      renderWeekSection(wk);
    };
  });

  $(target).querySelectorAll("[data-replace]").forEach(btn=>btn.onclick=()=>{const [wk,day]=btn.dataset.replace.split(":");replaceDay(wk,day)});
  $(target).querySelectorAll("[data-recipe]").forEach(btn=>btn.onclick=()=>{const [wk,id]=btn.dataset.recipe.split(":");showRecipe(id,wk)});
  $(target).querySelectorAll("[data-rating]").forEach(btn=>{
    btn.onclick=()=>{
      const [wk,recipeId,value]=btn.dataset.rating.split(":");
      setRecipeRating(recipeId,value);
      renderWeekSection(wk);
    };
  });
}

function scaleQuantity(qty){
  if(!qty)return "";
  const match=String(qty).match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if(!match)return qty;
  const scaled=Number(match[1])*(state.portions/5);
  const rounded=Math.round(scaled*4)/4;
  return `${rounded} ${match[2]}`.trim();
}

// Ingredient quantities scale with Portions, but a recipe's declared cook
// time is written for the base 5 portions and never adjusts on its own.
// That's fine for casseroles, braises, and one-pot dishes - a bigger dish
// or a fuller pot barely takes longer. It's NOT fine for recipes cooked in
// discrete stovetop rounds (breaded cutlets, pan-fried patties, crepes,
// searing in a single pan) - those genuinely take longer at larger
// portions because only so much fits in a pan at once. Recipes are tagged
// "batch-limited" for exactly this case; everything else is left alone.
function displayedTime(r){
  const base=Number.parseInt(r.time,10);
  if(!Number.isFinite(base) || !r.tags.includes("batch-limited")) return r.time;
  const extraBatches=Math.max(0,Math.ceil(state.portions/5)-1);
  if(!extraBatches) return r.time;
  const minutesPerExtraBatch=8;
  return `${base+extraBatches*minutesPerExtraBatch} min`;
}

async function renderRecipePhotoGallery(recipeId){
  const container=$("recipePhotoGallery");
  if(!container)return;
  let photos=[];
  try{
    const response=await fetch(`${API_ORIGIN}/.netlify/functions/recipe-photos?recipeId=${encodeURIComponent(recipeId)}`);
    const data=await response.json().catch(()=>({}));
    if(response.ok&&Array.isArray(data.photos))photos=data.photos;
  }catch(error){
    console.error(error);
  }
  renderRecipePhotoGalleryHtml(recipeId,photos);
}

function renderRecipePhotoGalleryHtml(recipeId,photos){
  const container=$("recipePhotoGallery");
  if(!container)return;
  const favorite=photos.find(p=>p.isFavorite)||photos[0]||null;
  container.innerHTML=`
    ${favorite?`<img class="recipe-photo-hero" src="${esc(favorite.image)}" alt="Photo of this dish">`:""}
    <div class="recipe-photo-strip">
      ${photos.map(p=>`
        <div>
          <div class="recipe-photo-thumb${p.isFavorite?" is-favorite":""}" data-recipe-photo-favorite="${p.id}">
            <img src="${esc(p.image)}" alt="Photo by ${esc(p.uploadedBy||"a family member")}">
            ${p.isFavorite?`<span class="fav-badge">★</span>`:""}
          </div>
          ${p.uploadedBy?`<div class="recipe-photo-by">${esc(p.uploadedBy)}</div>`:""}
        </div>
      `).join("")}
      <button type="button" class="btn tiny secondary" data-recipe-photo-add="1" style="align-self:center;white-space:nowrap">📷 Add a photo</button>
    </div>
  `;
  container.querySelectorAll("[data-recipe-photo-favorite]").forEach(el=>{
    el.onclick=async()=>{
      const photoId=el.dataset.recipePhotoFavorite;
      try{
        await fetch(`${API_ORIGIN}/.netlify/functions/recipe-photos`,{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({recipeId,action:"favorite",photoId})
        });
      }catch(error){console.error(error);}
      renderRecipePhotoGallery(recipeId);
    };
  });
  const addBtn=container.querySelector("[data-recipe-photo-add]");
  if(addBtn)addBtn.onclick=()=>{
    const input=$("recipePhotoInput");
    input.value="";
    input.onchange=async()=>{
      const file=input.files?.[0];
      if(!file)return;
      try{
        const image=await compressKitchenPhoto(file,1200,.75);
        const response=await fetch(`${API_ORIGIN}/.netlify/functions/recipe-photos`,{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({recipeId,image,uploadedBy:deviceName||"",recipeTitle:getRecipe(recipeId)?.title||""})
        });
        const data=await response.json().catch(()=>({}));
        if(!response.ok){
          alert(data.error||"Could not save that photo. Try again.");
          return;
        }
        renderRecipePhotoGallery(recipeId);
      }catch(error){
        console.error(error);
        alert("Something went wrong saving that photo. Try again.");
      }
    };
    input.click();
  };
}

function showRecipe(id,weekKey="this"){
  const r=getRecipe(id);
  if(!r)return;
  const haveMatches=matchHave(r);

  $("recipeModal").innerHTML=`
    <div class="recipe-head" style="margin-top:16px">
      <h2 style="margin:0">${esc(r.title)}</h2>
      <p class="muted">${esc(r.desc)}</p>
      <div class="chips">
        <span class="chip on">${kindLabel(r.kind)}</span>
        <span class="chip">${esc(r.hands)} hands-on</span>
        <span class="chip">${esc(displayedTime(r))} total</span>
        ${r.cost?`<span class="chip">About ${esc(r.cost)} per portion</span>`:""}
      </div>
      ${r.tags.includes("batch-limited") && state.portions>5?`<p class="muted">This is cooked in stovetop batches, so the total time above is longer than the base recipe to account for frying/searing multiple rounds at ${state.portions} portions.</p>`:""}
      ${ratingButtons(r.id,"modal")}
    </div>
    <div id="recipePhotoGallery"><div class="tiny muted">Loading photos…</div></div>
    <details class="have-summary">
      <summary>From what you have</summary>
      <div class="have-body">
        ${haveMatches.length?haveMatches.map(x=>`<div>✓ ${esc(x)}</div>`).join(""):"No matches yet."}
        <div class="tiny" style="margin-top:8px">Frozen meat or chicken may need thawing before using today.</div>
      </div>
    </details>
    <div class="cols">
      <div>
        <h3>Ingredients</h3>
        ${r.ingredients.map(([n,q])=>`<div>• ${esc(n)} ${q?`<span class="qty">— ${esc(scaleQuantity(q))}</span>`:""}</div>`).join("")}
      </div>
      <div>
        <h3>Instructions</h3>
        ${r.steps.map((s,i)=>`<div style="margin-bottom:8px"><b>${i+1}.</b> ${esc(s)}</div>`).join("")}
      </div>
    </div>
    <div class="row modal-close-row-bottom" style="justify-content:space-between">
      <button class="btn small secondary" type="button" onclick="$('recipeDialog').close()">← Close</button>
      <button class="btn small" type="button" onclick="addMissing('${r.id}','${weekKey}')">View shopping items</button>
    </div>`;

  $("recipeModal").querySelectorAll("[data-rating]").forEach(btn=>{
    btn.onclick=()=>{
      const [,recipeId,value]=btn.dataset.rating.split(":");
      setRecipeRating(recipeId,value);
      showRecipe(recipeId,weekKey);
    };
  });

  $("recipeDialog").showModal();
  renderRecipePhotoGallery(r.id);
}

function matchHave(r){
  return r.ingredients
    .map(([name])=>name)
    .filter(name=>inventoryMatchesIngredient(name));
}

function addMissing(id,weekKey="this"){
  state.shoppingView=weekKey;
  save("state",state);
  renderShopping();
  $("recipeDialog").close();
  showView("shopping");
}

function buildShoppingForWeek(weekKey){
  const recipes=(state[planProp(weekKey)]||[]).map(p=>getRecipe(p.id)).filter(Boolean);
  if(weekKey==="this")recipes.push(...shabbosSelectedRecipes());
  const result=IngredientEngine.buildShopping(recipes,state.have||[],state.portions);
  state[shoppingProp(weekKey)]=result.shopping;
  state.shoppingDiagnostics[weekKey]=result.diagnostics;
}

function shoppingFromRecipes(list,diagnosticKey="combined"){
  const result=IngredientEngine.buildShopping(list,state.have||[],state.portions);
  state.shoppingDiagnostics[diagnosticKey]=result.diagnostics;
  return result.shopping;
}

function shoppingItemsForView(){
  const view=state.shoppingView||"this";
  if(view==="next") return state.nextShopping||[];
  if(view==="combined"){
    const recipes=[...(state.plan||[]),...(state.nextPlan||[])].map(p=>getRecipe(p.id)).filter(Boolean);
    return shoppingFromRecipes(recipes,"combined");
  }
  return state.shopping||[];
}

function selectedStoreUrl(storeId){
  const store=state.stores[storeId];
  if(!store)return "";
  return store.websiteUrl||store.mapsUrl||"";
}

async function copyItem(item){
  try{await navigator.clipboard.writeText(item)}catch{}
}

function shoppingCheckKey(storeId,itemName){
  return `${storeId}:${canonicalIngredient(itemName)}`;
}

function pruneShoppingChecks(view,items){
  state.shoppingChecked=state.shoppingChecked||{this:{},next:{},combined:{}};
  const allowed=new Set((items||[]).map(item=>shoppingCheckKey(item.store,item.name)));
  const current=state.shoppingChecked[view]||{};
  state.shoppingChecked[view]=Object.fromEntries(Object.entries(current).filter(([key,value])=>allowed.has(key)&&Boolean(value)));
}

function setShoppingChecked(view,key,checked){
  state.shoppingChecked=state.shoppingChecked||{this:{},next:{},combined:{}};
  state.shoppingChecked[view]=state.shoppingChecked[view]||{};
  if(checked)state.shoppingChecked[view][key]=true;
  else delete state.shoppingChecked[view][key];
  save("state",state);
}

function renderShopping(){
  const groups=[
    {id:"meat",title:"Meat / chicken store",cls:"meat"},
    {id:"supermarket",title:"Default supermarket",cls:""}
  ];
  const itemsForView=shoppingItemsForView();
  pruneShoppingChecks(state.shoppingView||"this",itemsForView);
  const viewLabel=state.shoppingView==="next"?"Next week":state.shoppingView==="combined"?"Both weeks":"This week";

  document.querySelectorAll("[data-shop-view]").forEach(btn=>{
    btn.classList.toggle("on", btn.dataset.shopView===state.shoppingView);
    btn.onclick=()=>{
      state.shoppingView=btn.dataset.shopView;
      save("state",state);
      renderShopping();
    };
  });

  $("shoppingList").innerHTML=(itemsForView.length?`<div class="notice">Shopping for ${viewLabel.toLowerCase()}.</div>`:"") + (groups.map(group=>{
    const items=itemsForView.filter(i=>i.store===group.id);
    if(!items.length)return "";

    const store=state.stores[group.id];
    const storeName=store?.name||group.title;
    const url=selectedStoreUrl(group.id);

    return `<div class="shop-group ${group.cls}">
      <h3>${esc(storeName)}</h3>
      ${items.map(i=>`
        <div class="shop-item ${state.shoppingChecked?.[state.shoppingView||"this"]?.[shoppingCheckKey(group.id,i.name)]?"checked":""}">
          <label class="shopping-check-label">
            <input type="checkbox" data-shop-check="${esc(shoppingCheckKey(group.id,i.name))}" ${state.shoppingChecked?.[state.shoppingView||"this"]?.[shoppingCheckKey(group.id,i.name)]?"checked":""}>
            <span><b>${esc(i.name)}</b><span class="qty">${esc(i.qty)}</span>${i.pantryUsed?`<span class="tiny">Used ${esc(String(Math.round(i.pantryUsed*100)/100))} from pantry</span>`:""}</span>
          </label>
          <div class="row">
            <button type="button" class="btn small secondary" data-copy="${esc(i.name)}">Copy item</button>
            ${url?`<a class="btn small ghost" href="${esc(url)}" target="_blank" rel="noopener">Open store</a>`:`<button type="button" class="btn small ghost" onclick="showView('stores')">Choose store</button>`}
          </div>
        </div>`).join("")}
    </div>`;
  }).join(""))||'<div class="notice">Build this week or next week first.</div>';

  document.querySelectorAll("[data-shop-check]").forEach(input=>{
    input.onchange=()=>{
      setShoppingChecked(state.shoppingView||"this",input.dataset.shopCheck,input.checked);
      input.closest?.(".shop-item")?.classList.toggle("checked",input.checked);
      save("state",state);
    };
  });
  document.querySelectorAll("[data-copy]").forEach(btn=>btn.onclick=()=>copyItem(btn.dataset.copy));
  save("state",state);
}

function renderStoreSelection(scope){
  const store=state.stores[scope];
  const box=$(`${scope}Selected`);
  if(!store){
    box.classList.add("hidden");
    box.innerHTML="";
    return;
  }
  box.classList.remove("hidden");
  box.innerHTML=`
    <b>${esc(store.name)}</b>
    <div class="tiny">${esc(store.address||"")}</div>
    <div class="row" style="margin-top:10px">
      <a class="btn small ghost" href="${esc(store.websiteUrl||store.mapsUrl)}" target="_blank" rel="noopener">Open store</a>
      <button class="btn small secondary" type="button" data-clear-store="${scope}">Change</button>
    </div>`;
  box.querySelector("[data-clear-store]").onclick=()=>{
    state.stores[scope]=null;
    save("state",state);
    renderStoreSelection(scope);
    renderShopping();
  };
}

function distanceLabel(miles){
  if(!Number.isFinite(miles))return "";
  return miles<1?`${miles.toFixed(1)} miles away`:`${Math.round(miles)} miles away`;
}

function renderStoreResults(scope,stores){
  const box=$(`${scope}Results`);
  if(!stores.length){
    box.innerHTML='<div class="notice">No nearby stores were found. Try again from another location.</div>';
    return;
  }

  box.innerHTML=stores.map((store,index)=>`
    <div class="store-result">
      <div>
        <b>${esc(store.name)}</b>
        <div class="tiny">${esc(store.address||"")}</div>
        <div class="distance">${esc(distanceLabel(store.distanceMiles))}</div>
        <span class="store-badge ${store.verified?"verified":"search"}">${store.verified?"Directory verified":"Nearby result"}</span>
      </div>
      <button class="btn small" type="button" data-select-store="${scope}:${index}">Choose</button>
    </div>`).join("");

  box.querySelectorAll("[data-select-store]").forEach(btn=>{
    btn.onclick=()=>{
      const [,index]=btn.dataset.selectStore.split(":");
      state.stores[scope]=stores[Number(index)];
      save("state",state);
      box.innerHTML="";
      $(`${scope}Status`).textContent="";
      renderStoreSelection(scope);
      renderShopping();
    };
  });
}

async function getDeviceLocation(){
  // Inside the native app, navigator.geolocation does not reliably bridge to
  // the device's real location services - the Capacitor Geolocation plugin
  // is required for that. Without it, calls just hang forever with no
  // permission prompt ever appearing (the actual bug this fixes). On the
  // website there's no Capacitor bridge, so navigator.geolocation is correct there.
  const capGeo=window.Capacitor?.Plugins?.Geolocation;
  if(capGeo){
    const permission=await capGeo.checkPermissions().catch(()=>null);
    if(permission&&permission.location!=="granted"){
      const requested=await capGeo.requestPermissions().catch(()=>null);
      if(!requested||requested.location!=="granted"){
        throw new Error("permission-denied");
      }
    }
    const position=await capGeo.getCurrentPosition({enableHighAccuracy:false,timeout:12000});
    return {latitude:position.coords.latitude,longitude:position.coords.longitude};
  }

  if(!navigator.geolocation)throw new Error("unsupported");

  return new Promise((resolve,reject)=>{
    navigator.geolocation.getCurrentPosition(
      position=>resolve({latitude:position.coords.latitude,longitude:position.coords.longitude}),
      ()=>reject(new Error("permission-denied")),
      {enableHighAccuracy:false,timeout:12000,maximumAge:300000}
    );
  });
}

async function findNearbyStores(scope){
  const status=$(`${scope}Status`);
  const results=$(`${scope}Results`);
  status.textContent="Finding your location…";
  results.innerHTML="";

  let location;
  try{
    location=await getDeviceLocation();
  }catch(error){
    status.textContent=error?.message==="unsupported"
      ?"Location is not available on this device."
      :"Allow location access to see nearby stores.";
    return;
  }

  save("location",{lat:location.latitude,lng:location.longitude});
  renderCalendar();
  status.textContent="Finding nearby kosher stores…";
  try{
    const response=await fetch(`${API_ORIGIN}/.netlify/functions/store-locator`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        lat:location.latitude,
        lng:location.longitude,
        scope
      })
    });

    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Store search failed");

    const stores=data.stores||[];
    status.textContent=stores.length?"Choose a nearby kosher store below.":"No nearby kosher stores were found."
    renderStoreResults(scope,stores);
  }catch(error){
    status.textContent="Nearby kosher stores could not be loaded. Please try again."
  }
}

function pantryPhotoById(id){
  return (state.pantryPhotos||[]).find(p=>p.id===id);
}

// Deterministic, name-based icon matching - the actual fix per explicit user
// feedback: relying on the AI to freshly guess a good icon on every scan was
// fundamentally unreliable, since it's still just a per-request AI guess that
// could come back wrong or missing. This is a fixed dictionary checked
// against the item's own name text, so the result is the same every time
// and fully testable, with no dependency on the AI getting it right.
// Order matters: more specific patterns are checked before broader ones
// that could otherwise false-match (e.g. "black pepper" the spice must be
// checked before generic "pepper" which means bell pepper).
const NAME_ICON_RULES=[
  // Exceptions that must come before their broader category below.
  [/\bblack pepper/i,"🧂"],
  [/\bpeanut butter/i,"🥜"],
  [/\bcream cheese/i,"🧀"],
  [/\bsour cream/i,"🥛"],
  [/\bwhipped cream\b|\bheavy cream\b|\bwhipping cream/i,"🥛"],
  [/\bcoconut (milk|cream)/i,"🥥"],
  [/\balmond milk|\bsoy milk|\boat milk/i,"🥛"],
  [/\bice cream/i,"🍦"],
  [/\bhot sauce\b|\bbuffalo (wing )?sauce\b|\bred\s*hot\b|\bsriracha\b|\b(cayenne|chili|chile|jalape[nñ]o|habanero|ghost)\s*(pepper\s*)?sauce\b/i,`<svg width="46" height="46" viewBox="0 0 56 56" role="img" aria-label="Hot sauce bottle"><rect x="20" y="6" width="8" height="8" rx="2" fill="#8a9a8e"/><path d="M16 18 h16 a4 4 0 0 1 4 4 v24 a4 4 0 0 1 -4 4 h-16 a4 4 0 0 1 -4 -4 v-24 a4 4 0 0 1 4 -4 z" fill="none" stroke="#265c44" stroke-width="2.2"/><path d="M23 30 q6 -6 3 6 q6 -2 1 6" fill="none" stroke="#c0522f" stroke-width="2.6" stroke-linecap="round"/></svg>`],
  [/\bhummus\b/i,`<svg width="46" height="46" viewBox="0 0 56 56" role="img" aria-label="Hummus plate"><ellipse cx="28" cy="34" rx="19" ry="12" fill="none" stroke="#265c44" stroke-width="2.2"/><path d="M15 32 q13 -8 26 0" fill="none" stroke="#c0522f" stroke-width="1.6" stroke-linecap="round"/><circle cx="20" cy="34" r="1.4" fill="#c0522f"/><circle cx="26" cy="36" r="1.4" fill="#c0522f"/><circle cx="33" cy="34" r="1.4" fill="#c0522f"/></svg>`],

  // Proteins.
  [/\begg/i,"🥚"],
  [/\b(salmon|tuna|tilapia|cod|halibut|fish|gefilte|sardine|anchov)/i,"🐟"],
  [/\b(chicken|turkey|poultry|drumstick|pargiyot|cutlet)/i,"🍗"],
  [/\b(beef|steak|brisket|burger|lamb|veal|schnitzel|meat)/i,"🥩"],
  [/\b(chickpea|bean|lentil|legume)/i,"🫘"],
  [/\btofu/i,"🧊"],

  // Dairy.
  [/\bmilk/i,"🥛"],
  [/\byogurt|yoghurt/i,`<svg width="46" height="46" viewBox="0 0 56 56" role="img" aria-label="Yogurt container"><path d="M16 16 h24 l-3 26 a4 4 0 0 1 -4 4 h-10 a4 4 0 0 1 -4 -4 z" fill="none" stroke="#265c44" stroke-width="2.2"/><text x="28" y="26" text-anchor="middle" font-size="6" fill="#265c44" font-weight="700" font-family="system-ui">yogurt</text></svg>`],
  [/\bcheese/i,"🧀"],
  [/\bbutter\b|\bmargarine/i,"🧈"],

  // Produce.
  [/\btomato/i,"🍅"],
  [/\bonion/i,"🧅"],
  [/\bgarlic/i,"🧄"],
  [/\bpotato/i,"🥔"],
  [/\bcarrot/i,"🥕"],
  [/\b(bell )?pepper/i,"🫑"],
  [/\b(lettuce|spinach|kale|greens|arugula)/i,"🥬"],
  [/\bcucumber/i,"🥒"],
  [/\bcorn/i,"🌽"],
  [/\bavocado|guacamole/i,"🥑"],
  [/\blemon|lime/i,"🍋"],
  [/\bapple/i,"🍎"],
  [/\bbanana/i,"🍌"],
  [/\bgrape/i,"🍇"],
  [/\bwatermelon/i,"🍉"],
  [/\b(berry|berries|strawberr)/i,"🍓"],
  [/\bbroccoli/i,"🥦"],
  [/\bmushroom/i,"🍄"],

  // Grains / starches.
  [/\b(bread|challah|bagel|bun|roll|baguette)/i,"🍞"],
  [/\brice/i,"🍚"],
  [/\b(pasta|noodle|spaghetti|macaroni)/i,"🍝"],
  [/\bcereal/i,"🥣"],
  [/\bpretzel/i,"🥨"],

  // Condiments / pantry staples.
  [/\bginger/i,"🫚"],
  [/\b(ketchup|mustard|mayonnaise|mayo|soy sauce|teriyaki|salsa|bbq sauce|dressing|worcestershire|wasabi|hoisin|fish sauce|oyster sauce|coconut aminos|tamari|sweet\s*(and|&)\s*sour(\s*sauce)?)/i,"🧂"],
  [/\boil/i,"🫒"],
  [/\bhoney/i,"🍯"],
  [/\b(jam|jelly|preserves)/i,"🍯"],
  [/\bolive/i,"🫒"],
  [/\bpickle/i,"🥒"],

  // Snacks / other common items.
  [/\b(chocolate|candy)/i,"🍫"],
  [/\b(nut|almond|peanut|cashew|pecan|walnut)/i,"🥜"],
  [/\bcoffee/i,"☕"],
  [/\btea/i,"🍵"],
  [/\bjuice/i,"🧃"],
  [/\b(soda|pop)/i,"🥤"],
  [/\bwine/i,"🍷"],
  [/\bwatermelon/i,"🍉"]
];

function categoryEmoji(category,unit,itemName){
  const name=String(itemName||"");
  // The deterministic name-based dictionary is the primary mechanism,
  // since it's fixed and testable rather than depending on an AI guessing
  // freshly on every scan.
  for(const [pattern,emoji] of NAME_ICON_RULES){
    if(pattern.test(name))return emoji;
  }
  // Container shape next, since it's often more visually recognizable
  // than the food category alone (a bottle of ketchup vs. a jar of jam
  // both being "condiment" looked the same before).
  const byUnit={bottle:"🧴",jar:"🫙",can:"🥫",box:"📦",bag:"🛍️",loaf:"🍞",bunch:"🌿",clove:"🧄",bulb:"🧅"};
  if(unit&&byUnit[unit])return byUnit[unit];
  return ({produce:"🥬",meat:"🥩",fish:"🐟",dairy:"🥛",eggs:"🥚",frozen:"❄️","dry goods":"🥫",canned:"🥫",condiment:"🧂",other:"🍽️"})[category]||"🍽️";
}

function pantryItemKey(name){
  return canonicalIngredient(name);
}

function canonicalIngredient(name){
  return IngredientEngine.canonicalIngredient(name);
}

function normalizeUnit(unit){
  return IngredientEngine.normalizeUnit(unit);
}

function unitMatchGroup(unit){
  return IngredientEngine.unitMatchGroup(unit);
}

function parseQtyText(text){
  return IngredientEngine.parseQtyText(text);
}

function pantryAvailableFor(canonical,requiredUnit){
  return IngredientEngine.pantryAvailableFor(state.have||[],canonical,requiredUnit);
}

function confidenceRank(value){return ({low:1,medium:2,high:3,user:4})[value]||0}

function logEvent(type,detail={}){
  state.debugLog=[...(state.debugLog||[]),{at:new Date().toISOString(),type,detail}].slice(-200);
  try{save("state",state,{skipCloudPush:true})}catch{}
}

function mergePantryItem(incoming){
  const key=pantryItemKey(incoming.item);
  const incomingUnit=unitMatchGroup(incoming.unit)||"each";
  const existing=(state.have||[]).find(item=>pantryItemKey(item.item)===key && (unitMatchGroup(item.unit)||"each")===incomingUnit);
  if(!existing){
    incoming.observations=Array.isArray(incoming.observations)?incoming.observations:[];
    state.have.push(incoming);
    return "added";
  }

  existing.observations=[...(existing.observations||[]),...(incoming.observations||[])].slice(-30);
  const byLocation=new Map();
  for(const observation of existing.observations){
    const location=observation.location||"Unknown";
    const qty=Number(observation.qty);
    if(!Number.isFinite(qty)||qty<0)continue;
    byLocation.set(location,Math.max(byLocation.get(location)||0,qty));
  }
  if(byLocation.size)existing.qty=[...byLocation.values()].reduce((a,b)=>a+b,0);
  else {
    const a=Number(existing.qty),b=Number(incoming.qty);
    if(Number.isFinite(b))existing.qty=Number.isFinite(a)?Math.max(a,b):b;
  }

  if(!existing.unit||existing.unit==="unknown")existing.unit=incoming.unit;
  const incomingIsStronger=confidenceRank(incoming.confidence)>confidenceRank(existing.confidence);
  if(incomingIsStronger)existing.confidence=incoming.confidence;
  if((!existing.thumbnail||incomingIsStronger)&&incoming.thumbnail)existing.thumbnail=incoming.thumbnail;
  if((!existing.evidence||incomingIsStronger)&&incoming.evidence)existing.evidence=incoming.evidence;
  if((!existing.bbox||incomingIsStronger)&&incoming.bbox)existing.bbox=incoming.bbox;
  if(incomingIsStronger&&incoming.quantityBasis)existing.quantityBasis=incoming.quantityBasis;
  existing.sourcePhotoIds=[...new Set([...(existing.sourcePhotoIds||[]),...(incoming.sourcePhotoIds||[])])];
  existing.sourceLocations=[...new Set([...(existing.sourceLocations||[existing.location]),incoming.location])];
  existing.perishable=Boolean(existing.perishable||incoming.perishable);
  if(incoming.expiresOn&&(incomingIsStronger||!existing.expiresOn))existing.expiresOn=incoming.expiresOn;
  return "updated";
}

function recomputeScannerItem(item){
  if(!item || item.confidence==="user") return item;
  const observations=Array.isArray(item.observations)?item.observations:[];
  const byLocation=new Map();
  for(const observation of observations){
    const qty=Number(observation.qty);
    if(!Number.isFinite(qty)||qty<0)continue;
    const location=observation.location||"Unknown";
    byLocation.set(location,Math.max(byLocation.get(location)||0,qty));
  }
  if(byLocation.size)item.qty=[...byLocation.values()].reduce((sum,value)=>sum+value,0);
  item.sourcePhotoIds=[...new Set(observations.map(o=>o.photoId).filter(Boolean))];
  item.sourceLocations=[...new Set(observations.map(o=>o.location).filter(Boolean))];
  if(item.sourceLocations.length)item.location=item.sourceLocations[0];
  const best=observations.slice().sort((a,b)=>confidenceRank(b.confidence)-confidenceRank(a.confidence))[0];
  if(best){
    item.confidence=best.confidence||item.confidence;
    item.evidence=best.evidence||item.evidence;
    item.quantityBasis=best.quantityBasis||item.quantityBasis;
    item.bbox=Array.isArray(best.bbox)?best.bbox:item.bbox;
  }
  return item;
}

function removePhotoObservations(photoId){
  state.have=(state.have||[]).map(item=>{
    const hadSource=(item.sourcePhotoIds||[]).includes(photoId);
    item.observations=(item.observations||[]).filter(observation=>observation.photoId!==photoId);
    item.sourcePhotoIds=(item.sourcePhotoIds||[]).filter(id=>id!==photoId);
    if(hadSource)item.thumbnail="";
    if(item.confidence==="user")return item;
    if(!item.observations.length)return null;
    return recomputeScannerItem(item);
  }).filter(Boolean);
}

function refreshPantryDependencies({renderInventoryToo=false}={}){
  buildShoppingForWeek("this");
  buildShoppingForWeek("next");
  save("state",state);
  if(renderInventoryToo)renderInventory();
  renderShopping();
  renderShabbosSlots();
}

function formatQty(item){
  const qty=item.qty;
  if(qty==="" || qty===null || qty===undefined || Number.isNaN(Number(qty))) return "Quantity not confirmed";
  const unit=item.unit && item.unit!=="unknown" ? ` ${item.unit}` : "";
  return `${qty}${unit}`;
}

function renderHave(){
  const photos=state.pantryPhotos||[];
  $("scanCount").textContent=`${photos.length} photo${photos.length===1?"":"s"}`;
  $("pictureList").innerHTML=photos.map((p,i)=>`
    <div class="scan-photo">
      <img src="${p.image}" alt="${esc(p.location||"Kitchen")} photo">
      <button type="button" class="remove-x" data-delphoto="${i}" aria-label="Remove photo">×</button>
      <div class="scan-photo-body">
        <select class="select" data-photolocation="${i}" aria-label="Location for photo ${i+1}">
          ${["Fridge","Freezer","Pantry","Fruit bowl","Spice cabinet","Other"].map(loc=>`<option ${loc===(p.location||"Other")?"selected":""}>${loc}</option>`).join("")}
        </select>
        <div class="scan-photo-status">${p.status==="scanning"?"Analyzing…":p.status==="scanned"?`${p.detectedCount||0} clear item${p.detectedCount===1?"":"s"}`:p.status==="error"?"Could not be read":"Ready to scan"}</div>
      ${p.status==="error"?`<button type="button" class="btn small secondary retry-photo" data-retryphoto="${i}">Retry this photo</button><div class="scan-detail"><code>${esc(p.error||"Unknown scan error")}</code></div>`:""}
      </div>
    </div>`).join("") || '<div class="notice" style="grid-column:1/-1">No photos added yet.</div>';

  document.querySelectorAll("[data-delphoto]").forEach(btn=>{
    btn.onclick=()=>{
      const photo=state.pantryPhotos[Number(btn.dataset.delphoto)];
      if(photo){
        removePhotoObservations(photo.id);
        state.pantryPhotos.splice(Number(btn.dataset.delphoto),1);
        logEvent("photo_removed",{photoId:photo.id,location:photo.location});
      }
      save("state",state);
      renderHave();
      refreshPantryDependencies();
    };
  });
  document.querySelectorAll("[data-photolocation]").forEach(select=>{
    select.onchange=()=>{
      const photo=state.pantryPhotos[Number(select.dataset.photolocation)];
      if(!photo)return;
      const previous=photo.location;
      photo.location=select.value;
      for(const item of state.have||[]){
        if((item.sourcePhotoIds||[]).includes(photo.id)){
          item.sourceLocations=(item.sourceLocations||[]).map(loc=>loc===previous?photo.location:loc);
          item.observations=(item.observations||[]).map(observation=>observation.photoId===photo.id?{...observation,location:photo.location}:observation);
          if(item.location===previous)item.location=photo.location;
          recomputeScannerItem(item);
        }
      }
      logEvent("photo_location_changed",{photoId:photo.id,from:previous,to:photo.location});
      save("state",state);
      refreshPantryDependencies();
    };
  });
  document.querySelectorAll("[data-retryphoto]").forEach(btn=>{
    btn.onclick=()=>{
      const photo=state.pantryPhotos[Number(btn.dataset.retryphoto)];
      if(!photo)return;
      photo.status="pending";
      photo.error="";
      save("state",state);
      renderHave();
      analyzePictures();
    };
  });
  renderInventory();
}

function renderInventory(){
  const items=state.have||[];
  const area=$("inventoryArea");
  if(!items.length){area.classList.add("hidden");return}
  area.classList.remove("hidden");
  const perishable=items.filter(i=>i.perishable).length;
  const reviewed=items.filter(i=>i.confidence==="user"||i.reviewed).length;
  $("inventorySummary").innerHTML=`
    <div class="summary-stat"><b>${items.length}</b><span class="tiny">ingredients</span></div>
    <div class="summary-stat"><b>${perishable}</b><span class="tiny">perishable</span></div>
    <div class="summary-stat"><b>${reviewed}</b><span class="tiny">reviewed</span></div>`;

  const shown=state.pantryExpanded?items:items.slice(0,8);
  $("inventoryList").innerHTML=shown.map((item,i)=>{
    const actualIndex=state.have.indexOf(item);
    const confidence=item.confidence||"medium";
    const confidenceText=confidence==="user"?"Confirmed by you":confidence==="high"?"High confidence":"Needs review";
    return `<div class="inventory-card">
      <div class="inventory-fallback">${categoryEmoji(item.category,item.unit,item.item)}</div>
      <div class="inventory-body">
        <div class="inventory-name">${esc(item.item)}</div>
        <div class="inventory-qty">${esc(formatQty(item))}</div>
        <span class="confidence ${confidence}">${confidenceText}</span>
        ${item.evidence?`<div class="inventory-evidence">Seen as: ${esc(item.evidence)}</div>`:""}
        ${item.expiresOn?`<div class="inventory-evidence">Best by ${esc(item.expiresOn)}</div>`:""}
        <div class="inventory-actions">
          <button type="button" data-decitem="${actualIndex}" aria-label="Decrease quantity">−</button>
          <button type="button" data-edititem="${actualIndex}">Edit</button>
          <button type="button" data-incitem="${actualIndex}" aria-label="Increase quantity">+</button>
        </div>
        <div class="inventory-edit-row">${confidence!=="user"?`<button type="button" class="btn small confirm-btn" data-confirmitem="${actualIndex}">Confirm</button>`:""}<button type="button" class="btn small ghost" data-delitem="${actualIndex}">Remove</button></div>
      </div>
    </div>`;
  }).join("");

  $("showAllInventoryBtn").classList.toggle("hidden",items.length<=8);
  $("showAllInventoryBtn").textContent=state.pantryExpanded?"Show fewer items":`Show all ${items.length} items`;
  $("pantryMemoryText").textContent=state.pantryLastScan?`Last scanned ${new Date(state.pantryLastScan).toLocaleString()}. Add a photo next time only when something changes.`:"Your typed inventory is saved on this device.";

  document.querySelectorAll("[data-incitem]").forEach(btn=>btn.onclick=()=>adjustPantryQty(Number(btn.dataset.incitem),1));
  document.querySelectorAll("[data-decitem]").forEach(btn=>btn.onclick=()=>adjustPantryQty(Number(btn.dataset.decitem),-1));
  document.querySelectorAll("[data-edititem]").forEach(btn=>btn.onclick=()=>editPantryItem(Number(btn.dataset.edititem)));
  document.querySelectorAll("[data-confirmitem]").forEach(btn=>btn.onclick=()=>confirmPantryItem(Number(btn.dataset.confirmitem)));
  document.querySelectorAll("[data-delitem]").forEach(btn=>btn.onclick=()=>removePantryItem(Number(btn.dataset.delitem)));
  renderPantrySuggestions();
}

function adjustPantryQty(index,delta){
  const item=state.have[index];
  if(!item)return;
  const current=Number(item.qty);
  item.qty=Math.max(0,Number.isFinite(current)?current+delta:Math.max(1,delta));
  item.reviewed=true;
  item.confidence="user";
  item.quantityBasis="user";
  refreshPantryDependencies();
  renderInventory();
}

function editPantryItem(index){
  const item=state.have[index];
  if(!item)return;
  const name=prompt("Item name",item.item);
  if(name===null)return;
  const qty=prompt("Quantity",item.qty===""?"":item.qty);
  if(qty===null)return;
  const unit=prompt("Unit (each, package, bag, lb, etc.)",item.unit||"each");
  if(unit===null)return;
  item.item=name.trim()||item.item;
  item.label=item.item;
  item.qty=qty.trim()===""?"":(Number.isFinite(Number(qty))?Number(qty):qty.trim());
  item.unit=unit.trim()||"unknown";
  item.reviewed=true;
  item.confidence="user";
  item.quantityBasis="user";
  refreshPantryDependencies();
  renderInventory();
}

function confirmPantryItem(index){
  const item=state.have[index];
  if(!item)return;
  item.reviewed=true;
  item.confidence="user";
  logEvent("item_confirmed",{item:item.item,qty:item.qty,unit:item.unit});
  refreshPantryDependencies();
  renderInventory();
}

function removePantryItem(index){
  const removed=state.have[index];
  state.have.splice(index,1);
  if(removed)logEvent("item_removed",{item:removed.item});
  refreshPantryDependencies();
  renderInventory();
}

function addTyped(){
  const value=$("typedItem").value.trim();
  if(!value)return;
  mergePantryItem({id:`typed-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,location:"Typed",item:value,label:value,qty:1,unit:"each",confidence:"user",category:"other",perishable:false,sourcePhotoIds:[],sourceLocations:["Typed"],reviewed:true});
  $("typedItem").value="";
  save("state",state);
  renderHave();
  refreshPantryDependencies();
}

function readFileAsDataURL(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
}

async function compressKitchenPhoto(file,maxDimension=900,quality=.66){
  const source=await readFileAsDataURL(file);
  const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=source});
  const scale=Math.min(1,maxDimension/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext("2d");
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  return canvas.toDataURL("image/jpeg",quality);
}

async function shrinkStoredPhoto(dataUrl,maxDimension=360,quality=.62){
  const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=dataUrl});
  const scale=Math.min(1,maxDimension/Math.max(img.naturalWidth,img.naturalHeight));
  if(scale===1 && dataUrl.length<120000) return dataUrl;
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
  return canvas.toDataURL("image/jpeg",quality);
}

async function loadImageElement(dataUrl){
  return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=dataUrl});
}

async function cropItemThumbnail(source,bbox,maxDimension=320,quality=.72){
  if(!Array.isArray(bbox)||bbox.length!==4)return "";
  const values=bbox.map(Number);
  if(values.some(v=>!Number.isFinite(v)))return "";
  // `source` may be a data URL (decodes it) or an already-loaded Image element
  // (reused across every item detected in the same photo). Re-decoding the
  // full-resolution original photo separately for each item - sometimes 10-15+
  // times per photo - is expensive enough on a phone to exhaust memory and get
  // the app killed by the OS. This is the actual crash the user hit.
  const img=typeof source==="string"?await loadImageElement(source):source;
  const normalized=Math.max(...values)>1;
  let [left,top,right,bottom]=values;
  if(normalized){left/=1000;top/=1000;right/=1000;bottom/=1000}
  left=Math.max(0,Math.min(.98,left));
  top=Math.max(0,Math.min(.98,top));
  right=Math.max(left+.02,Math.min(1,right));
  bottom=Math.max(top+.02,Math.min(1,bottom));
  const width=Math.max(.04,right-left);
  const height=Math.max(.04,bottom-top);
  // Add a little context around the object, then crop.
  const pad=.04;
  const sx=Math.max(0,(left-pad)*img.naturalWidth);
  const sy=Math.max(0,(top-pad)*img.naturalHeight);
  const sw=Math.min(img.naturalWidth-sx,(width+pad*2)*img.naturalWidth);
  const sh=Math.min(img.naturalHeight-sy,(height+pad*2)*img.naturalHeight);
  const scale=Math.min(1,maxDimension/Math.max(sw,sh));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(sw*scale));
  canvas.height=Math.max(1,Math.round(sh*scale));
  canvas.getContext("2d").drawImage(img,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
  return canvas.toDataURL("image/jpeg",quality);
}

$("photoInput").addEventListener("change",async event=>{
  const files=[...(event.target.files||[])];
  event.target.value="";
  if(!files.length)return;
  const remaining=Math.max(0,12-(state.pantryPhotos||[]).length);
  if(!remaining){$("aiStatus").textContent="You already have 12 photos. Remove one before adding another.";return}
  $("aiStatus").className="notice";
  $("aiStatus").textContent=`Preparing ${Math.min(files.length,remaining)} photo${Math.min(files.length,remaining)===1?"":"s"}…`;
  let added=0;
  for(const file of files.slice(0,remaining)){
    if(!file.type.startsWith("image/"))continue;
    try{
      const image=await compressKitchenPhoto(file);
      state.pantryPhotos.push({id:`photo-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,location:$("photoLocation").value,label:file.name||"Kitchen photo",image,status:"pending",addedAt:Date.now()});
      added++;
    }catch{}
  }
  try{save("state",state)}catch(error){
    state.pantryPhotos=state.pantryPhotos.slice(0,-added);
    $("aiStatus").className="notice error";
    $("aiStatus").textContent="These photos could not be saved on this device. Try fewer or smaller pictures.";
    renderHave();
    return;
  }
  renderHave();
  $("aiStatus").textContent=`${added} photo${added===1?"":"s"} added. Add more or finish scanning.`;
});

async function analyzePictures(){
  const pending=(state.pantryPhotos||[]).filter(p=>p.status!=="scanned");
  if(!pending.length){
    $("aiStatus").className="notice";
    $("aiStatus").textContent=state.have.length?"Everything added has already been scanned. Add another photo if something changed.":"Add a picture first.";
    return;
  }

  const button=$("analyzePicturesBtn");
  button.disabled=true;
  let added=0, updated=0, rawRecognized=0, failed=0, empty=0;
  const session={id:`scan-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,startedAt:new Date().toISOString(),appVersion:APP_VERSION,photos:[],beforeInventoryCount:(state.have||[]).length};
  $("aiStatus").className="notice";
  $("aiStatus").textContent=`Analyzing ${pending.length} photo${pending.length===1?"":"s"}…`;
  renderHave();

  for(let index=0;index<pending.length;index++){
    const picture=pending[index];
    removePhotoObservations(picture.id);
    picture.status="scanning";
    picture.error="";
    $("aiStatus").textContent=`Analyzing photo ${index+1} of ${pending.length}…`;
    renderHave();
    const photoLog={photoId:picture.id,location:picture.location,label:picture.label,startedAt:new Date().toISOString()};
    try{
      const aiStarted=performance.now();
      const aiRequest={id:`ai-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,at:new Date().toISOString(),photoId:picture.id,location:picture.location,status:"pending"};
      const response=await fetch(`${API_ORIGIN}/.netlify/functions/pantry-ai`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({image:picture.image,catalog:INGREDIENT_OPTIONS,location:picture.location,photoId:picture.id})
      });
      const data=await response.json().catch(()=>({}));
      aiRequest.durationMs=Math.round(performance.now()-aiStarted);
      aiRequest.httpStatus=response.status;
      aiRequest.status=response.ok?"success":"error";
      aiRequest.requestId=data.requestId||"";
      aiRequest.model=data.model||"";
      aiRequest.itemCount=Array.isArray(data.items)?data.items.length:0;
      aiRequest.error=data.error||"";
      aiRequest.items=Array.isArray(data.items)?data.items.map(x=>({name:x.name,qty:x.qty,unit:x.unit,confidence:x.confidence,evidence:x.evidence,quantityBasis:x.quantityBasis||""})):[];
      aiRequest.rejectedItems=Array.isArray(data.rejectedItems)?data.rejectedItems:[];
      state.aiRequests=[...(state.aiRequests||[]),aiRequest].slice(-50);
      if(!response.ok)throw new Error(data.error||`Scan failed (${response.status})`);
      const rawItems=Array.isArray(data.items)?data.items:[];
      const rejected=[];
      const items=rawItems.filter(item=>{
        const check=IngredientEngine.validateDetectedItem(item);
        if(!check.ok)rejected.push({item,reasons:check.reasons});
        return check.ok;
      }).slice(0,20);
      picture.rejectedItems=[...(Array.isArray(data.rejectedItems)?data.rejectedItems:[]),...rejected];
      picture.status="scanned";
      picture.scannedAt=Date.now();
      picture.detectedCount=items.length;
      picture.rawItems=rawItems;
      picture.requestId=data.requestId||"";
      picture.model=data.model||"";
      if(!items.length)empty++;
      let decodedImage=null;
      if(items.length){
        try{decodedImage=await loadImageElement(picture.image)}catch{decodedImage=null}
      }
      for(const item of items){
        const name=String(item.name||item.item||"").trim();
        if(!name)continue;
        rawRecognized++;
        let thumbnail="";
        try{thumbnail=await cropItemThumbnail(decodedImage||picture.image,item.bbox)}catch{}
        const result=mergePantryItem({
          id:`item-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
          location:picture.location,
          item:name,
          label:name,
          qty:item.qty===undefined?"":item.qty,
          unit:item.unit||"unknown",
          confidence:item.confidence||"medium",
          category:item.category||"other",
          perishable:Boolean(item.perishable),
          sourcePhotoIds:[picture.id],
          sourceLocations:[picture.location],
          reviewed:false,
          thumbnail,
          evidence:item.evidence||"",
          quantityBasis:item.quantityBasis||"visible",
          observations:[{photoId:picture.id,location:picture.location,qty:item.qty,unit:item.unit||"unknown",confidence:item.confidence||"medium",evidence:item.evidence||"",quantityBasis:item.quantityBasis||"visible",bbox:Array.isArray(item.bbox)?item.bbox:null}],
          bbox:Array.isArray(item.bbox)?item.bbox:null
        });
        if(result==="added")added++; else updated++;
      }
      photoLog.status="success";
      photoLog.detectedCount=items.length;
      photoLog.requestId=picture.requestId;
      photoLog.model=picture.model;
      try{picture.image=await shrinkStoredPhoto(picture.image)}catch{}
    }catch(error){
      console.error(error);
      picture.status="error";
      picture.error=String(error.message||error);
      failed++;
      photoLog.status="error";
      photoLog.error=picture.error;
    }
    photoLog.finishedAt=new Date().toISOString();
    session.photos.push(photoLog);
    save("state",state);
  }

  const uniqueCount=(state.have||[]).length;
  session.finishedAt=new Date().toISOString();
  session.afterInventoryCount=uniqueCount;
  session.added=added;
  session.updated=updated;
  session.failed=failed;
  session.empty=empty;
  session.uiMessage="";
  state.scanSessions=[...(state.scanSessions||[]),session].slice(-20);

  if(rawRecognized>0){
    state.pantryLastScan=Date.now();
    $("aiStatus").className=`notice ${failed?"warning":"success"}`;
    const resultText=`Your inventory now has ${uniqueCount} unique ingredient${uniqueCount===1?"":"s"}. ${added} new, ${updated} matched to something already found.`;
    $("aiStatus").textContent=failed
      ? `${resultText} ${failed} photo${failed===1?"":"s"} needs another try; successful results were kept.`
      : `${resultText} Review anything marked “Needs review.”`;
  }else if(failed){
    $("aiStatus").className="notice error";
    $("aiStatus").textContent="No items were added because the photos could not be read. Tap Retry on the failed photo. Your existing inventory was not removed.";
  }else{
    $("aiStatus").className="notice warning";
    $("aiStatus").textContent="The scan finished, but no clearly identifiable food was visible. Try a closer, brighter photo; nothing was added.";
  }
  session.uiMessage=$("aiStatus").textContent;
  logEvent("scan_finished",{sessionId:session.id,added,updated,failed,uniqueCount});
  buildShoppingForWeek("this");
  buildShoppingForWeek("next");
  save("state",state);
  button.disabled=false;
  renderHave();
  renderShopping();

  // The photos themselves are no longer needed once their items are
  // safely in the pantry (each item's thumbnail is already a standalone
  // saved crop, not a live reference to the photo) - offer to clear them
  // out in one prompt rather than letting the photo list grow indefinitely.
  offerToDeleteScannedPhotos(pending.filter(p=>p.status==="scanned").map(p=>p.id));
}

function offerToDeleteScannedPhotos(justScannedIds){
  if(!justScannedIds.length)return false;
  if(!confirm(`${justScannedIds.length} photo${justScannedIds.length===1?"":"s"} scanned and saved to your pantry. Delete the photo${justScannedIds.length===1?"":"s"} now to keep things tidy?`))return false;
  state.pantryPhotos=(state.pantryPhotos||[]).filter(p=>!justScannedIds.includes(p.id));
  save("state",state);
  renderHave();
  return true;
}

$("receiptPhotoInput").addEventListener("change",async event=>{
  const file=event.target.files?.[0];
  event.target.value="";
  if(!file||!file.type.startsWith("image/"))return;
  $("receiptStatus").className="notice";
  $("receiptStatus").textContent="Reading your receipt…";
  state.receiptReview=[];
  renderReceiptReview();
  try{
    // Receipts need to stay legible (small print, many lines), so use a
    // larger/higher-quality compression than the kitchen-photo default.
    const image=await compressKitchenPhoto(file,1400,0.75);
    const response=await fetch(`${API_ORIGIN}/.netlify/functions/receipt-scan`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({image,purchaseDate:new Date().toISOString().slice(0,10),photoId:`receipt-${Date.now()}`})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`Scan failed (${response.status})`);
    const items=Array.isArray(data.items)?data.items:[];
    if(!items.length){
      $("receiptStatus").className="notice warning";
      $("receiptStatus").textContent="No grocery items were found. Try a clearer, flatter photo of the receipt.";
      return;
    }
    state.receiptReview=items.map(item=>({
      id:`receipt-item-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      name:item.name,
      rawText:item.rawText||"",
      qty:Number.isFinite(item.qty)?item.qty:1,
      unit:item.unit||"unknown",
      category:item.category||"other",
      confidence:item.confidence||"medium",
      expiresOn:item.expiresOn||null,
      checked:true
    }));
    $("receiptStatus").className="notice success";
    $("receiptStatus").textContent=`Found ${items.length} item${items.length===1?"":"s"}. Review below, then add to your pantry.`;
    renderReceiptReview();
  }catch(error){
    $("receiptStatus").className="notice error";
    $("receiptStatus").textContent=error?.message||"Could not read the receipt. Please try again.";
  }
});

function renderReceiptReview(){
  const items=state.receiptReview||[];
  const area=$("receiptReviewArea");
  const list=$("receiptReviewList");
  if(!items.length){area.classList.add("hidden");list.innerHTML="";return}
  area.classList.remove("hidden");
  list.innerHTML=items.map(item=>`
    <div class="row" style="align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--line)">
      <input type="checkbox" data-receipt-check="${item.id}" ${item.checked?"checked":""} aria-label="Include ${esc(item.name)}">
      <input type="text" class="text-input" data-receipt-name="${item.id}" value="${esc(item.name)}" style="flex:1" aria-label="Item name">
      <input type="number" class="text-input" data-receipt-qty="${item.id}" value="${item.qty}" min="0" step="0.5" style="width:64px" aria-label="Quantity">
      <span class="tiny muted">${esc(item.unit)}</span>
      ${item.expiresOn?`<span class="tiny muted">best by ${esc(item.expiresOn)}</span>`:""}
    </div>`).join("");
  list.querySelectorAll("[data-receipt-check]").forEach(el=>{
    el.onchange=()=>{
      const item=items.find(i=>i.id===el.dataset.receiptCheck);
      if(item)item.checked=el.checked;
    };
  });
  list.querySelectorAll("[data-receipt-name]").forEach(el=>{
    el.onchange=()=>{
      const item=items.find(i=>i.id===el.dataset.receiptName);
      if(item)item.name=el.value.trim().slice(0,80);
    };
  });
  list.querySelectorAll("[data-receipt-qty]").forEach(el=>{
    el.onchange=()=>{
      const item=items.find(i=>i.id===el.dataset.receiptQty);
      if(item)item.qty=Number(el.value)||1;
    };
  });
}

$("addReceiptItemsBtn").onclick=()=>{
  const items=(state.receiptReview||[]).filter(item=>item.checked&&item.name.trim());
  if(!items.length){
    $("receiptStatus").className="notice";
    $("receiptStatus").textContent="No items selected.";
    return;
  }
  let added=0,updated=0;
  for(const item of items){
    const result=mergePantryItem({
      id:`item-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      location:"Receipt",
      item:item.name,
      label:item.name,
      qty:item.qty,
      unit:item.unit||"unknown",
      // The receipt review screen (checking the box, editing the name/qty)
      // IS the user confirming this item - it should not also need
      // re-confirming in the main pantry list, unlike a fresh photo scan
      // the user hasn't looked at yet.
      confidence:"user",
      category:item.category||"other",
      perishable:Boolean(item.expiresOn),
      expiresOn:item.expiresOn||null,
      sourcePhotoIds:[],
      sourceLocations:["Receipt"],
      reviewed:true,
      thumbnail:"",
      evidence:item.rawText||"",
      quantityBasis:"label",
      observations:[{location:"Receipt",qty:item.qty,unit:item.unit||"unknown",confidence:"user",evidence:item.rawText||"",quantityBasis:"label",bbox:null}]
    });
    if(result==="added")added++; else updated++;
  }
  state.receiptReview=[];
  buildShoppingForWeek("this");
  buildShoppingForWeek("next");
  save("state",state);
  renderHave();
  renderReceiptReview();
  $("receiptStatus").className="notice success";
  $("receiptStatus").textContent=`Added ${added+updated} item${added+updated===1?"":"s"} to your pantry (${added} new, ${updated} matched to something already there).`;
};

$("cancelReceiptBtn").onclick=()=>{
  state.receiptReview=[];
  renderReceiptReview();
  $("receiptStatus").className="notice";
  $("receiptStatus").textContent="Add a receipt photo to get started.";
};

// ===== Community recipes =====
let communitySession=null;
let communityDraft=null;

function loadCommunitySession(){
  try{
    const raw=localStorage.getItem("communitySession");
    if(raw)communitySession=JSON.parse(raw);
  }catch{communitySession=null}
}
function saveCommunitySession(){
  try{
    if(communitySession)localStorage.setItem("communitySession",JSON.stringify(communitySession));
    else localStorage.removeItem("communitySession");
  }catch{}
}
function renderCommunitySignInState(){
  const signedIn=Boolean(communitySession?.sessionToken);
  $("communitySignedOut")?.classList.toggle("hidden",signedIn);
  $("communitySignedIn")?.classList.toggle("hidden",!signedIn);
  if(signedIn&&$("communityUserName"))$("communityUserName").textContent=communitySession.user?.name||"you";
}

let socialLoginInitialized=false;
async function ensureSocialLoginInitialized(){
  const plugin=window.Capacitor?.Plugins?.SocialLogin;
  if(!plugin)return null;
  if(!socialLoginInitialized){
    await plugin.initialize({
      apple:{clientId:"com.dinnermadeeasy.app"},
      google:{
        webClientId:"523517537145-epln9fprdg80demjgoqt78p8p30hjg25.apps.googleusercontent.com",
        iOSClientId:"523517537145-mi9gc1u7qncsoc6681gb28rok2oikeg7.apps.googleusercontent.com",
        iOSServerClientId:"523517537145-epln9fprdg80demjgoqt78p8p30hjg25.apps.googleusercontent.com"
      }
    });
    socialLoginInitialized=true;
  }
  return plugin;
}

async function completeCommunitySignIn(provider,idToken,name){
  const response=await fetch(`${API_ORIGIN}/.netlify/functions/auth-verify`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({provider,idToken,name})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Sign-in failed.");
  communitySession={sessionToken:data.sessionToken,user:data.user};
  saveCommunitySession();
  renderCommunitySignInState();
  $("communityStatus").className="notice success";
  $("communityStatus").textContent=`Signed in as ${data.user.name}.`;
}

$("appleSignInBtn").onclick=async()=>{
  $("communityStatus").className="notice";
  $("communityStatus").textContent="Opening Sign in with Apple…";
  try{
    const plugin=await ensureSocialLoginInitialized();
    if(!plugin)throw new Error("Sign-in is only available in the app, not this web preview.");
    const res=await plugin.login({provider:"apple",options:{scopes:["email","name"]}});
    const idToken=res?.result?.idToken;
    if(!idToken)throw new Error("Apple did not return a sign-in token.");
    const name=[res?.result?.profile?.givenName,res?.result?.profile?.familyName].filter(Boolean).join(" ");
    await completeCommunitySignIn("apple",idToken,name);
  }catch(error){
    $("communityStatus").className="notice error";
    $("communityStatus").textContent=error?.message||"Sign in with Apple failed.";
  }
};

$("googleSignInBtn").onclick=async()=>{
  $("communityStatus").className="notice";
  $("communityStatus").textContent="Opening Sign in with Google…";
  try{
    const plugin=await ensureSocialLoginInitialized();
    if(!plugin)throw new Error("Sign-in is only available in the app, not this web preview.");
    const res=await plugin.login({provider:"google",options:{scopes:["email","profile"]}});
    const idToken=res?.result?.idToken;
    if(!idToken)throw new Error("Google did not return a sign-in token.");
    const name=res?.result?.profile?.name||"";
    await completeCommunitySignIn("google",idToken,name);
  }catch(error){
    $("communityStatus").className="notice error";
    $("communityStatus").textContent=error?.message||"Sign in with Google failed.";
  }
};

$("communitySignOutBtn").onclick=()=>{
  communitySession=null;
  saveCommunitySession();
  renderCommunitySignInState();
  $("shareRecipeForm").classList.add("hidden");
};

async function loadCommunityRecipes(){
  $("communityStatus").className="notice";
  $("communityStatus").textContent="Loading community recipes…";
  try{
    const response=await fetch(`${API_ORIGIN}/.netlify/functions/community-recipes`);
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Could not load community recipes.");
    const recipes=data.recipes||[];
    renderCommunityRecipes(recipes);
    $("communityStatus").className="notice";
    $("communityStatus").textContent=recipes.length?`${recipes.length} recipe${recipes.length===1?"":"s"} shared by the community.`:"No community recipes yet — be the first to share one!";
  }catch(error){
    $("communityStatus").className="notice error";
    $("communityStatus").textContent=error?.message||"Could not load community recipes.";
  }
}

function renderCommunityRecipes(recipes){
  const list=$("communityRecipeList");
  if(!list)return;
  list.innerHTML=recipes.map(r=>`
    <div class="meal-card" style="grid-template-columns:1fr">
      <div>
        <div class="meal-title">${esc(r.title)}</div>
        <div class="meal-meta">${kindLabel(r.kind)} · Shared by ${esc(r.submittedByName||"a community cook")}</div>
        ${r.kashrutNotes?`<div class="tiny" style="margin-top:6px">${esc(r.kashrutNotes)}</div>`:""}
        <details style="margin-top:8px">
          <summary>View recipe</summary>
          <div style="margin-top:8px">
            ${(r.ingredients||[]).map(i=>`<div>• ${esc(i.name)}${i.amount?` <span class="qty">— ${esc(i.amount)}</span>`:""}</div>`).join("")}
          </div>
          <ol style="margin-top:8px;padding-left:18px">
            ${(r.steps||[]).map(s=>`<li>${esc(s)}</li>`).join("")}
          </ol>
        </details>
      </div>
    </div>`).join("")||'<div class="notice">No community recipes yet.</div>';
}

$("shareRecipeBtn").onclick=()=>{
  communityDraft={ingredients:[{name:"",amount:""}],steps:[""]};
  renderCommunityDraft();
  $("communityTitle").value="";
  $("shareRecipeForm").classList.remove("hidden");
};

$("cancelCommunityRecipeBtn").onclick=()=>{
  communityDraft=null;
  $("shareRecipeForm").classList.add("hidden");
};

$("addCommunityIngredientBtn").onclick=()=>{
  communityDraft.ingredients.push({name:"",amount:""});
  renderCommunityDraft();
};
$("addCommunityStepBtn").onclick=()=>{
  communityDraft.steps.push("");
  renderCommunityDraft();
};

function renderCommunityDraft(){
  $("communityIngredients").innerHTML=communityDraft.ingredients.map((ing,i)=>`
    <div class="row" style="gap:6px;margin-top:6px">
      <input type="text" class="text-input" data-ing-name="${i}" placeholder="Ingredient" value="${esc(ing.name)}" style="flex:2">
      <input type="text" class="text-input" data-ing-amount="${i}" placeholder="Amount" value="${esc(ing.amount)}" style="flex:1">
    </div>`).join("");
  $("communitySteps").innerHTML=communityDraft.steps.map((step,i)=>`
    <div style="margin-top:6px">
      <textarea class="text-input" data-step="${i}" placeholder="Step ${i+1}" rows="2">${esc(step)}</textarea>
    </div>`).join("");
  document.querySelectorAll("[data-ing-name]").forEach(el=>{el.onchange=()=>{communityDraft.ingredients[Number(el.dataset.ingName)].name=el.value}});
  document.querySelectorAll("[data-ing-amount]").forEach(el=>{el.onchange=()=>{communityDraft.ingredients[Number(el.dataset.ingAmount)].amount=el.value}});
  document.querySelectorAll("[data-step]").forEach(el=>{el.onchange=()=>{communityDraft.steps[Number(el.dataset.step)]=el.value}});
}

$("submitCommunityRecipeBtn").onclick=async()=>{
  if(!communitySession?.sessionToken){
    $("communityStatus").className="notice error";
    $("communityStatus").textContent="Please sign in first.";
    return;
  }
  const title=$("communityTitle").value.trim();
  const ingredients=(communityDraft?.ingredients||[]).filter(i=>i.name.trim());
  const steps=(communityDraft?.steps||[]).map(s=>s.trim()).filter(Boolean);
  if(!title||!ingredients.length||!steps.length){
    $("communityStatus").className="notice error";
    $("communityStatus").textContent="Please add a title, at least one ingredient, and at least one step.";
    return;
  }
  $("communityStatus").className="notice";
  $("communityStatus").textContent="Checking your recipe against kosher standards…";
  try{
    const response=await fetch(`${API_ORIGIN}/.netlify/functions/community-recipes`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({sessionToken:communitySession.sessionToken,title,ingredients,steps})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Could not publish this recipe.");
    $("shareRecipeForm").classList.add("hidden");
    communityDraft=null;
    $("communityStatus").className="notice success";
    $("communityStatus").textContent="Recipe shared! It's now visible to the community.";
    loadCommunityRecipes();
  }catch(error){
    $("communityStatus").className="notice error";
    $("communityStatus").textContent=error?.message||"Could not publish this recipe.";
  }
};

function inventoryMatchesIngredient(name){
  const target=canonicalIngredient(name);
  if(!target)return false;
  return (state.have||[]).some(item=>{
    if(Number(item.qty)===0)return false;
    if(item.confidence!=="user" && item.confidence!=="high" && !item.reviewed)return false;
    return canonicalIngredient(item.item)===target;
  });
}

function renderPantrySuggestions(){
  const box=$("pantrySuggestions");
  if(!state.have.length){box.innerHTML='<div class="notice">Add or scan ingredients to see recipe ideas.</div>';return}
  const scored=RECIPES.filter(recipeAllowed).map(r=>{
    const ingredients=r.ingredients.map(([name])=>name).filter(name=>name && !/optional|oil spray|olive oil/i.test(name));
    const matched=ingredients.filter(inventoryMatchesIngredient).length;
    const total=ingredients.length;
    const missing=Math.max(0,total-matched);
    const ratio=total>0?matched/total:0;
    return {r,matched,missing,total,ratio};
  }).filter(x=>x.matched>0);

  // The point of this list is "what can I actually cook with what I have,"
  // not "which recipe happens to share the most ingredients with my
  // pantry" - a recipe needing 4 more ingredients isn't a real suggestion
  // even if it matched more items in absolute terms than a near-complete
  // one. Require covering at least half the recipe before it counts as a
  // real suggestion; only fall back to weaker partial matches if nothing
  // clears that bar, so the list is never empty just because the pantry is
  // sparse.
  const MIN_COVERAGE=0.5;
  const strong=scored.filter(x=>x.ratio>=MIN_COVERAGE);
  const pool=(strong.length?strong:scored).sort((a,b)=>b.ratio-a.ratio||b.matched-a.matched||a.missing-b.missing);

  // Keep only the single best-scoring recipe per family, so near-identical
  // variants of the same dish (e.g. several "Loaded Baked Potatoes" add-in
  // versions) can't crowd out real variety in the suggestion list - the
  // actual bug: because variants share almost the same ingredients, they
  // score almost identically and can otherwise sweep the whole top 5.
  const seenFamilies=new Set();
  const suggestions=[];
  for(const item of pool){
    const family=recipeFamily(item.r);
    if(seenFamilies.has(family))continue;
    seenFamilies.add(family);
    suggestions.push(item);
    if(suggestions.length>=5)break;
  }

  box.innerHTML=suggestions.length?suggestions.map(x=>`
    <div class="suggestion-card">
      <div><b>${esc(x.r.title)}</b><div class="tiny">You have ${x.matched} of ${x.total} main ingredients · buy about ${x.missing}</div></div>
      <button class="btn small secondary" type="button" data-pantry-recipe="${x.r.id}">Show recipe</button>
    </div>`).join(""):'<div class="notice">I found ingredients, but not enough clear matches yet. Review item names or add another photo.</div>';
  document.querySelectorAll("[data-pantry-recipe]").forEach(btn=>btn.onclick=()=>showRecipe(btn.dataset.pantryRecipe));
}

function makeSupportReport(includeImages=true){
  return {
    type:"dinner-planner-support-report",
    schemaVersion:SUPPORT_SCHEMA,
    reportId:`report-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    appVersion:APP_VERSION,
    generatedAt:new Date().toISOString(),
    page:{href:location.href,userAgent:navigator.userAgent,language:navigator.language,screen:{width:screen.width,height:screen.height,pixelRatio:window.devicePixelRatio||1}},
    currentMessage:$("aiStatus")?.textContent||"",
    household:{
      hasCode:Boolean(householdCode),
      code:householdCode||"",
      deviceName,
      syncStatus:cloudSyncStatus
    },
    preferences:{portions:state.portions,prefs:state.prefs,week:state.week,exclude:state.exclude},
    photos:(state.pantryPhotos||[]).map(p=>({
      id:p.id,location:p.location,label:p.label,status:p.status,addedAt:p.addedAt,scannedAt:p.scannedAt,detectedCount:p.detectedCount||0,error:p.error||"",requestId:p.requestId||"",model:p.model||"",rawItems:p.rawItems||[],rejectedItems:p.rejectedItems||[],image:includeImages?p.image:undefined
    })),
    inventory:(state.have||[]).map(item=>({...item,thumbnail:includeImages?item.thumbnail:undefined})),
    scanSessions:state.scanSessions||[],
    aiRequests:state.aiRequests||[],
    validationResults:state.validationResults||[],
    shoppingDiagnostics:state.shoppingDiagnostics||{},
    runtimeErrors:state.runtimeErrors||[],
    debugLog:state.debugLog||[]
  };
}

async function downloadJson(filename,data){
  const text=JSON.stringify(data,null,2);
  // Plain Blob + <a download> links don't reliably work inside the native
  // app's WebView - there's no download manager registered there, so the
  // click fires but nothing visibly happens (the actual bug this fixes).
  // Try the native Share Sheet first (the same technique the separate
  // "Use phone Share menu" button already uses successfully), and only
  // fall back to the classic browser download link when sharing isn't
  // available at all - which is the normal, working path on the website.
  try{
    const file=new File([text],filename,{type:"application/json"});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({title:"Dinner Made Easy",files:[file]});
      return "shared";
    }
  }catch(error){
    if(error?.name==="AbortError")return "cancelled";
  }
  const blob=new Blob([text],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  return "downloaded";
}

function supportInventoryFromFile(data){
  const source=Array.isArray(data?.correctedInventory)?data.correctedInventory:Array.isArray(data?.inventory)?data.inventory:null;
  if(!source)return null;
  return source.filter(x=>x&&(x.item||x.name||x.label)).map((x,index)=>({
    id:x.id||`imported-${Date.now()}-${index}`,
    item:String(x.item||x.name||x.label).trim(),
    label:String(x.label||x.item||x.name).trim(),
    location:x.location||"Corrected import",
    qty:x.qty!==undefined?x.qty:1,
    unit:x.unit||"each",
    confidence:"user",
    category:x.category||"other",
    perishable:Boolean(x.perishable),
    sourcePhotoIds:Array.isArray(x.sourcePhotoIds)?x.sourcePhotoIds:[],
    sourceLocations:Array.isArray(x.sourceLocations)?x.sourceLocations:[x.location||"Corrected import"],
    reviewed:true,
    thumbnail:typeof x.thumbnail==="string"?x.thumbnail:"",
    evidence:typeof x.evidence==="string"?x.evidence:"",
    bbox:Array.isArray(x.bbox)?x.bbox:null
  }));
}

async function shareSupportReport(){
  const report=makeSupportReport(true);
  const filename=`dinner-planner-support-${new Date().toISOString().slice(0,10)}.json`;
  const file=new File([JSON.stringify(report,null,2)],filename,{type:"application/json"});
  try{
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({title:"Dinner Planner scan support",text:"Please inspect this Dinner Planner scan.",files:[file]});
      $("supportStatus") && ($("supportStatus").textContent="Support file shared through your phone’s Share menu.");
      logEvent("support_report_shared",{reportId:report.reportId,photosIncluded:true});
      return;
    }
  }catch(error){
    if(error?.name==="AbortError")return;
  }
  downloadJson(filename,report);
  $("supportStatus") && ($("supportStatus").textContent="Your phone could not share the file directly, so it was downloaded instead.");
}

$("shareSupportBtn").onclick=shareSupportReport;
$("quickShareSupportBtn").onclick=async()=>{
  const report=makeSupportReport(true);
  const outcome=await downloadJson(`dinner-planner-support-${new Date().toISOString().slice(0,10)}.json`,report);
  if($("supportStatus")){
    if(outcome==="cancelled")return;
    $("supportStatus").className="notice success";
    $("supportStatus").textContent=outcome==="shared"?"Support file shared. Attach it in ChatGPT using the + button.":"Support file downloaded. Attach it in ChatGPT using the + button.";
  }
  logEvent("support_report_downloaded",{reportId:report.reportId,photosIncluded:true,source:"quick",outcome});
};

$("downloadSupportBtn").onclick=async()=>{
  const report=makeSupportReport($("includeSupportPhotos").checked);
  const outcome=await downloadJson(`dinner-planner-support-${new Date().toISOString().slice(0,10)}.json`,report);
  if(outcome==="cancelled")return;
  $("supportStatus").className="notice success";
  $("supportStatus").textContent=outcome==="shared"?"Support file shared. Upload it in our ChatGPT conversation.":"Support file downloaded. Upload it in our ChatGPT conversation.";
  logEvent("support_report_downloaded",{reportId:report.reportId,photosIncluded:$("includeSupportPhotos").checked,outcome});
};

$("copySupportBtn").onclick=async()=>{
  const report=makeSupportReport(false);
  try{
    await navigator.clipboard.writeText(JSON.stringify(report,null,2));
    $("supportStatus").className="notice success";
    $("supportStatus").textContent="Report copied. You can paste it into the chat.";
  }catch{
    const outcome=await downloadJson("dinner-planner-support.json",report);
    if(outcome==="cancelled")return;
    $("supportStatus").className="notice warning";
    $("supportStatus").textContent=outcome==="shared"?"Copying was blocked, so the report was shared instead.":"Copying was blocked, so the report was downloaded instead.";
  }
};

$("importSupportFix").addEventListener("change",async event=>{
  const file=event.target.files?.[0];event.target.value="";
  if(!file)return;
  try{
    const data=JSON.parse(await file.text());
    const inventory=supportInventoryFromFile(data);
    if(!inventory)throw new Error("This file does not contain a corrected inventory.");
    if(!confirm(`Replace the current inventory with ${inventory.length} corrected items? Your photos will stay.`))return;
    state.have=inventory;
    state.pantryLastScan=Date.now();
    logEvent("corrected_inventory_imported",{count:inventory.length,sourceType:data.type||"unknown"});
    buildShoppingForWeek("this");
    buildShoppingForWeek("next");
    save("state",state);
    renderHave();
    renderShopping();
    $("supportStatus").className="notice success";
    $("supportStatus").textContent=`Imported ${inventory.length} corrected items.`;
  }catch(error){
    $("supportStatus").className="notice error";
    $("supportStatus").textContent=error.message||"The correction file could not be read.";
  }
});

$("reloadLatestBtn").onclick=async()=>{
  $("supportStatus").className="notice";
  $("supportStatus").textContent="Clearing the old app cache and reloading…";
  try{
    if("caches" in window){for(const key of await caches.keys())await caches.delete(key)}
    if("serviceWorker" in navigator){for(const reg of await navigator.serviceWorker.getRegistrations())await reg.unregister()}
  }catch{}
  location.replace(`${location.pathname}?appVersion=${APP_VERSION}&reload=${Date.now()}`);
};

$("showAllInventoryBtn").onclick=()=>{state.pantryExpanded=!state.pantryExpanded;save("state",state);renderInventory()};
$("editAllItemsBtn").onclick=()=>{state.pantryExpanded=true;save("state",state);renderInventory();$("inventoryList").scrollIntoView({behavior:"smooth",block:"start"})};
$("clearPhotosBtn").onclick=()=>{
  if(!(state.pantryPhotos||[]).length)return;
  if(!confirm("Remove the saved kitchen photos? Your confirmed inventory will stay."))return;
  for(const photo of state.pantryPhotos||[])removePhotoObservations(photo.id);
  state.pantryPhotos=[];
  buildShoppingForWeek("this");
  buildShoppingForWeek("next");
  save("state",state);
  renderHave();
  renderShopping();
  $("aiStatus").className="notice";
  $("aiStatus").textContent="Photos removed. Your inventory is still saved.";
};
$("rescanPhotosBtn").onclick=async()=>{
  const photos=state.pantryPhotos||[];
  if(!photos.length){
    $("aiStatus").className="notice";
    $("aiStatus").textContent="No saved photos to re-scan yet.";
    return;
  }
  // Re-runs the AI on photos already saved on this device - no need to
  // retake anything, useful after a scan-quality fix ships.
  for(const photo of photos){
    removePhotoObservations(photo.id);
    photo.status="pending";
    photo.error="";
    photo.detectedCount=0;
    photo.rawItems=[];
    photo.rejectedItems=[];
  }
  save("state",state);
  renderHave();
  await analyzePictures();
};
$("addMorePhotosBtn").onclick=()=>$("photoInput").click();
$("removeUsedBtn").onclick=()=>{
  state.pantryExpanded=true;
  save("state",state);
  renderInventory();
  $("inventoryList").scrollIntoView({behavior:"smooth",block:"start"});
  $("aiStatus").className="notice";
  $("aiStatus").textContent="Use Remove on anything you have finished.";
};

$("minusPortions").onclick=()=>{
  state.portions=Math.max(1,state.portions-1);
  buildShoppingForWeek("this");
  buildShoppingForWeek("next");
  save("state",state);
  renderPrefs();
  renderShopping();
};

$("plusPortions").onclick=()=>{
  state.portions=Math.min(20,state.portions+1);
  buildShoppingForWeek("this");
  buildShoppingForWeek("next");
  save("state",state);
  renderPrefs();
  renderShopping();
};

$("savePrefsBtn").onclick=()=>{save("state",state);showView("prefs")};
$("createHouseholdBtn")?.addEventListener("click",()=>{createHousehold()});
$("joinHouseholdBtn")?.addEventListener("click",()=>{joinHousehold($("joinHouseholdCode").value)});
$("leaveHouseholdBtn")?.addEventListener("click",()=>{leaveHousehold()});
$("copyHouseholdCodeBtn")?.addEventListener("click",async()=>{
  try{
    await navigator.clipboard.writeText(householdCode||"");
    setHouseholdStatus("synced","Code copied. Send it to your family.");
  }catch{
    setHouseholdStatus("error","Couldn't copy. Share the code shown above.");
  }
});
$("shareHouseholdCodeBtn")?.addEventListener("click",async()=>{
  const text=`Join our Dinner Made Easy household! Open the app and enter this code: ${householdCode}`;
  try{
    if(navigator.share){
      await navigator.share({title:"Join our household",text});
    }else{
      await navigator.clipboard.writeText(text);
      setHouseholdStatus("synced","Sharing isn't available here, so the invite was copied instead.");
    }
  }catch{}
});
$("deviceNameInput")?.addEventListener("change",event=>{
  deviceName=event.target.value.slice(0,60);
  save("deviceName",deviceName);
});

function runBuild(weekKey="this",replaceUnlocked=false){
  if(!replaceUnlocked){
    const plan=state[planProp(weekKey)]||[];
    const locks=state[lockedProp(weekKey)]||{};
    const lockedCount=plan.filter(entry=>locks[entry.day]).length;
    if(lockedCount>0){
      const word=lockedCount===1?"dinner":"dinners";
      if(!confirm(`You have ${lockedCount} locked ${word} this week. Building a new plan will clear the locks and replace them too. Continue?`))return;
    }
  }
  const status=$(weekKey==="next"?"nextBuildStatus":"buildStatus");
  const button=$(weekKey==="next"?"buildNextWeekBtn":"buildWeekBtn");
  status.textContent=replaceUnlocked ? "Replacing unlocked dinners…" : (weekKey==="next"?"Building next week…":"Building your week…");
  button.disabled=true;
  try{
    state=normalizeState(state);
    buildPlanForWeek(weekKey,{replaceUnlocked});
    const plan=state[planProp(weekKey)]||[];
    const uniqueCount=new Set(plan.map(p=>p.id)).size;
    if(plan.length!==5 || uniqueCount!==5){
      throw new Error("The weekly plan was incomplete.");
    }
    status.textContent=weekKey==="next"?"Next week is ready.":"Your week is ready.";
    requestAnimationFrame(()=>{showView("week");showWeekSubView(weekKey==="next"?"next":"this");});
  }catch(error){
    console.error(error);
    recordRuntimeError("build_failed",error?.message||String(error),{weekKey,stack:error?.stack||""});
    state[planProp(weekKey)]=[];
    state[lockedProp(weekKey)]={};
    buildShoppingForWeek(weekKey);
    save("state",state);
    renderWeekSection(weekKey);
    renderShopping();
    const reason=error?.message?` (${error.message})`:"";
    status.textContent=(weekKey==="next"?"Next week could not be built.":"The week could not be built.")+reason+" Tap the button once more.";
  }finally{
    button.disabled=false;
  }
}

$("buildWeekBtn").onclick=()=>runBuild("this",false);
$("lockWeekBtn").onclick=()=>lockAllForWeek("this");
$("replaceUnlockedBtn").onclick=()=>runBuild("this",true);
$("buildNextWeekBtn").onclick=()=>runBuild("next",false);
$("lockNextWeekBtn").onclick=()=>lockAllForWeek("next");
$("replaceNextUnlockedBtn").onclick=()=>runBuild("next",true);
$("buildNextWeekBtnHome").onclick=()=>runBuild("next",false);
$("usePantryBtn").onclick=()=>showView("pantry");

$("mobileMenuBtn")?.addEventListener("click",openMobileNav);
$("mobileNavCloseBtn")?.addEventListener("click",closeMobileNav);
$("mobileNavOverlay")?.addEventListener("click",event=>{
  if(event.target===$("mobileNavOverlay"))closeMobileNav();
});
document.querySelectorAll("[data-showview]").forEach(btn=>{
  btn.addEventListener("click",()=>showView(btn.dataset.showview));
});
$("addCustomExcludeBtn").onclick=addCustomExclude;
$("addTypedBtn").onclick=()=>$("typedBox").classList.toggle("hidden");
$("saveTypedBtn").onclick=addTyped;
$("analyzePicturesBtn").onclick=analyzePictures;
document.querySelectorAll("[data-find-stores]").forEach(btn=>btn.onclick=()=>findNearbyStores(btn.dataset.findStores));


function recordRuntimeError(type,message,detail={}){
  const entry={at:new Date().toISOString(),type,message:String(message||"Unknown error"),detail};
  state.runtimeErrors=[...(state.runtimeErrors||[]),entry].slice(-100);
  logEvent("runtime_error",entry);
}
window.addEventListener("error",event=>recordRuntimeError("error",event.message,{source:event.filename,line:event.lineno,column:event.colno}));
window.addEventListener("unhandledrejection",event=>recordRuntimeError("unhandledrejection",event.reason?.message||event.reason||"Unhandled promise rejection"));

function runValidationSuite(){
  const checks=[];
  const add=(id,ok,message,detail={})=>checks.push({id,ok:Boolean(ok),message,detail,at:new Date().toISOString()});
  const dairyPattern=/milk|cream|cheese|butter|ricotta|mozzarella|cheddar|yogurt/i;

  const validatePlan=(weekKey)=>{
    const plan=state[planProp(weekKey)]||[];
    add(`${weekKey}-plan-count`,plan.length===0||plan.length===5,`${weekKey} plan has ${plan.length} dinners`,{ids:plan.map(entry=>entry.id)});
    add(`${weekKey}-plan-unique`,plan.length===0||new Set(plan.map(entry=>entry.id)).size===plan.length,`${weekKey} plan uses five unique recipes`);
    for(const entry of plan){
      const recipe=getRecipe(entry.id);
      const date=plannerDatesForWeek(weekKey).find(value=>value.day===entry.day)?.date;
      add(`${weekKey}-${entry.day}-recipe`,Boolean(recipe),`${entry.day} points to a real recipe`,{id:entry.id});
      if(recipe&&date){
        add(`${weekKey}-${entry.day}-calendar`,recipeAllowedOnDate(recipe,date),`${entry.day} follows the Jewish calendar`,{recipe:recipe.title,rule:calendarRuleForDate(date)});
        add(`${weekKey}-${entry.day}-preferences`,recipeAllowed(recipe),`${recipe.title} follows saved and weekly exclusions`);
        if(recipe.kind==="meat"){
          add(`${weekKey}-${entry.day}-kosher`,!recipe.ingredients.some(([name])=>dairyPattern.test(name)),`${recipe.title} does not mix meat and dairy`);
        }
      }
    }
  };

  validatePlan("this");
  validatePlan("next");

  const tomatoForms=["fresh tomatoes","canned tomatoes","frozen tomatoes","tomato sauce","tomato paste"].map(canonicalIngredient);
  add("tomato-separation",new Set(tomatoForms).size===tomatoForms.length,"Fresh, canned, frozen, sauce, and paste tomatoes stay separate",{tomatoForms});

  const inventoryChecks=(state.have||[]).map(item=>({item:item.item,result:IngredientEngine.validateDetectedItem({name:item.item,qty:item.qty,confidence:item.confidence||"user",evidence:item.evidence||"user entry",quantityBasis:item.quantityBasis||"user"})}));
  add("inventory-ids",(state.have||[]).every(item=>item.id&&item.item),"Every pantry item has an ID and name");
  add("inventory-valid",inventoryChecks.every(row=>row.result.ok),"Pantry items have valid names, quantities, and confidence",{failed:inventoryChecks.filter(row=>!row.result.ok)});
  add("inventory-photo-links",(state.have||[]).every(item=>(item.sourcePhotoIds||[]).every(id=>(state.pantryPhotos||[]).some(photo=>photo.id===id))),"Pantry source-photo links are not orphaned");

  const lastSession=(state.scanSessions||[]).at(-1);
  add("scan-message",!(($("aiStatus")?.textContent||"").toLowerCase().includes("could not")&&(lastSession?.added>0||lastSession?.updated>0)),"Scan result message is not contradictory",{message:$("aiStatus")?.textContent||"",lastSession});
  add("shopping-nonnegative",[...(state.shopping||[]),...(state.nextShopping||[])].every(item=>!String(item.qty).startsWith("-")),"Shopping quantities are non-negative");

  const syntheticRecipe={title:"Canned tomato test",store:"supermarket",ingredients:[["canned tomatoes","2 cans"]]};
  const syntheticPantry=[{id:"test",item:"canned tomatoes",qty:12,unit:"can",confidence:"high",reviewed:false}];
  const syntheticCovered=IngredientEngine.buildShopping([syntheticRecipe],syntheticPantry,5);
  add("shopping-pantry-deduction",syntheticCovered.shopping.length===0,"Twelve canned tomatoes prevent an unnecessary two-can purchase",{diagnostics:syntheticCovered.diagnostics});
  const syntheticFresh=IngredientEngine.buildShopping([syntheticRecipe],[{id:"fresh",item:"fresh tomatoes",qty:12,unit:"each",confidence:"high"}],5);
  add("shopping-tomato-safety",syntheticFresh.shopping.length===1,"Fresh tomatoes do not satisfy a canned-tomato requirement",{shopping:syntheticFresh.shopping});

  add("version-meta",String(document.querySelector('meta[name="dinner-planner-version"]')?.content)===APP_VERSION,"Build metadata matches the app version",{appVersion:APP_VERSION});
  add("version-badge",Boolean($("versionBadge")?.textContent?.trim().startsWith(`v${APP_VERSION}`)),"Visible version badge matches the app version",{badge:$("versionBadge")?.textContent||""});
  const developerIds=["developerPanel","developerSummary","developerValidation","developerPantry","developerAi","developerShopping","developerTimeline","developerErrors","developerStorage"];
  add("developer-ui",developerIds.every(id=>Boolean($(id))),"Developer-mode panels are installed",{missing:developerIds.filter(id=>!$(id))});
  add("support-schema",SUPPORT_SCHEMA>=2,"Support-report schema is current",{schema:SUPPORT_SCHEMA});

  state.validationResults=checks;
  save("state",state);
  logEvent("validation_finished",{passed:checks.filter(check=>check.ok).length,total:checks.length});
  return checks;
}

window.__dinnerPlannerBridge={
  version:APP_VERSION,
  getState:()=>JSON.parse(JSON.stringify(state)),
  getLastSaveError:()=>load("lastSaveError",null),
  setState:next=>{state=normalizeState(next);buildShoppingForWeek("this");buildShoppingForWeek("next");save("state",state);renderPrefs();renderWeekSection("this");renderWeekSection("next");renderHave();renderShopping()},
  saveState:()=>save("state",state),
  logEvent,
  runValidationSuite,
  makeSupportReport,
  downloadJson,
  renderHave,
  renderShopping,
  buildShoppingForWeek,
  canonicalIngredient,
  shoppingCheckKey,
  setShoppingChecked,
  clearRuntimeLogs:()=>{state.runtimeErrors=[];state.debugLog=[];state.aiRequests=[];state.validationResults=[];save("state",state)},
  getCacheName:()=>`dinner-made-easy-v${APP_VERSION}-${BUILD_ID}`
};

async function prepareCurrentAppVersion(){
  const versionKey=`${K}appVersion`;
  const buildKey=`${K}buildId`;
  const previous=localStorage.getItem(versionKey);
  const previousBuild=localStorage.getItem(buildKey);
  const isNewFeatureVersion=previous!==APP_VERSION;
  const isNewBuild=previousBuild!==BUILD_ID;
  if(isNewFeatureVersion){
    // v60 migration: install the household's agreed permanent preference defaults
    // and remove the obsolete weekly pantry-first toggle (pantry-first is automatic).
    state.prefs=[...new Set([...(state.prefs||[]),...PREFS])];
    state.week=(state.week||[]).filter(value=>value!=="Use what I have first");
    save("state",state);
    localStorage.setItem(versionKey,APP_VERSION);
    logEvent("app_version_changed",{from:previous||"unknown",to:APP_VERSION});
  }
  if(isNewBuild){
    localStorage.setItem(buildKey,BUILD_ID);
    try{
      if("caches" in window){for(const key of await caches.keys()){if(key.startsWith("dinner-made-easy-"))await caches.delete(key)}}
      if("serviceWorker" in navigator){
        for(const reg of await navigator.serviceWorker.getRegistrations()){
          await reg.update();
          reg.waiting?.postMessage("SKIP_WAITING");
        }
      }
    }catch{}
    logEvent("app_build_changed",{from:previousBuild||"unknown",to:BUILD_ID});
  }
}
prepareCurrentAppVersion();

// The passive "did my own build ID change since last visit" check above only
// catches updates if this page has actually re-fetched from the network
// recently. A long-lived native WebView session (backgrounded/foregrounded
// repeatedly, never fully reloaded) could otherwise keep running a stale
// build indefinitely with no way for the person to know. Actively check the
// deployed build ID whenever the app is resumed, and offer a one-tap refresh
// rather than silently reloading, so it never interrupts something the
// person is in the middle of doing.
async function checkForNewerDeployedBuild(){
  try{
    const response=await fetch(`/service-worker.js?check=${Date.now()}`,{cache:"no-store"});
    if(!response.ok)return;
    const text=await response.text();
    const match=text.match(/BUILD_ID\s*=\s*"([^"]+)"/);
    const deployedBuildId=match?.[1];
    if(deployedBuildId && deployedBuildId!=="__BUILD_ID__" && deployedBuildId!==BUILD_ID){
      const badge=$("versionBadge");
      if(badge){
        badge.classList.add("update-available");
        badge.title="A new version is ready - tap to refresh";
        badge.onclick=()=>location.reload();
      }
    }
  }catch{}
}
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible")checkForNewerDeployedBuild();
});
window.addEventListener("focus",checkForNewerDeployedBuild);
setTimeout(checkForNewerDeployedBuild,4000);
setInterval(checkForNewerDeployedBuild,10*60*1000);

if("serviceWorker" in navigator){
  navigator.serviceWorker.register(`/service-worker.js?v=${APP_VERSION}-${BUILD_ID}`,{updateViaCache:"none"}).catch(()=>{});
}
renderPrefs();
renderCalendar();
let lastRenderedCalendarDay=isoLocalDate(new Date());
function refreshCalendarIfDayChanged(){
  const today=isoLocalDate(new Date());
  if(today!==lastRenderedCalendarDay){
    lastRenderedCalendarDay=today;
    renderCalendar();
    renderWeekSection("this");
    renderWeekSection("next");
  }
}
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible")refreshCalendarIfDayChanged();
});
window.addEventListener("focus",refreshCalendarIfDayChanged);
window.addEventListener("pageshow",refreshCalendarIfDayChanged);
setInterval(refreshCalendarIfDayChanged,15000);
renderStoreSelection("meat");
renderStoreSelection("supermarket");
renderWeekSection("this");
renderWeekSection("next");
renderShabbosSlots();
renderHave();
buildShoppingForWeek("this");
buildShoppingForWeek("next");
save("state",state);
renderShopping();
renderHouseholdSection();
loadCommunitySession();
renderCommunitySignInState();
loadCommunityRecipes();
showView("home");
if(householdCode){
  // One-time recovery: on 2026-08-01 an accidental Build press wiped this household's
  // locked plan, and a race in household sync then overwrote the good copy with a
  // different, unwanted plan on a second device. This restores the dinners the user
  // actually wanted, locked, using the app's normal save/sync path so it propagates
  // correctly and is protected by the sync-conflict guard from now on. Runs once.
  if(householdCode==="ANGZWU83" && !load("recoveryV1Applied",false)){
    const recoveryDishes=[
      {day:"Sun",id:"lemon-herb-chicken-01"},
      {day:"Mon",id:"grilled-cheese-soup-06"},
      {day:"Tue",id:"beef-burgers-06"},
      {day:"Wed",id:"loaded-baked-potato-03"},
      {day:"Thu",id:"beef-tacos-07"}
    ];
    const dates=plannerDatesForWeek("this");
    const validRecovery=recoveryDishes.every(entry=>getRecipe(entry.id));
    if(validRecovery){
      state.plan=recoveryDishes.map((entry,i)=>({...entry,date:isoLocalDate(dates[i].date)}));
      state.locked=Object.fromEntries(recoveryDishes.map(entry=>[entry.day,true]));
      save("recoveryV1Applied",true);
      save("state",state);
      renderWeekSection("this");
    }
  }
  // Correction: the v1 guess above was wrong (per the user, 2026-08-01). There is no
  // reliable source to recover the real plan from, so this only removes the incorrect
  // locks - and only if they still match exactly what v1 set, so we never clobber
  // anything the user has since done manually.
  if(load("recoveryV1Applied",false) && !load("recoveryV2Applied",false)){
    const wrongDishes={Sun:"lemon-herb-chicken-01",Mon:"grilled-cheese-soup-06",Tue:"beef-burgers-06",Wed:"loaded-baked-potato-03",Thu:"beef-tacos-07"};
    const stillMatches=(state.plan||[]).length===5 && (state.plan||[]).every(entry=>wrongDishes[entry.day]===entry.id) &&
      Object.keys(wrongDishes).every(day=>state.locked?.[day]);
    if(stillMatches){
      state.locked={};
      save("state",state);
      renderWeekSection("this");
    }
    save("recoveryV2Applied",true);
  }
  pullHouseholdState();
  startHouseholdPolling();
}
setTimeout(()=>{try{runValidationSuite()}catch(error){recordRuntimeError("validation",error.message)}},0);

window.__dinnerPlannerTest={
  recipeAllowed,
  recipeFamily,
  recipeProtein,
  getRecipe,
  categoryEmoji,
  mergePantryItem,
  checkForNewerDeployedBuild,
  displayedTime,
  targetKinds,
  hebrewDateParts,
  calendarRuleForDate,
  isObservedTishaBAv,
  plannerDates,
  recipeAllowedOnDate,
  buildPlan:(opts)=>buildPlanForWeek("this",opts),
  renderWeekSection,
  buildPlanForWeek,
  replaceDay,
  lockAllForWeek,
  getState:()=>JSON.parse(JSON.stringify(state)),
  setState:s=>{state=s},
  canonicalIngredient,
  parseQtyText,
  shoppingFromRecipes,
  shoppingCheckKey,
  setShoppingChecked,
  inventoryMatchesIngredient,
  setRecipeRating,
  scoreRecipe,
  isPlanStale,
  refreshCalendarIfDayChanged,
  setLastRenderedCalendarDayForTest:day=>{lastRenderedCalendarDay=day},
  createHousehold,
  joinHousehold,
  leaveHousehold,
  pullHouseholdState,
  buildSyncPayload,
  getHouseholdCode:()=>householdCode,
  downloadJson,
  showView,
  showWeekSubView,
  VIEW_SECTIONS,
  offerToDeleteScannedPhotos,
  getPendingCloudConflict:()=>pendingCloudState?{conflicts:cloudConflictsWithLocalLocks(pendingCloudState)}:null,
  resolveConflictKeepMine:()=>{pendingCloudState=null;renderHouseholdConflict(null);save("state",state);},
  resolveConflictUseTheirs:()=>{if(pendingCloudState){snapshotWeek("this");snapshotWeek("next");applyCloudState(pendingCloudState);}pendingCloudState=null;renderHouseholdConflict(null);},
  hasRestorableSnapshot,
  cloudConflictsWithLocalLocks,
  recordShabbosDurableBackup,
  hasShabbosDurableBackup,
  restoreShabbosDurableBackup,
  refreshPantryDependencies,
  importRecipeAndOpenEditor,
  offerCommunityShare,
  renderRecipePhotoGallery,
  renderRecipePhotoGalleryHtml,
  setCommunitySessionForTest:s=>{communitySession=s;},
  hasDurableLocks,
  restoreDurableLocks,
  recordDurableLock,
  clearDurableLock,
  restoreWeekSnapshot,
  snapshotWeek,
  renderShabbosSlots,
  shabbosSelectedRecipes,
  addShabbosDish:(mealKey,courseId,dish)=>{
    const course=state.shabbosMenu[mealKey].courses.find(c=>c.id===courseId);
    if(course)course.dishes.push({id:shabbosUid(),recipeId:null,custom:null,storeLink:"",...dish});
    refreshPantryDependencies({renderInventoryToo:false});
    renderShabbosSlots();
  },
  setShabbosMealEnabled:(key,enabled)=>{state.shabbosMenu[key].enabled=enabled;refreshPantryDependencies({renderInventoryToo:false});renderShabbosSlots();},
  shabbosSpecialsForCourse,
  openDishEditor,
  SHABBOS_TAKEOUT_MEALS,
  extractRecipeDocumentText,
  SHABBOS_SPECIALS};

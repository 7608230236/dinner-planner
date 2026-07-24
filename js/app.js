const APP_VERSION="60";
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
const save=(k,v)=>{
  try{
    localStorage.setItem(K+k,JSON.stringify(v));
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
  recentPlans:[]
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
    planNonce: Number.isFinite(Number(clean.planNonce)) ? Number(clean.planNonce) : 0
  };
}
state = normalizeState(state);
save("state",state);

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

function recipeAllowed(r){
  const text=JSON.stringify(r).toLowerCase();
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

function stableJitter(text){
  let h = 2166136261;
  for(let i=0;i<text.length;i++){
    h ^= text.charCodeAt(i);
    h = Math.imul(h,16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function scoreRecipe(r,targetKind,usedFamilies){
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

  const preferenceText=JSON.stringify(r).toLowerCase();
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

function chooseUniqueRecipe({usedIds,usedFamilies,targetKind,date,bannedIds=new Set()}){
  const allowed=RECIPES.filter(r=>recipeAllowed(r)&&recipeAllowedOnDate(r,date));
  let candidates=allowed.filter(r=>!usedIds.has(r.id)&&!bannedIds.has(r.id));
  if(!candidates.length) candidates=allowed.filter(r=>!usedIds.has(r.id));
  if(!candidates.length) candidates=allowed;
  return candidates.sort((a,b)=>scoreRecipe(b,targetKind,usedFamilies)-scoreRecipe(a,targetKind,usedFamilies))[0];
}

function buildPlanForWeek(weekKey="this",{replaceUnlocked=false}={}){
  state.planNonce=(state.planNonce||0)+1;
  const allowed=RECIPES.filter(recipeAllowed);
  const planField=planProp(weekKey);
  const lockedField=lockedProp(weekKey);
  if(!allowed.length){
    const target = weekKey==="next" ? "nextWeekList" : "weekList";
    $(target).innerHTML='<div class="notice">No recipes match these choices. Remove an exclusion and try again.</div>';
    return;
  }

  const oldPlan=[...(state[planField]||[])];
  const lockMap=state[lockedField]||{};
  const usedIds=new Set();
  const usedFamilies=new Set();
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
        continue;
      }
    }

    const banned=new Set();
    if(replaceUnlocked && old) banned.add(old.id);

    const chosen=chooseUniqueRecipe({
      usedIds,
      usedFamilies,
      targetKind:kinds[i],
      date,
      bannedIds:banned
    });

    if(chosen){
      newPlan.push({day,id:chosen.id,date:isoLocalDate(date)});
      usedIds.add(chosen.id);
      usedFamilies.add(recipeFamily(chosen));
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
}

function replaceDay(weekKey,day){
  const planField=planProp(weekKey);
  const plan=state[planField]||[];
  const index=plan.findIndex(p=>p.day===day);
  if(index<0)return;

  const current=plan[index];
  const dates=plannerDatesForWeek(weekKey);
  const date=dates[index].date;
  const usedIds=new Set(plan.filter(p=>p.day!==day).map(p=>p.id));
  const usedFamilies=new Set(plan.filter(p=>p.day!==day).map(p=>recipeFamily(getRecipe(p.id))));
  const chosen=chooseUniqueRecipe({
    usedIds,
    usedFamilies,
    targetKind:targetKinds(dates)[index],
    date,
    bannedIds:new Set([current.id])
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

function lockAllForWeek(weekKey="this"){
  const plan=state[planProp(weekKey)]||[];
  if(!plan.length)return false;
  const field=lockedProp(weekKey);
  const allLocked=plan.every(entry=>Boolean(state[field]?.[entry.day]));
  state[field]=Object.fromEntries(plan.map(entry=>[entry.day,!allLocked]));
  save("state",state);
  renderWeekSection(weekKey);
  return !allLocked;
}

function renderWeekSection(weekKey="this"){
  const plan=state[planProp(weekKey)]||[];
  const locks=state[lockedProp(weekKey)]||{};
  const target=weekKey==="next"?"nextWeekList":"weekList";
  const lockAllButton=$(weekKey==="next"?"lockNextWeekBtn":"lockWeekBtn");
  const allLocked=plan.length>0&&plan.every(entry=>Boolean(locks[entry.day]));
  if(lockAllButton){
    lockAllButton.disabled=!plan.length;
    lockAllButton.textContent=allLocked?"Unlock week":"Lock in week";
  }
  renderWeekDateRange(weekKey);

  if(!plan.length){
    $(target).innerHTML=weekKey==="next"
      ? '<div class="notice">Build next week when you want to shop ahead.</div>'
      : '<div class="notice">Press Build this week’s dinners to create a plan.</div>';
    return;
  }

  $(target).innerHTML=plan.map(p=>{
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
        <div class="meal-meta">${kindLabel(r.kind)} · ${esc(r.time)} · ${esc(r.cost||"")} · ${esc(r.desc)}</div>
        ${rule.note?`<div class="observance ${rule.type==='tisha'?'tisha':''}">${esc(rule.note)}</div>`:""}
      </div>
      <div class="meal-actions">
        <button type="button" class="btn small ${locked?'soft':'secondary'} lock ${locked?'on':''}" data-lock="${weekKey}:${p.day}">${locked?'Locked':'Lock'}</button>
        <button type="button" class="btn small secondary" data-replace="${weekKey}:${p.day}">Replace</button>
        <button type="button" class="btn small ghost" data-recipe="${weekKey}:${r.id}">Show recipe</button>
      </div>
    </div>`;
  }).join("");

  $(target).querySelectorAll("[data-lock]").forEach(btn=>{
    btn.onclick=()=>{
      const [wk,day]=btn.dataset.lock.split(":");
      const field=lockedProp(wk);
      state[field][day]=!state[field][day];
      save("state",state);
      renderWeekSection(wk);
    };
  });

  $(target).querySelectorAll("[data-replace]").forEach(btn=>btn.onclick=()=>{const [wk,day]=btn.dataset.replace.split(":");replaceDay(wk,day)});
  $(target).querySelectorAll("[data-recipe]").forEach(btn=>btn.onclick=()=>{const [wk,id]=btn.dataset.recipe.split(":");showRecipe(id,wk)});
}

function scaleQuantity(qty){
  if(!qty)return "";
  const match=String(qty).match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if(!match)return qty;
  const scaled=Number(match[1])*(state.portions/5);
  const rounded=Math.round(scaled*4)/4;
  return `${rounded} ${match[2]}`.trim();
}

function showRecipe(id,weekKey="this"){
  const r=getRecipe(id);
  if(!r)return;
  const haveMatches=matchHave(r);

  $("recipeModal").innerHTML=`
    <div class="row" style="justify-content:space-between">
      <button class="btn small secondary" type="button" onclick="$('recipeDialog').close()">← Close</button>
      <button class="btn small" type="button" onclick="addMissing('${r.id}','${weekKey}')">View shopping items</button>
    </div>
    <div class="recipe-head">
      <h2 style="margin:0">${esc(r.title)}</h2>
      <p class="muted">${esc(r.desc)}</p>
      <div class="chips">
        <span class="chip on">${kindLabel(r.kind)}</span>
        <span class="chip">${esc(r.hands)} hands-on</span>
        <span class="chip">${esc(r.time)} total</span>
        ${r.cost?`<span class="chip">About ${esc(r.cost)} per portion</span>`:""}
      </div>
    </div>
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
    </div>`;

  $("recipeDialog").showModal();
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
  scrollToSection("shopping");
}

function buildShoppingForWeek(weekKey){
  const recipes=(state[planProp(weekKey)]||[]).map(p=>getRecipe(p.id)).filter(Boolean);
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
            ${url?`<a class="btn small ghost" href="${esc(url)}" target="_blank" rel="noopener">Open store</a>`:`<button type="button" class="btn small ghost" onclick="scrollToSection('stores')">Choose store</button>`}
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

async function findNearbyStores(scope){
  const status=$(`${scope}Status`);
  const results=$(`${scope}Results`);
  status.textContent="Finding your location…";
  results.innerHTML="";

  if(!navigator.geolocation){
    status.textContent="Location is not available on this device.";
    return;
  }

  navigator.geolocation.getCurrentPosition(async position=>{
    save("location",{lat:position.coords.latitude,lng:position.coords.longitude});
    renderCalendar();
    status.textContent="Finding nearby kosher stores…";
    try{
      const response=await fetch(`${API_ORIGIN}/.netlify/functions/store-locator`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          lat:position.coords.latitude,
          lng:position.coords.longitude,
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
  },()=>{
    status.textContent="Allow location access to see nearby stores.";
  },{enableHighAccuracy:false,timeout:12000,maximumAge:300000});
}

function pantryPhotoById(id){
  return (state.pantryPhotos||[]).find(p=>p.id===id);
}

function categoryEmoji(category){
  return ({produce:"🥬",meat:"🥩",dairy:"🥛",frozen:"❄️","dry goods":"🥫",canned:"🥫",condiment:"🧂",other:"🍽️"})[category]||"🍽️";
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

function parseQtyText(text){
  return IngredientEngine.parseQtyText(text);
}

function pantryAvailableFor(canonical,requiredUnit){
  return IngredientEngine.pantryAvailableFor(state.have||[],canonical,requiredUnit);
}

function confidenceRank(value){return ({low:1,medium:2,high:3,user:4})[value]||0}

function logEvent(type,detail={}){
  state.debugLog=[...(state.debugLog||[]),{at:new Date().toISOString(),type,detail}].slice(-200);
  try{save("state",state)}catch{}
}

function mergePantryItem(incoming){
  const key=pantryItemKey(incoming.item);
  const incomingUnit=normalizeUnit(incoming.unit)||"each";
  const existing=(state.have||[]).find(item=>pantryItemKey(item.item)===key && (normalizeUnit(item.unit)||"each")===incomingUnit);
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
        <div class="scan-photo-status">${p.status==="scanning"?"Analyzing…":p.status==="scanned"?`${p.detectedCount||0} clear items`:p.status==="error"?"Could not be read":"Ready to scan"}</div>
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
    const source=pantryPhotoById((item.sourcePhotoIds||[])[0]);
    const confidence=item.confidence||"medium";
    const image=item.thumbnail || (source&&source.image) || "";
    const confidenceText=confidence==="user"?"Confirmed by you":confidence==="high"?"High confidence":"Needs review";
    return `<div class="inventory-card">
      ${image?`<img src="${image}" alt="${item.thumbnail?"Detected item":"Source photo"} for ${esc(item.item)}">`:`<div class="inventory-fallback">${categoryEmoji(item.category)}</div>`}
      <div class="inventory-body">
        <div class="inventory-name">${esc(item.item)}</div>
        <div class="inventory-qty">${esc(formatQty(item))}</div>
        <span class="confidence ${confidence}">${confidenceText}</span>
        ${item.evidence?`<div class="inventory-evidence">Seen as: ${esc(item.evidence)}</div>`:""}
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

async function cropItemThumbnail(dataUrl,bbox,maxDimension=320,quality=.72){
  if(!Array.isArray(bbox)||bbox.length!==4)return "";
  const values=bbox.map(Number);
  if(values.some(v=>!Number.isFinite(v)))return "";
  const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=dataUrl});
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
      for(const item of items){
        const name=String(item.name||item.item||"").trim();
        if(!name)continue;
        rawRecognized++;
        let thumbnail="";
        try{thumbnail=await cropItemThumbnail(picture.image,item.bbox)}catch{}
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
}

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
  const suggestions=RECIPES.filter(recipeAllowed).map(r=>{
    const ingredients=r.ingredients.map(([name])=>name).filter(name=>name && !/optional|oil spray|olive oil/i.test(name));
    const matched=ingredients.filter(inventoryMatchesIngredient).length;
    const missing=Math.max(0,ingredients.length-matched);
    return {r,matched,missing,total:ingredients.length,score:matched*4-missing};
  }).filter(x=>x.matched>0).sort((a,b)=>b.score-a.score||a.missing-b.missing).slice(0,5);
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

function downloadJson(filename,data){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
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
$("quickShareSupportBtn").onclick=()=>{
  const report=makeSupportReport(true);
  downloadJson(`dinner-planner-support-${new Date().toISOString().slice(0,10)}.json`,report);
  if($("supportStatus")){
    $("supportStatus").className="notice success";
    $("supportStatus").textContent="Support file downloaded. Attach it in ChatGPT using the + button.";
  }
  logEvent("support_report_downloaded",{reportId:report.reportId,photosIncluded:true,source:"quick"});
};

$("downloadSupportBtn").onclick=()=>{
  const report=makeSupportReport($("includeSupportPhotos").checked);
  downloadJson(`dinner-planner-support-${new Date().toISOString().slice(0,10)}.json`,report);
  $("supportStatus").className="notice success";
  $("supportStatus").textContent="Support file downloaded. Upload it in our ChatGPT conversation.";
  logEvent("support_report_downloaded",{reportId:report.reportId,photosIncluded:$("includeSupportPhotos").checked});
};

$("copySupportBtn").onclick=async()=>{
  const report=makeSupportReport(false);
  try{
    await navigator.clipboard.writeText(JSON.stringify(report,null,2));
    $("supportStatus").className="notice success";
    $("supportStatus").textContent="Report copied. You can paste it into the chat.";
  }catch{
    downloadJson("dinner-planner-support.json",report);
    $("supportStatus").className="notice warning";
    $("supportStatus").textContent="Copying was blocked, so the report was downloaded instead.";
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

$("savePrefsBtn").onclick=()=>{save("state",state);scrollToSection("weekSettings")};

function runBuild(weekKey="this",replaceUnlocked=false){
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
    requestAnimationFrame(()=>scrollToSection(weekKey==="next"?"nextWeek":"week"));
  }catch(error){
    console.error(error);
    state[planProp(weekKey)]=[];
    state[lockedProp(weekKey)]={};
    buildShoppingForWeek(weekKey);
    save("state",state);
    renderWeekSection(weekKey);
    renderShopping();
    status.textContent=weekKey==="next"?"Next week could not be built. Tap the button once more.":"The week could not be built. Tap the button once more.";
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
$("usePantryBtn").onclick=()=>scrollToSection("pantry");
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
  add("version-badge",$("versionBadge")?.textContent?.trim()===`v${APP_VERSION}`,"Visible version badge matches the app version",{badge:$("versionBadge")?.textContent||""});
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
  getCacheName:()=>`dinner-made-easy-v${APP_VERSION}`
};

async function prepareCurrentAppVersion(){
  const versionKey=`${K}appVersion`;
  const previous=localStorage.getItem(versionKey);
  if(previous!==APP_VERSION){
    // v60 migration: install the household's agreed permanent preference defaults
    // and remove the obsolete weekly pantry-first toggle (pantry-first is automatic).
    state.prefs=[...new Set([...(state.prefs||[]),...PREFS])];
    state.week=(state.week||[]).filter(value=>value!=="Use what I have first");
    save("state",state);
    localStorage.setItem(versionKey,APP_VERSION);
    try{
      if("caches" in window){for(const key of await caches.keys()){if(key.startsWith("dinner-made-easy-")&&key!==`dinner-made-easy-v${APP_VERSION}`)await caches.delete(key)}}
      if("serviceWorker" in navigator){for(const reg of await navigator.serviceWorker.getRegistrations())await reg.update()}
    }catch{}
    logEvent("app_version_changed",{from:previous||"unknown",to:APP_VERSION});
  }
}
prepareCurrentAppVersion();
if("serviceWorker" in navigator){
  navigator.serviceWorker.register(`/service-worker.js?v=${APP_VERSION}`,{updateViaCache:"none"}).catch(()=>{});
}
renderPrefs();
renderCalendar();
renderStoreSelection("meat");
renderStoreSelection("supermarket");
renderWeekSection("this");
renderWeekSection("next");
renderHave();
buildShoppingForWeek("this");
buildShoppingForWeek("next");
save("state",state);
renderShopping();
setTimeout(()=>{try{runValidationSuite()}catch(error){recordRuntimeError("validation",error.message)}},0);

window.__dinnerPlannerTest={
  recipeAllowed,
  recipeFamily,
  targetKinds,
  hebrewDateParts,
  calendarRuleForDate,
  isObservedTishaBAv,
  plannerDates,
  recipeAllowedOnDate,
  buildPlan:(opts)=>buildPlanForWeek("this",opts),
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
  inventoryMatchesIngredient
};

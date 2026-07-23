(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  root.DinnerIngredientEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const GENERIC=/^(pantry|spices?|various jars?|canned goods?|food|groceries|containers?|produce|vegetables?|fruit|meat|dairy|frozen food)$/i;
  const OPTIONAL=/\b(optional|if wanted|as needed|to taste|for serving|mild)\b/i;
  const TRUSTED_CONFIDENCE=new Set(['high','user']);

  function cleanName(value){
    return String(value||'').toLowerCase().trim()
      .replace(/\b(organic|large|small|medium|whole|shredded|sliced|fresh|yellow|red|green|white)\b/g,' ')
      .replace(/\bchick[ -]?peas\b/g,'chickpea')
      .replace(/\bgarbanzo beans?\b/g,'chickpea')
      .replace(/\bmayonnaise\b/g,'mayo')
      .replace(/\bkernel corn\b/g,'corn')
      .replace(/[^a-z0-9]+/g,' ')
      .replace(/\s+/g,' ').trim();
  }

  function canonicalIngredient(value){
    const raw=String(value||'').toLowerCase();
    const n=cleanName(value);
    if(!n)return '';

    // Tomato forms are intentionally never interchangeable.
    if(/\btomato paste\b/.test(n))return 'tomato paste';
    if(/\btomato sauce\b|\bmarinara\b|\bpasta sauce\b/.test(n))return 'tomato sauce';
    if(/\b(canned|diced|crushed|peeled|stewed) tomato/.test(n)||/\btomato(?:es)? canned\b/.test(n))return 'canned tomato';
    if(/\bfrozen\b/.test(raw)&&/\btomato(?:es)?\b/.test(raw))return 'frozen tomato';
    if(/\btomato(?:es)?\b/.test(n))return 'fresh tomato';

    if(/\bcream cheese\b/.test(n))return 'cream cheese';
    if(/\bheavy cream\b|\bwhipping cream\b/.test(n))return 'heavy cream';
    if(/\bsour cream\b/.test(n))return 'sour cream';
    if(/\bmozzarella\b/.test(n))return 'mozzarella cheese';
    if(/\bcheddar\b/.test(n))return 'cheddar cheese';
    if(/\bricotta\b/.test(n))return 'ricotta cheese';
    if(/\b(cholov yisroel )?cheese\b/.test(n))return 'cheese';

    if(/\bchicken (breast|cutlet)s?\b/.test(n))return 'chicken breast';
    if(/\bchicken thigh(s)?\b/.test(n))return 'chicken thigh';
    if(/\bchicken drumstick(s)?\b/.test(n))return 'chicken drumstick';
    if(/\bground beef\b/.test(n))return 'ground beef';
    if(/\bbeef strip(s)?\b/.test(n))return 'beef strips';

    if(/\b(spaghetti|ziti|macaroni|penne|rigatoni|fusilli|rotini|pasta)\b/.test(n))return 'pasta';
    if(/\borzo\b/.test(n))return 'orzo';
    if(/\b(lo mein|egg noodles?|noodles?)\b/.test(n))return 'noodles';
    if(/\bfrozen peas?\b/.test(n))return 'frozen peas';
    if(/\bfrozen corn\b/.test(n))return 'frozen corn';
    if(/\bwraps?|tortillas?\b/.test(n))return 'wraps';
    if(/\bburger buns?|hamburger buns?\b/.test(n))return 'burger buns';

    const singular=n
      .replace(/\btomatoes\b/g,'tomato')
      .replace(/\bonions\b/g,'onion')
      .replace(/\beggs\b/g,'egg')
      .replace(/\bcarrots\b/g,'carrot')
      .replace(/\bcucumbers\b/g,'cucumber')
      .replace(/\bpotatoes\b/g,'potato')
      .replace(/\bpeppers\b/g,'pepper')
      .replace(/\bcloves\b/g,'clove')
      .replace(/\s+/g,' ').trim();
    return singular;
  }

  function normalizeUnit(value){
    const u=String(value||'').toLowerCase().trim().replace(/\.$/,'');
    if(!u||u==='unknown')return '';
    if(/^(each|ea|piece|pieces|pc|pcs|count)$/.test(u))return 'each';
    if(/^(package|packages|pkg|pkgs|pack|packs)$/.test(u))return 'package';
    if(/^(jar|jars)$/.test(u))return 'jar';
    if(/^(can|cans)$/.test(u))return 'can';
    if(/^(bag|bags)$/.test(u))return 'bag';
    if(/^(box|boxes)$/.test(u))return 'box';
    if(/^(bottle|bottles)$/.test(u))return 'bottle';
    if(/^(container|containers|tub|tubs)$/.test(u))return 'container';
    if(/^(lb|lbs|pound|pounds)$/.test(u))return 'lb';
    if(/^(oz|ounce|ounces)$/.test(u))return 'oz';
    if(/^(cup|cups|cups dry)$/.test(u))return 'cup';
    if(/^(tbsp|tablespoon|tablespoons)$/.test(u))return 'tbsp';
    if(/^(tsp|teaspoon|teaspoons)$/.test(u))return 'tsp';
    if(/^(clove|cloves)$/.test(u))return 'clove';
    if(/^(bulb|bulbs|head|heads)$/.test(u))return 'bulb';
    if(/^(gallon|gallons|gal)$/.test(u))return 'gallon';
    if(/^(loaf|loaves)$/.test(u))return 'loaf';
    if(/^(bunch|bunches)$/.test(u))return 'bunch';
    return u;
  }

  function parseNumber(raw){
    const value=String(raw||'').trim();
    if(/^\d+(?:\.\d+)?$/.test(value))return Number(value);
    const mixed=value.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if(mixed)return Number(mixed[1])+Number(mixed[2])/Number(mixed[3]);
    const frac=value.match(/^(\d+)\/(\d+)$/);
    if(frac&&Number(frac[2]))return Number(frac[1])/Number(frac[2]);
    return null;
  }

  function parseQtyText(text){
    const raw=String(text||'').trim();
    const optional=OPTIONAL.test(raw);
    const cleaned=raw.replace(OPTIONAL,' ').replace(/\s+/g,' ').trim();
    const m=cleaned.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*(.*)$/);
    if(!m)return {amount:null,unit:'',raw,optional};
    const amount=parseNumber(m[1]);
    return {amount,unit:normalizeUnit(m[2])||'each',raw,optional};
  }

  function isTrusted(item){
    return Boolean(item&&(
      item.reviewed || TRUSTED_CONFIDENCE.has(String(item.confidence||'').toLowerCase())
    ));
  }

  function convertQuantity(amount,fromUnit,toUnit,canonical){
    if(!Number.isFinite(Number(amount)))return null;
    const from=normalizeUnit(fromUnit)||'each';
    const to=normalizeUnit(toUnit)||'each';
    const value=Number(amount);
    if(from===to)return value;
    if(from==='lb'&&to==='oz')return value*16;
    if(from==='oz'&&to==='lb')return value/16;
    if(from==='gallon'&&to==='cup')return value*16;
    if(from==='cup'&&to==='gallon')return value/16;
    if(from==='cup'&&to==='tbsp')return value*16;
    if(from==='tbsp'&&to==='cup')return value/16;
    if(from==='tbsp'&&to==='tsp')return value*3;
    if(from==='tsp'&&to==='tbsp')return value/3;
    if(canonical==='garlic'&&from==='bulb'&&to==='clove')return value*8;
    if(canonical==='garlic'&&from==='clove'&&to==='bulb')return value/8;
    return null;
  }

  function pantryAvailableFor(inventory,canonical,requiredUnit){
    const target=canonicalIngredient(canonical);
    const unit=normalizeUnit(requiredUnit)||'each';
    let total=0;
    let present=false;
    const sources=[];
    for(const item of Array.isArray(inventory)?inventory:[]){
      if(canonicalIngredient(item.item||item.name)!==target)continue;
      if(!isTrusted(item))continue;
      const qty=Number(item.qty);
      if(Number.isFinite(qty)&&qty>0)present=true;
      if(!Number.isFinite(qty)||qty<=0)continue;
      const converted=convertQuantity(qty,item.unit,unit,target);
      if(converted===null)continue;
      total+=converted;
      sources.push({id:item.id||'',qty,unit:normalizeUnit(item.unit)||'each',converted});
    }
    return {canonical:target,unit,total,present,sources};
  }

  function validateDetectedItem(item){
    const reasons=[];
    const name=String(item?.name||item?.item||'').trim();
    if(!name)reasons.push('missing name');
    if(GENERIC.test(name))reasons.push('generic description');
    const qty=Number(item?.qty);
    if(item?.qty!==''&&item?.qty!==null&&item?.qty!==undefined&&(!Number.isFinite(qty)||qty<0||qty>100))reasons.push('implausible quantity');
    const confidence=String(item?.confidence||'medium').toLowerCase();
    if(!['high','medium','user'].includes(confidence))reasons.push('invalid confidence');
    const evidence=String(item?.evidence||'').trim();
    if(confidence==='medium'&&!evidence)reasons.push('medium confidence without visible evidence');
    if(String(item?.quantityBasis||'')==='label'&&Number.isFinite(qty)&&!new RegExp(`\\b${Math.trunc(qty)}\\b`).test(evidence))reasons.push('label quantity not supported by evidence');
    return {ok:reasons.length===0,reasons,name,canonical:canonicalIngredient(name)};
  }

  function formatAmount(amount,unit){
    const rounded=Math.round(Number(amount)*100)/100;
    if(!unit)return String(rounded);
    const plural=rounded===1?'':(unit==='each'?'':unit==='box'?'es':'s');
    return `${rounded} ${unit}${plural}`;
  }

  function buildShopping(recipes,inventory,portions=5){
    const aggregated=[];
    const diagnostics=[];
    const scale=Number(portions)/5;
    for(const recipe of Array.isArray(recipes)?recipes:[]){
      for(const pair of recipe.ingredients||[]){
        const name=pair?.[0];
        const rawQty=pair?.[1]||'';
        if(!name||/^(oil spray|olive oil)$/i.test(name))continue;
        const parsed=parseQtyText(rawQty);
        if(parsed.optional)continue;
        const canonical=canonicalIngredient(name);
        const store=(recipe.store==='meat'&&/(chicken|beef|ground|cutlet|thigh|drumstick)/i.test(name))?'meat':'supermarket';
        const amount=parsed.amount===null?null:parsed.amount*scale;
        let row=aggregated.find(x=>x.canonical===canonical&&x.store===store&&x.unit===parsed.unit);
        if(!row){
          row={name,canonical,store,unit:parsed.unit,amount:amount,texts:amount===null&&rawQty?[rawQty]:[],recipes:[recipe.title]};
          aggregated.push(row);
        }else{
          if(amount!==null)row.amount=(row.amount||0)+amount;
          if(rawQty&&amount===null&&!row.texts.includes(rawQty))row.texts.push(rawQty);
          if(!row.recipes.includes(recipe.title))row.recipes.push(recipe.title);
        }
      }
    }

    const shopping=[];
    for(const row of aggregated){
      const available=pantryAvailableFor(inventory,row.canonical,row.unit);
      if(row.amount!==null){
        const required=Math.max(0,row.amount);
        const used=Math.min(required,available.total);
        const remaining=Math.max(0,required-used);
        diagnostics.push({...row,required,available:available.total,used,remaining,sources:available.sources});
        if(remaining>0)shopping.push({name:row.name,qty:formatAmount(remaining,row.unit),store:row.store,canonical:row.canonical,pantryUsed:used,required,available:available.total,recipes:row.recipes});
      }else{
        diagnostics.push({...row,required:null,available:available.total,used:available.present?1:0,remaining:available.present?0:null,sources:available.sources});
        if(!available.present)shopping.push({name:row.name,qty:row.texts.join(', '),store:row.store,canonical:row.canonical,pantryUsed:0,required:null,available:0,recipes:row.recipes});
      }
    }
    return {shopping,diagnostics};
  }

  return {
    canonicalIngredient,normalizeUnit,parseQtyText,convertQuantity,pantryAvailableFor,
    validateDetectedItem,buildShopping,isTrusted,formatAmount,GENERIC
  };
});

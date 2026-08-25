import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
async function loadRecipes(){
  const context=vm.createContext({window:{}});
  const code=await readFile(resolve(root,'js/recipes.js'),'utf8');
  vm.runInContext(code,context);
  return context.window.DinnerRecipes;
}

test('recipe library contains 762 weekday dinners plus a curated set of Shabbos specials (762, not 738 - added 24 genuinely new dishes across 8 new families, e.g. beef stuffed peppers, chicken pot pie, beef barley soup, honey-glazed sheet-pan chicken thighs, Persian jeweled rice, Moroccan beef tagine, in response to tester feedback that the library felt repetitive - the old 738 recipes were only 131 truly distinct base dishes, each cloned 5-6x with nothing but a different side dish swapped in)',async()=>{
  const recipes=await loadRecipes();
  assert.equal(recipes.length,762);
  assert.equal(new Set(Array.from(recipes,r=>r.id)).size,762);
  assert.equal(new Set(Array.from(recipes,r=>r.title)).size,762);
  assert.ok(recipes.every(r=>r.family&&r.kind&&r.tags.length&&r.ingredients.length>=4&&r.steps.length===4));
  assert.equal(new Set(Array.from(recipes,r=>r.family)).size,139);
  assert.equal(recipes.filter(r=>r.tags.includes('shabbos')).length,31,'the curated Shabbos specials should be tagged shabbos');
});

test('no recipe pairs two competing primary-carb ingredients (the actual bug: 65 recipes like "Caprese Pasta — with Rice" or "Chicken Shepherd\'s Pie — with Quinoa" told you to cook a second starch alongside a dish that was already pasta/orzo/rice/noodle/potato-based)',async()=>{
  const recipes=await loadRecipes();
  const STARCH_PATTERNS=[
    {label:"rice",re:/^rice$|^basmati rice$|^brown rice$|^white rice$/i},
    {label:"quinoa",re:/^quinoa$/i},
    {label:"pasta",re:/^pasta$|^small pasta$/i},
    {label:"orzo",re:/^orzo$/i},
    {label:"noodles",re:/noodle/i},
    {label:"couscous",re:/^couscous$/i},
    {label:"bulgur",re:/bulgur/i},
    {label:"potato",re:/^potato(es)?$|mashed potato|roasted potato/i},
  ];
  const offenders=recipes.filter(r=>{
    const found=new Set();
    for(const [name] of (r.ingredients||[])){
      const n=String(name).trim();
      for(const p of STARCH_PATTERNS){ if(p.re.test(n)) found.add(p.label); }
    }
    return found.size>=2;
  });
  assert.equal(offenders.length,0,`recipes with two competing starches: ${offenders.map(r=>r.title).join(', ')}`);
});

test('recipe mix has enough meat, dairy, pareve, and break-fast choices',async()=>{
  const recipes=await loadRecipes();
  const counts=Object.fromEntries(['meat','dairy','pareve'].map(kind=>[kind,recipes.filter(r=>r.kind===kind).length]));
  assert.deepEqual(counts,{meat:408,dairy:200,pareve:154});
  assert.ok(recipes.filter(r=>r.tags.includes('break-fast')).length>=6);
});

test('library enforces household kosher and ingredient rules (fish is a weekday-only ban - the user explicitly allows it for Shabbos - so Shabbos-tagged recipes are exempt from that one check only; every other ban, including tofu/turkey/banned vegetables/spicy, stays universal with no Shabbos exception)',async()=>{
  const recipes=await loadRecipes();
  const fishBanned=/fish|salmon|tuna/i;
  const alwaysBanned=/tofu|turkey|broccoli|cauliflower|cilantro|jalape|habanero|serrano|cayenne/i;
  const dairy=/milk|cream|cheese|butter|ricotta|mozzarella|cheddar|parmesan/i;
  for(const recipe of recipes){
    const text=JSON.stringify(recipe);
    if(!recipe.tags.includes('shabbos'))assert.doesNotMatch(text,fishBanned,recipe.id);
    assert.doesNotMatch(text,alwaysBanned,recipe.id);
    if(recipe.kind==='meat')assert.doesNotMatch(text,dairy,recipe.id);
    if(recipe.kind==='dairy')assert.match(text,/Cholov Yisroel/,recipe.id);
    assert.ok(Number.parseInt(recipe.hands,10)<=20,recipe.id);
    const total=Number.parseInt(recipe.time,10);
    assert.ok(total<=35||recipe.tags.includes('oven')||recipe.tags.includes('bbq')||recipe.tags.includes('shabbos')||recipe.tags.includes('slow-cooker'),`${recipe.id} exceeds the non-oven time limit`);
  }
});

test('cooking steps are actionable, not vague filler (the actual bug: "cook until fully cooked" with no time, temp, or technique, and two recipes literally repeating the same step twice)',async()=>{
  const recipes=await loadRecipes();
  const vague=/^cook until fully cooked\.?$/i;
  for(const recipe of recipes){
    assert.equal(new Set(recipe.steps).size,recipe.steps.length,`${recipe.id} has a literal duplicate step`);
    assert.ok(
      recipe.steps.some(s=>/\d/.test(s)),
      `${recipe.id} has no time, temperature, or quantity in any step - purely vague instructions`
    );
    for(const step of recipe.steps){
      assert.ok(!vague.test(step.trim()),`${recipe.id} has a fully generic, non-actionable step: "${step}"`);
    }
  }
});

test('a recipe\'s declared total time is honest about what its own steps actually require (the actual bug: birria declared "90 min" while its own step said to braise 2.5-3 hours)',async()=>{
  const recipes=await loadRecipes();
  for(const recipe of recipes){
    const declaredMin=Number.parseInt(recipe.time,10);
    const allSteps=recipe.steps.join(' ');
    for(const hm of allSteps.matchAll(/(\d+(?:\.\d+)?)-?(\d+(?:\.\d+)?)?\s*hours?/gi)){
      const hi=hm[2]?Number.parseFloat(hm[2]):Number.parseFloat(hm[1]);
      assert.ok(hi*60<=declaredMin,`${recipe.id} declares "${recipe.time}" but a step says "${hm[0]}"`);
    }
    for(const mm of allSteps.matchAll(/(\d+)-?(\d+)?\s*minutes?/gi)){
      const hi=mm[2]?Number.parseFloat(mm[2]):Number.parseFloat(mm[1]);
      assert.ok(hi<=declaredMin+5,`${recipe.id} declares "${recipe.time}" but a step says "${mm[0]}"`);
    }
  }
});

test('no Shabbos-tagged recipe is ever dairy (the actual bug: two salmon recipes used real Cholov Yisroel butter and were offered in the same Fish course pool as meat mains at a meat Shabbos meal - fixed to pareve margarine)',async()=>{
  const recipes=await loadRecipes();
  const shabbosDairy=recipes.filter(r=>r.tags.includes('shabbos')&&r.kind==='dairy');
  assert.deepEqual(Array.from(shabbosDairy).map(r=>r.id),[],'no Shabbos recipe should be dairy, since Friday night/Shabbos day are meat meals');
});

test('specific recipes that used to instruct adding an ingredient (garlic, onion, flour) never listed in the ingredients array - meaning it was never on the shopping list - now include it (the actual bug the user hit: they shopped from the app\'s list and came up short on ingredients the steps actually needed)',async()=>{
  const recipes=await loadRecipes();
  const byId=Object.fromEntries(Array.from(recipes,r=>[r.id,r]));

  const garlicIds=['sloppy-joes-02','sloppy-joes-03','sloppy-joes-04','sloppy-joes-05','sloppy-joes-06','sloppy-joes-07','sloppy-joes-09','sloppy-joes-10','beef-tacos-01','beef-tacos-03','beef-tacos-04','beef-tacos-05','beef-tacos-06','beef-tacos-07','beef-tacos-08','beef-tacos-09','beef-tacos-10','dairy-risotto-02','dairy-risotto-03','dairy-risotto-04','dairy-risotto-05','dairy-risotto-06','dairy-risotto-07','dairy-risotto-09','dairy-risotto-10'];
  for(const id of garlicIds){
    const r=byId[id];
    assert.ok(r,`${id} should exist`);
    assert.ok(r.ingredients.some(([name])=>/garlic/i.test(name)),`${id}'s steps call for garlic but it's missing from the ingredients list`);
  }

  const flourIds=['chicken-piccata-style-01','chicken-piccata-style-02','chicken-piccata-style-03','chicken-piccata-style-04','chicken-piccata-style-05'];
  for(const id of flourIds){
    const r=byId[id];
    assert.ok(r,`${id} should exist`);
    assert.ok(r.ingredients.some(([name])=>/^flour$/i.test(name)),`${id}'s steps call for flouring the chicken but flour is missing from the ingredients list`);
  }

  const onionIds=['pareve-tomato-pasta-02','pareve-tomato-pasta-03','pareve-tomato-pasta-04','pareve-tomato-pasta-05','pareve-tomato-pasta-06','pareve-tomato-pasta-07','pareve-tomato-pasta-08','pareve-tomato-pasta-09','pareve-tomato-pasta-10','rice-beans-02','rice-beans-03','rice-beans-04','rice-beans-05','rice-beans-06','rice-beans-07','rice-beans-08','rice-beans-09','rice-beans-10'];
  for(const id of onionIds){
    const r=byId[id];
    assert.ok(r,`${id} should exist`);
    assert.ok(r.ingredients.some(([name])=>/onion/i.test(name)),`${id}'s steps call for onion but it's missing from the ingredients list`);
    // The onion must also have a real cooking instruction, not just be listed with nothing to do with it.
    const stepsText=r.steps.join(' ').toLowerCase();
    assert.match(stepsText,/onion/,`${id} lists onion but never actually instructs cooking it anywhere in the steps`);
    assert.doesNotMatch(stepsText,/sautéed onion/i,`${id} should no longer reference a pre-cooked onion with no prep step of its own`);
  }
});

test('no recipe ends with a vague "Serve with/over X" step that never explains how to make X (the actual bug the user hit: a recipe listed 3 lb of potatoes as an ingredient and titled itself "with Oven Wedges", but the only instruction was "Serve with oven potato wedges" - no temperature, no time, no technique)',async()=>{
  const recipes=await loadRecipes();
  const stillVague=recipes.filter(r=>{
    const last=r.steps[r.steps.length-1];
    if(/broth for dipping/i.test(last))return false; // birria/gefilte fish - the broth is the dish's own cooking liquid, not a separate side
    return /^Serve (with|over)\s/i.test(last) && last.split(' ').length<=8;
  });
  assert.deepEqual(Array.from(stillVague).map(r=>r.id),[],'these recipes still end with a vague, uninstructed "Serve with X" step');
});

test('no recipe\'s only "seasoning" is salted pasta/starch boiling water while the actual sauce or dish itself has none (the actual bug the user caught: Creamy Tomato Pasta boiled its pasta in salted water but the cream-tomato sauce itself - the actual dish - had zero salt, pepper, or herbs anywhere; this was missed by an earlier seasoning pass because "well-salted water" contains the substring "salt" and was wrongly counted as the dish being seasoned)',async()=>{
  const recipes=await loadRecipes();
  const suspect=Array.from(recipes).filter(r=>{
    const stepsText=r.steps.join(' ');
    const hasRealSeasoning=/\b(season|seasoning|black pepper|paprika|cumin|oregano|basil|thyme|garam masala|saffron|turmeric|cinnamon|sesame|ginger|shawarma|soy sauce)\b/i.test(stepsText);
    const onlySaltMention=/salted (water|boiling)/i.test(stepsText) && !/\bsalt\b(?!ed (water|boiling))/i.test(stepsText.replace(/salted (water|boiling)/gi,''));
    return onlySaltMention && !hasRealSeasoning;
  });
  assert.deepEqual(suspect.map(r=>r.id),[],'these recipes only mention salt in the context of boiling water for pasta/starch - the actual dish itself is still unseasoned');
});

test('no recipe tells you to season with salt or pepper in its steps without listing salt/pepper as an ingredient (the actual bug: 201 of 762 recipes told you to "season all over with salt, pepper..." but salt and pepper never appeared in the ingredients list, so there was no way to know from the ingredients alone that you needed it or how much)',async()=>{
  const recipes=await loadRecipes();
  const missing=recipes.filter(r=>{
    const stepsText=r.steps.join(' ').toLowerCase();
    const ingNames=r.ingredients.map(([name])=>name.toLowerCase());
    const mentionsSalt=/\bsalt\b/.test(stepsText);
    const mentionsPepper=/\bpepper\b/.test(stepsText) && !/bell pepper|sweet pepper|chili pepper/.test(stepsText);
    const hasSaltIng=ingNames.some(n=>n.includes('salt'));
    const hasPepperIng=ingNames.some(n=>n.includes('pepper') && !n.includes('bell') && !n.includes('sweet'));
    return (mentionsSalt && !hasSaltIng) || (mentionsPepper && !hasPepperIng);
  });
  assert.equal(missing.length,0,`recipes referencing salt/pepper in steps but missing from ingredients: ${missing.map(r=>r.id).join(', ')}`);
});

test('no recipe gives two cooking methods in one ambiguous run-on sentence with no clear primary method (the actual bug: "cook chicken 6-7 minutes per side, or bake at 400°F for 22-25 minutes, until it reaches 165°F" reads as one instruction but is actually two unrelated methods with the doneness check ambiguously attached to whichever one you happened to pick)',async()=>{
  const recipes=await loadRecipes();
  const ambiguous=recipes.filter(r=>/or (bake|roast|grill|cook)[^.]* at \d/i.test(r.steps.join(' ')));
  assert.equal(ambiguous.length,0,`recipes with an ambiguous dual-method step: ${ambiguous.map(r=>r.id).join(', ')}`);
});

test('every bread-derived ingredient is labeled Pas Yisroel, the same way every dairy ingredient is labeled Cholov Yisroel - added in response to the household confirming this is a real, kept standard, not just Chabad minhag for meat/dairy',async()=>{
  const recipes=await loadRecipes();
  const breadWords=/\b(pita|bread|bun|buns|bagel|baguette|challah|tortilla|naan|roll|rolls|breadcrumbs?|matzo|matzah|pretzel)\b/i;
  const missing=recipes.filter(r=>r.ingredients.some(([name])=>breadWords.test(name) && !/pas yisroel/i.test(name)));
  assert.equal(missing.length,0,`recipes with an unlabeled bread ingredient: ${missing.map(r=>r.id).join(', ')}`);
});


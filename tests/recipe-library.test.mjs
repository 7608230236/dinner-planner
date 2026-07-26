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

test('recipe library contains 750 unique complete dinners',async()=>{
  const recipes=await loadRecipes();
  assert.equal(recipes.length,750);
  assert.equal(new Set(Array.from(recipes,r=>r.id)).size,750);
  assert.equal(new Set(Array.from(recipes,r=>r.title)).size,750);
  assert.ok(recipes.every(r=>r.family&&r.kind&&r.tags.length&&r.ingredients.length>=4&&r.steps.length===4));
  assert.equal(new Set(Array.from(recipes,r=>r.family)).size,100);
});

test('recipe mix has enough meat, dairy, pareve, and break-fast choices',async()=>{
  const recipes=await loadRecipes();
  const counts=Object.fromEntries(['meat','dairy','pareve'].map(kind=>[kind,recipes.filter(r=>r.kind===kind).length]));
  assert.deepEqual(counts,{meat:375,dairy:225,pareve:150});
  assert.ok(recipes.filter(r=>r.tags.includes('break-fast')).length>=6);
});

test('library enforces household kosher and ingredient rules',async()=>{
  const recipes=await loadRecipes();
  const banned=/fish|salmon|tuna|tofu|turkey|broccoli|cauliflower|cilantro|jalape|habanero|serrano|cayenne/i;
  const dairy=/milk|cream|cheese|butter|ricotta|mozzarella|cheddar|parmesan/i;
  for(const recipe of recipes){
    const text=JSON.stringify(recipe);
    assert.doesNotMatch(text,banned,recipe.id);
    if(recipe.kind==='meat')assert.doesNotMatch(text,dairy,recipe.id);
    if(recipe.kind==='dairy')assert.match(text,/Cholov Yisroel/,recipe.id);
    assert.ok(Number.parseInt(recipe.hands,10)<=20,recipe.id);
    const total=Number.parseInt(recipe.time,10);
    assert.ok(total<=35||recipe.tags.includes('oven')||recipe.tags.includes('bbq'),`${recipe.id} exceeds the non-oven time limit`);
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

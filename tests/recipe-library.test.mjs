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

test('recipe library contains 500 unique complete dinners',async()=>{
  const recipes=await loadRecipes();
  assert.equal(recipes.length,500);
  assert.equal(new Set(Array.from(recipes,r=>r.id)).size,500);
  assert.equal(new Set(Array.from(recipes,r=>r.title)).size,500);
  assert.ok(recipes.every(r=>r.family&&r.kind&&r.tags.length&&r.ingredients.length>=4&&r.steps.length===4));
});

test('recipe mix has enough meat, dairy, pareve, and break-fast choices',async()=>{
  const recipes=await loadRecipes();
  const counts=Object.fromEntries(['meat','dairy','pareve'].map(kind=>[kind,recipes.filter(r=>r.kind===kind).length]));
  assert.deepEqual(counts,{meat:250,dairy:150,pareve:100});
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

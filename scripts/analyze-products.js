const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'prisma', 'database', 'dev.db');
const DOORS_CAT_ID = 'cmlg8vri200037kf4bec1l5bx';

const db = new Database(DB_PATH, { readonly: true });

console.log('=== PRODUCT ANALYSIS ===\n');

// 1. Total counts
const totalProducts = db.prepare('SELECT COUNT(*) as cnt FROM products').get();
const doorProducts = db.prepare('SELECT COUNT(*) as cnt FROM products WHERE catalog_category_id = ?').get(DOORS_CAT_ID);
console.log(`Total products in DB: ${totalProducts.cnt}`);
console.log(`Door products (cat=${DOORS_CAT_ID}): ${doorProducts.cnt}\n`);

// 2. Products by category
const byCat = db.prepare(`
  SELECT cc.name as category, COUNT(*) as cnt
  FROM products p
  LEFT JOIN catalog_categories cc ON p.catalog_category_id = cc.id
  GROUP BY p.catalog_category_id
  ORDER BY cnt DESC
`).all();
console.log('Products by category:');
for (const r of byCat) console.log(`  ${r.category || '(no category)'}: ${r.cnt}`);
console.log();

// 3. Sample properties_data for 3 door products
const samples = db.prepare(`
  SELECT id, sku, name, base_price, properties_data
  FROM products WHERE catalog_category_id = ?
  LIMIT 3
`).all(DOORS_CAT_ID);

console.log('=== SAMPLE properties_data (3 door products) ===\n');
for (const s of samples) {
  console.log(`--- SKU: ${s.sku} | Name: ${s.name} | Price: ${s.base_price} ---`);
  try {
    const pd = JSON.parse(s.properties_data || '{}');
    console.log(JSON.stringify(pd, null, 2));
  } catch {
    console.log('(invalid JSON)', s.properties_data?.substring(0, 200));
  }
  console.log();
}

// 4. Parse all door products and analyze properties_data keys and values
const allDoors = db.prepare(`
  SELECT properties_data FROM products WHERE catalog_category_id = ?
`).all(DOORS_CAT_ID);

const keyValues = {};
let parseErrors = 0;

for (const row of allDoors) {
  let pd;
  try {
    pd = JSON.parse(row.properties_data || '{}');
  } catch {
    parseErrors++;
    continue;
  }
  for (const [key, val] of Object.entries(pd)) {
    if (!keyValues[key]) keyValues[key] = new Set();
    if (typeof val === 'object' && val !== null) {
      keyValues[key].add(JSON.stringify(val));
    } else {
      keyValues[key].add(String(val));
    }
  }
}

console.log(`=== DISTINCT VALUES PER properties_data KEY (${allDoors.length} door products, ${parseErrors} parse errors) ===\n`);

const sortedKeys = Object.entries(keyValues).sort((a, b) => a[1].size - b[1].size);
for (const [key, valSet] of sortedKeys) {
  const vals = [...valSet];
  if (vals.length <= 20) {
    console.log(`"${key}" (${vals.length} distinct): ${vals.join(' | ')}`);
  } else {
    console.log(`"${key}" (${vals.length} distinct): ${vals.slice(0, 10).join(' | ')} ... [+${vals.length - 10} more]`);
  }
}

// 5. Key dimensional analysis
console.log('\n=== KEY DIMENSIONS ===\n');

const extract = (key) => {
  const vals = new Set();
  for (const row of allDoors) {
    try {
      const pd = JSON.parse(row.properties_data || '{}');
      if (pd[key] !== undefined && pd[key] !== null && pd[key] !== '') vals.add(String(pd[key]));
    } catch {}
  }
  return vals;
};

const modelNames = extract('Название модели');
const modelCodes = extract('Код модели Domeo (Web)');
const widths = extract('Ширина/мм');
const heights = extract('Высота/мм');
const coatings = extract('Тип покрытия');
const styles = extract('Стиль Domeo (Web)');
const suppliers = extract('Поставщик');
const glasses = extract('Стекло');

console.log(`Distinct model names ("Название модели"):   ${modelNames.size}`);
console.log(`Distinct model codes ("Код модели Domeo"):   ${modelCodes.size}`);
console.log(`Distinct widths ("Ширина/мм"):              ${widths.size} → ${[...widths].sort().join(', ')}`);
console.log(`Distinct heights ("Высота/мм"):             ${heights.size} → ${[...heights].sort().join(', ')}`);
console.log(`Distinct coatings ("Тип покрытия"):         ${coatings.size} → ${[...coatings].join(', ')}`);
console.log(`Distinct styles ("Стиль Domeo (Web)"):      ${styles.size}`);
console.log(`Distinct suppliers ("Поставщик"):           ${suppliers.size} → ${[...suppliers].join(', ')}`);
console.log(`Distinct glass ("Стекло"):                  ${glasses.size}`);

// 6. Permutation analysis: model_code × coating → how many width×height combos
console.log('\n=== PERMUTATION ANALYSIS ===\n');
const combos = {};
for (const row of allDoors) {
  try {
    const pd = JSON.parse(row.properties_data || '{}');
    const code = pd['Код модели Domeo (Web)'] || '?';
    const coating = pd['Тип покрытия'] || '?';
    const key = `${code} | ${coating}`;
    if (!combos[key]) combos[key] = new Set();
    combos[key].add(`${pd['Ширина/мм']}x${pd['Высота/мм']}`);
  } catch {}
}

const comboEntries = Object.entries(combos).sort((a, b) => b[1].size - a[1].size);
console.log(`Distinct (model_code, coating) pairs: ${comboEntries.length}`);
console.log(`Total products: ${allDoors.length}`);
const theoreticalTotal = comboEntries.reduce((sum, [, v]) => sum + v.size, 0);
console.log(`Sum of size permutations: ${theoreticalTotal}`);

console.log('\nTop 15 (model_code | coating) by # of size permutations:');
for (const [key, sizeSet] of comboEntries.slice(0, 15)) {
  console.log(`  ${key}: ${sizeSet.size} sizes → ${[...sizeSet].sort().join(', ')}`);
}

// 7. How many "unique models" if we group by (model_name, coating)?
const uniqueModelCoating = new Set();
const uniqueModelCodeCoating = new Set();
for (const row of allDoors) {
  try {
    const pd = JSON.parse(row.properties_data || '{}');
    uniqueModelCoating.add(`${pd['Название модели']}|${pd['Тип покрытия']}`);
    uniqueModelCodeCoating.add(`${pd['Код модели Domeo (Web)']}|${pd['Тип покрытия']}`);
  } catch {}
}
console.log(`\nUnique (model_name, coating) combos: ${uniqueModelCoating.size}`);
console.log(`Unique (model_code, coating) combos: ${uniqueModelCodeCoating.size}`);
console.log(`→ These are your "unique door variants" (a model in a specific coating)`);
console.log(`→ Each variant expands into ${(allDoors.length / uniqueModelCodeCoating.size).toFixed(1)} size permutations on average`);

// 8. Distribution of sizes per model
const sizeCounts = {};
for (const [, sizeSet] of comboEntries) {
  const n = sizeSet.size;
  sizeCounts[n] = (sizeCounts[n] || 0) + 1;
}
console.log('\nDistribution of # size permutations per (code, coating):');
for (const [n, cnt] of Object.entries(sizeCounts).sort((a, b) => Number(b[0]) - Number(a[0]))) {
  console.log(`  ${n} sizes: ${cnt} model-coating pairs`);
}

db.close();
console.log('\nDone.');

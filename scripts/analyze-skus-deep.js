const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'prisma/database/dev.db'));

const DOORS_CAT = 'cmlg8vri200037kf4bec1l5bx';

const rows = db.prepare(
  'SELECT sku, name, properties_data FROM products WHERE catalog_category_id = ?'
).all(DOORS_CAT);

console.log('Total door products:', rows.length);

// Parse SKUs to understand structure
const skuParts = {};
let colorInSku = 0;
let colorInProps = 0;
const sampleSkus = [];

const uniqueKeys = new Set();
const keyValueCounts = {};

for (const row of rows) {
  // Parse properties_data
  let props = {};
  try { props = JSON.parse(row.properties_data || '{}'); } catch(e) {}
  
  for (const k of Object.keys(props)) {
    uniqueKeys.add(k);
    if (!keyValueCounts[k]) keyValueCounts[k] = {};
    const v = String(props[k] || '').substring(0, 80);
    keyValueCounts[k][v] = (keyValueCounts[k][v] || 0) + 1;
  }

  // Check if color is part of SKU
  const color = props['Цвет/Отделка'] || '';
  if (color && row.sku && row.sku.includes(color.replace(/[\s\/]/g, '_'))) {
    colorInSku++;
  }
  if (color) colorInProps++;
}

// Show distinct counts per property key
console.log('\n=== Properties distinct values ===');
const sorted = [...uniqueKeys].sort();
for (const k of sorted) {
  const vals = keyValueCounts[k];
  const distinctCount = Object.keys(vals).length;
  const totalUsed = Object.values(vals).reduce((a, b) => a + b, 0);
  console.log(`  ${k}: ${distinctCount} distinct (used in ${totalUsed} products)`);
}

// SKU structure analysis
console.log('\n=== SKU structure ===');
// Parse SKU parts: door_{code}_{modelName}_{w}_{h}_{coating}
const skuPatterns = {};
for (const row of rows) {
  const parts = row.sku.split('_');
  const len = parts.length;
  const key = `parts=${len}`;
  skuPatterns[key] = (skuPatterns[key] || 0) + 1;
}
console.log('SKU part counts:', skuPatterns);

// Sample 5 SKUs
console.log('\nSample SKUs:');
for (let i = 0; i < 5; i++) {
  console.log(`  ${rows[i].sku}`);
}

// Find duplicates: same (code, width, height, coating) but different color
console.log('\n=== Checking for color in SKU ===');
// Parse all unique model codes, then check for color variations
const byCodeSizeCoating = {};
for (const row of rows) {
  let props = {};
  try { props = JSON.parse(row.properties_data || '{}'); } catch(e) {}
  
  const code = props['Код модели Domeo (Web)'] || 'unknown';
  const modelName = props['Название модели'] || '';
  const w = props['Ширина/мм'] || '';
  const h = props['Высота/мм'] || '';
  const coating = props['Тип покрытия'] || '';
  const color = props['Цвет/Отделка'] || '';
  const supplier = props['Поставщик'] || '';
  
  const key = `${code}|${modelName}|${w}|${h}|${coating}`;
  if (!byCodeSizeCoating[key]) byCodeSizeCoating[key] = [];
  byCodeSizeCoating[key].push({ sku: row.sku, color, supplier });
}

// Find groups with multiple colors
let groupsWithMultipleColors = 0;
let totalExtraFromColors = 0;
const examples = [];
for (const [key, items] of Object.entries(byCodeSizeCoating)) {
  const uniqueColors = new Set(items.map(i => i.color));
  if (uniqueColors.size > 1) {
    groupsWithMultipleColors++;
    totalExtraFromColors += items.length - 1; // minus the "base" one
    if (examples.length < 5) {
      examples.push({ key, colors: [...uniqueColors], count: items.length, skus: items.slice(0, 3).map(i => i.sku) });
    }
  }
}

console.log(`Groups (code+model+size+coating) with MULTIPLE colors: ${groupsWithMultipleColors}`);
console.log(`Total extra products from color variations: ${totalExtraFromColors}`);
console.log(`Unique groups: ${Object.keys(byCodeSizeCoating).length}`);

if (examples.length > 0) {
  console.log('\nExamples of color variations:');
  for (const ex of examples) {
    console.log(`  ${ex.key}: ${ex.count} products, colors: ${ex.colors.join(', ')}`);
    for (const s of ex.skus) console.log(`    SKU: ${s}`);
  }
}

// What is the actual unique count without color?
const withoutColor = new Set();
const withColor = new Set();
for (const row of rows) {
  let props = {};
  try { props = JSON.parse(row.properties_data || '{}'); } catch(e) {}
  const code = props['Код модели Domeo (Web)'] || '';
  const modelName = props['Название модели'] || '';
  const w = props['Ширина/мм'] || '';
  const h = props['Высота/мм'] || '';
  const coating = props['Тип покрытия'] || '';
  const color = props['Цвет/Отделка'] || '';
  
  withoutColor.add(`${code}|${modelName}|${w}|${h}|${coating}`);
  withColor.add(`${code}|${modelName}|${w}|${h}|${coating}|${color}`);
}

console.log(`\n=== SUMMARY ===`);
console.log(`Unique (code, model, size, coating): ${withoutColor.size}`);
console.log(`Unique (code, model, size, coating, COLOR): ${withColor.size}`);
console.log(`COLOR adds: ${withColor.size - withoutColor.size} extra unique combos`);
console.log(`Total products: ${rows.length}`);
console.log(`Products that would exist WITHOUT color dimension: ${withoutColor.size}`);
console.log(`Extra products due to color: ${rows.length - withoutColor.size}`);

db.close();

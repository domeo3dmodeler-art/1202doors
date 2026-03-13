const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'prisma/database/dev.db'));

const DOORS_CAT = 'cmlg8vri200037kf4bec1l5bx';

const rows = db.prepare(
  'SELECT id, sku, properties_data FROM products WHERE catalog_category_id = ?'
).all(DOORS_CAT);

console.log('Total door products before:', rows.length);

const groups = {};
for (const row of rows) {
  let props = {};
  try { props = JSON.parse(row.properties_data || '{}'); } catch(e) {}

  const code = props['Код модели Domeo (Web)'] || '';
  const modelName = props['Название модели'] || '';
  const w = props['Ширина/мм'] || '';
  const h = props['Высота/мм'] || '';
  const coating = props['Тип покрытия'] || '';

  const key = `${code}|${modelName}|${w}|${h}|${coating}`;
  if (!groups[key]) groups[key] = [];
  groups[key].push(row);
}

const toDelete = [];
const toKeep = [];

for (const [key, items] of Object.entries(groups)) {
  // Keep the one with the shortest SKU (base, without color suffix)
  items.sort((a, b) => a.sku.length - b.sku.length);
  toKeep.push(items[0]);
  for (let i = 1; i < items.length; i++) {
    toDelete.push(items[i].id);
  }
}

console.log('Groups:', Object.keys(groups).length);
console.log('To keep:', toKeep.length);
console.log('To delete:', toDelete.length);

if (toDelete.length === 0) {
  console.log('Nothing to delete');
  process.exit(0);
}

db.exec('BEGIN');

const BATCH = 500;
for (let i = 0; i < toDelete.length; i += BATCH) {
  const batch = toDelete.slice(i, i + BATCH);
  const placeholders = batch.map(() => '?').join(',');
  db.prepare(`DELETE FROM product_images WHERE product_id IN (${placeholders})`).run(...batch);
  db.prepare(`DELETE FROM products WHERE id IN (${placeholders})`).run(...batch);
}

db.exec('COMMIT');

const after = db.prepare('SELECT count(*) as cnt FROM products WHERE catalog_category_id = ?').get(DOORS_CAT);
const imagesAfter = db.prepare('SELECT count(*) as cnt FROM product_images').get();
const totalAfter = db.prepare('SELECT count(*) as cnt FROM products').get();

console.log('\n=== AFTER CLEANUP ===');
console.log('Door products:', after.cnt);
console.log('Total products (all categories):', totalAfter.cnt);
console.log('Product images remaining:', imagesAfter.cnt);

db.close();

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const db = new Database(path.join(__dirname, '..', 'prisma/database/dev.db'));

const booleanColumns = new Set([
  'is_active', 'isActive', 'is_required', 'is_for_calculator', 'is_for_export',
  'is_featured', 'is_primary', 'isPublished', 'is_read', 'measurement_done'
]);

const dateTimeColumns = new Set([
  'last_login', 'created_at', 'updated_at', 'createdAt', 'updatedAt',
  'valid_until', 'invoice_date', 'due_date', 'order_date', 'expected_date'
]);

function convertDateTime(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') {
    if (val > 1e12) return `'${new Date(val).toISOString()}'`;
    if (val > 1e9) return `'${new Date(val * 1000).toISOString()}'`;
    return 'NULL';
  }
  if (typeof val === 'string') {
    if (/^\d+$/.test(val)) {
      const n = parseInt(val);
      if (n > 1e12) return `'${new Date(n).toISOString()}'`;
      if (n > 1e9) return `'${new Date(n * 1000).toISOString()}'`;
    }
    return `'${val.replace(/'/g, "''")}'`;
  }
  return 'NULL';
}

const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma%' AND name != 'sqlite_sequence'"
).all();

const stream = fs.createWriteStream('c:/01_conf/domeo-data-export.sql', 'utf8');

for (const { name } of tables) {
  const rows = db.prepare(`SELECT * FROM "${name}"`).all();
  if (rows.length === 0) continue;

  console.error(`Table: ${name} (${rows.length} rows)`);

  const columns = Object.keys(rows[0]);

  stream.write(`-- Table: ${name} (${rows.length} rows)\n`);

  for (const row of rows) {
    const values = columns.map(col => {
      const val = row[col];
      if (val === null || val === undefined) return 'NULL';
      if (booleanColumns.has(col)) {
        return (val === 1 || val === true || val === '1') ? 'true' : 'false';
      }
      if (dateTimeColumns.has(col)) {
        return convertDateTime(val);
      }
      if (typeof val === 'number') return String(val);
      if (typeof val === 'boolean') return val ? 'true' : 'false';
      const escaped = String(val).replace(/'/g, "''");
      return `'${escaped}'`;
    });
    stream.write(`INSERT INTO "${name}" ("${columns.join('","')}") VALUES (${values.join(',')}) ON CONFLICT DO NOTHING;\n`);
  }
  stream.write('\n');
}

stream.end();
stream.on('finish', () => console.error('Export complete'));

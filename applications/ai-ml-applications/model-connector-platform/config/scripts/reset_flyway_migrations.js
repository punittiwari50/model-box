const { platformDatabase } = require('./packages/model-connector-service/dist/database/platformDatabase');
const { DatabaseMigrationEngine } = require('./packages/model-connector-service/dist/database/DatabaseMigrationEngine');

function resetFlyway() {
  const db = platformDatabase.getDatabase();
  console.log('[Flyway Reset] Dropping and resetting FLYWAY_SCHEMA_HISTORY...');

  const fs = require('node:fs');
  const path = require('node:path');
  const ddlPath = path.resolve(__dirname, '../database/ddl/drop_flyway_schema_history.sql');
  const dropDdl = fs.readFileSync(ddlPath, 'utf8');
  db.exec(dropDdl);
  console.log('[Flyway Reset] Old schema history table dropped via drop_flyway_schema_history.sql.');

  console.log('[Flyway Reset] Running clean migrations...');
  DatabaseMigrationEngine.migrate(db);

  const rows = db.prepare('SELECT INSTALLED_RANK, VERSION, DESCRIPTION, SCRIPT, SUCCESS FROM FLYWAY_SCHEMA_HISTORY').all();
  console.log('[Flyway Reset] Current Migration History:');
  console.table(rows);
}

resetFlyway();

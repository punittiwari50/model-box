/**
 * Clean up script for purging all customer, mock, test, and session data from the database.
 * Preserves canonical categories, models, roles, and schema history.
 */
const fs = require('node:fs');
const path = require('node:path');

function getDatabase() {
  const candidates = [
    '/app/packages/model-connector-core/dist/index.js',
    path.resolve(__dirname, '../../packages/model-connector-core/dist/index.js'),
    path.resolve(__dirname, '../packages/model-connector-core/dist/index.js'),
    path.resolve(__dirname, './packages/model-connector-core/dist/index.js'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      const core = require(c);
      if (core.coreDatabaseManager) {
        return core.coreDatabaseManager.getDatabase();
      }
    }
  }
  throw new Error('Could not resolve coreDatabaseManager from candidates: ' + candidates.join(', '));
}

function cleanup() {
  const db = getDatabase();
  console.log('[Cleanup] Starting comprehensive data cleanup...');

  db.exec('BEGIN TRANSACTION;');
  try {
    const deletedMessages = db.prepare('DELETE FROM MESSAGES').run();
    console.log(`[Cleanup] Deleted messages: ${deletedMessages.changes}`);

    const deletedSessions = db.prepare('DELETE FROM SESSIONS').run();
    console.log(`[Cleanup] Deleted sessions: ${deletedSessions.changes}`);

    const deletedContext = db.prepare('DELETE FROM CONTEXT_ITEMS').run();
    console.log(`[Cleanup] Deleted context items: ${deletedContext.changes}`);

    const deletedAudit = db.prepare('DELETE FROM AUDIT_LOGS').run();
    console.log(`[Cleanup] Deleted audit logs: ${deletedAudit.changes}`);

    const deletedAccounts = db.prepare('DELETE FROM MODEL_ACCOUNTS').run();
    console.log(`[Cleanup] Deleted model accounts: ${deletedAccounts.changes}`);

    try {
      const deletedCliSessions = db.prepare('DELETE FROM CLI_OAUTH_SESSIONS').run();
      console.log(`[Cleanup] Deleted CLI OAuth sessions: ${deletedCliSessions.changes}`);
    } catch {}

    try {
      const deletedCache = db.prepare('DELETE FROM PROVIDER_MODEL_CACHE').run();
      console.log(`[Cleanup] Deleted provider model cache: ${deletedCache.changes}`);
    } catch {}

    try {
      const deletedClients = db.prepare('DELETE FROM PROVIDER_OAUTH_CLIENTS').run();
      console.log(`[Cleanup] Deleted provider oauth clients: ${deletedClients.changes}`);
    } catch {}

    try {
      const deletedUsers = db.prepare('DELETE FROM USERS').run();
      console.log(`[Cleanup] Deleted users: ${deletedUsers.changes}`);
    } catch {}

    try {
      const deletedCompanies = db.prepare('DELETE FROM COMPANIES').run();
      console.log(`[Cleanup] Deleted companies: ${deletedCompanies.changes}`);
    } catch {}

    db.exec('COMMIT;');
    console.log('[Cleanup] Database tables purged successfully.');
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('[Cleanup] Error during database cleanup:', err);
    process.exit(1);
  }

  // Cleanup filesystem files in credentials & oauth_responses
  const candidatesDirs = [
    path.resolve(__dirname, '../data/credentials'),
    path.resolve(__dirname, '../data/oauth_responses'),
    path.resolve('/app/config/data/credentials'),
    path.resolve('/app/config/data/oauth_responses'),
  ];

  for (const dir of candidatesDirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file === '.gitkeep') continue;
        const fullPath = path.join(dir, file);
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
          console.log(`[Cleanup] Removed data file: ${fullPath}`);
        } catch {}
      }
    }
  }

  const sessionFiles = [
    path.resolve(__dirname, '../data/oauth_sessions.json'),
    path.resolve(__dirname, '../data/oauth_sessions.csv'),
    path.resolve('/app/config/data/oauth_sessions.json'),
    path.resolve('/app/config/data/oauth_sessions.csv'),
  ];
  for (const sf of sessionFiles) {
    if (fs.existsSync(sf)) {
      try {
        fs.unlinkSync(sf);
        console.log(`[Cleanup] Removed session file: ${sf}`);
      } catch {}
    }
  }

  console.log('[Cleanup] All database records and session files cleanly purged.');
}

cleanup();

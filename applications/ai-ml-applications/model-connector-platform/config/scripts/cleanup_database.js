/**
 * Clean up script for purging all mock and transient data from the database.
 * Preserves canonical categories, models, roles, and permissions.
 */
const { platformDatabase } = require('./packages/model-connector-service/dist/database/platformDatabase');

function cleanup() {
  const db = platformDatabase.getDatabase();
  console.log('[Cleanup] Starting database cleanup...');

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

    // Remove any mock accounts
    const deletedAccounts = db.prepare(
      "DELETE FROM MODEL_ACCOUNTS WHERE USER_EMAIL LIKE '%@local.dev' OR USER_EMAIL LIKE '%@enterprise.com' OR ACCOUNT_NAME LIKE '%mock%'"
    ).run();
    console.log(`[Cleanup] Deleted mock accounts: ${deletedAccounts.changes}`);

    try {
      const deletedUsers = db.prepare("DELETE FROM USERS").run();
      console.log(`[Cleanup] Deleted users: ${deletedUsers.changes}`);
    } catch {}

    try {
      const deletedCompanies = db.prepare("DELETE FROM COMPANIES").run();
      console.log(`[Cleanup] Deleted companies: ${deletedCompanies.changes}`);
    } catch {}

    db.exec('COMMIT;');
    console.log('[Cleanup] Database cleanup completed successfully.');
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('[Cleanup] Error during database cleanup:', err);
    process.exit(1);
  }
}

cleanup();

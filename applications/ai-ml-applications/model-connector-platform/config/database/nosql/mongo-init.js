/**
 * MongoDB Enterprise NoSQL Initialization Script.
 * Conforms to:
 * - UPPER CASE Collection Names (CONVERSATIONS, MESSAGES, CONTEXT_ITEMS, AUDIT_LOGS)
 * - Meaningful non-generic keys (SESSION_ID, MESSAGE_ID, etc.)
 */

db = db.getSiblingDB("model_connector");

// 1. CONVERSATIONS Collection
db.createCollection("CONVERSATIONS");
db.CONVERSATIONS.createIndex({ "SESSION_ID": 1 }, { unique: true });
db.CONVERSATIONS.createIndex({ "ACTIVE_MODEL_ID": 1 });
db.CONVERSATIONS.createIndex({ "UPDATED_TIMESTAMP": -1 });

// 2. MESSAGES Collection
db.createCollection("MESSAGES");
db.MESSAGES.createIndex({ "MESSAGE_ID": 1 }, { unique: true });
db.MESSAGES.createIndex({ "SESSION_ID": 1 });
db.MESSAGES.createIndex({ "CREATED_TIMESTAMP": 1 });

// 3. CONTEXT_ITEMS Collection
db.createCollection("CONTEXT_ITEMS");
db.CONTEXT_ITEMS.createIndex({ "CONTEXT_ID": 1 }, { unique: true });
db.CONTEXT_ITEMS.createIndex({ "SESSION_ID": 1 });

// 4. AUDIT_LOGS Collection
db.createCollection("AUDIT_LOGS");
db.AUDIT_LOGS.createIndex({ "AUDIT_LOG_ID": 1 }, { unique: true });
db.AUDIT_LOGS.createIndex({ "CORRELATION_ID": 1 });
db.AUDIT_LOGS.createIndex({ "TRACE_ID": 1 });
db.AUDIT_LOGS.createIndex({ "CREATED_TIMESTAMP": -1 });

// 5. MODEL_CACHE Collection (TTL indexed)
db.createCollection("MODEL_CACHE");
db.MODEL_CACHE.createIndex({ "CACHE_KEY": 1 }, { unique: true });
db.MODEL_CACHE.createIndex({ "EXPIRES_AT": 1 }, { expireAfterSeconds: 0 });

print("ModelConnector NoSQL MongoDB Collections & Indexes initialized successfully.");

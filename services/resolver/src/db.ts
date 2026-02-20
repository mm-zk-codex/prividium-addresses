import Database from 'better-sqlite3';

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

function ensureColumn(db: Database.Database, table: string, columnDef: string, columnName: string) {
  if (!hasColumn(db, table, columnName)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  }
}

export function openDb(path: string) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS aliases (
      aliasKey TEXT PRIMARY KEY,
      normalizedEmail TEXT NOT NULL,
      suffix TEXT NOT NULL,
      recipientPrividiumAddress TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deposit_requests (
      trackingId TEXT PRIMARY KEY,
      aliasKey TEXT NOT NULL,
      l1DepositAddressY TEXT NOT NULL,
      l2VaultAddressX TEXT NOT NULL,
      saltY TEXT NOT NULL,
      saltX TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      lastActivityAt INTEGER NOT NULL,
      inflightL1 INTEGER NOT NULL DEFAULT 0,
      inflightL2 INTEGER NOT NULL DEFAULT 0,
      isActive INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS deposit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trackingId TEXT NOT NULL,
      kind TEXT NOT NULL,
      l1TokenAddress TEXT,
      amount TEXT NOT NULL,
      status TEXT NOT NULL,
      detectedAtL1 INTEGER,
      l1DepositTxHash TEXT,
      l1DeployTxHash TEXT,
      l1BridgeTxHash TEXT,
      l2ArrivedAt INTEGER,
      l2DeployTxHash TEXT,
      l2SweepTxHash TEXT,
      error TEXT,
      note TEXT,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS token_registry_cache (
      l1TokenAddress TEXT PRIMARY KEY,
      tokenAssetId TEXT NOT NULL,
      registeredAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_deposit_requests_alias_created ON deposit_requests(aliasKey, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_deposit_events_tracking_created ON deposit_events(trackingId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_deposit_events_status ON deposit_events(status);
  `);

  // Migration support from old schema
  ensureColumn(db, 'deposit_requests', 'createdAt INTEGER', 'createdAt');
  ensureColumn(db, 'deposit_requests', 'lastActivityAt INTEGER DEFAULT 0', 'lastActivityAt');
  ensureColumn(db, 'deposit_requests', 'inflightL1 INTEGER DEFAULT 0', 'inflightL1');
  ensureColumn(db, 'deposit_requests', 'inflightL2 INTEGER DEFAULT 0', 'inflightL2');
  ensureColumn(db, 'deposit_requests', 'isActive INTEGER DEFAULT 1', 'isActive');

  db.exec(`UPDATE deposit_requests SET createdAt = COALESCE(createdAt, issuedAt, strftime('%s','now')*1000)`);
  db.exec(`UPDATE deposit_requests SET lastActivityAt = COALESCE(lastActivityAt, createdAt)`);

  return db;
}

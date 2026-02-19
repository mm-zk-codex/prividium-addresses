import Database from 'better-sqlite3';

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
      chainId INTEGER NOT NULL,
      l1DepositAddressY TEXT NOT NULL,
      l2VaultAddressX TEXT NOT NULL,
      saltY TEXT NOT NULL,
      saltX TEXT NOT NULL,
      l1DetectedAt INTEGER,
      l1DeployTxHash TEXT,
      l1BridgeTxHash TEXT,
      l2DetectedAt INTEGER,
      l2DeployTxHash TEXT,
      l2SweepTxHash TEXT,
      tokenType TEXT NOT NULL,
      l1TokenAddress TEXT,
      amount TEXT,
      status TEXT NOT NULL,
      issuedAt INTEGER NOT NULL,
      creditedAt INTEGER,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_deposits_alias_issued ON deposit_requests(aliasKey, issuedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposit_requests(status);
  `);

  return db;
}

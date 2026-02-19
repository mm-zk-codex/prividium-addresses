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
      salt TEXT NOT NULL,
      depositAddress TEXT NOT NULL,
      status TEXT NOT NULL,
      issuedAt INTEGER NOT NULL,
      detectedAt INTEGER,
      deployedAt INTEGER,
      sweptAt INTEGER,
      creditedAt INTEGER,
      depositTxHash TEXT,
      deployTxHash TEXT,
      sweepTxHash TEXT,
      amountWei TEXT,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_deposits_alias_issued ON deposit_requests(aliasKey, issuedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposit_requests(status);
  `);

  return db;
}

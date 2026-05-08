-- Migration 016: Account balance snapshots for point-in-time reconstruction

CREATE TABLE IF NOT EXISTS AccountBalanceSnapshots (
  SnapshotDate  DATE NOT NULL,
  AccountID     INT NOT NULL,
  ClosingBalance DECIMAL(18,2) NOT NULL,
  ComputedAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (SnapshotDate, AccountID),
  CONSTRAINT fk_abs_account FOREIGN KEY (AccountID) REFERENCES Accounts(AccountID) ON DELETE CASCADE
);

CREATE INDEX idx_abs_account_date ON AccountBalanceSnapshots (AccountID, SnapshotDate DESC);

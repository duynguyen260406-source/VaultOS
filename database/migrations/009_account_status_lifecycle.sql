-- Migration 009: Account status lifecycle (Hold/Frozen/Dormant)

ALTER TABLE Accounts
  MODIFY COLUMN Status ENUM('Active','Closed','Frozen','Hold','Dormant') NOT NULL DEFAULT 'Active';

ALTER TABLE Accounts
  ADD COLUMN StatusReason TEXT NULL AFTER Status,
  ADD COLUMN StatusChangedByUserID INT NULL AFTER StatusReason,
  ADD COLUMN StatusChangedAt DATETIME NULL AFTER StatusChangedByUserID,
  ADD COLUMN HoldExpiresAt DATE NULL AFTER StatusChangedAt,
  ADD COLUMN LastActivityAt DATETIME NULL AFTER HoldExpiresAt;

ALTER TABLE Accounts
  ADD CONSTRAINT fk_accounts_status_user FOREIGN KEY (StatusChangedByUserID) REFERENCES AppUsers(UserID) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS AccountStatusHistory (
  HistoryID      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  AccountID      INT NOT NULL,
  OldStatus      ENUM('Active','Closed','Frozen','Hold','Dormant') NULL,
  NewStatus      ENUM('Active','Closed','Frozen','Hold','Dormant') NOT NULL,
  Reason         TEXT NULL,
  ChangedByUserID INT NULL,
  ChangedAt      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ash_account FOREIGN KEY (AccountID) REFERENCES Accounts(AccountID) ON DELETE CASCADE,
  CONSTRAINT fk_ash_user    FOREIGN KEY (ChangedByUserID) REFERENCES AppUsers(UserID) ON DELETE SET NULL
);

CREATE INDEX idx_ash_account_changed ON AccountStatusHistory (AccountID, ChangedAt DESC);

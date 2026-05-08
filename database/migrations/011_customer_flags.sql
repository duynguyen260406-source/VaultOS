-- Migration 011: Customer flags & watchlist

CREATE TABLE IF NOT EXISTS CustomerFlags (
  FlagID           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  CustomerID       INT NOT NULL,
  FlagType         ENUM('VIP','Blacklist','UnderInvestigation','PEP','Deceased','Incapacitated','CourtOrder') NOT NULL,
  Reason           TEXT NULL,
  AddedByUserID    INT NULL,
  AddedAt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ExpiresAt        DATE NULL,
  RemovedAt        DATETIME NULL,
  RemovedByUserID  INT NULL,
  IsActive         TINYINT(1) GENERATED ALWAYS AS (RemovedAt IS NULL) STORED,
  CONSTRAINT fk_cf_customer   FOREIGN KEY (CustomerID)      REFERENCES Customers(CustomerID) ON DELETE CASCADE,
  CONSTRAINT fk_cf_added_by   FOREIGN KEY (AddedByUserID)   REFERENCES AppUsers(UserID) ON DELETE SET NULL,
  CONSTRAINT fk_cf_removed_by FOREIGN KEY (RemovedByUserID) REFERENCES AppUsers(UserID) ON DELETE SET NULL
);

CREATE INDEX idx_cf_customer_active ON CustomerFlags (CustomerID, IsActive);
CREATE INDEX idx_cf_type_active ON CustomerFlags (FlagType, IsActive);

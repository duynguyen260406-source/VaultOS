-- Migration 021: Sanctions & PEP list

CREATE TABLE IF NOT EXISTS SanctionsList (
  EntryID          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ListSource       ENUM('OFAC','UN','EU','LOCAL','PEP') NOT NULL DEFAULT 'LOCAL',
  EntryType        ENUM('Individual','Entity','PEP') NOT NULL DEFAULT 'Individual',
  FullName         VARCHAR(300) NOT NULL,
  NormalizedName   VARCHAR(300) NOT NULL,
  Aliases          JSON NULL,
  DateOfBirth      DATE NULL,
  Country          VARCHAR(100) NULL,
  IdentityNumberHash VARCHAR(64) NULL,
  AddedAt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  SourceNotes      TEXT NULL,
  Active           TINYINT(1) NOT NULL DEFAULT 1
);

CREATE INDEX idx_sl_normalized ON SanctionsList (NormalizedName, Active);
CREATE INDEX idx_sl_id_hash    ON SanctionsList (IdentityNumberHash, Active);
CREATE INDEX idx_sl_source     ON SanctionsList (ListSource, Active);

CREATE TABLE IF NOT EXISTS SanctionsScreeningResults (
  ResultID          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ScreenedAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ScreenedEntityType ENUM('customer','counterparty') NOT NULL,
  EntityID          INT NOT NULL,
  ListSource        ENUM('OFAC','UN','EU','LOCAL','PEP') NULL,
  MatchedEntryID    INT UNSIGNED NULL,
  MatchScore        TINYINT NOT NULL DEFAULT 0,
  MatchReason       VARCHAR(200) NULL,
  Status            ENUM('PendingReview','FalsePositive','Confirmed','Resolved') NOT NULL DEFAULT 'PendingReview',
  ReviewedByUserID  INT NULL,
  ReviewedAt        DATETIME NULL,
  CONSTRAINT fk_ssr_entry   FOREIGN KEY (MatchedEntryID)   REFERENCES SanctionsList(EntryID) ON DELETE SET NULL,
  CONSTRAINT fk_ssr_reviewer FOREIGN KEY (ReviewedByUserID) REFERENCES AppUsers(UserID) ON DELETE SET NULL
);

CREATE INDEX idx_ssr_status ON SanctionsScreeningResults (Status, ScreenedAt DESC);
CREATE INDEX idx_ssr_entity ON SanctionsScreeningResults (ScreenedEntityType, EntityID);

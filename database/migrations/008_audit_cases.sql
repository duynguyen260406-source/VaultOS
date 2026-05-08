-- Migration 008: Audit case management

CREATE TABLE IF NOT EXISTS AuditCases (
  CaseID          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  OpenedByUserID  INT NULL,
  OpenedAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Status          ENUM('open','investigating','escalated','closed') NOT NULL DEFAULT 'open',
  Priority        ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  Summary         VARCHAR(500) NOT NULL,
  ClosedAt        DATETIME NULL,
  ClosureReason   TEXT NULL,
  ClosedByUserID  INT NULL,
  CONSTRAINT fk_ac_opened_by FOREIGN KEY (OpenedByUserID) REFERENCES AppUsers(UserID) ON DELETE SET NULL,
  CONSTRAINT fk_ac_closed_by FOREIGN KEY (ClosedByUserID) REFERENCES AppUsers(UserID) ON DELETE SET NULL
);

CREATE INDEX idx_ac_status_opened ON AuditCases (Status, OpenedAt DESC);

CREATE TABLE IF NOT EXISTS AuditCaseLinks (
  LinkID          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  CaseID          INT UNSIGNED NOT NULL,
  LinkType        ENUM('suspicious_activity','transaction','customer','account') NOT NULL,
  TargetID        INT NOT NULL,
  AddedByUserID   INT NULL,
  AddedAt         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_acl_case    FOREIGN KEY (CaseID)        REFERENCES AuditCases(CaseID) ON DELETE CASCADE,
  CONSTRAINT fk_acl_added   FOREIGN KEY (AddedByUserID) REFERENCES AppUsers(UserID)   ON DELETE SET NULL,
  UNIQUE KEY uq_case_link (CaseID, LinkType, TargetID)
);

CREATE TABLE IF NOT EXISTS AuditCaseNotes (
  NoteID          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  CaseID          INT UNSIGNED NOT NULL,
  AuthorUserID    INT NULL,
  Body            TEXT NOT NULL,
  CreatedAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_acn_case   FOREIGN KEY (CaseID)       REFERENCES AuditCases(CaseID) ON DELETE CASCADE,
  CONSTRAINT fk_acn_author FOREIGN KEY (AuthorUserID) REFERENCES AppUsers(UserID)   ON DELETE SET NULL
);

CREATE INDEX idx_acn_case_created ON AuditCaseNotes (CaseID, CreatedAt);

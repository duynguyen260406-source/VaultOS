-- Migration 018: Regulatory report templates

CREATE TABLE IF NOT EXISTS RegulatoryReportTemplates (
  TemplateID      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  Code            VARCHAR(50) NOT NULL UNIQUE,
  Name            VARCHAR(200) NOT NULL,
  Description     TEXT NULL,
  RequiredRole    ENUM('manager','auditor','any') NOT NULL DEFAULT 'any',
  Active          TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS RegulatoryReportRuns (
  RunID           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  TemplateID      INT UNSIGNED NOT NULL,
  RunByUserID     INT NULL,
  Parameters      JSON NULL,
  OutputFormat    ENUM('CSV','JSON') NOT NULL DEFAULT 'CSV',
  RowCount        INT NOT NULL DEFAULT 0,
  GeneratedAt     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  SignedOffByUserID INT NULL,
  SignedOffAt     DATETIME NULL,
  CONSTRAINT fk_rrr_template FOREIGN KEY (TemplateID)       REFERENCES RegulatoryReportTemplates(TemplateID),
  CONSTRAINT fk_rrr_user     FOREIGN KEY (RunByUserID)      REFERENCES AppUsers(UserID) ON DELETE SET NULL,
  CONSTRAINT fk_rrr_signoff  FOREIGN KEY (SignedOffByUserID) REFERENCES AppUsers(UserID) ON DELETE SET NULL
);

INSERT INTO RegulatoryReportTemplates (Code, Name, Description, RequiredRole) VALUES
  ('CTR_DAILY',    'Cash Transaction Report (CTR)',          'Transactions >= 200M VND in the reporting period', 'any'),
  ('STR_MONTHLY',  'Suspicious Transaction Report (STR)',    'Suspicious activity alerts in the reporting period', 'any'),
  ('LOAN_SUMMARY', 'Loan Portfolio Summary',                 'Loan counts, disbursements and repayments summary', 'any'),
  ('BALANCE_SHEET','Branch Balance Sheet Snapshot',          'Total deposits and outstanding loans per branch', 'manager');

CREATE TABLE IF NOT EXISTS RuleSettings (
    RuleID          INT             AUTO_INCREMENT PRIMARY KEY,
    Code            VARCHAR(80)     NOT NULL UNIQUE,
    Value           JSON            NOT NULL,
    Description     VARCHAR(255)    NOT NULL DEFAULT '',
    UpdatedByUserID INT             NULL,
    UpdatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    Active          BOOLEAN         NOT NULL DEFAULT TRUE,
    INDEX idx_rules_active_code (Active, Code),
    CONSTRAINT fk_rules_updated_by FOREIGN KEY (UpdatedByUserID)
        REFERENCES AppUsers(UserID) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO RuleSettings (Code, Value, Description) VALUES ('txn_suspicious_amount_vnd', JSON_QUOTE('50000000'), 'Single-transaction amount (VND) at or above which the audit pipeline flags an alert.');

INSERT IGNORE INTO RuleSettings (Code, Value, Description) VALUES ('approval_required_amount_vnd', JSON_QUOTE('50000000'), 'Cash transactions at or above this amount route through the maker-checker approval queue.');

INSERT IGNORE INTO RuleSettings (Code, Value, Description) VALUES ('cash_variance_tolerance_vnd', JSON_QUOTE('100000'), 'EOD reconciliation: maximum |variance| (VND) accepted before a teller session is marked flagged.');

INSERT IGNORE INTO RuleSettings (Code, Value, Description) VALUES ('loan_application_max_inline_vnd', JSON_QUOTE('0'), 'Loan applications above this principal route through the maker-checker queue. 0 means always queue.');

INSERT IGNORE INTO RuleSettings (Code, Value, Description) VALUES ('dormancy_days', JSON_QUOTE('365'), 'Days of inactivity after which an Active account auto-transitions to Dormant.');

DROP FUNCTION IF EXISTS fn_rule_value;

CREATE FUNCTION fn_rule_value(p_code VARCHAR(80)) RETURNS JSON READS SQL DATA RETURN (SELECT Value FROM RuleSettings WHERE Code = p_code AND Active = TRUE LIMIT 1);

DROP TRIGGER IF EXISTS trg_suspicious_activity;

CREATE TRIGGER trg_suspicious_activity AFTER INSERT ON Transactions FOR EACH ROW FOLLOWS trg_log_transaction INSERT INTO SuspiciousActivity (TransactionID, AccountID, Amount, Reason) SELECT NEW.TransactionID, NEW.AccountID, NEW.Amount, CONCAT('Transaction amount meets/exceeds configured suspicious threshold (', FORMAT(COALESCE(CAST(JSON_UNQUOTE(fn_rule_value('txn_suspicious_amount_vnd')) AS DECIMAL(18,2)), 50000000), 0), ' VND)') WHERE NEW.Amount >= COALESCE(CAST(JSON_UNQUOTE(fn_rule_value('txn_suspicious_amount_vnd')) AS DECIMAL(18,2)), 50000000);


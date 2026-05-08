-- Rollback for 007_rule_settings.sql.
-- Restores the original hardcoded 50,000,000 VND trigger and drops the new objects.
-- Apply manually via the MySQL client (the migrate runner does not run rollbacks):
--   mysql -u root -p < database/migrations/rollback/007_rule_settings_down.sql

USE banking_system;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_suspicious_activity$$

CREATE TRIGGER trg_suspicious_activity
AFTER INSERT ON Transactions
FOR EACH ROW FOLLOWS trg_log_transaction
BEGIN
    IF NEW.Amount >= 50000000 THEN
        INSERT INTO SuspiciousActivity (
            TransactionID,
            AccountID,
            Amount,
            Reason
        )
        VALUES (
            NEW.TransactionID,
            NEW.AccountID,
            NEW.Amount,
            'Transaction amount exceeds 50,000,000 VND threshold'
        );
    END IF;
END$$

DROP FUNCTION IF EXISTS fn_rule_value$$

DELIMITER ;

DROP TABLE IF EXISTS RuleSettings;

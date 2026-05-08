USE banking_system;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_customers_check_dob_ins$$

CREATE TRIGGER trg_customers_check_dob_ins
BEFORE INSERT ON Customers
FOR EACH ROW
BEGIN
    IF NEW.DateOfBirth >= CURRENT_DATE() THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Date of birth must be before today.';
    END IF;
END$$

DELIMITER ;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_customers_check_dob_upd$$

CREATE TRIGGER trg_customers_check_dob_upd
BEFORE UPDATE ON Customers
FOR EACH ROW
BEGIN
    IF NEW.DateOfBirth >= CURRENT_DATE() THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Date of birth must be before today.';
    END IF;
END$$

DELIMITER ;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_log_transaction$$

CREATE TRIGGER trg_log_transaction
AFTER INSERT ON Transactions
FOR EACH ROW
BEGIN
    IF @app_actor IS NULL OR TRIM(@app_actor) = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'app_actor must be set before writing audit records.';
    END IF;
    IF fn_is_trusted_app_context() <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Application context is invalid or untrusted.';
    END IF;

    INSERT INTO AuditLog (
        TableName,
        ActionType,
        RecordID,
        NewValues,
        PerformedBy
    )
    VALUES (
        'Transactions',
        'INSERT',
        NEW.TransactionID,
        JSON_OBJECT(
            'TransactionID',   NEW.TransactionID,
            'AccountID',       NEW.AccountID,
            'TransactionType', NEW.TransactionType,
            'Amount',          NEW.Amount,
            'TransactionDate', NEW.TransactionDate,
            'Description',     NEW.Description,
            'ReferenceID',     NEW.ReferenceID
        ),
        CONCAT(COALESCE(NULLIF(TRIM(@app_actor), ''), 'unknown'), ' | db=', CURRENT_USER(), ' | role=', CURRENT_ROLE())
    );
END$$

DELIMITER ;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_suspicious_activity$$

-- Threshold is read from RuleSettings via fn_rule_value('txn_suspicious_amount_vnd').
-- The COALESCE fallback to 50,000,000 ensures the alert never silently disables if
-- the rule row is missing or marked inactive (e.g., during a botched config edit).
CREATE TRIGGER trg_suspicious_activity
AFTER INSERT ON Transactions
FOR EACH ROW FOLLOWS trg_log_transaction
BEGIN
    DECLARE v_threshold DECIMAL(18,2);

    SET v_threshold = COALESCE(
        CAST(JSON_UNQUOTE(fn_rule_value('txn_suspicious_amount_vnd')) AS DECIMAL(18,2)),
        50000000
    );

    IF NEW.Amount >= v_threshold THEN
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
            CONCAT('Transaction amount meets/exceeds configured suspicious threshold (', FORMAT(v_threshold, 0), ' VND)')
        );
    END IF;
END$$

DELIMITER ;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_log_appusers_ins$$

CREATE TRIGGER trg_log_appusers_ins
AFTER INSERT ON AppUsers
FOR EACH ROW
BEGIN
    IF @app_actor IS NULL OR TRIM(@app_actor) = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'app_actor must be set before writing audit records.';
    END IF;
    IF fn_is_trusted_app_context() <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Application context is invalid or untrusted.';
    END IF;

    INSERT INTO AuditLog (TableName, ActionType, RecordID, NewValues, PerformedBy)
    VALUES (
        'AppUsers',
        'INSERT',
        NEW.UserID,
        JSON_OBJECT(
            'UserID', NEW.UserID,
            'Username', NEW.Username,
            'Role', NEW.Role,
            'Status', NEW.Status,
            'EmployeeID', NEW.EmployeeID,
            'CustomerID', NEW.CustomerID,
            'FailedLoginCount', NEW.FailedLoginCount,
            'PasswordHash', '[REDACTED]',
            'CreatedByUserID', NEW.CreatedByUserID
        ),
        CONCAT(COALESCE(NULLIF(TRIM(@app_actor), ''), 'unknown'), ' | db=', CURRENT_USER(), ' | role=', CURRENT_ROLE())
    );
END$$

DELIMITER ;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_log_appusers_upd$$

CREATE TRIGGER trg_log_appusers_upd
AFTER UPDATE ON AppUsers
FOR EACH ROW
BEGIN
    IF @app_actor IS NULL OR TRIM(@app_actor) = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'app_actor must be set before writing audit records.';
    END IF;
    IF fn_is_trusted_app_context() <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Application context is invalid or untrusted.';
    END IF;

    INSERT INTO AuditLog (TableName, ActionType, RecordID, OldValues, NewValues, PerformedBy)
    VALUES (
        'AppUsers',
        'UPDATE',
        NEW.UserID,
        JSON_OBJECT(
            'Username', OLD.Username,
            'Role', OLD.Role,
            'Status', OLD.Status,
            'EmployeeID', OLD.EmployeeID,
            'CustomerID', OLD.CustomerID,
            'FailedLoginCount', OLD.FailedLoginCount,
            'PasswordHash', '[REDACTED]',
            'CreatedByUserID', OLD.CreatedByUserID
        ),
        JSON_OBJECT(
            'Username', NEW.Username,
            'Role', NEW.Role,
            'Status', NEW.Status,
            'EmployeeID', NEW.EmployeeID,
            'CustomerID', NEW.CustomerID,
            'FailedLoginCount', NEW.FailedLoginCount,
            'PasswordHash', '[REDACTED]',
            'CreatedByUserID', NEW.CreatedByUserID
        ),
        CONCAT(COALESCE(NULLIF(TRIM(@app_actor), ''), 'unknown'), ' | db=', CURRENT_USER(), ' | role=', CURRENT_ROLE())
    );
END$$

DELIMITER ;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_log_appusers_del$$

CREATE TRIGGER trg_log_appusers_del
AFTER DELETE ON AppUsers
FOR EACH ROW
BEGIN
    IF @app_actor IS NULL OR TRIM(@app_actor) = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'app_actor must be set before writing audit records.';
    END IF;
    IF fn_is_trusted_app_context() <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Application context is invalid or untrusted.';
    END IF;

    INSERT INTO AuditLog (TableName, ActionType, RecordID, OldValues, PerformedBy)
    VALUES (
        'AppUsers',
        'DELETE',
        OLD.UserID,
        JSON_OBJECT(
            'Username', OLD.Username,
            'Role', OLD.Role,
            'Status', OLD.Status,
            'EmployeeID', OLD.EmployeeID,
            'CustomerID', OLD.CustomerID,
            'FailedLoginCount', OLD.FailedLoginCount,
            'PasswordHash', '[REDACTED]',
            'CreatedByUserID', OLD.CreatedByUserID
        ),
        CONCAT(COALESCE(NULLIF(TRIM(@app_actor), ''), 'unknown'), ' | db=', CURRENT_USER(), ' | role=', CURRENT_ROLE())
    );
END$$

DELIMITER ;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_log_customers_ins$$

CREATE TRIGGER trg_log_customers_ins
AFTER INSERT ON Customers
FOR EACH ROW
BEGIN
    IF @app_actor IS NULL OR TRIM(@app_actor) = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'app_actor must be set before writing audit records.';
    END IF;
    IF fn_is_trusted_app_context() <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Application context is invalid or untrusted.';
    END IF;

    INSERT INTO AuditLog (TableName, ActionType, RecordID, NewValues, PerformedBy)
    VALUES (
        'Customers',
        'INSERT',
        NEW.CustomerID,
        JSON_OBJECT(
            'CustomerID', NEW.CustomerID,
            'Gender', NEW.Gender,
            'IdentityHash', NEW.IdentityHash,
            'PhoneHash', NEW.PhoneHash,
            'City', NEW.City,
            'RegistrationDate', NEW.RegistrationDate
        ),
        CONCAT(COALESCE(NULLIF(TRIM(@app_actor), ''), 'unknown'), ' | db=', CURRENT_USER(), ' | role=', CURRENT_ROLE())
    );
END$$

DELIMITER ;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_log_customers_upd$$

CREATE TRIGGER trg_log_customers_upd
AFTER UPDATE ON Customers
FOR EACH ROW
BEGIN
    IF @app_actor IS NULL OR TRIM(@app_actor) = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'app_actor must be set before writing audit records.';
    END IF;
    IF fn_is_trusted_app_context() <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Application context is invalid or untrusted.';
    END IF;

    INSERT INTO AuditLog (TableName, ActionType, RecordID, OldValues, NewValues, PerformedBy)
    VALUES (
        'Customers',
        'UPDATE',
        NEW.CustomerID,
        JSON_OBJECT(
            'Gender', OLD.Gender,
            'IdentityHash', OLD.IdentityHash,
            'PhoneHash', OLD.PhoneHash,
            'City', OLD.City
        ),
        JSON_OBJECT(
            'Gender', NEW.Gender,
            'IdentityHash', NEW.IdentityHash,
            'PhoneHash', NEW.PhoneHash,
            'City', NEW.City
        ),
        CONCAT(COALESCE(NULLIF(TRIM(@app_actor), ''), 'unknown'), ' | db=', CURRENT_USER(), ' | role=', CURRENT_ROLE())
    );
END$$

DELIMITER ;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_log_customers_del$$

CREATE TRIGGER trg_log_customers_del
AFTER DELETE ON Customers
FOR EACH ROW
BEGIN
    IF @app_actor IS NULL OR TRIM(@app_actor) = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'app_actor must be set before writing audit records.';
    END IF;
    IF fn_is_trusted_app_context() <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Application context is invalid or untrusted.';
    END IF;

    INSERT INTO AuditLog (TableName, ActionType, RecordID, OldValues, PerformedBy)
    VALUES (
        'Customers',
        'DELETE',
        OLD.CustomerID,
        JSON_OBJECT(
            'Gender', OLD.Gender,
            'IdentityHash', OLD.IdentityHash,
            'PhoneHash', OLD.PhoneHash,
            'City', OLD.City,
            'RegistrationDate', OLD.RegistrationDate
        ),
        CONCAT(COALESCE(NULLIF(TRIM(@app_actor), ''), 'unknown'), ' | db=', CURRENT_USER(), ' | role=', CURRENT_ROLE())
    );
END$$

DELIMITER ;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_log_employees_ins$$

CREATE TRIGGER trg_log_employees_ins
AFTER INSERT ON Employees
FOR EACH ROW
BEGIN
    IF @app_actor IS NULL OR TRIM(@app_actor) = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'app_actor must be set before writing audit records.';
    END IF;
    IF fn_is_trusted_app_context() <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Application context is invalid or untrusted.';
    END IF;

    INSERT INTO AuditLog (TableName, ActionType, RecordID, NewValues, PerformedBy)
    VALUES (
        'Employees',
        'INSERT',
        NEW.EmployeeID,
        JSON_OBJECT(
            'EmployeeID', NEW.EmployeeID,
            'Position', NEW.Position,
            'HireDate', NEW.HireDate,
            'BranchID', NEW.BranchID,
            'ManagerID', NEW.ManagerID,
            'EmailHash', NEW.EmailHash
        ),
        CONCAT(COALESCE(NULLIF(TRIM(@app_actor), ''), 'unknown'), ' | db=', CURRENT_USER(), ' | role=', CURRENT_ROLE())
    );
END$$

DELIMITER ;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_log_employees_upd$$

CREATE TRIGGER trg_log_employees_upd
AFTER UPDATE ON Employees
FOR EACH ROW
BEGIN
    IF @app_actor IS NULL OR TRIM(@app_actor) = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'app_actor must be set before writing audit records.';
    END IF;
    IF fn_is_trusted_app_context() <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Application context is invalid or untrusted.';
    END IF;

    INSERT INTO AuditLog (TableName, ActionType, RecordID, OldValues, NewValues, PerformedBy)
    VALUES (
        'Employees',
        'UPDATE',
        NEW.EmployeeID,
        JSON_OBJECT(
            'Position', OLD.Position,
            'HireDate', OLD.HireDate,
            'BranchID', OLD.BranchID,
            'ManagerID', OLD.ManagerID,
            'EmailHash', OLD.EmailHash
        ),
        JSON_OBJECT(
            'Position', NEW.Position,
            'HireDate', NEW.HireDate,
            'BranchID', NEW.BranchID,
            'ManagerID', NEW.ManagerID,
            'EmailHash', NEW.EmailHash
        ),
        CONCAT(COALESCE(NULLIF(TRIM(@app_actor), ''), 'unknown'), ' | db=', CURRENT_USER(), ' | role=', CURRENT_ROLE())
    );
END$$

DELIMITER ;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_log_employees_del$$

CREATE TRIGGER trg_log_employees_del
AFTER DELETE ON Employees
FOR EACH ROW
BEGIN
    IF @app_actor IS NULL OR TRIM(@app_actor) = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'app_actor must be set before writing audit records.';
    END IF;
    IF fn_is_trusted_app_context() <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Application context is invalid or untrusted.';
    END IF;

    INSERT INTO AuditLog (TableName, ActionType, RecordID, OldValues, PerformedBy)
    VALUES (
        'Employees',
        'DELETE',
        OLD.EmployeeID,
        JSON_OBJECT(
            'Position', OLD.Position,
            'HireDate', OLD.HireDate,
            'BranchID', OLD.BranchID,
            'ManagerID', OLD.ManagerID,
            'EmailHash', OLD.EmailHash
        ),
        CONCAT(COALESCE(NULLIF(TRIM(@app_actor), ''), 'unknown'), ' | db=', CURRENT_USER(), ' | role=', CURRENT_ROLE())
    );
END$$

DELIMITER ;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_log_accounts_ins$$

CREATE TRIGGER trg_log_accounts_ins
AFTER INSERT ON Accounts
FOR EACH ROW
BEGIN
    IF @app_actor IS NULL OR TRIM(@app_actor) = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'app_actor must be set before writing audit records.';
    END IF;
    IF fn_is_trusted_app_context() <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Application context is invalid or untrusted.';
    END IF;

    INSERT INTO AuditLog (TableName, ActionType, RecordID, NewValues, PerformedBy)
    VALUES (
        'Accounts',
        'INSERT',
        NEW.AccountID,
        JSON_OBJECT(
            'AccountID', NEW.AccountID,
            'AccountNumber', NEW.AccountNumber,
            'CustomerID', NEW.CustomerID,
            'AccountTypeID', NEW.AccountTypeID,
            'BranchID', NEW.BranchID,
            'Balance', NEW.Balance,
            'OpenDate', NEW.OpenDate,
            'Status', NEW.Status
        ),
        CONCAT(COALESCE(NULLIF(TRIM(@app_actor), ''), 'unknown'), ' | db=', CURRENT_USER(), ' | role=', CURRENT_ROLE())
    );
END$$

DELIMITER ;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_log_accounts_upd$$

CREATE TRIGGER trg_log_accounts_upd
AFTER UPDATE ON Accounts
FOR EACH ROW
BEGIN
    IF @app_actor IS NULL OR TRIM(@app_actor) = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'app_actor must be set before writing audit records.';
    END IF;
    IF fn_is_trusted_app_context() <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Application context is invalid or untrusted.';
    END IF;

    INSERT INTO AuditLog (TableName, ActionType, RecordID, OldValues, NewValues, PerformedBy)
    VALUES (
        'Accounts',
        'UPDATE',
        NEW.AccountID,
        JSON_OBJECT(
            'AccountNumber', OLD.AccountNumber,
            'CustomerID', OLD.CustomerID,
            'AccountTypeID', OLD.AccountTypeID,
            'BranchID', OLD.BranchID,
            'Balance', OLD.Balance,
            'OpenDate', OLD.OpenDate,
            'Status', OLD.Status
        ),
        JSON_OBJECT(
            'AccountNumber', NEW.AccountNumber,
            'CustomerID', NEW.CustomerID,
            'AccountTypeID', NEW.AccountTypeID,
            'BranchID', NEW.BranchID,
            'Balance', NEW.Balance,
            'OpenDate', NEW.OpenDate,
            'Status', NEW.Status
        ),
        CONCAT(COALESCE(NULLIF(TRIM(@app_actor), ''), 'unknown'), ' | db=', CURRENT_USER(), ' | role=', CURRENT_ROLE())
    );
END$$

DELIMITER ;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_log_accounts_del$$

CREATE TRIGGER trg_log_accounts_del
AFTER DELETE ON Accounts
FOR EACH ROW
BEGIN
    IF @app_actor IS NULL OR TRIM(@app_actor) = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'app_actor must be set before writing audit records.';
    END IF;
    IF fn_is_trusted_app_context() <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Application context is invalid or untrusted.';
    END IF;

    INSERT INTO AuditLog (TableName, ActionType, RecordID, OldValues, PerformedBy)
    VALUES (
        'Accounts',
        'DELETE',
        OLD.AccountID,
        JSON_OBJECT(
            'AccountNumber', OLD.AccountNumber,
            'CustomerID', OLD.CustomerID,
            'AccountTypeID', OLD.AccountTypeID,
            'BranchID', OLD.BranchID,
            'Balance', OLD.Balance,
            'OpenDate', OLD.OpenDate,
            'Status', OLD.Status
        ),
        CONCAT(COALESCE(NULLIF(TRIM(@app_actor), ''), 'unknown'), ' | db=', CURRENT_USER(), ' | role=', CURRENT_ROLE())
    );
END$$

DELIMITER ;

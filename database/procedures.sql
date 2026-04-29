USE banking_system;

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_create_customer$$

CREATE PROCEDURE sp_create_customer(
    IN p_first_name       VARCHAR(50),
    IN p_last_name        VARCHAR(50),
    IN p_date_of_birth    DATE,
    IN p_gender           VARCHAR(10),
    IN p_identity_number  VARCHAR(32),
    IN p_phone            VARCHAR(20),
    IN p_email            VARCHAR(255),
    IN p_address          VARCHAR(255),
    IN p_city             VARCHAR(50),
    OUT p_customer_id     INT
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF fn_is_trusted_app_context() <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Application context is invalid or untrusted.';
    END IF;

    IF p_first_name IS NULL OR TRIM(p_first_name) = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Customer first name is required.';
    END IF;

    IF p_last_name IS NULL OR TRIM(p_last_name) = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Customer last name is required.';
    END IF;

    IF p_gender NOT IN ('M', 'F', 'Other') THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Customer gender must be M, F, or Other.';
    END IF;

    START TRANSACTION;

    INSERT INTO Customers (
        FirstName,
        LastName,
        DateOfBirth,
        Gender,
        IdentityNumber,
        IdentityHash,
        Phone,
        PhoneHash,
        Email,
        EncryptionKeyVersion,
        Address,
        City
    )
    VALUES (
        p_first_name,
        p_last_name,
        p_date_of_birth,
        p_gender,
        AES_ENCRYPT(p_identity_number, @encryption_key),
        SHA2(CONCAT(@hash_pepper, '|', TRIM(p_identity_number)), 256),
        AES_ENCRYPT(p_phone, @encryption_key),
        SHA2(CONCAT(@hash_pepper, '|', TRIM(p_phone)), 256),
        CASE
            WHEN p_email IS NULL OR TRIM(p_email) = '' THEN NULL
            ELSE AES_ENCRYPT(p_email, @encryption_key)
        END,
        COALESCE(CAST(@encryption_key_version AS UNSIGNED), 1),
        p_address,
        p_city
    );

    SET p_customer_id = LAST_INSERT_ID();

    COMMIT;
END$$

DELIMITER ;

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_open_account$$

CREATE PROCEDURE sp_open_account(
    IN p_customer_id      INT,
    IN p_account_type_id  INT,
    IN p_branch_id        INT,
    OUT p_account_id      INT,
    OUT p_account_number  VARCHAR(20)
)
BEGIN
    DECLARE v_customer_exists      INT DEFAULT 0;
    DECLARE v_account_type_exists  INT DEFAULT 0;
    DECLARE v_branch_exists        INT DEFAULT 0;
    DECLARE v_account_sequence     INT DEFAULT 0;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF fn_is_trusted_app_context() <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Application context is invalid or untrusted.';
    END IF;

    IF @app_role = 'teller' THEN
        IF @app_branch_id IS NULL THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Teller branch context is missing.';
        END IF;

        IF p_branch_id <> @app_branch_id THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Tellers may only open accounts in their own branch.';
        END IF;
    END IF;

    START TRANSACTION;

    SELECT CustomerID INTO v_customer_exists
    FROM Customers
    WHERE CustomerID = p_customer_id
    FOR UPDATE;

    IF v_customer_exists = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Customer does not exist.';
    END IF;

    SELECT COUNT(*) INTO v_account_type_exists
    FROM AccountTypes
    WHERE AccountTypeID = p_account_type_id;

    IF v_account_type_exists = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Account type does not exist.';
    END IF;

    SELECT COUNT(*) INTO v_branch_exists
    FROM Branches
    WHERE BranchID = p_branch_id;

    IF v_branch_exists = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Branch does not exist.';
    END IF;

    SELECT COUNT(*) + 1 INTO v_account_sequence
    FROM Accounts
    WHERE CustomerID = p_customer_id;

    SET p_account_number = CONCAT(
        LPAD(p_branch_id, 4, '0'),
        '-',
        LPAD(p_customer_id, 4, '0'),
        '-',
        LPAD(v_account_sequence, 6, '0')
    );

    INSERT INTO Accounts (
        AccountNumber,
        CustomerID,
        AccountTypeID,
        BranchID,
        Balance,
        Status
    )
    VALUES (
        p_account_number,
        p_customer_id,
        p_account_type_id,
        p_branch_id,
        0.00,
        'Active'
    );

    SET p_account_id = LAST_INSERT_ID();

    COMMIT;
END$$

DELIMITER ;

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_close_account$$

CREATE PROCEDURE sp_close_account(
    IN p_account_id INT
)
BEGIN
    DECLARE v_status   ENUM('Active','Closed','Frozen');
    DECLARE v_balance  DECIMAL(18,2);

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF fn_is_trusted_app_context() <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Application context is invalid or untrusted.';
    END IF;

    START TRANSACTION;

    SELECT Status, Balance INTO v_status, v_balance
    FROM Accounts
    WHERE AccountID = p_account_id
    FOR UPDATE;

    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Account does not exist.';
    END IF;

    IF v_status <> 'Active' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Only Active accounts can be closed.';
    END IF;

    IF v_balance <> 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Account balance must be zero before closing.';
    END IF;

    UPDATE Accounts
    SET Status = 'Closed'
    WHERE AccountID = p_account_id;

    COMMIT;
END$$

DELIMITER ;

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_deposit$$

CREATE PROCEDURE sp_deposit(
    IN p_account_id INT,
    IN p_amount     DECIMAL(18,2)
)
BEGIN
    DECLARE v_status         ENUM('Active','Closed','Frozen');
    DECLARE v_account_branch INT;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_amount <= 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Deposit amount must be greater than zero.';
    END IF;

    IF fn_is_trusted_app_context() <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Application context is invalid or untrusted.';
    END IF;

    START TRANSACTION;

    SELECT Status, BranchID INTO v_status, v_account_branch
    FROM Accounts
    WHERE AccountID = p_account_id
    FOR UPDATE;

    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Account does not exist.';
    END IF;

    IF v_status <> 'Active' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Account is not Active. Deposit denied.';
    END IF;

    IF @app_role = 'teller' AND (@app_branch_id IS NULL OR v_account_branch <> @app_branch_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Tellers may only deposit into accounts in their own branch.';
    END IF;

    UPDATE Accounts
    SET Balance = Balance + p_amount
    WHERE AccountID = p_account_id;

    INSERT INTO Transactions (AccountID, TransactionType, Amount, Description)
    VALUES (p_account_id, 'Deposit', p_amount, CONCAT('Deposit of ', p_amount));

    COMMIT;
END$$

DELIMITER ;

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_withdraw$$

CREATE PROCEDURE sp_withdraw(
    IN p_account_id INT,
    IN p_amount     DECIMAL(18,2)
)
BEGIN
    DECLARE v_status         ENUM('Active','Closed','Frozen');
    DECLARE v_balance        DECIMAL(18,2);
    DECLARE v_account_branch INT;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_amount <= 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Withdrawal amount must be greater than zero.';
    END IF;

    IF fn_is_trusted_app_context() <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Application context is invalid or untrusted.';
    END IF;

    START TRANSACTION;

    SELECT Status, Balance, BranchID INTO v_status, v_balance, v_account_branch
    FROM Accounts
    WHERE AccountID = p_account_id
    FOR UPDATE;

    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Account does not exist.';
    END IF;

    IF v_status <> 'Active' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Account is not Active. Withdrawal denied.';
    END IF;

    IF @app_role = 'teller' AND (@app_branch_id IS NULL OR v_account_branch <> @app_branch_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Tellers may only withdraw from accounts in their own branch.';
    END IF;

    IF v_balance < p_amount THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Insufficient balance for this withdrawal.';
    END IF;

    UPDATE Accounts
    SET Balance = Balance - p_amount
    WHERE AccountID = p_account_id;

    INSERT INTO Transactions (AccountID, TransactionType, Amount, Description)
    VALUES (p_account_id, 'Withdrawal', p_amount, CONCAT('Withdrawal of ', p_amount));

    COMMIT;
END$$

DELIMITER ;

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_transfer$$

CREATE PROCEDURE sp_transfer(
    IN p_from_account INT,
    IN p_to_account   INT,
    IN p_amount       DECIMAL(18,2)
)
BEGIN
    DECLARE v_from_status   ENUM('Active','Closed','Frozen');
    DECLARE v_to_status     ENUM('Active','Closed','Frozen');
    DECLARE v_from_balance  DECIMAL(18,2);
    DECLARE v_from_branch   INT;
    DECLARE v_to_branch     INT;
    DECLARE v_txn_out_id    INT;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_amount <= 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Transfer amount must be greater than zero.';
    END IF;

    IF p_from_account = p_to_account THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Source and destination accounts must be different.';
    END IF;

    IF fn_is_trusted_app_context() <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Application context is invalid or untrusted.';
    END IF;

    START TRANSACTION;

    IF p_from_account < p_to_account THEN
        SELECT Status, Balance, BranchID INTO v_from_status, v_from_balance, v_from_branch
        FROM Accounts WHERE AccountID = p_from_account FOR UPDATE;

        SELECT Status, BranchID INTO v_to_status, v_to_branch
        FROM Accounts WHERE AccountID = p_to_account FOR UPDATE;
    ELSE
        SELECT Status, BranchID INTO v_to_status, v_to_branch
        FROM Accounts WHERE AccountID = p_to_account FOR UPDATE;

        SELECT Status, Balance, BranchID INTO v_from_status, v_from_balance, v_from_branch
        FROM Accounts WHERE AccountID = p_from_account FOR UPDATE;
    END IF;

    IF v_from_status IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Source account does not exist.';
    END IF;
    IF v_from_status <> 'Active' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Source account is not Active. Transfer denied.';
    END IF;

    IF v_to_status IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Destination account does not exist.';
    END IF;
    IF v_to_status <> 'Active' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Destination account is not Active. Transfer denied.';
    END IF;

    IF @app_role = 'teller' THEN
        IF @app_branch_id IS NULL THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Teller branch context is missing.';
        END IF;

        IF v_from_branch <> @app_branch_id OR v_to_branch <> @app_branch_id THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Tellers may only transfer between accounts in their own branch.';
        END IF;
    END IF;

    IF v_from_balance < p_amount THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Insufficient balance in source account for this transfer.';
    END IF;

    INSERT INTO Transactions (AccountID, TransactionType, Amount, Description)
    VALUES (
        p_from_account,
        'Transfer_Out',
        p_amount,
        CONCAT('Transfer to account ', p_to_account)
    );

    SET v_txn_out_id = LAST_INSERT_ID();

    INSERT INTO Transactions (AccountID, TransactionType, Amount, Description, ReferenceID)
    VALUES (
        p_to_account,
        'Transfer_In',
        p_amount,
        CONCAT('Transfer from account ', p_from_account),
        v_txn_out_id
    );

    UPDATE Accounts
    SET Balance = Balance - p_amount
    WHERE AccountID = p_from_account;

    UPDATE Accounts
    SET Balance = Balance + p_amount
    WHERE AccountID = p_to_account;

    COMMIT;
END$$

DELIMITER ;

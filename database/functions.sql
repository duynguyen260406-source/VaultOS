USE banking_system;

DELIMITER $$

DROP FUNCTION IF EXISTS fn_is_trusted_app_context$$

DROP FUNCTION IF EXISTS fn_context_signature$$

CREATE FUNCTION fn_context_signature(
    p_user_id      INT,
    p_username     VARCHAR(50),
    p_role         VARCHAR(32),
    p_employee_id  INT,
    p_branch_id    INT
)
RETURNS CHAR(64)
READS SQL DATA
BEGIN
    DECLARE v_secret VARCHAR(255);

    SELECT SecretValue INTO v_secret
    FROM AppRuntimeSecrets
    WHERE SecretName = 'context_signing_key'
    LIMIT 1;

    IF v_secret IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN LOWER(
        SHA2(
            CONCAT(
                v_secret,
                '|',
                COALESCE(CAST(p_user_id AS CHAR), 'null'),
                '|',
                COALESCE(p_username, 'null'),
                '|',
                COALESCE(p_role, 'null'),
                '|',
                COALESCE(CAST(p_employee_id AS CHAR), 'null'),
                '|',
                COALESCE(CAST(p_branch_id AS CHAR), 'null')
            ),
            256
        )
    );
END$$

DELIMITER ;

DELIMITER $$

CREATE FUNCTION fn_is_trusted_app_context()
RETURNS TINYINT
READS SQL DATA
BEGIN
    DECLARE v_username VARCHAR(50);
    DECLARE v_role VARCHAR(32);
    DECLARE v_status VARCHAR(16);
    DECLARE v_employee_id INT;
    DECLARE v_branch_id INT;
    DECLARE v_auth_user VARCHAR(64);
    DECLARE v_auth_host VARCHAR(255);
    DECLARE v_admin_user VARCHAR(64);
    DECLARE v_admin_host VARCHAR(255);
    DECLARE v_invoker_user VARCHAR(64);
    DECLARE v_invoker_host VARCHAR(255);
    DECLARE v_expected_signature CHAR(64);
    DECLARE v_found INT DEFAULT 1;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_found = 0;

    IF @app_username IS NULL
       OR @app_role IS NULL
       OR @app_context_signature IS NULL
       OR TRIM(@app_context_signature) = '' THEN
        RETURN 0;
    END IF;

    SET v_expected_signature = fn_context_signature(
        @app_user_id,
        @app_username,
        @app_role,
        @app_employee_id,
        @app_branch_id
    );

    IF v_expected_signature IS NULL
       OR BINARY LOWER(TRIM(@app_context_signature)) <> BINARY v_expected_signature THEN
        RETURN 0;
    END IF;

    SET v_invoker_user = SUBSTRING_INDEX(USER(), '@', 1);
    SET v_invoker_host = SUBSTRING_INDEX(USER(), '@', -1);

    SELECT SecretValue INTO v_auth_user
    FROM AppRuntimeSecrets
    WHERE SecretName = 'auth_db_user'
    LIMIT 1;

    SELECT SecretValue INTO v_auth_host
    FROM AppRuntimeSecrets
    WHERE SecretName = 'auth_db_host'
    LIMIT 1;

    SELECT SecretValue INTO v_admin_user
    FROM AppRuntimeSecrets
    WHERE SecretName = 'admin_db_user'
    LIMIT 1;

    SELECT SecretValue INTO v_admin_host
    FROM AppRuntimeSecrets
    WHERE SecretName = 'admin_db_host'
    LIMIT 1;

    IF BINARY @app_role = 'auth' THEN
        RETURN (
            v_auth_user IS NOT NULL
            AND BINARY v_invoker_user = BINARY v_auth_user
            AND (
                v_auth_host IS NULL
                OR BINARY v_auth_host = ''
                OR BINARY v_auth_host = '%'
                OR BINARY v_invoker_host = BINARY v_auth_host
            )
        );
    END IF;

    IF BINARY @app_role = 'system' THEN
        RETURN (
            v_admin_user IS NOT NULL
            AND BINARY v_invoker_user = BINARY v_admin_user
            AND (
                v_admin_host IS NULL
                OR BINARY v_admin_host = ''
                OR BINARY v_admin_host = '%'
                OR BINARY v_invoker_host = BINARY v_admin_host
            )
        );
    END IF;

    IF @app_user_id IS NULL THEN
        RETURN 0;
    END IF;

    SET v_found = 1;
    SELECT
        u.Username,
        u.Role,
        u.Status,
        u.EmployeeID,
        e.BranchID
    INTO
        v_username,
        v_role,
        v_status,
        v_employee_id,
        v_branch_id
    FROM AppUsers u
    LEFT JOIN Employees e ON u.EmployeeID = e.EmployeeID
    WHERE u.UserID = @app_user_id
    LIMIT 1;

    IF v_found = 0 THEN
        RETURN 0;
    END IF;

    IF BINARY v_status <> 'active'
       OR BINARY v_username <> BINARY @app_username
       OR BINARY v_role <> BINARY @app_role
       OR COALESCE(v_employee_id, -1) <> COALESCE(@app_employee_id, -1)
       OR COALESCE(v_branch_id, -1) <> COALESCE(@app_branch_id, -1) THEN
        RETURN 0;
    END IF;

    RETURN 1;
END$$

DELIMITER ;

DELIMITER $$

DROP FUNCTION IF EXISTS fn_compute_interest$$

CREATE FUNCTION fn_compute_interest(
    p_account_id INT,
    p_rate       DECIMAL(5,2),
    p_days       INT
)
RETURNS DECIMAL(18,2)
READS SQL DATA
BEGIN
    DECLARE v_balance  DECIMAL(18,2);
    DECLARE v_interest DECIMAL(18,2);

    SELECT Balance INTO v_balance
    FROM Accounts
    WHERE AccountID = p_account_id;

    IF v_balance IS NULL THEN
        RETURN 0.00;
    END IF;

    SET v_interest = v_balance * (p_rate / 100) * (p_days / 365);

    RETURN ROUND(v_interest, 2);
END$$

DELIMITER ;

DELIMITER $$

DROP FUNCTION IF EXISTS fn_check_min_balance$$

CREATE FUNCTION fn_check_min_balance(
    p_account_id INT,
    p_min_amount DECIMAL(18,2)
)
RETURNS BOOLEAN
READS SQL DATA
BEGIN
    DECLARE v_balance DECIMAL(18,2);

    SELECT Balance INTO v_balance
    FROM Accounts
    WHERE AccountID = p_account_id;

    IF v_balance IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN v_balance >= p_min_amount;
END$$

DELIMITER ;

DELIMITER $$

DROP FUNCTION IF EXISTS fn_rule_value$$

CREATE FUNCTION fn_rule_value(p_code VARCHAR(80))
RETURNS JSON
READS SQL DATA
BEGIN
    DECLARE v_value JSON;

    SELECT Value INTO v_value
    FROM RuleSettings
    WHERE Code = p_code AND Active = TRUE
    LIMIT 1;

    RETURN v_value;
END$$

DELIMITER ;

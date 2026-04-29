USE banking_system;

DROP ROLE IF EXISTS 'role_manager', 'role_teller', 'role_auditor', 'role_backup';

CREATE ROLE 'role_manager';

GRANT SELECT, INSERT, UPDATE ON banking_system.Branches TO 'role_manager';
GRANT SELECT, INSERT, UPDATE ON banking_system.Employees TO 'role_manager';
GRANT SELECT ON banking_system.Customers TO 'role_manager';
GRANT SELECT, INSERT, UPDATE ON banking_system.AppUsers TO 'role_manager';
GRANT SELECT, INSERT, UPDATE ON banking_system.AccountTypes TO 'role_manager';
GRANT SELECT ON banking_system.Accounts TO 'role_manager';
GRANT SELECT ON banking_system.Transactions TO 'role_manager';
GRANT SELECT ON banking_system.Loans TO 'role_manager';
GRANT SELECT ON banking_system.AuditLog TO 'role_manager';
GRANT SELECT, UPDATE ON banking_system.SuspiciousActivity TO 'role_manager';
GRANT SELECT ON banking_system.vw_customer_balances TO 'role_manager';
GRANT SELECT ON banking_system.vw_transaction_summary TO 'role_manager';
GRANT SELECT ON banking_system.vw_branch_overview TO 'role_manager';
GRANT SELECT ON banking_system.vw_customer_directory_masked TO 'role_manager';
GRANT SELECT ON banking_system.vw_customer_details_masked TO 'role_manager';
GRANT SELECT ON banking_system.vw_employee_directory_masked TO 'role_manager';
GRANT SELECT ON banking_system.vw_employee_details_masked TO 'role_manager';
GRANT EXECUTE ON PROCEDURE banking_system.sp_create_customer TO 'role_manager';
GRANT EXECUTE ON PROCEDURE banking_system.sp_open_account TO 'role_manager';
GRANT EXECUTE ON PROCEDURE banking_system.sp_close_account TO 'role_manager';
GRANT EXECUTE ON PROCEDURE banking_system.sp_deposit TO 'role_manager';
GRANT EXECUTE ON PROCEDURE banking_system.sp_withdraw TO 'role_manager';
GRANT EXECUTE ON PROCEDURE banking_system.sp_transfer TO 'role_manager';

CREATE ROLE 'role_teller';

GRANT SELECT ON banking_system.Customers TO 'role_teller';
GRANT SELECT ON banking_system.Branches TO 'role_teller';
GRANT SELECT ON banking_system.AccountTypes TO 'role_teller';
GRANT SELECT ON banking_system.Accounts TO 'role_teller';
GRANT SELECT ON banking_system.Transactions TO 'role_teller';
GRANT EXECUTE ON PROCEDURE banking_system.sp_create_customer TO 'role_teller';
GRANT EXECUTE ON PROCEDURE banking_system.sp_open_account TO 'role_teller';
GRANT EXECUTE ON PROCEDURE banking_system.sp_deposit TO 'role_teller';
GRANT EXECUTE ON PROCEDURE banking_system.sp_withdraw TO 'role_teller';
GRANT EXECUTE ON PROCEDURE banking_system.sp_transfer TO 'role_teller';

CREATE ROLE 'role_auditor';

GRANT SELECT ON banking_system.Branches TO 'role_auditor';
GRANT SELECT ON banking_system.AccountTypes TO 'role_auditor';
GRANT SELECT ON banking_system.Accounts TO 'role_auditor';
GRANT SELECT ON banking_system.Transactions TO 'role_auditor';
GRANT SELECT ON banking_system.AuditLog TO 'role_auditor';
GRANT SELECT, UPDATE ON banking_system.SuspiciousActivity TO 'role_auditor';
GRANT SELECT ON banking_system.vw_customer_balances TO 'role_auditor';
GRANT SELECT ON banking_system.vw_transaction_summary TO 'role_auditor';
GRANT SELECT ON banking_system.vw_branch_overview TO 'role_auditor';
GRANT SELECT ON banking_system.vw_customer_directory_masked TO 'role_auditor';
GRANT SELECT ON banking_system.vw_customer_details_masked TO 'role_auditor';
GRANT SELECT ON banking_system.vw_employee_directory_masked TO 'role_auditor';
GRANT SELECT ON banking_system.vw_employee_details_masked TO 'role_auditor';

CREATE ROLE 'role_backup';

GRANT SELECT, SHOW VIEW, TRIGGER ON banking_system.* TO 'role_backup';
GRANT LOCK TABLES, EVENT ON banking_system.* TO 'role_backup';

FLUSH PRIVILEGES;

USE banking_system;

CREATE INDEX idx_txn_account ON Transactions(AccountID);

CREATE INDEX idx_txn_date ON Transactions(TransactionDate);

CREATE INDEX idx_txn_date_type ON Transactions(TransactionDate, TransactionType);

CREATE INDEX idx_txn_reference ON Transactions(ReferenceID);

CREATE INDEX idx_acct_customer ON Accounts(CustomerID);

CREATE INDEX idx_acct_branch ON Accounts(BranchID);

CREATE INDEX idx_acct_status ON Accounts(Status);

CREATE INDEX idx_acct_branch_status ON Accounts(BranchID, Status);

CREATE INDEX idx_acct_customer_branch ON Accounts(CustomerID, BranchID);

CREATE INDEX idx_emp_branch ON Employees(BranchID);

CREATE INDEX idx_loan_customer ON Loans(CustomerID);

CREATE INDEX idx_loan_status ON Loans(Status);

CREATE INDEX idx_audit_timestamp ON AuditLog(ActionTimestamp);

CREATE INDEX idx_audit_filter ON AuditLog(TableName, ActionType, ActionTimestamp);

CREATE INDEX idx_suspicious_reviewed_date ON SuspiciousActivity(Reviewed, AlertDate);

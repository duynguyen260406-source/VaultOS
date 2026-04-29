CREATE INDEX idx_txn_date_type ON Transactions(TransactionDate, TransactionType);
CREATE INDEX idx_acct_branch_status ON Accounts(BranchID, Status);
CREATE INDEX idx_acct_customer_branch ON Accounts(CustomerID, BranchID);
CREATE INDEX idx_audit_timestamp ON AuditLog(ActionTimestamp);
CREATE INDEX idx_audit_filter ON AuditLog(TableName, ActionType, ActionTimestamp);
CREATE INDEX idx_suspicious_reviewed_date ON SuspiciousActivity(Reviewed, AlertDate);


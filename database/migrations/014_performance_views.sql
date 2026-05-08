-- Migration 014: Branch & teller performance views

CREATE OR REPLACE VIEW vw_teller_productivity AS
SELECT
    u.UserID                                   AS user_id,
    u.Username                                 AS username,
    b.BranchID                                 AS branch_id,
    b.BranchName                               AS branch_name,
    DATE(t.TransactionDate)                    AS txn_date,
    COUNT(*)                                   AS txn_count,
    SUM(t.Amount)                              AS total_amount,
    SUM(CASE WHEN t.TransactionType='Deposit'    THEN 1 ELSE 0 END) AS deposits,
    SUM(CASE WHEN t.TransactionType='Withdrawal' THEN 1 ELSE 0 END) AS withdrawals,
    SUM(CASE WHEN t.TransactionType LIKE 'Transfer%' THEN 1 ELSE 0 END) AS transfers
FROM Transactions t
JOIN Accounts a    ON t.AccountID = a.AccountID
JOIN Branches b    ON a.BranchID  = b.BranchID
LEFT JOIN TellerSessions s ON (
    t.TransactionDate BETWEEN s.OpenedAt AND COALESCE(s.ClosedAt, NOW())
    AND a.BranchID = s.BranchID
)
LEFT JOIN AppUsers u ON s.UserID = u.UserID
WHERE t.TransactionDate >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
GROUP BY u.UserID, u.Username, b.BranchID, b.BranchName, DATE(t.TransactionDate);

CREATE OR REPLACE VIEW vw_branch_performance AS
SELECT
    b.BranchID                                  AS branch_id,
    b.BranchName                                AS branch_name,
    DATE(t.TransactionDate)                     AS txn_date,
    COUNT(*)                                    AS txn_count,
    SUM(t.Amount)                               AS total_amount,
    COUNT(DISTINCT t.AccountID)                 AS active_accounts,
    SUM(CASE WHEN t.TransactionType='Deposit'    THEN t.Amount ELSE 0 END) AS deposit_volume,
    SUM(CASE WHEN t.TransactionType='Withdrawal' THEN t.Amount ELSE 0 END) AS withdrawal_volume,
    SUM(CASE WHEN t.TransactionType LIKE 'Transfer%' THEN t.Amount ELSE 0 END) AS transfer_volume
FROM Transactions t
JOIN Accounts a ON t.AccountID = a.AccountID
JOIN Branches b ON a.BranchID  = b.BranchID
WHERE t.TransactionDate >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
GROUP BY b.BranchID, b.BranchName, DATE(t.TransactionDate);

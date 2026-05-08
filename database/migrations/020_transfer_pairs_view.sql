-- Migration 020: Transfer pairs view for network graph

CREATE OR REPLACE VIEW vw_transfer_pairs AS
SELECT
    tout.TransactionID  AS out_txn_id,
    tin.TransactionID   AS in_txn_id,
    aout.CustomerID     AS from_customer_id,
    ain.CustomerID      AS to_customer_id,
    CONCAT(cf.FirstName,' ',cf.LastName) AS from_name,
    CONCAT(ct.FirstName,' ',ct.LastName) AS to_name,
    tout.Amount         AS amount,
    DATE(tout.TransactionDate) AS txn_date
FROM Transactions tout
JOIN Transactions tin  ON tout.ReferenceID = tin.ReferenceID
                       AND tout.TransactionType = 'Transfer_Out'
                       AND tin.TransactionType  = 'Transfer_In'
JOIN Accounts aout ON tout.AccountID = aout.AccountID
JOIN Accounts ain  ON tin.AccountID  = ain.AccountID
JOIN Customers cf  ON aout.CustomerID = cf.CustomerID
JOIN Customers ct  ON ain.CustomerID  = ct.CustomerID
WHERE aout.CustomerID != ain.CustomerID;

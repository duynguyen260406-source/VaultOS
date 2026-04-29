USE banking_system;

CREATE OR REPLACE VIEW vw_customer_balances AS
SELECT
    c.CustomerID,
    CONCAT(c.FirstName, ' ', c.LastName)    AS CustomerName,
    COALESCE(SUM(a.Balance), 0)             AS TotalBalance
FROM Customers c
LEFT JOIN Accounts a
    ON c.CustomerID = a.CustomerID
    AND a.Status = 'Active'
GROUP BY c.CustomerID, c.FirstName, c.LastName;

CREATE OR REPLACE VIEW vw_transaction_summary AS
SELECT
    DATE(t.TransactionDate)     AS TransactionDate,
    t.TransactionType,
    COUNT(*)                    AS TransactionCount,
    SUM(t.Amount)               AS TotalAmount
FROM Transactions t
GROUP BY DATE(t.TransactionDate), t.TransactionType
ORDER BY TransactionDate DESC, TransactionType;

CREATE OR REPLACE VIEW vw_branch_overview AS
SELECT
    b.BranchName,
    b.City,
    (SELECT COUNT(*)
     FROM Accounts a
     WHERE a.BranchID = b.BranchID
       AND a.Status = 'Active') AS AccountCount,
    (SELECT COUNT(*)
     FROM Employees e
     WHERE e.BranchID = b.BranchID) AS EmployeeCount,
    (SELECT COALESCE(SUM(a.Balance), 0)
     FROM Accounts a
     WHERE a.BranchID = b.BranchID
       AND a.Status = 'Active') AS TotalDeposits
FROM Branches b;

CREATE OR REPLACE VIEW vw_customer_directory_masked AS
SELECT
    CustomerID,
    FirstName,
    LastName,
    CASE
        WHEN Email IS NULL THEN NULL
        ELSE 'REDACTED'
    END AS EmailMasked,
    'REDACTED' AS PhoneMasked
FROM Customers;

CREATE OR REPLACE VIEW vw_customer_details_masked AS
SELECT
    CustomerID,
    FirstName,
    LastName,
    CASE
        WHEN Email IS NULL THEN NULL
        ELSE 'REDACTED'
    END AS EmailMasked,
    'REDACTED' AS PhoneMasked,
    CONCAT(LEFT(Address, 12), '...') AS AddressMasked,
    CONCAT(YEAR(DateOfBirth), '-**-**') AS DateOfBirthMasked,
    Gender,
    City,
    RegistrationDate
FROM Customers;

CREATE OR REPLACE VIEW vw_employee_directory_masked AS
SELECT
    EmployeeID,
    BranchID,
    ManagerID,
    FirstName,
    LastName,
    Position,
    Salary,
    CASE
        WHEN Email IS NULL THEN NULL
        ELSE 'REDACTED'
    END AS EmailMasked,
    CASE
        WHEN Phone IS NULL THEN NULL
        ELSE 'REDACTED'
    END AS PhoneMasked,
    HireDate
FROM Employees;

CREATE OR REPLACE VIEW vw_employee_details_masked AS
SELECT
    EmployeeID,
    BranchID,
    ManagerID,
    FirstName,
    LastName,
    Position,
    Salary,
    CASE
        WHEN Email IS NULL THEN NULL
        ELSE 'REDACTED'
    END AS EmailMasked,
    CASE
        WHEN Phone IS NULL THEN NULL
        ELSE 'REDACTED'
    END AS PhoneMasked,
    HireDate
FROM Employees;

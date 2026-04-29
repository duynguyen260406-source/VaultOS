CREATE DATABASE IF NOT EXISTS banking_system
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE banking_system;

CREATE TABLE IF NOT EXISTS Branches (
    BranchID        INT             AUTO_INCREMENT PRIMARY KEY,
    BranchName      VARCHAR(100)    NOT NULL,
    Address         VARCHAR(255)    NOT NULL,
    City            VARCHAR(50)     NOT NULL,
    Phone           VARCHAR(15)     NOT NULL,
    EstablishedDate DATE            NOT NULL,
    CONSTRAINT uq_branch_name UNIQUE (BranchName),
    CONSTRAINT chk_branch_phone CHECK (Phone REGEXP '^[0-9]{10,15}$')
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Employees (
    EmployeeID      INT             AUTO_INCREMENT PRIMARY KEY,
    FirstName       VARCHAR(50)     NOT NULL,
    LastName        VARCHAR(50)     NOT NULL,
    Position        VARCHAR(50)     NOT NULL,
    Salary          DECIMAL(15,2)   NOT NULL,
    HireDate        DATE            NOT NULL,
    BranchID        INT             NOT NULL,
    ManagerID       INT             NULL,
    Email           VARBINARY(255)  NULL,
    EmailHash       CHAR(64)        NULL,
    Phone           VARBINARY(255)  NULL,
    EncryptionKeyVersion INT        NOT NULL DEFAULT 1,
    CONSTRAINT fk_emp_branch  FOREIGN KEY (BranchID)  REFERENCES Branches(BranchID)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_emp_manager FOREIGN KEY (ManagerID)  REFERENCES Employees(EmployeeID)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT uq_emp_email_hash UNIQUE (EmailHash),
    CONSTRAINT chk_emp_salary CHECK (Salary > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Customers (
    CustomerID      INT             AUTO_INCREMENT PRIMARY KEY,
    FirstName       VARCHAR(50)     NOT NULL,
    LastName        VARCHAR(50)     NOT NULL,
    DateOfBirth     DATE            NOT NULL,
    Gender          ENUM('M','F','Other') NOT NULL,
    IdentityNumber  VARBINARY(255)  NOT NULL,
    IdentityHash    CHAR(64)        NOT NULL,
    Phone           VARBINARY(255)  NOT NULL,
    PhoneHash       CHAR(64)        NOT NULL,
    Email           VARBINARY(255)  NULL,
    EncryptionKeyVersion INT        NOT NULL DEFAULT 1,
    Address         VARCHAR(255)    NOT NULL,
    City            VARCHAR(50)     NOT NULL,
    RegistrationDate DATE           NOT NULL DEFAULT (CURRENT_DATE),
    CONSTRAINT uq_cust_identity_hash UNIQUE (IdentityHash),
    CONSTRAINT uq_cust_phone_hash    UNIQUE (PhoneHash)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS AppUsers (
    UserID             INT             AUTO_INCREMENT PRIMARY KEY,
    Username           VARCHAR(50)     NOT NULL,
    PasswordHash       VARCHAR(255)    NOT NULL,
    Role               ENUM('manager','teller','auditor') NOT NULL,
    Status             ENUM('pending','active','locked','disabled') NOT NULL DEFAULT 'active',
    EmployeeID         INT             NULL,
    CustomerID         INT             NULL,
    FailedLoginCount   INT             NOT NULL DEFAULT 0,
    LastLoginAt        DATETIME        NULL,
    PasswordChangedAt  DATETIME        NULL,
    SessionVersion     INT             NOT NULL DEFAULT 0,
    CreatedAt          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CreatedByUserID    INT             NULL,
    CONSTRAINT uq_appusers_username UNIQUE (Username),
    CONSTRAINT fk_appusers_employee FOREIGN KEY (EmployeeID) REFERENCES Employees(EmployeeID)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_appusers_customer FOREIGN KEY (CustomerID) REFERENCES Customers(CustomerID)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_appusers_creator FOREIGN KEY (CreatedByUserID) REFERENCES AppUsers(UserID)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT chk_appusers_staff_identity CHECK (EmployeeID IS NOT NULL AND CustomerID IS NULL),
    CONSTRAINT chk_appusers_failed_count CHECK (FailedLoginCount >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS AppRuntimeSecrets (
    SecretName       VARCHAR(64)     PRIMARY KEY,
    SecretValue      VARCHAR(255)    NOT NULL,
    UpdatedAt        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS AccountTypes (
    AccountTypeID   INT             AUTO_INCREMENT PRIMARY KEY,
    TypeName        VARCHAR(30)     NOT NULL,
    Description     VARCHAR(255)    NULL,
    CONSTRAINT uq_acct_type UNIQUE (TypeName)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Accounts (
    AccountID       INT             AUTO_INCREMENT PRIMARY KEY,
    AccountNumber   VARCHAR(20)     NOT NULL,
    CustomerID      INT             NOT NULL,
    AccountTypeID   INT             NOT NULL,
    BranchID        INT             NOT NULL,
    Balance         DECIMAL(18,2)   NOT NULL DEFAULT 0.00,
    OpenDate        DATE            NOT NULL DEFAULT (CURRENT_DATE),
    Status          ENUM('Active','Closed','Frozen') NOT NULL DEFAULT 'Active',
    CONSTRAINT fk_acct_customer FOREIGN KEY (CustomerID)    REFERENCES Customers(CustomerID)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_acct_type     FOREIGN KEY (AccountTypeID) REFERENCES AccountTypes(AccountTypeID)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_acct_branch   FOREIGN KEY (BranchID)      REFERENCES Branches(BranchID)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT uq_acct_number   UNIQUE (AccountNumber),
    CONSTRAINT chk_acct_balance CHECK (Balance >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Transactions (
    TransactionID   INT             AUTO_INCREMENT PRIMARY KEY,
    AccountID       INT             NOT NULL,
    TransactionType ENUM('Deposit','Withdrawal','Transfer_In','Transfer_Out') NOT NULL,
    Amount          DECIMAL(18,2)   NOT NULL,
    TransactionDate DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Description     VARCHAR(255)    NULL,
    ReferenceID     INT             NULL COMMENT 'References the originating Transfer_Out row for linked transfer entries',
    CONSTRAINT fk_txn_account FOREIGN KEY (AccountID) REFERENCES Accounts(AccountID)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_txn_reference FOREIGN KEY (ReferenceID) REFERENCES Transactions(TransactionID)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT chk_txn_amount CHECK (Amount > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Loans (
    LoanID          INT             AUTO_INCREMENT PRIMARY KEY,
    CustomerID      INT             NOT NULL,
    BranchID        INT             NOT NULL,
    LoanAmount      DECIMAL(18,2)   NOT NULL,
    InterestRate    DECIMAL(5,2)    NOT NULL,
    StartDate       DATE            NOT NULL,
    EndDate         DATE            NOT NULL,
    Status          ENUM('Active','Paid','Defaulted') NOT NULL DEFAULT 'Active',
    CONSTRAINT fk_loan_customer FOREIGN KEY (CustomerID) REFERENCES Customers(CustomerID)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_loan_branch   FOREIGN KEY (BranchID)   REFERENCES Branches(BranchID)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_loan_amount  CHECK (LoanAmount > 0),
    CONSTRAINT chk_loan_rate    CHECK (InterestRate > 0 AND InterestRate < 100),
    CONSTRAINT chk_loan_dates   CHECK (EndDate > StartDate)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS AuditLog (
    AuditID         INT             AUTO_INCREMENT PRIMARY KEY,
    TableName       VARCHAR(50)     NOT NULL,
    ActionType      VARCHAR(20)     NOT NULL,
    RecordID        INT             NOT NULL,
    OldValues       JSON            NULL,
    NewValues       JSON            NULL,
    ActionTimestamp DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PerformedBy     VARCHAR(100)    NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS SuspiciousActivity (
    AlertID         INT             AUTO_INCREMENT PRIMARY KEY,
    TransactionID   INT             NOT NULL,
    AccountID       INT             NOT NULL,
    Amount          DECIMAL(18,2)   NOT NULL,
    AlertDate       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Reason          VARCHAR(255)    NOT NULL,
    Reviewed        BOOLEAN         NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_alert_txn FOREIGN KEY (TransactionID) REFERENCES Transactions(TransactionID)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_alert_acct FOREIGN KEY (AccountID) REFERENCES Accounts(AccountID)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

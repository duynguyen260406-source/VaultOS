-- Migration 005: Enhanced loan lifecycle
-- Extends the existing Loans table and adds LoanRepayments.

ALTER TABLE Loans
    ADD COLUMN IF NOT EXISTS Purpose              VARCHAR(255)  NULL,
    ADD COLUMN IF NOT EXISTS TermMonths           INT           NULL,
    ADD COLUMN IF NOT EXISTS MonthlyPaymentAmount DECIMAL(18,2) NULL,
    ADD COLUMN IF NOT EXISTS PrincipalOutstanding DECIMAL(18,2) NULL,
    ADD COLUMN IF NOT EXISTS InterestAccrued      DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS NextPaymentDate      DATE          NULL,
    ADD COLUMN IF NOT EXISTS DisbursementDate     DATE          NULL,
    ADD COLUMN IF NOT EXISTS ApprovalStatus       ENUM('Pending','Approved','Rejected','Disbursed','InArrears','Paid','WrittenOff') NOT NULL DEFAULT 'Pending',
    ADD COLUMN IF NOT EXISTS ApprovedByUserID     INT           NULL,
    ADD COLUMN IF NOT EXISTS RejectionReason      TEXT          NULL,
    ADD COLUMN IF NOT EXISTS LinkedAccountID      INT           NULL,
    ADD COLUMN IF NOT EXISTS CreatedByUserID      INT           NULL;

ALTER TABLE Loans
    ADD CONSTRAINT IF NOT EXISTS fk_loan_approved_by    FOREIGN KEY (ApprovedByUserID)  REFERENCES AppUsers(UserID)    ON DELETE SET NULL,
    ADD CONSTRAINT IF NOT EXISTS fk_loan_linked_account FOREIGN KEY (LinkedAccountID)   REFERENCES Accounts(AccountID) ON DELETE SET NULL,
    ADD CONSTRAINT IF NOT EXISTS fk_loan_created_by     FOREIGN KEY (CreatedByUserID)   REFERENCES AppUsers(UserID)    ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS LoanRepayments (
    RepaymentID      INT           AUTO_INCREMENT PRIMARY KEY,
    LoanID           INT           NOT NULL,
    TransactionID    INT           NULL,
    PaidAt           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Amount           DECIMAL(18,2) NOT NULL,
    PrincipalPortion DECIMAL(18,2) NOT NULL,
    InterestPortion  DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    PrincipalAfter   DECIMAL(18,2) NOT NULL,
    CreatedByUserID  INT           NULL,
    INDEX idx_repay_loan (LoanID, PaidAt),
    INDEX idx_repay_txn  (TransactionID),
    CONSTRAINT fk_repay_loan FOREIGN KEY (LoanID)        REFERENCES Loans(LoanID)            ON DELETE RESTRICT,
    CONSTRAINT fk_repay_txn  FOREIGN KEY (TransactionID) REFERENCES Transactions(TransactionID) ON DELETE SET NULL,
    CONSTRAINT fk_repay_user FOREIGN KEY (CreatedByUserID) REFERENCES AppUsers(UserID)       ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

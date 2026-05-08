-- Migration 012: Interest accrual support
-- Adds interest rate fields to AccountTypes, last accrual date to Accounts,
-- and extends the TransactionType enum to cover system-generated credits/debits.

ALTER TABLE AccountTypes
    ADD COLUMN IF NOT EXISTS InterestRate    DECIMAL(7,4) NULL     DEFAULT NULL COMMENT 'Annual interest rate (e.g. 0.0450 = 4.5%)',
    ADD COLUMN IF NOT EXISTS AccruesInterest TINYINT(1)   NOT NULL DEFAULT 0    COMMENT '1 = daily interest accrual enabled';

ALTER TABLE Accounts
    ADD COLUMN IF NOT EXISTS LastInterestAccruedDate DATE NULL DEFAULT NULL;

ALTER TABLE Transactions
    MODIFY COLUMN TransactionType
        ENUM('Deposit','Withdrawal','Transfer_In','Transfer_Out','InterestCredit','FeeDebit')
        NOT NULL;

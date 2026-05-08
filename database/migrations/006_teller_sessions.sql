-- Migration 006: Teller session / cash-drawer tracking
-- Each teller opens one session per working day; closing captures counted cash vs expected.

CREATE TABLE IF NOT EXISTS TellerSessions (
    SessionID            INT AUTO_INCREMENT PRIMARY KEY,
    UserID               INT           NOT NULL,
    BranchID             INT           NOT NULL,
    OpenedAt             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    OpeningBalance       DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    ClosedAt             DATETIME      NULL,
    ClosingBalanceCounted DECIMAL(18,2) NULL,
    ClosingBalanceExpected DECIMAL(18,2) NULL,
    Variance             DECIMAL(18,2) NULL,
    Status               ENUM('open','closed','reconciled','flagged') NOT NULL DEFAULT 'open',
    Notes                TEXT          NULL,
    INDEX idx_sess_user_status   (UserID,   Status),
    INDEX idx_sess_branch_status (BranchID, Status),
    INDEX idx_sess_opened        (OpenedAt),
    CONSTRAINT fk_sess_user   FOREIGN KEY (UserID)   REFERENCES AppUsers(UserID)   ON DELETE RESTRICT,
    CONSTRAINT fk_sess_branch FOREIGN KEY (BranchID) REFERENCES Branches(BranchID) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

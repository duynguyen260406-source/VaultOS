CREATE TABLE IF NOT EXISTS PendingApprovals (
    ApprovalID          INT             AUTO_INCREMENT PRIMARY KEY,
    RequestType         VARCHAR(50)     NOT NULL,
    Payload             JSON            NOT NULL,
    RequestedByUserID   INT             NOT NULL,
    RequestedAt         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    BranchID            INT             NULL,
    Status              ENUM('pending','approved','rejected','executed','failed') NOT NULL DEFAULT 'pending',
    ReviewedByUserID    INT             NULL,
    ReviewedAt          DATETIME        NULL,
    ReviewNotes         TEXT            NULL,
    ExecutedAt          DATETIME        NULL,
    ExecutionError      TEXT            NULL,
    ResultRefID         INT             NULL,
    INDEX idx_approvals_status_date      (Status, RequestedAt),
    INDEX idx_approvals_branch_status    (BranchID, Status),
    INDEX idx_approvals_requester_status (RequestedByUserID, Status),
    CONSTRAINT fk_approvals_requester FOREIGN KEY (RequestedByUserID)
        REFERENCES AppUsers(UserID) ON DELETE RESTRICT,
    CONSTRAINT fk_approvals_reviewer FOREIGN KEY (ReviewedByUserID)
        REFERENCES AppUsers(UserID) ON DELETE SET NULL,
    CONSTRAINT fk_approvals_branch FOREIGN KEY (BranchID)
        REFERENCES Branches(BranchID) ON DELETE SET NULL
) ENGINE=InnoDB

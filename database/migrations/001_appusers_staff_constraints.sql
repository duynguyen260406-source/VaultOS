ALTER TABLE AppUsers
    ADD CONSTRAINT chk_appusers_staff_identity
        CHECK (EmployeeID IS NOT NULL AND CustomerID IS NULL),
    ADD CONSTRAINT chk_appusers_failed_count
        CHECK (FailedLoginCount >= 0);


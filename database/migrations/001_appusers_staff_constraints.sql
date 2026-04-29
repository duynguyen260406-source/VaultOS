ALTER TABLE AppUsers
    DROP FOREIGN KEY fk_appusers_employee,
    DROP FOREIGN KEY fk_appusers_customer,
    ADD CONSTRAINT fk_appusers_employee
        FOREIGN KEY (EmployeeID) REFERENCES Employees(EmployeeID)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    ADD CONSTRAINT fk_appusers_customer
        FOREIGN KEY (CustomerID) REFERENCES Customers(CustomerID)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    ADD CONSTRAINT chk_appusers_staff_identity
        CHECK (EmployeeID IS NOT NULL AND CustomerID IS NULL),
    ADD CONSTRAINT chk_appusers_failed_count
        CHECK (FailedLoginCount >= 0);

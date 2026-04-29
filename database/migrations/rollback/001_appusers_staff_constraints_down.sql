ALTER TABLE AppUsers
    DROP FOREIGN KEY fk_appusers_employee,
    DROP FOREIGN KEY fk_appusers_customer,
    DROP CHECK chk_appusers_staff_identity,
    DROP CHECK chk_appusers_failed_count,
    ADD CONSTRAINT fk_appusers_employee
        FOREIGN KEY (EmployeeID) REFERENCES Employees(EmployeeID)
        ON UPDATE CASCADE ON DELETE SET NULL,
    ADD CONSTRAINT fk_appusers_customer
        FOREIGN KEY (CustomerID) REFERENCES Customers(CustomerID)
        ON UPDATE CASCADE ON DELETE SET NULL;

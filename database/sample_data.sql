USE banking_system;

SET @encryption_key = COALESCE(@encryption_key, 'banking_system_demo_key_change_me');
SET @hash_pepper = COALESCE(@hash_pepper, @encryption_key);

INSERT INTO Branches (BranchName, Address, City, Phone, EstablishedDate) VALUES
('Chi nhanh Hoan Kiem',     '25 Trang Tien, Hoan Kiem',          'Ha Noi',        '02439361000', '2005-03-15'),
('Chi nhanh Dong Da',       '198 Thai Ha, Dong Da',              'Ha Noi',        '02435371234', '2008-07-20'),
('Chi nhanh Ben Thanh',     '45 Le Loi, Quan 1',                 'Ho Chi Minh',   '02838291500', '2003-11-10'),
('Chi nhanh Hai Chau',      '88 Bach Dang, Hai Chau',            'Da Nang',       '02363822000', '2010-01-05'),
('Chi nhanh Ngu Hanh Son',  '120 Le Van Hien, Ngu Hanh Son',     'Da Nang',       '02363950100', '2015-06-18'),
('Chi nhanh Ninh Kieu',     '30 Hoa Binh, Ninh Kieu',            'Can Tho',       '02923812000', '2012-09-25'),
('Chi nhanh Tan Binh',      '300 Hoang Van Thu, Tan Binh',        'Ho Chi Minh',   '02838440200', '2007-04-01'),
('Chi nhanh Cau Giay',      '152 Xuan Thuy, Cau Giay',           'Ha Noi',        '02437957800', '2014-02-14');

INSERT INTO Employees (
    FirstName,
    LastName,
    Position,
    Salary,
    HireDate,
    BranchID,
    ManagerID,
    Email,
    EmailHash,
    Phone
) VALUES
('Minh',    'Nguyen Van',   'Branch Manager',   35000000.00, '2005-03-15', 1, NULL, AES_ENCRYPT('minh.nguyen@bank.vn', @encryption_key),    SHA2(CONCAT(@hash_pepper, '|', LOWER(TRIM('minh.nguyen@bank.vn'))), 256),    AES_ENCRYPT('0901234001', @encryption_key)),
('Lan',     'Tran Thi',     'Branch Manager',   34000000.00, '2008-08-01', 2, NULL, AES_ENCRYPT('lan.tran@bank.vn', @encryption_key),       SHA2(CONCAT(@hash_pepper, '|', LOWER(TRIM('lan.tran@bank.vn'))), 256),       AES_ENCRYPT('0901234002', @encryption_key)),
('Hoa',     'Le Thi',       'Teller',           15000000.00, '2018-05-10', 1, 1,    AES_ENCRYPT('hoa.le@bank.vn', @encryption_key),         SHA2(CONCAT(@hash_pepper, '|', LOWER(TRIM('hoa.le@bank.vn'))), 256),         AES_ENCRYPT('0901234003', @encryption_key)),
('Tuan',    'Pham Van',     'Loan Officer',     22000000.00, '2016-03-20', 1, 1,    AES_ENCRYPT('tuan.pham@bank.vn', @encryption_key),      SHA2(CONCAT(@hash_pepper, '|', LOWER(TRIM('tuan.pham@bank.vn'))), 256),      AES_ENCRYPT('0901234004', @encryption_key)),
('Huong',   'Vo Thi',       'Branch Manager',   36000000.00, '2003-11-10', 3, NULL, AES_ENCRYPT('huong.vo@bank.vn', @encryption_key),       SHA2(CONCAT(@hash_pepper, '|', LOWER(TRIM('huong.vo@bank.vn'))), 256),       AES_ENCRYPT('0901234005', @encryption_key)),
('Duc',     'Hoang Van',    'Teller',           14500000.00, '2020-01-15', 3, 5,    AES_ENCRYPT('duc.hoang@bank.vn', @encryption_key),      SHA2(CONCAT(@hash_pepper, '|', LOWER(TRIM('duc.hoang@bank.vn'))), 256),      AES_ENCRYPT('0901234006', @encryption_key)),
('Linh',    'Nguyen Thi',   'Customer Service', 16000000.00, '2019-07-01', 2, 2,    AES_ENCRYPT('linh.nguyen@bank.vn', @encryption_key),    SHA2(CONCAT(@hash_pepper, '|', LOWER(TRIM('linh.nguyen@bank.vn'))), 256),    AES_ENCRYPT('0901234007', @encryption_key)),
('Nam',     'Dang Van',     'Branch Manager',   33000000.00, '2010-01-05', 4, NULL, AES_ENCRYPT('nam.dang@bank.vn', @encryption_key),       SHA2(CONCAT(@hash_pepper, '|', LOWER(TRIM('nam.dang@bank.vn'))), 256),       AES_ENCRYPT('0901234008', @encryption_key)),
('Thao',    'Bui Thi',      'Teller',           14000000.00, '2021-06-12', 4, 8,    AES_ENCRYPT('thao.bui@bank.vn', @encryption_key),       SHA2(CONCAT(@hash_pepper, '|', LOWER(TRIM('thao.bui@bank.vn'))), 256),       AES_ENCRYPT('0901234009', @encryption_key)),
('Khoa',    'Tran Van',     'IT Specialist',    28000000.00, '2017-09-01', 1, 1,    AES_ENCRYPT('khoa.tran@bank.vn', @encryption_key),      SHA2(CONCAT(@hash_pepper, '|', LOWER(TRIM('khoa.tran@bank.vn'))), 256),      AES_ENCRYPT('0901234010', @encryption_key));

INSERT INTO Customers (
    FirstName,
    LastName,
    DateOfBirth,
    Gender,
    IdentityNumber,
    IdentityHash,
    Phone,
    PhoneHash,
    Email,
    Address,
    City
) VALUES
('An',      'Nguyen Van',   '1990-05-14', 'M', AES_ENCRYPT('001090012345', @encryption_key), SHA2(CONCAT(@hash_pepper, '|', TRIM('001090012345')), 256), AES_ENCRYPT('0912345001', @encryption_key), SHA2(CONCAT(@hash_pepper, '|', TRIM('0912345001')), 256), AES_ENCRYPT('an.nguyen@gmail.com', @encryption_key),    '10 Hang Bai, Hoan Kiem',        'Ha Noi'),
('Binh',    'Tran Thi',     '1985-11-22', 'F', AES_ENCRYPT('001085023456', @encryption_key), SHA2(CONCAT(@hash_pepper, '|', TRIM('001085023456')), 256), AES_ENCRYPT('0912345002', @encryption_key), SHA2(CONCAT(@hash_pepper, '|', TRIM('0912345002')), 256), AES_ENCRYPT('binh.tran@gmail.com', @encryption_key),    '55 Kim Ma, Ba Dinh',            'Ha Noi'),
('Cuong',   'Le Van',       '1992-02-08', 'M', AES_ENCRYPT('079092034567', @encryption_key), SHA2(CONCAT(@hash_pepper, '|', TRIM('079092034567')), 256), AES_ENCRYPT('0912345003', @encryption_key), SHA2(CONCAT(@hash_pepper, '|', TRIM('0912345003')), 256), AES_ENCRYPT('cuong.le@yahoo.com', @encryption_key),     '120 Nguyen Trai, Quan 1',       'Ho Chi Minh'),
('Dung',    'Pham Thi',     '1988-08-30', 'F', AES_ENCRYPT('079088045678', @encryption_key), SHA2(CONCAT(@hash_pepper, '|', TRIM('079088045678')), 256), AES_ENCRYPT('0912345004', @encryption_key), SHA2(CONCAT(@hash_pepper, '|', TRIM('0912345004')), 256), AES_ENCRYPT('dung.pham@gmail.com', @encryption_key),    '78 Le Hong Phong, Quan 5',      'Ho Chi Minh'),
('Hieu',    'Vo Van',       '1995-01-17', 'M', AES_ENCRYPT('048095056789', @encryption_key), SHA2(CONCAT(@hash_pepper, '|', TRIM('048095056789')), 256), AES_ENCRYPT('0912345005', @encryption_key), SHA2(CONCAT(@hash_pepper, '|', TRIM('0912345005')), 256), AES_ENCRYPT('hieu.vo@outlook.com', @encryption_key),    '33 Nguyen Van Linh, Hai Chau',  'Da Nang'),
('Giang',   'Hoang Thi',    '1993-12-03', 'F', AES_ENCRYPT('048093067890', @encryption_key), SHA2(CONCAT(@hash_pepper, '|', TRIM('048093067890')), 256), AES_ENCRYPT('0912345006', @encryption_key), SHA2(CONCAT(@hash_pepper, '|', TRIM('0912345006')), 256), NULL,                                               '200 Tran Phu, Son Tra',         'Da Nang'),
('Khanh',   'Nguyen Duy',   '1980-06-25', 'M', AES_ENCRYPT('092080078901', @encryption_key), SHA2(CONCAT(@hash_pepper, '|', TRIM('092080078901')), 256), AES_ENCRYPT('0912345007', @encryption_key), SHA2(CONCAT(@hash_pepper, '|', TRIM('0912345007')), 256), AES_ENCRYPT('khanh.nguyen@gmail.com', @encryption_key), '15 Tran Hung Dao, Ninh Kieu',   'Can Tho'),
('Linh',    'Dang Thi',     '1998-09-10', 'F', AES_ENCRYPT('001098089012', @encryption_key), SHA2(CONCAT(@hash_pepper, '|', TRIM('001098089012')), 256), AES_ENCRYPT('0912345008', @encryption_key), SHA2(CONCAT(@hash_pepper, '|', TRIM('0912345008')), 256), AES_ENCRYPT('linh.dang@gmail.com', @encryption_key),   '42 Doi Can, Ba Dinh',           'Ha Noi'),
('Minh',    'Bui Quang',    '1991-04-05', 'M', AES_ENCRYPT('079091090123', @encryption_key), SHA2(CONCAT(@hash_pepper, '|', TRIM('079091090123')), 256), AES_ENCRYPT('0912345009', @encryption_key), SHA2(CONCAT(@hash_pepper, '|', TRIM('0912345009')), 256), AES_ENCRYPT('minh.bui@gmail.com', @encryption_key),    '66 Phan Xich Long, Phu Nhuan',  'Ho Chi Minh'),
('Ngoc',    'Tran Thi',     '1987-07-19', 'F', AES_ENCRYPT('048087001234', @encryption_key), SHA2(CONCAT(@hash_pepper, '|', TRIM('048087001234')), 256), AES_ENCRYPT('0912345010', @encryption_key), SHA2(CONCAT(@hash_pepper, '|', TRIM('0912345010')), 256), AES_ENCRYPT('ngoc.tran@yahoo.com', @encryption_key),    '8 Ngo Quyen, Hai Chau',         'Da Nang');

INSERT INTO AppUsers (
    Username,
    PasswordHash,
    Role,
    Status,
    EmployeeID,
    CustomerID,
    FailedLoginCount,
    PasswordChangedAt
) VALUES
('manager', '$2b$12$Pp/GpyG8I8A9ey7DuyfMh.KmzRLeBw9Ugvg1TuMtg.9WgwTDmxJPi', 'manager', 'active', 1, NULL, 0, CURRENT_TIMESTAMP),
('teller',  '$2b$12$.vxwsmikKO8q4185UCWqg.FO04mvAu3RNJD7XzPcNPf3Vg4B4EFnK', 'teller',  'active', 3, NULL, 0, CURRENT_TIMESTAMP),
('auditor', '$2b$12$v/4gFbDS8Y3Q8S5BOKB8POU2RwK9//B8LYIstUDY3.HAPhMk6EyIu', 'auditor', 'active', 10, NULL, 0, CURRENT_TIMESTAMP);

INSERT INTO AccountTypes (TypeName, Description) VALUES
('Savings',     'Tai khoan tiet kiem - Savings account with interest'),
('Checking',    'Tai khoan thanh toan - Everyday checking account'),
('Fixed Deposit','Tai khoan tiet kiem co ky han - Fixed term deposit');

INSERT INTO RuleSettings (Code, Value, Description) VALUES
('txn_suspicious_amount_vnd',       JSON_QUOTE('50000000'), 'Single-transaction amount (VND) at or above which the audit pipeline flags an alert.'),
('approval_required_amount_vnd',    JSON_QUOTE('50000000'), 'Cash transactions at or above this amount route through the maker-checker approval queue.'),
('cash_variance_tolerance_vnd',     JSON_QUOTE('100000'),   'EOD reconciliation: maximum |variance| (VND) accepted before a teller session is marked flagged.'),
('loan_application_max_inline_vnd', JSON_QUOTE('0'),        'Loan applications above this principal route through the maker-checker queue. 0 means always queue.'),
('dormancy_days',                   JSON_QUOTE('365'),      'Days of inactivity after which an Active account auto-transitions to Dormant.');

INSERT INTO Accounts (AccountNumber, CustomerID, AccountTypeID, BranchID, Balance, OpenDate, Status) VALUES
('1001-0001-0001', 1, 1, 1, 150000000.00, '2020-01-10', 'Active'),
('1001-0002-0001', 1, 2, 1,  25000000.00, '2020-01-10', 'Active'),
('1002-0001-0001', 2, 1, 2,  80000000.00, '2019-06-15', 'Active'),
('1003-0001-0001', 3, 2, 3, 320000000.00, '2021-03-20', 'Active'),
('1003-0002-0001', 3, 3, 3, 500000000.00, '2021-03-20', 'Active'),
('1004-0001-0001', 4, 1, 3,  45000000.00, '2020-08-01', 'Active'),
('1005-0001-0001', 5, 2, 4,  12000000.00, '2022-02-14', 'Active'),
('1006-0001-0001', 6, 1, 4,  67000000.00, '2021-11-30', 'Active'),
('1007-0001-0001', 7, 1, 6, 200000000.00, '2018-04-22', 'Active'),
('1008-0001-0001', 8, 2, 2,   8500000.00, '2023-01-05', 'Active'),
('1009-0001-0001', 9, 2, 7,  55000000.00, '2022-07-18', 'Active'),
('1010-0001-0001',10, 1, 4,  93000000.00, '2020-12-01', 'Active');

INSERT INTO Transactions (AccountID, TransactionType, Amount, TransactionDate, Description, ReferenceID) VALUES
(1,  'Deposit',       50000000.00, '2024-01-05 09:30:00', 'Nap luong thang 1',           NULL),
(1,  'Withdrawal',    10000000.00, '2024-01-10 14:15:00', 'Rut tien ATM',                NULL),
(2,  'Deposit',        5000000.00, '2024-01-12 10:00:00', 'Chuyen khoan noi bo',         NULL),
(3,  'Deposit',       20000000.00, '2024-01-15 08:45:00', 'Nap tien mat tai quay',       NULL),
(4,  'Deposit',      100000000.00, '2024-01-20 11:30:00', 'Nhan thanh toan hop dong',    NULL),
(4,  'Transfer_Out',  30000000.00, '2024-01-22 16:00:00', 'Chuyen tien cho doi tac',     NULL),
(6,  'Transfer_In',   30000000.00, '2024-01-22 16:00:00', 'Nhan chuyen khoan',           6),
(7,  'Deposit',        8000000.00, '2024-02-01 09:00:00', 'Nap luong thang 2',           NULL),
(8,  'Deposit',       15000000.00, '2024-02-05 13:20:00', 'Nap tiet kiem',               NULL),
(9,  'Withdrawal',    50000000.00, '2024-02-10 10:45:00', 'Rut tien dau tu',             NULL),
(10, 'Deposit',        3000000.00, '2024-02-15 15:30:00', 'Nap tien hoc phi',            NULL),
(11, 'Deposit',       20000000.00, '2024-02-20 09:15:00', 'Nap luong thang 2',           NULL),
(1,  'Deposit',       55000000.00, '2024-03-01 08:30:00', 'Thuong Tet Nguyen Dan',       NULL),
(5,  'Deposit',      200000000.00, '2024-03-05 14:00:00', 'Tat toan ky gui',             NULL),
(4,  'Withdrawal',    15000000.00, '2024-03-10 11:00:00', 'Thanh toan hoa don',          NULL);

INSERT INTO Loans (CustomerID, BranchID, LoanAmount, InterestRate, StartDate, EndDate, Status) VALUES
(1, 1, 500000000.00,  7.50, '2023-06-01', '2028-06-01', 'Active'),
(3, 3, 1000000000.00, 8.00, '2022-01-15', '2032-01-15', 'Active'),
(5, 4, 200000000.00,  6.80, '2023-09-01', '2026-09-01', 'Active'),
(7, 6, 300000000.00,  7.20, '2021-03-10', '2026-03-10', 'Active'),
(9, 7, 150000000.00,  7.00, '2024-01-01', '2027-01-01', 'Active');

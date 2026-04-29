ALTER TABLE Customers
    ADD COLUMN EncryptionKeyVersion INT NOT NULL DEFAULT 1 AFTER Email;

ALTER TABLE Employees
    ADD COLUMN EncryptionKeyVersion INT NOT NULL DEFAULT 1 AFTER Phone;

INSERT INTO AppRuntimeSecrets (SecretName, SecretValue)
VALUES ('encryption_key_version', '1')
ON DUPLICATE KEY UPDATE SecretValue = VALUES(SecretValue);


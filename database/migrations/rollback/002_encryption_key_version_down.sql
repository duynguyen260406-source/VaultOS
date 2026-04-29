ALTER TABLE Employees DROP COLUMN EncryptionKeyVersion;
ALTER TABLE Customers DROP COLUMN EncryptionKeyVersion;
DELETE FROM AppRuntimeSecrets WHERE SecretName = 'encryption_key_version';


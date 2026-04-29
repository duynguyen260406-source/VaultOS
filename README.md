# Banking Management System

A comprehensive banking management system built with MySQL and Python, designed for managing customers, accounts, transactions, employees, and branches for a Vietnamese commercial bank.

## Features

- **Customer Management**: Register, search, and manage bank customers
- **Account Lifecycle**: Open, close, and view savings/checking/fixed deposit accounts
- **Transaction Processing**: Deposits, withdrawals, and inter-account transfers with ACID compliance
- **Automated Audit Trail**: Triggers log transactions plus high-risk management changes and flag suspicious activity (>50M VND)
- **Role-Based Security**: Manager, teller, auditor, auth, and backup accounts with least-privilege access
- **Data Encryption**: AES encryption for sensitive fields with hash-backed uniqueness
- **Scoped Access**: Teller sessions are restricted to their own branch for account operations
- **Reporting**: Daily transactions, customer balances, and branch activity reports
- **Backup & Recovery**: Dedicated backup user, optional TLS, and optional encrypted dump files

## Tech Stack

- **Database**: MySQL 8.0+
- **Application**: Python 3.8+
- **Libraries**: mysql-connector-python, tabulate
- **Tools**: mysqldump, matplotlib (ER diagram)

## Project Structure

```
banking-management-system/
database/      # MySQL schema, sample data, indexes, views, procedures, functions, triggers
api/           # FastAPI routers and Pydantic response/request models
app/           # Shared database connection, business operations, reports, CLI
web/           # VaultOS static web portal served by FastAPI
scripts/       # Backup, restore, and security bootstrap scripts
tests/         # API, database, security, and end-to-end tests
docs/          # Report, ER tooling, design notes, and project brief
requirements.txt
README.md
```

## Setup Instructions

### Prerequisites

- MySQL 8.0 or higher
- Python 3.8 or higher
- pip (Python package manager)

### Database Setup

Run the SQL files in order using the MySQL client:

```bash
# Optional local-only destructive reset
mysql -u root -p < database/reset_dev.sql

# 1. Create schema and tables
mysql -u root -p < database/schema.sql

# 2. Load sample data with the same encryption key the app will use
mysql -u root -p --init-command="SET @encryption_key='replace_with_the_same_secret_key'" < database/sample_data.sql

# 3. Create indexes
mysql -u root -p < database/indexes.sql

# 4. Create views
mysql -u root -p < database/views.sql

# 5. Create stored procedures
mysql -u root -p < database/procedures.sql

# 6. Create user-defined functions
mysql -u root -p < database/functions.sql

# 7. Create triggers
mysql -u root -p < database/triggers.sql

# 8. Bootstrap security roles/users from environment secrets
python scripts/bootstrap_security.py --dry-run
python scripts/bootstrap_security.py
```

For production changes after the first deployment, use ordered migrations instead
of rerunning the full schema:

```bash
python scripts/migrate.py --env prod
```

### Python Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Shared app settings
export DB_HOST=localhost
export DB_PORT=3306
export DB_NAME=banking_system
export DB_ENCRYPTION_KEY=replace_with_a_strong_secret_key
export JWT_SECRET_KEY=replace_with_a_long_random_jwt_secret
export DB_REQUIRE_TLS=false
export DB_SSL_MODE=
export DB_SSL_CA=
export DB_SSL_CERT=
export DB_SSL_KEY=

# Dedicated auth connection for AppUsers login/password flows
export DB_AUTH_USER=app_auth_user
export DB_AUTH_PASSWORD=your_app_auth_password

# Admin account used only by bootstrap scripts
export DB_ADMIN_USER=root
export DB_ADMIN_PASSWORD=your_admin_password

# Enable per-role DB sessions for end-to-end RBAC
export DB_MANAGER_USER=manager_user
export DB_MANAGER_PASSWORD=your_manager_password
export DB_TELLER_USER=teller_user
export DB_TELLER_PASSWORD=your_teller_password
export DB_AUDITOR_USER=auditor_user
export DB_AUDITOR_PASSWORD=your_auditor_password
export DB_BACKUP_USER=backup_user
export DB_BACKUP_PASSWORD=your_backup_password
export AUTH_LOCK_THRESHOLD=5

# Optional legacy fallback if DB_AUTH_* is not set
export DB_USER=root
export DB_PASSWORD=your_admin_password

# Optional encrypted backup output
export BACKUP_ENCRYPTION_PASSPHRASE=
export BACKUP_ENCRYPTION_KEY_FILE=
```

## Usage

### Environment Profiles

The project now supports profile-based env loading:

- `APP_ENV=dev` loads `.env.dev`
- `APP_ENV=prod` loads `.env.prod`
- `APP_ENV_FILE=path/to/file` overrides both and loads one explicit env file

Recommended setup:

```bash
# Development
cp .env.dev.example .env.dev

# Production-like deployment profile
cp .env.prod.example .env.prod
```

If you still want one default local profile, you can keep using `.env`.

### Start Commands

Start the API and web portal from the project root with the standard launcher:

```bash
# Local development
python scripts/start_api.py --env dev --reload

# Production-style startup (no reload)
python scripts/start_api.py --env prod --host 0.0.0.0 --port 8000
```

Direct `uvicorn` still works, but the launcher avoids loading the wrong env file.

Legacy direct start:

```bash
uvicorn api.main:app --reload
```

Then open:

- Web portal: `http://localhost:8000/`
- Login page: `http://localhost:8000/login.html`
- API health check: `http://localhost:8000/health`
- API docs: `http://localhost:8000/docs`

The static web portal in `web/` is served by the same FastAPI app, so browser requests use the same origin as the API.

### CLI

```bash
cd app
python main.py
```

The CLI menu provides:

```
===== BANKING MANAGEMENT SYSTEM =====
1. Customer Management
2. Account Management
3. Transactions
4. Reports
5. Exit
```

### Generate ER Diagram

```bash
cd docs
python er_diagram.py
# Output: er_diagram.png
```

## Database Schema Overview

| Table               | Description                                    |
|---------------------|------------------------------------------------|
| Branches            | Bank branch offices (8 branches)               |
| Employees           | Staff with managerial hierarchy (10 employees) |
| Customers           | Bank clients with identity info (10 customers) |
| AppUsers            | Application login accounts for staff users      |
| AccountTypes        | Savings, Checking, Fixed Deposit               |
| Accounts            | Customer accounts linked to branches (12 accounts) |
| Transactions        | Deposits, withdrawals, transfers (15 records)  |
| Loans               | Customer loans with interest tracking (5 loans)|
| AuditLog            | Automatic transaction audit trail              |
| SuspiciousActivity  | Flagged high-value transactions (>=50M VND)    |

## Security Features

- **Least-privilege DB roles**: Manager can manage business tables but cannot edit `AuditLog` or `SuspiciousActivity`; teller uses stored procedures for writes; auditor reads masked customer-safe projections
- **API/Auth enforcement**: JWT role checks protect every API route and client entry point
- **Audit attribution**: Database sessions store the current app user, employee, and branch so triggers log the real actor
- **AES Encryption**: `Customers.IdentityNumber`, `Customers.Phone`, `Customers.Email`, `Employees.Email`, and `Employees.Phone` are encrypted at rest with per-session `@encryption_key`
- **Key-version tracking**: encrypted customer and employee rows track `EncryptionKeyVersion` for controlled re-encryption during key rotation
- **Hash-backed uniqueness**: `Customers.IdentityHash`, `Customers.PhoneHash`, and `Employees.EmailHash` preserve unique constraints without storing plaintext in indexed columns
- **Expanded Audit Triggers**: Transactions, accounts, customers, employees, and app-user changes are automatically logged
- **Fraud Detection**: Transactions over 50,000,000 VND are flagged
- **Masked Read Views**: Auditor-facing customer and employee reads come from masked projections instead of decrypted raw tables
- **Branch Scope**: Teller deposits, withdrawals, transfers, account search, and account opening are constrained to the teller's branch
- **Backup Scripts**: Use a dedicated backup account and can encrypt output files with `openssl`

When reseeding the database, keep the same encryption key in both the application environment and the `sample_data.sql` loading session. Runtime no longer falls back to demo secrets, so `DB_ENCRYPTION_KEY` and `JWT_SECRET_KEY` must be set explicitly.

If you load `database/sample_data.sql`, the initial application accounts are:

- `manager` / `manager123`
- `teller` / `teller123`
- `auditor` / `auditor123`

These accounts live in `AppUsers` with bcrypt password hashes and should be changed after first login.

## Deployment Notes

- Start from `.env.dev.example` and `.env.prod.example` instead of reusing one shared `.env` everywhere.
- `APP_ENV=prod` now fails fast unless `.env.prod` or `APP_ENV_FILE` exists, and production placeholders are rejected at startup.
- Use `python scripts/start_api.py --env dev ...` for local work and `python scripts/start_api.py --env prod ...` for deployment startup.
- Build the frontend before production startup with `cd react-app && npm install && npm run build`; production serves `react-app/dist` and no longer exposes `react-app/src`.
- API docs and OpenAPI are disabled by default in production. Set `APP_EXPOSE_DOCS=true` only for trusted internal deployments.
- Use `python scripts/bootstrap_security.py --env prod` and `python scripts/apply_security_hardening.py --env prod` for production-side DB bootstrap/hardening.
- Apply database changes with `python scripts/migrate.py --env prod`; rollback SQL lives under `database/migrations/rollback/` and should be used only after a verified backup.
- Use `.env` or machine-level environment variables for all passwords and secrets. Do not commit real credentials into `database/security.sql`.
- `database/security.sql` is now a reference template for the hardened RBAC matrix. The recommended deploy path is `python scripts/bootstrap_security.py`, which reads `DB_AUTH_*`, `DB_MANAGER_*`, `DB_TELLER_*`, `DB_AUDITOR_*`, and `DB_BACKUP_*` from environment variables and creates the MySQL users safely at deploy time.
- Application users now live in the `AppUsers` table. The sample passwords above are only development seed credentials; production deployments should create real users and force password rotation.
- `DB_AUTH_USER` should be a low-privilege MySQL account used only for `AppUsers` authentication, password updates, and employee-branch lookup. Do not use `root` for normal runtime traffic.
- If `DB_REQUIRE_TLS=true`, configure the matching `DB_SSL_*` variables for app traffic and backup/restore scripts.
- Use `DB_BACKUP_USER` for `scripts/backup.sh`; avoid backing up with `root`.

## License

This project is licensed under the MIT License.

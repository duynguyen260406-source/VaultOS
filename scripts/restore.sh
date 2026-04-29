#!/usr/bin/env bash
# ============================================================================
# Banking Management System - Database Restore Script
# ============================================================================
# Restores a mysqldump backup file into the banking_system database.
#
# Usage:
#   DB_ADMIN_USER=root DB_ADMIN_PASSWORD=secret ./restore.sh backups/file.sql
#
# Environment variables:
#   DB_NAME                      - MySQL database name (default: banking_system)
#   DB_ADMIN_USER                - Administrative MySQL username (required)
#   DB_ADMIN_PASSWORD            - Administrative MySQL password (required)
#   DB_ADMIN_HOST                - MySQL host (default: DB_HOST or localhost)
#   DB_ADMIN_PORT                - MySQL port (default: DB_PORT or 3306)
#   DB_SSL_MODE                  - Optional MySQL TLS mode (e.g. REQUIRED, VERIFY_CA)
#   DB_SSL_CA / DB_SSL_CERT /
#   DB_SSL_KEY                   - Optional TLS certificate paths
#   BACKUP_ENCRYPTION_PASSPHRASE - Passphrase used for encrypted backups
#   BACKUP_ENCRYPTION_KEY_FILE   - Key file used for encrypted backups
# ============================================================================

set -euo pipefail

DB_NAME="${DB_NAME:-banking_system}"
DB_USER="${DB_ADMIN_USER:-${DB_USER:-}}"
DB_PASS="${DB_ADMIN_PASSWORD:-${DB_PASS:-}}"
DB_HOST="${DB_ADMIN_HOST:-${DB_HOST:-localhost}}"
DB_PORT="${DB_ADMIN_PORT:-${DB_PORT:-3306}}"

SSL_MODE="${DB_SSL_MODE:-}"
SSL_CA="${DB_SSL_CA:-}"
SSL_CERT="${DB_SSL_CERT:-}"
SSL_KEY="${DB_SSL_KEY:-}"

BACKUP_PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-}"
BACKUP_KEY_FILE="${BACKUP_ENCRYPTION_KEY_FILE:-}"

if [ $# -lt 1 ]; then
    echo "Usage: $0 <backup_file>" >&2
    echo "  e.g. $0 backups/banking_system_backup_20260406_120000.sql" >&2
    exit 1
fi

if [ -z "${DB_USER}" ] || [ -z "${DB_PASS}" ]; then
    echo "[ERROR] DB_ADMIN_USER and DB_ADMIN_PASSWORD are required." >&2
    exit 1
fi

if [ -n "${BACKUP_PASSPHRASE}" ] && [ -n "${BACKUP_KEY_FILE}" ]; then
    echo "[ERROR] Set only one of BACKUP_ENCRYPTION_PASSPHRASE or BACKUP_ENCRYPTION_KEY_FILE." >&2
    exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "${BACKUP_FILE}" ]; then
    echo "[ERROR] Backup file not found: ${BACKUP_FILE}" >&2
    exit 1
fi

MYSQL_OPTS=(
    --host="${DB_HOST}"
    --port="${DB_PORT}"
    --user="${DB_USER}"
)

if [ -n "${DB_PASS}" ]; then
    MYSQL_OPTS+=( --password="${DB_PASS}" )
fi
if [ -n "${SSL_MODE}" ]; then
    MYSQL_OPTS+=( --ssl-mode="${SSL_MODE}" )
fi
if [ -n "${SSL_CA}" ]; then
    MYSQL_OPTS+=( --ssl-ca="${SSL_CA}" )
fi
if [ -n "${SSL_CERT}" ]; then
    MYSQL_OPTS+=( --ssl-cert="${SSL_CERT}" )
fi
if [ -n "${SSL_KEY}" ]; then
    MYSQL_OPTS+=( --ssl-key="${SSL_KEY}" )
fi

FILE_SIZE="$(du -h "${BACKUP_FILE}" | cut -f1)"
echo "[INFO] Restoring '${DB_NAME}' from:"
echo "       File: ${BACKUP_FILE}"
echo "       Size: ${FILE_SIZE}"
echo ""
echo "[WARNING] This will overwrite the current '${DB_NAME}' database."
echo ""

if [[ "${BACKUP_FILE}" == *.enc ]]; then
    if ! command -v openssl >/dev/null 2>&1; then
        echo "[ERROR] openssl is required to restore encrypted backups." >&2
        exit 1
    fi
    if [ -n "${BACKUP_PASSPHRASE}" ]; then
        openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_PASSPHRASE -in "${BACKUP_FILE}" | \
            mysql "${MYSQL_OPTS[@]}" "${DB_NAME}"
    elif [ -n "${BACKUP_KEY_FILE}" ]; then
        openssl enc -d -aes-256-cbc -pbkdf2 -pass file:"${BACKUP_KEY_FILE}" -in "${BACKUP_FILE}" | \
            mysql "${MYSQL_OPTS[@]}" "${DB_NAME}"
    else
        echo "[ERROR] Encrypted backup detected but no decryption secret was provided." >&2
        exit 1
    fi
elif mysql "${MYSQL_OPTS[@]}" "${DB_NAME}" < "${BACKUP_FILE}"; then
    :
else
    echo "[ERROR] Restore failed. Check your credentials, TLS settings, and backup file." >&2
    exit 1
fi

echo "[SUCCESS] Database '${DB_NAME}' restored successfully from:"
echo "          ${BACKUP_FILE}"

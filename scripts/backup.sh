#!/usr/bin/env bash
# ============================================================================
# Banking Management System - Database Backup Script
# ============================================================================
# Creates a timestamped mysqldump backup of the banking_system database.
#
# Usage:
#   DB_BACKUP_USER=backup_user DB_BACKUP_PASSWORD=secret ./backup.sh
#
# Environment variables:
#   DB_NAME                      - MySQL database name (default: banking_system)
#   DB_BACKUP_USER               - Dedicated backup MySQL username (required)
#   DB_BACKUP_PASSWORD           - Backup MySQL password (required)
#   DB_BACKUP_HOST               - MySQL host (default: DB_HOST or localhost)
#   DB_BACKUP_PORT               - MySQL port (default: DB_PORT or 3306)
#   DB_SSL_MODE                  - Optional MySQL TLS mode (e.g. REQUIRED, VERIFY_CA)
#   DB_SSL_CA / DB_SSL_CERT /
#   DB_SSL_KEY                   - Optional TLS certificate paths
#   BACKUP_ENCRYPTION_PASSPHRASE - Optional passphrase to encrypt the dump with openssl
#   BACKUP_ENCRYPTION_KEY_FILE   - Optional key file for openssl encryption
# ============================================================================

set -euo pipefail
umask 077

DB_NAME="${DB_NAME:-banking_system}"
DB_USER="${DB_BACKUP_USER:-${DB_USER:-}}"
DB_PASS="${DB_BACKUP_PASSWORD:-${DB_PASS:-}}"
DB_HOST="${DB_BACKUP_HOST:-${DB_HOST:-localhost}}"
DB_PORT="${DB_BACKUP_PORT:-${DB_PORT:-3306}}"

SSL_MODE="${DB_SSL_MODE:-}"
SSL_CA="${DB_SSL_CA:-}"
SSL_CERT="${DB_SSL_CERT:-}"
SSL_KEY="${DB_SSL_KEY:-}"

BACKUP_PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-}"
BACKUP_KEY_FILE="${BACKUP_ENCRYPTION_KEY_FILE:-}"

if [ -z "${DB_USER}" ] || [ -z "${DB_PASS}" ]; then
    echo "[ERROR] DB_BACKUP_USER and DB_BACKUP_PASSWORD are required." >&2
    exit 1
fi

if [ -n "${BACKUP_PASSPHRASE}" ] && [ -n "${BACKUP_KEY_FILE}" ]; then
    echo "[ERROR] Set only one of BACKUP_ENCRYPTION_PASSPHRASE or BACKUP_ENCRYPTION_KEY_FILE." >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/backups"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_EXT=".sql"
if [ -n "${BACKUP_PASSPHRASE}" ] || [ -n "${BACKUP_KEY_FILE}" ]; then
    BACKUP_EXT=".sql.enc"
fi
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_backup_${TIMESTAMP}${BACKUP_EXT}"

if [ ! -d "${BACKUP_DIR}" ]; then
    echo "[INFO] Creating backup directory: ${BACKUP_DIR}"
    mkdir -p "${BACKUP_DIR}"
fi

DUMP_OPTS=(
    --host="${DB_HOST}"
    --port="${DB_PORT}"
    --user="${DB_USER}"
    --routines
    --triggers
    --events
    --single-transaction
    --add-drop-table
)

if [ -n "${DB_PASS}" ]; then
    DUMP_OPTS+=( --password="${DB_PASS}" )
fi
if [ -n "${SSL_MODE}" ]; then
    DUMP_OPTS+=( --ssl-mode="${SSL_MODE}" )
fi
if [ -n "${SSL_CA}" ]; then
    DUMP_OPTS+=( --ssl-ca="${SSL_CA}" )
fi
if [ -n "${SSL_CERT}" ]; then
    DUMP_OPTS+=( --ssl-cert="${SSL_CERT}" )
fi
if [ -n "${SSL_KEY}" ]; then
    DUMP_OPTS+=( --ssl-key="${SSL_KEY}" )
fi

echo "[INFO] Starting backup of '${DB_NAME}' to:"
echo "       ${BACKUP_FILE}"

if [ -n "${BACKUP_PASSPHRASE}" ]; then
    if ! command -v openssl >/dev/null 2>&1; then
        echo "[ERROR] openssl is required for encrypted backups." >&2
        exit 1
    fi
    if mysqldump "${DUMP_OPTS[@]}" "${DB_NAME}" | \
        openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_ENCRYPTION_PASSPHRASE > "${BACKUP_FILE}"; then
        :
    else
        echo "[ERROR] Encrypted backup failed." >&2
        rm -f "${BACKUP_FILE}"
        exit 1
    fi
elif [ -n "${BACKUP_KEY_FILE}" ]; then
    if ! command -v openssl >/dev/null 2>&1; then
        echo "[ERROR] openssl is required for encrypted backups." >&2
        exit 1
    fi
    if mysqldump "${DUMP_OPTS[@]}" "${DB_NAME}" | \
        openssl enc -aes-256-cbc -pbkdf2 -salt -pass file:"${BACKUP_KEY_FILE}" > "${BACKUP_FILE}"; then
        :
    else
        echo "[ERROR] Encrypted backup failed." >&2
        rm -f "${BACKUP_FILE}"
        exit 1
    fi
elif mysqldump "${DUMP_OPTS[@]}" "${DB_NAME}" > "${BACKUP_FILE}"; then
    :
else
    echo "[ERROR] Backup failed. Check your credentials and that MySQL is running." >&2
    rm -f "${BACKUP_FILE}"
    exit 1
fi

FILE_SIZE="$(du -h "${BACKUP_FILE}" | cut -f1)"
echo "[SUCCESS] Backup completed successfully."
echo "          File: ${BACKUP_FILE}"
echo "          Size: ${FILE_SIZE}"

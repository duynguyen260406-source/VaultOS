import os

from env_loader import load_project_env


load_project_env()


def require_env(name: str) -> str:
    value = os.getenv(name)
    if value is None or value == "":
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def current_env() -> str:
    return (os.getenv("APP_ENV") or "dev").strip().lower() or "dev"


def is_prod() -> bool:
    return current_env() == "prod"


def validate_production_config() -> None:
    if not is_prod():
        return

    required_names = (
        "DB_HOST",
        "DB_NAME",
        "DB_AUTH_USER",
        "DB_AUTH_PASSWORD",
        "DB_ENCRYPTION_KEY",
        "DB_HASH_PEPPER",
        "DB_CONTEXT_SIGNING_KEY",
        "JWT_SECRET_KEY",
        "APP_TRUSTED_HOSTS",
        "CORS_ALLOWED_ORIGINS",
    )
    for name in required_names:
        require_env(name)

    placeholders = ("replace_", "change_me", "local-dev", "localhost", "prod-db-host", "example.com")
    secret_names = (
        "DB_ENCRYPTION_KEY",
        "DB_HASH_PEPPER",
        "DB_CONTEXT_SIGNING_KEY",
        "JWT_SECRET_KEY",
        "DB_AUTH_PASSWORD",
    )
    for name in secret_names:
        value = os.getenv(name, "").lower()
        if any(marker in value for marker in placeholders):
            raise RuntimeError(f"{name} must be replaced with a real production value")

    if not env_flag("DB_REQUIRE_TLS"):
        raise RuntimeError("APP_ENV=prod requires DB_REQUIRE_TLS=true")
    if not env_flag("SESSION_COOKIE_SECURE"):
        raise RuntimeError("APP_ENV=prod requires SESSION_COOKIE_SECURE=true")
    if not env_flag("APP_FORCE_HTTPS"):
        raise RuntimeError("APP_ENV=prod requires APP_FORCE_HTTPS=true")

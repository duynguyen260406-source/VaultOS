import os
from pathlib import Path
from typing import Optional

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - dotenv is installed in normal runtime
    load_dotenv = None


_LOADED_ENV_PATH: Optional[Path] = None


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _resolve_env_path() -> Optional[Path]:
    base_dir = _project_root()

    explicit = os.getenv("APP_ENV_FILE")
    if explicit:
        candidate = Path(explicit)
        if not candidate.is_absolute():
            candidate = (base_dir / candidate).resolve()
        if not candidate.exists():
            raise RuntimeError(f"APP_ENV_FILE does not exist: {candidate}")
        return candidate

    profile = (os.getenv("APP_ENV") or "").strip().lower()
    if profile:
        candidate = base_dir / f".env.{profile}"
        if candidate.exists():
            return candidate
        if profile == "prod" and os.getenv("APP_ALLOW_ENV_FALLBACK", "").strip().lower() not in {"1", "true", "yes", "on"}:
            required_env_names = (
                "DB_HOST",
                "DB_NAME",
                "DB_AUTH_USER",
                "DB_AUTH_PASSWORD",
                "DB_ENCRYPTION_KEY",
                "DB_HASH_PEPPER",
                "DB_CONTEXT_SIGNING_KEY",
                "JWT_SECRET_KEY",
            )
            if all(os.getenv(name) for name in required_env_names):
                return None
            raise RuntimeError(
                "APP_ENV=prod requires .env.prod, APP_ENV_FILE, or complete process-level production env vars. "
                "Set APP_ALLOW_ENV_FALLBACK=true only for explicit local troubleshooting."
            )

    default_file = base_dir / ".env"
    if default_file.exists():
        return default_file

    return None


def load_project_env(override: bool = False) -> Optional[Path]:
    global _LOADED_ENV_PATH

    if _LOADED_ENV_PATH is not None and not override:
        return _LOADED_ENV_PATH
    if load_dotenv is None:
        return None

    env_path = _resolve_env_path()
    if env_path and env_path.exists():
        load_dotenv(env_path, override=override)
        _LOADED_ENV_PATH = env_path
        return env_path

    return None

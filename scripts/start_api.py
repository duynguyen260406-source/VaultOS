import argparse
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.env_loader import load_project_env


def main() -> int:
    parser = argparse.ArgumentParser(description="Start the banking API with a selected environment profile.")
    parser.add_argument("--env", default=None, help="Environment profile name, for example 'dev' or 'prod'.")
    parser.add_argument("--env-file", default=None, help="Explicit env file path to load.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload for development.")
    args = parser.parse_args()

    if args.env:
        os.environ["APP_ENV"] = args.env
    if args.env_file:
        os.environ["APP_ENV_FILE"] = args.env_file
    env_path = load_project_env(override=True)

    import uvicorn

    if env_path:
        print(f"[INFO] Loaded env file: {env_path}")
    uvicorn.run("api.main:app", host=args.host, port=args.port, reload=args.reload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""
One-time setup: creates all the .env files for the avatar with matching secrets.

Put this file in your  backend  folder and run:
    python setup_avatar_env.py
"""

import secrets
from pathlib import Path

here = Path(__file__).resolve().parent          # ...\MainPortfolio\backend
worker_dir = here / "avatar" / "worker"
gateway_dir = here / "avatar" / "gateway"
for d in (worker_dir, gateway_dir):
    if not d.is_dir():
        raise SystemExit(f"Can't find {d}. Put this script in the backend folder (the one that contains avatar\\).")


def find_next_project() -> Path:
    """Look for the Next.js project (a package.json that uses "next") near the backend."""
    candidates = [here.parent, *(p for p in here.parent.iterdir() if p.is_dir())]
    found = []
    for folder in candidates:
        pkg = folder / "package.json"
        if folder.name != "node_modules" and pkg.exists() and '"next"' in pkg.read_text(encoding="utf-8", errors="ignore"):
            found.append(folder)
    if len(found) == 1:
        return found[0]
    if found:
        print("Found more than one Next.js project:")
        for i, f in enumerate(found, 1):
            print(f"  {i}. {f}")
        choice = input("Which one is your portfolio? Enter the number: ").strip()
        return found[int(choice) - 1]
    typed = input("Couldn't find your Next.js project. Paste the folder path that has package.json: ").strip().strip('"')
    path = Path(typed)
    if not (path / "package.json").exists():
        raise SystemExit(f"No package.json in {path}")
    return path


portfolio_root = find_next_project()
print(f"Using Next.js project: {portfolio_root}")

password = input("Pick a password for the avatar page: ").strip()
if not password:
    raise SystemExit("Password can't be empty.")

worker_token = secrets.token_urlsafe(32)
gateway_secret = secrets.token_urlsafe(32)
session_secret = secrets.token_urlsafe(32)

(worker_dir / ".env").write_text(
    f"WORKER_TOKEN={worker_token}\n"
    "WORKER_NAME=pc\n"
    "OLLAMA_URL=http://127.0.0.1:11434\n",
    encoding="utf-8",
)

(gateway_dir / ".env").write_text(
    f"GATEWAY_SECRET={gateway_secret}\n"
    f"WORKER_TOKEN={worker_token}\n"
    "WORKER_URLS=http://127.0.0.1:8100\n",
    encoding="utf-8",
)

# .env.local may hold other portfolio settings: keep those, replace only AVATAR_ lines.
env_local = portfolio_root / ".env.local"
kept = []
if env_local.exists():
    kept = [l for l in env_local.read_text(encoding="utf-8").splitlines() if not l.startswith("AVATAR_")]
kept += [
    f"AVATAR_PASSWORD={password}",
    f"AVATAR_SESSION_SECRET={session_secret}",
    "AVATAR_GATEWAY_URL=http://127.0.0.1:8200",
    f"AVATAR_GATEWAY_SECRET={gateway_secret}",
]
env_local.write_text("\n".join(kept) + "\n", encoding="utf-8")

# Point the frontend code at wherever the avatar folder actually lives.
route_fixed = None
app_dir = portfolio_root / "app" if (portfolio_root / "app").is_dir() else portfolio_root / "src" / "app"
hook = next(app_dir.rglob("_hooks/useChat.ts"), None) if app_dir.is_dir() else None
if hook:
    avatar_dir = hook.parent.parent
    # Route groups like (site) don't appear in the URL.
    parts = [p for p in avatar_dir.relative_to(app_dir).parts if not (p.startswith("(") and p.endswith(")"))]
    route = "/" + "/".join(parts)
    for f in avatar_dir.rglob("*.ts*"):
        text = f.read_text(encoding="utf-8")
        if "/lab/avatar" in text and route != "/lab/avatar":
            f.write_text(text.replace("/lab/avatar", route), encoding="utf-8")
    route_fixed = route

print("\nDone! Created:")
print(f"  {worker_dir / '.env'}")
print(f"  {gateway_dir / '.env'}")
print(f"  {env_local}  (avatar settings added)")
if route_fixed:
    print(f"\nAvatar page will be at: http://localhost:3000{route_fixed}")
print("\nAll the secrets already match. You never need to touch these files again.")
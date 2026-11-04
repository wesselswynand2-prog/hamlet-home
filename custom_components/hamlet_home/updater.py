"""Install a Hamlet app release zip from GitHub (pure file work, run in an executor)."""
from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path, PurePosixPath

REPOS = {"hamlet_home": "wesselswynand2-prog/hamlet-home", "hamlet_geyser": "wesselswynand2-prog/hamlet-geyser"}
ALLOWED_HOSTS = ("https://github.com/", "https://objects.githubusercontent.com/", "https://release-assets.githubusercontent.com/")


class InstallError(Exception):
    """The zip can't be installed."""


def pick_asset(release: dict, domain: str) -> str | None:
    """Download URL of the release zip (hamlet-home.zip), else None."""
    want = REPOS[domain].split("/")[1] + ".zip"
    for a in release.get("assets", []):
        if a.get("name") == want and str(a.get("browser_download_url", "")).startswith(ALLOWED_HOSTS):
            return a["browser_download_url"]
    return None


def install_zip(zip_path: Path, domain: str, config_dir: Path, target: Path, expect_version: str | None) -> str:
    """Unpack custom_components/<domain> from the zip over `target`, keeping a backup.

    Returns the installed version.  Only files under */custom_components/<domain>/ (and the
    hamlet-update.sh helper) are taken; anything that would land outside is refused.
    """
    staging = config_dir / "hamlet_backup" / f".{domain}.new"
    shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True)
    script = None
    found = False
    try:
        with zipfile.ZipFile(zip_path) as zf:
            for info in zf.infolist():
                parts = PurePosixPath(info.filename).parts
                if ".." in parts or info.filename.startswith("/"):
                    raise InstallError(f"Unsafe path in zip: {info.filename}")
                if info.is_dir():
                    continue
                if parts[-1] == "hamlet-update.sh":
                    script = zf.read(info)
                    continue
                if "custom_components" not in parts:
                    continue
                i = parts.index("custom_components")
                if len(parts) < i + 3 or parts[i + 1] != domain or "__pycache__" in parts:
                    continue
                dest = staging.joinpath(*parts[i + 2:])
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(zf.read(info))
                found = True
        if not found or not (staging / "manifest.json").is_file():
            raise InstallError(f"The zip has no custom_components/{domain}")
        version = json.loads((staging / "manifest.json").read_text())["version"]
        if expect_version and version.lstrip("v") != expect_version.lstrip("v"):
            raise InstallError(f"The zip is version {version}, expected {expect_version}")
        backup = config_dir / "hamlet_backup" / domain
        if target.exists():
            shutil.rmtree(backup, ignore_errors=True)
            shutil.copytree(target, backup, ignore=shutil.ignore_patterns("__pycache__"))
            shutil.rmtree(target)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(staging), str(target))
        if script:
            (config_dir / "hamlet-update.sh").write_bytes(script)
        return version
    except zipfile.BadZipFile as err:
        raise InstallError("The download is not a valid zip") from err
    finally:
        shutil.rmtree(staging, ignore_errors=True)

#!/usr/bin/env python3
"""Refresh the Tinycast settings backup and installed extension inventory."""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DOWNLOADS = Path.home() / "Downloads"
EXTENSIONS = (
    Path.home() / "Library/Application Support/com.tinycast.app/extensions"
)


def main() -> None:
    if len(sys.argv) > 2:
        raise SystemExit("Usage: python3 tinycast/update.py [export.tinycast]")
    if len(sys.argv) == 2:
        source = Path(sys.argv[1]).expanduser()
    else:
        exports = list(DOWNLOADS.glob("Tinycast-*.tinycast"))
        if not exports:
            raise SystemExit("No Tinycast export found in Downloads")
        source = max(exports, key=lambda path: path.stat().st_mtime)
    if not source.is_file():
        raise SystemExit(f"Export not found: {source}")

    entries = [
        entry
        for entry in subprocess.check_output(
            ["aa", "list", "-i", str(source)], text=True
        ).splitlines()
        if entry
    ]
    if set(entries) != {"manifest.json", "settings.json"}:
        raise SystemExit(
            "Export contains categories besides Settings & Shortcuts. "
            "Export again with only that category selected."
        )

    with tempfile.TemporaryDirectory() as staging:
        subprocess.run(["aa", "extract", "-i", str(source), "-d", staging], check=True)
        manifest = json.loads((Path(staging) / "manifest.json").read_text())
        settings = json.loads((Path(staging) / "settings.json").read_text())
        if manifest.get("counts") != {"configuration": 1} or not isinstance(
            settings.get("settings"), dict
        ):
            raise SystemExit("This is not a settings-only Tinycast export")

    extensions = []
    for package in sorted(EXTENSIONS.glob("*/package.json")):
        data = json.loads(package.read_text())
        extensions.append({"name": data["name"], "title": data.get("title", data["name"])})

    shutil.copyfile(source, ROOT / "settings.tinycast")
    (ROOT / "extensions.json").write_text(
        json.dumps(extensions, indent=2, ensure_ascii=False) + "\n"
    )
    print(f"Updated settings.tinycast from {source.name} (Tinycast {manifest['appVersion']})")
    print(f"Recorded {len(extensions)} installed extensions in extensions.json")
    print("Review both files before committing to the public dotfiles repository.")


if __name__ == "__main__":
    main()

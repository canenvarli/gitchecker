#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo "==> Building GitChecker DMG..."
npm run build:dmg

DMG=$(ls -t release/GitChecker-*-arm64.dmg 2>/dev/null | head -1)
if [ -z "$DMG" ]; then
  echo "ERROR: DMG not found in release/" >&2
  exit 1
fi

echo "==> Mounting $DMG..."
MOUNT_OUTPUT=$(hdiutil attach "$DMG" -nobrowse 2>&1)
VOLUME=$(echo "$MOUNT_OUTPUT" | grep '/Volumes/' | sed 's/.*\(\/Volumes\/.*\)/\1/')

if [ -z "$VOLUME" ]; then
  echo "ERROR: Failed to mount DMG" >&2
  exit 1
fi

echo "==> Installing to /Applications..."
cp -R "$VOLUME/GitChecker.app" /Applications/

echo "==> Unmounting..."
hdiutil detach "$VOLUME" -quiet

echo "==> Done. GitChecker installed to /Applications/GitChecker.app"

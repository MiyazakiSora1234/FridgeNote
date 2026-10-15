#!/usr/bin/env bash
# Mac 上で FridgeNote(iOS)をビルド/テストする。リポジトリは GitHub から取得済みの前提。
#
#   初回:  git clone https://github.com/MiyazakiSora1234/FridgeNote.git ~/work/FridgeNote
#   以降:  ~/work/FridgeNote/scripts/mac-build.sh [build|test]   (既定: build)
#
# シミュレータ向けはコード署名なしでビルドできる。実機向けビルドはこのスクリプトの対象外。
set -euo pipefail

MODE="${1:-build}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ "${SKIP_PULL:-0}" != "1" ]] && git rev-parse --git-dir >/dev/null 2>&1; then
  git pull --ff-only
fi

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "xcodegen not found; installing via Homebrew..."
  brew install xcodegen
fi

cd ios
xcodegen generate

UDID="$(xcrun simctl list devices available | grep -m1 'iPhone' | sed -E 's/.*\(([0-9A-Fa-f-]{36})\).*/\1/' || true)"
if [[ -z "$UDID" ]]; then
  echo "No available iPhone simulator found. Install one from Xcode > Settings > Platforms." >&2
  exit 1
fi
echo "Using simulator: $UDID"

COMMON=(
  -project FridgeNote.xcodeproj
  -scheme FridgeNote
  -destination "platform=iOS Simulator,id=$UDID"
  -derivedDataPath build
  CODE_SIGNING_ALLOWED=NO
)

case "$MODE" in
  build) xcodebuild "${COMMON[@]}" build ;;
  test)  xcodebuild "${COMMON[@]}" test ;;
  *) echo "usage: $0 [build|test]" >&2; exit 2 ;;
esac

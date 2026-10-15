#!/usr/bin/env bash
# Mac 上で FridgeNote を Archive し、App Store Connect(TestFlight)へアップロードする。
#
#   TEAM_ID=XXXXXXXXXX scripts/mac-archive.sh
#
# 前提:
#   - Apple Developer Program 加入済み。App Store Connect に Bundle ID com.fridgenote.app のアプリを作成済み。
#   - 署名は次のどちらかで通す:
#       A) Xcode > Settings > Accounts に Apple ID でサインイン済み(GUI操作が1回必要)
#       B) App Store Connect API キー(GUI不要): ASC_KEY_PATH(.p8) / ASC_KEY_ID / ASC_ISSUER_ID を環境変数で渡す
#   - ビルド番号は ExportOptions.plist の manageAppVersionAndBuildNumber により自動で採番される。
set -euo pipefail

: "${TEAM_ID:?TEAM_ID (Apple Developer Team ID, 10 chars) is required}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/ios"

command -v xcodegen >/dev/null 2>&1 || brew install xcodegen
xcodegen generate

AUTH=()
if [[ -n "${ASC_KEY_PATH:-}" ]]; then
  AUTH=(
    -allowProvisioningUpdates
    -authenticationKeyPath "$ASC_KEY_PATH"
    -authenticationKeyID "${ASC_KEY_ID:?ASC_KEY_ID required with ASC_KEY_PATH}"
    -authenticationKeyIssuerID "${ASC_ISSUER_ID:?ASC_ISSUER_ID required with ASC_KEY_PATH}"
  )
else
  AUTH=(-allowProvisioningUpdates)
fi

ARCHIVE="build/FridgeNote.xcarchive"
rm -rf "$ARCHIVE"

# SSH経由などGUIのないセッションではローカルのKeychainを使う署名ができない。
# Archive は署名なしで作り、exportArchive で App Store Connect API キーによるクラウド署名に任せる。
xcodebuild archive \
  -project FridgeNote.xcodeproj \
  -scheme FridgeNote \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGNING_ALLOWED=NO

# export で署名済みの ipa を作り、altool で App Store Connect へアップロードする。
# (Xcode の upload 指定は API キーでの「store configuration」取得に失敗することがあったため分けている)
rm -rf build/export
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist ExportOptions.plist \
  -exportPath build/export \
  "${AUTH[@]}"

if [[ -n "${ASC_KEY_PATH:-}" ]]; then
  # altool は ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8 を探す
  xcrun altool --upload-app -f build/export/FridgeNote.ipa -t ios \
    --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
else
  echo "ASC_KEY_PATH 未指定: build/export/FridgeNote.ipa を Transporter アプリ等で手動アップロードしてください。"
fi

echo "Done. App Store Connect > TestFlight でビルドの処理完了を待ち、テスターを招待してください。"

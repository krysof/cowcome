#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
TEAM_ID="${APPLE_TEAM_ID:-GYD232NJLH}"
ARCHIVE_PATH="native-build/ios/Cowcome.xcarchive"
EXPORT_PATH="native-build/ios/export"
EXPORT_OPTIONS="native-build/ios/ExportOptions.plist"

npm run native:sync

xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  -allowProvisioningUpdates \
  archive

cat > "$EXPORT_OPTIONS" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>debugging</string>
  <key>teamID</key>
  <string>${TEAM_ID}</string>
  <key>signingStyle</key>
  <string>automatic</string>
</dict>
</plist>
EOF

xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -allowProvisioningUpdates

echo "Signed iOS archive: $ARCHIVE_PATH"
echo "Signed development IPA: $EXPORT_PATH/App.ipa"

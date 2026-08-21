#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
npm run native:sync

xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath native-build/ios \
  CODE_SIGNING_ALLOWED=NO \
  build

echo "iOS Simulator app: native-build/ios/Build/Products/Debug-iphonesimulator/App.app"

#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

if [ -z "${JAVA_HOME:-}" ] && [ -d /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
fi
if [ -z "${ANDROID_HOME:-}" ] && [ -d /opt/homebrew/share/android-commandlinetools ]; then
  export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
fi

npm run native:sync
(cd android && ./gradlew assembleDebug)

echo "Android debug APK: android/app/build/outputs/apk/debug/app-debug.apk"

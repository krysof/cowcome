# iOS 与 Android 构建

本项目使用 Capacitor 将同一套 Web 游戏封装为原生 iOS / Android 应用。应用 ID 为
`net.kryso.cowcome`，竖屏运行，并包含原生牛来头像图标与启动画面。

## 同步 Web 内容

```bash
npm install
npm run native:sync
```

## iOS

要求 macOS、Xcode 以及 iOS Simulator。

```bash
npm run ios:build
npm run ios:open
```

模拟器构建输出在：
`native-build/ios/Build/Products/Debug-iphonesimulator/App.app`

真机或 App Store 构建请在 Xcode 打开 `ios/App/App.xcodeproj`，选择自己的 Apple
Developer Team，确认 Bundle Identifier 可用后执行 Archive。签名证书和描述文件不纳入代码库。

## Android

要求 Android SDK 36 与 JDK 21。macOS Homebrew 的默认安装位置会被构建脚本自动识别；
其他环境请设置 `JAVA_HOME` 与 `ANDROID_HOME`。

```bash
npm run android:build
npm run android:open
```

Debug APK 输出在：
`android/app/build/outputs/apk/debug/app-debug.apk`

正式发布时请在 Android Studio 配置自己的签名密钥并生成签名 AAB。签名密钥不得提交到代码库。

## 版本

Web、iOS 和 Android 使用相同显示版本 `20260821.26`。Android `versionCode` 与 iOS
build number 使用纯数字 `26082126`。

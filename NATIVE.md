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

本机已配置 Apple Developer Team，可直接生成签名的真机开发版：

```bash
npm run ios:archive
```

签名归档输出在 `native-build/ios/Cowcome.xcarchive`，开发版 IPA 输出为
`native-build/ios/export/App.ipa`。该 IPA 仅能安装到当前开发描述文件已登记的设备；App Store
发布仍需在 Xcode Organizer 选择相应分发方式。签名证书和描述文件不纳入代码库。

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

游戏内显示版本与 Android 版本为 `20260821.31`。App Store 营销版本为 `1.0`，iOS
build number 为 `26082131`；Android `versionCode` 为 `26082130`。原生安装包包含完整游戏资源，
不依赖网络即可游玩；PWA 安装入口只在网页版显示。

界面支持自动语言、English、日本語、粵語、繁體中文、简体中文和한국어；未匹配到支持语言时回退到简体中文。

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'net.kryso.cowcome',
  appName: '牛来：雾中逃亡',
  webDir: 'dist',
  backgroundColor: '#0b0d09',
  ios: {
    backgroundColor: '#0b0d09',
    // CSS already accounts for every safe-area inset.  Letting UIKit add a
    // second inset makes the visible bottom controls and WKWebView's touch
    // coordinates disagree on devices with a home indicator.
    contentInset: 'never',
    allowsLinkPreview: false,
    scrollEnabled: false,
    preferredContentMode: 'mobile',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      launchFadeOutDuration: 500,
      backgroundColor: '#0b0d09',
      showSpinner: false,
    },
  },
  android: {
    backgroundColor: '#0b0d09',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;

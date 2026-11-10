import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'net.runback.app',
  appName: 'Runback',
  // The app ships the built site from `npm run build`, so it opens fast and can show the offline screen.
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#0F1512',
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#0F1512',
      showSpinner: false,
    },
  },
};

export default config;

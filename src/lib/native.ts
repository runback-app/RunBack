import { Capacitor } from '@capacitor/core';

/** True inside the iPhone/Android app, false on the website. */
export const isNativeApp = Capacitor.isNativePlatform();

/**
 * The address to put in links people share or open from email.
 * Inside the app the page's own origin is capacitor://localhost, which only works on that phone.
 */
export function siteOrigin(): string {
  return isNativeApp ? 'https://runback.net' : window.location.origin;
}

/** Native-only setup: status bar and splash screen. Does nothing on the website. */
export async function startNativeApp(): Promise<void> {
  if (!isNativeApp) return;
  document.documentElement.classList.add('native-app');
  const [{ StatusBar, Style }, { SplashScreen }] = await Promise.all([
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
  ]);
  await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
  await SplashScreen.hide().catch(() => undefined);
}

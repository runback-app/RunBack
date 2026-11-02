import { deletePushSubscription, savePushSubscription } from './lib/api';
import { VAPID_PUBLIC_KEY, base64UrlToBytes } from './lib/push';

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js');
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Asks permission, subscribes this device, and saves it to the player's account. */
export async function turnOnAlerts(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Alerts are blocked for this site. Allow notifications in your browser settings, then try again.'
        : 'Alerts stay off until you tap Allow.',
    );
  }
  const reg = await registration();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (/permission denied|not allowed/i.test(message)) {
        throw new Error("This browser won't allow alerts here. Private or incognito windows can't get alerts.");
      }
      throw new Error("Couldn't turn on alerts on this device. Try again in a minute.");
    }
  }
  await savePushSubscription(sub);
}

export async function turnOffAlerts(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await deletePushSubscription(sub.endpoint).catch(() => undefined);
  await sub.unsubscribe();
}

/** Shows a sample alert right on this device so people can see what they'll get. */
export async function showTestAlert(): Promise<void> {
  const reg = await registration();
  await reg.showNotification('Runback alerts are on', {
    body: "You'll hear about it here when your crew checks in.",
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: '/' },
  });
}

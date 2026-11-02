// Public half of the key pair that signs alerts. Safe to share; the private half lives in Supabase Vault.
export const VAPID_PUBLIC_KEY =
  'BOdtan8KG-S6in5lBCDbcJgdxu7E9KTUp_gK-GPnHI_RbAqM_3H1W3ikdGApS0rMq4TsJBaDHIpffGnVr57ZOB8';

/** Push APIs want the key as raw bytes, not base64url text. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export type AlertSupport =
  | 'ready' // can turn alerts on
  | 'install-first' // iPhone/iPad: add to Home Screen first
  | 'unsupported'; // this browser can't do push alerts

/**
 * Figures out whether this device can get alerts.
 * iPhones only allow web alerts after the site is added to the Home Screen.
 */
export function alertSupport(env: {
  userAgent: string;
  standalone: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
}): AlertSupport {
  const isAppleMobile = /iPhone|iPad|iPod/i.test(env.userAgent);
  if (isAppleMobile && !env.standalone) return 'install-first';
  if (env.hasServiceWorker && env.hasPushManager && env.hasNotification) return 'ready';
  return 'unsupported';
}

export function currentAlertSupport(): AlertSupport {
  if (typeof window === 'undefined') return 'unsupported';
  const nav = navigator as Navigator & { standalone?: boolean };
  return alertSupport({
    userAgent: navigator.userAgent,
    standalone: window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true,
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
  });
}

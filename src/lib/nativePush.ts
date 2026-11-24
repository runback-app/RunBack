import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from './supabase';

const STORAGE = 'runback-native-alerts';
export const nativePushAvailable = Capacitor.getPlatform() === 'ios' && import.meta.env.VITE_NATIVE_PUSH_ENABLED === 'true';
const environment = import.meta.env.VITE_NATIVE_PUSH_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'production';
type Device = { userId: string; endpoint: string };

function storedDevice(): Device | null {
  try { return JSON.parse(localStorage.getItem(STORAGE) ?? 'null'); } catch { return null; }
}

export async function currentNativeDevice(): Promise<Device | null> {
  const { data } = await supabase.auth.getSession();
  const device = storedDevice();
  if (!device || device.userId !== data.session?.user.id) return null;
  const permission = await PushNotifications.checkPermissions();
  return permission.receive === 'granted' ? device : null;
}

let registering: Promise<void> | undefined;
let generation = 0;
export function enableNativeAlerts(askPermission = true): Promise<void> {
  if (registering) return registering;
  registering = register(askPermission).finally(() => { registering = undefined; });
  return registering;
}

async function register(askPermission: boolean): Promise<void> {
  if (!nativePushAvailable) throw new Error('iPhone notifications are being set up.');
  const attempt = generation;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error('Sign in to turn on alerts.');
  let permission = await PushNotifications.checkPermissions();
  if (askPermission && permission.receive === 'prompt') permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') throw new Error('Allow notifications for RunBack in iPhone Settings.');
  const handles: PluginListenerHandle[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const token = await new Promise<string>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Notification registration timed out. Try again.')), 20000);
      void (async () => {
        handles.push(await PushNotifications.addListener('registration', token => resolve(token.value)));
        handles.push(await PushNotifications.addListener('registrationError', () => reject(new Error('Could not register this iPhone for notifications.'))));
        await PushNotifications.register();
      })().catch(reject);
    });
    const current = await supabase.auth.getSession();
    if (attempt !== generation || current.data.session?.user.id !== userId) throw new Error('Account changed. Try turning on alerts again.');
    const { error } = await supabase.rpc('save_native_push_subscription', { p_token: token, p_environment: environment });
    if (error) throw new Error('Could not save this notification device. Try again.');
    const endpoint = `apns://${environment}/${token.toLowerCase()}`;
    if (attempt !== generation) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
      throw new Error('Notification registration was cancelled.');
    }
    const previous = storedDevice();
    localStorage.setItem(STORAGE, JSON.stringify({ userId, endpoint }));
    if (previous?.userId === userId && previous.endpoint !== endpoint) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', previous.endpoint);
    }
  } finally {
    clearTimeout(timer);
    await Promise.all(handles.map(h => h.remove()));
  }
}

export async function disableNativeAlerts(): Promise<void> {
  generation++;
  // Keep enough information to retry server removal if it fails.
  const device = storedDevice();
  if (device) {
    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', device.endpoint);
    if (error) throw new Error('Could not turn off alerts. Check your connection and try again.');
  }
  localStorage.removeItem(STORAGE);
  await PushNotifications.unregister();
  await PushNotifications.removeAllDeliveredNotifications();
}

export async function refreshNativeAlerts(userId: string): Promise<void> {
  // Never prompt on startup or enable another account's notifications implicitly.
  if (storedDevice()?.userId === userId) await enableNativeAlerts(false);
}

import { useEffect, useEffectEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { PushNotifications } from '@capacitor/push-notifications';
import { useAuth } from './auth';
import { nativePushAvailable, refreshNativeAlerts } from './lib/nativePush';
import { nativeNotificationPath } from './lib/nativeInvite';

export function NativePush() {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const open = useEffectEvent((url: unknown) => {
    const path = nativeNotificationPath(url);
    if (path) void navigate(path);
  });
  useEffect(() => {
    if (!nativePushAvailable || !userId) return;
    const refresh = () => { void refreshNativeAlerts(userId).catch(() => undefined); };
    refresh();
    const action = PushNotifications.addListener('pushNotificationActionPerformed', event => open(event.notification.data?.url));
    const foreground = CapacitorApp.addListener('appStateChange', event => { if (event.isActive) refresh(); });
    return () => {
      void action.then(h => h.remove()).catch(() => undefined);
      void foreground.then(h => h.remove()).catch(() => undefined);
    };
  }, [userId]);
  return null;
}

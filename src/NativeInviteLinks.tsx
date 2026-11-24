import { App as CapacitorApp } from '@capacitor/app';
import { useEffect, useEffectEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { nativeInvitePath } from './lib/nativeInvite';

export function NativeInviteLinks() {
  const navigate = useNavigate();
  const openInvite = useEffectEvent((url: string) => {
    const path = nativeInvitePath(url);
    if (!path || window.location.pathname === path) return false;
    void navigate(path);
    return true;
  });

  useEffect(() => {
    let active = true;
    let openedInvite = false;
    const listener = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      if (active && openInvite(url)) openedInvite = true;
    });

    void listener.then(async () => {
      const launch = await CapacitorApp.getLaunchUrl();
      if (active && !openedInvite && launch?.url) openInvite(launch.url);
    }).catch(() => console.warn('Could not initialize native invite links.'));

    return () => {
      active = false;
      void listener.then((handle) => handle.remove()).catch(() => undefined);
    };
  }, []);

  return null;
}

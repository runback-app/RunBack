// Sends phone/computer alerts after someone checks in.
// The database calls this right after each check-in with { checkin_id }.
// Who gets alerted is decided in SQL (public.alert_targets), which also makes sure
// each check-in is only handled once, so calling this twice does nothing extra.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const VAPID_PUBLIC_KEY = 'BOdtan8KG-S6in5lBCDbcJgdxu7E9KTUp_gK-GPnHI_RbAqM_3H1W3ikdGApS0rMq4TsJBaDHIpffGnVr57ZOB8';
const VAPID_SUBJECT = 'https://runback.net';

type Target = { endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string };

function adminKey(): string {
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys);
      if (typeof parsed.default === 'string') return parsed.default;
    } catch {
      // fall through to the legacy key
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, adminKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

let signingReady = false;

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);

  let checkinId: unknown;
  let notificationId: unknown;
  try {
    const payload = await req.json();
    checkinId = payload?.checkin_id;
    notificationId = payload?.notification_id;
  } catch {
    return reply({ error: 'Send JSON with checkin_id' }, 400);
  }
  if ((typeof checkinId !== 'string' || !/^[0-9a-f-]{36}$/i.test(checkinId)) && (typeof notificationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(notificationId))) {
    return reply({ error: 'Send JSON with checkin_id' }, 400);
  }

  const { data, error } = typeof notificationId === 'string'
    ? await admin.rpc('run_alert_targets', { p_notification_id: notificationId })
    : await admin.rpc('alert_targets', { p_checkin_id: checkinId });
  if (error) {
    console.error('alert_targets failed', error.message);
    return reply({ error: 'Lookup failed' }, 500);
  }
  const targets = (data ?? []) as Target[];
  if (targets.length === 0) return reply({ sent: 0 });

  if (!signingReady) {
    const { data: key, error: keyError } = await admin.rpc('alert_signing_key');
    if (keyError || typeof key !== 'string' || !key) {
      console.error('signing key missing', keyError?.message);
      return reply({ error: 'Alerts are not set up' }, 500);
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, key);
    signingReady = true;
  }

  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    targets.map(async (t) => {
      try {
        await webpush.sendNotification(
          { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
          JSON.stringify({ title: t.title, body: t.body, url: t.url }),
          { TTL: 60 * 60, urgency: 'high' },
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 410 means the device turned alerts off or the app was removed, so forget it.
        // 404 can be a brief hiccup right after someone turns alerts on, so just log it.
        if (status === 410) gone.push(t.endpoint);
        else console.error('push failed', status, (err as Error).message);
      }
    }),
  );

  if (gone.length) await admin.from('push_subscriptions').delete().in('endpoint', gone);
  return reply({ sent, removed: gone.length });
});

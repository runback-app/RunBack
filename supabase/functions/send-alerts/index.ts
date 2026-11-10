// Sends phone/computer alerts after someone checks in, for crew runs, and for Got next teams.
// The database calls this with { checkin_id }, { notification_id } (crew runs),
// or { team_notification_id } ("You're up next" / "You got picked up").
// It also emails us about reported court chat messages: { report_alert_id },
// and about messages sent through the feedback form: { feedback_id }.
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

type ReportDetails = {
  message_id: string;
  report_count: number;
  body: string;
  posted_at: string;
  author_id: string;
  author_name: string;
  court_name: string;
  court_slug: string;
};

const SITE = 'https://runback.net';
const TABLE_EDITOR = 'https://supabase.com/dashboard/project/ioxmdthiblgudygedjmc/editor';

/** Emails us about a reported court chat message, through Resend. Plain text only. */
async function sendReportEmail(alertId: string): Promise<Response> {
  const { data, error } = await admin.rpc('report_alert_details', { p_alert_id: alertId });
  if (error) {
    console.error('report_alert_details failed', error.message);
    return reply({ error: 'Lookup failed' }, 500);
  }
  const r = ((data ?? []) as ReportDetails[])[0];
  if (!r) return reply({ sent: 0 }); // already handled, too old, or message gone

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set; report email skipped');
    return reply({ error: 'Report emails are not set up' }, 500);
  }
  const to = (Deno.env.get('REPORT_ALERT_TO') ?? 'support@runback.net')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  const hidden = r.report_count >= 3;
  const subject = hidden
    ? `Runback: chat message hidden after 3 reports (${r.court_name})`
    : `Runback: chat message reported (${r.court_name})`;
  const text = [
    hidden
      ? 'A court chat message got its 3rd report, so it is now hidden for everyone.'
      : 'Someone reported a court chat message. It is hidden for them; others still see it until 3 reports.',
    '',
    `Court: ${r.court_name} (${SITE}/court/${r.court_slug})`,
    `Posted by: ${r.author_name} (${SITE}/player/${r.author_id})`,
    `Posted at: ${new Date(r.posted_at).toLocaleString('en-US', { timeZone: 'America/Phoenix' })} (Tucson time)`,
    `Reports so far: ${r.report_count}`,
    '',
    'Message:',
    r.body,
    '',
    'What to do:',
    '- Fine? Do nothing. Messages clear on their own after 24 hours.',
    `- Remove it now: Supabase table editor → court_messages → find id ${r.message_id} → delete row.`,
    `  ${TABLE_EDITOR}`,
    '- Repeat problem player? Note their player link above.',
  ].join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Runback alerts <alerts@runback.net>', to, subject, text }),
  });
  if (!res.ok) {
    console.error('report email failed', res.status, await res.text());
    return reply({ error: 'Email failed' }, 502);
  }
  return reply({ sent: 1 });
}

type FeedbackDetails = {
  feedback_id: string;
  message: string;
  page: string | null;
  sent_at: string;
  player_id: string | null;
  player_name: string | null;
  reply_email: string | null;
};

/** Emails us a message from the feedback form. Reply-To is the player, so Reply answers them. */
async function sendFeedbackEmail(feedbackId: string): Promise<Response> {
  const { data, error } = await admin.rpc('feedback_email_details', { p_feedback_id: feedbackId });
  if (error) {
    console.error('feedback_email_details failed', error.message);
    return reply({ error: 'Lookup failed' }, 500);
  }
  const f = ((data ?? []) as FeedbackDetails[])[0];
  if (!f) return reply({ sent: 0 }); // already emailed or too old

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set; feedback email skipped');
    return reply({ error: 'Feedback emails are not set up' }, 500);
  }
  const to = (Deno.env.get('REPORT_ALERT_TO') ?? 'support@runback.net')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  const name = f.player_name ?? 'A player';
  const replyOk = !!f.reply_email && /^[^\s@<>]+@[^\s@<>]+$/.test(f.reply_email);
  const text = [
    `${name} sent feedback from Runback.`,
    '',
    'Message:',
    f.message,
    '',
    `From: ${name}${f.player_id ? ` (${SITE}/player/${f.player_id})` : ''}`,
    `Page: ${f.page ?? 'unknown'}`,
    `Sent: ${new Date(f.sent_at).toLocaleString('en-US', { timeZone: 'America/Phoenix' })} (Tucson time)`,
    '',
    replyOk ? 'Hit Reply to answer them (it goes to their sign-in email).' : 'No reply address on file.',
  ].join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Runback feedback <alerts@runback.net>',
      to,
      subject: `Runback feedback from ${name}`,
      text,
      ...(replyOk ? { reply_to: f.reply_email } : {}),
    }),
  });
  if (!res.ok) {
    console.error('feedback email failed', res.status, await res.text());
    return reply({ error: 'Email failed' }, 502);
  }
  return reply({ sent: 1 });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);

  let checkinId: unknown;
  let notificationId: unknown;
  let teamNotificationId: unknown;
  let reportAlertId: unknown;
  let feedbackId: unknown;
  try {
    const payload = await req.json();
    checkinId = payload?.checkin_id;
    notificationId = payload?.notification_id;
    teamNotificationId = payload?.team_notification_id;
    reportAlertId = payload?.report_alert_id;
    feedbackId = payload?.feedback_id;
  } catch {
    return reply({ error: 'Send JSON with checkin_id' }, 400);
  }
  const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
  if (isId(reportAlertId)) return sendReportEmail(reportAlertId);
  if (isId(feedbackId)) return sendFeedbackEmail(feedbackId);
  if (!isId(checkinId) && !isId(notificationId) && !isId(teamNotificationId)) {
    return reply({ error: 'Send JSON with checkin_id' }, 400);
  }

  const { data, error } = isId(teamNotificationId)
    ? await admin.rpc('team_alert_targets', { p_notification_id: teamNotificationId })
    : isId(notificationId)
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

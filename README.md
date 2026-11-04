# Runback

See who's at the court before you go. Check in at a Tucson court, see who's playing, build a crew you can invite with a text, and get an alert when a run starts.

Live site: https://runback.net

[MVP status and remaining checks](docs/MVP_STATUS.md) · [Where to sign in, edit, deploy, and handle recovery](docs/OPERATIONS.md)

## What it does

- **Courts and map:** South Rec, North Rec, Reid Park, and Himmel Park on a map, with posted hours and whether they're open right now.
- **Check-ins:** check in for 1 to 3 hours. Check-ins end on their own, so counts never go stale. One court at a time.
- **Run meter:** ten spots (two teams of five) fill up as people check in.
- **Player profiles:** photo, position, height, level, home court, and a short bio. Tap anyone to see their player card.
- **Crews:** start a crew for your regular run, then text the invite link. The crew page shows which crewmates are playing right now.
- **Planned runs:** leaders can schedule once, daily, or on selected weekdays in Tucson time. Each date has Going / Maybe / Can’t make it RSVPs and its own chat. Rolling 12-week schedules replenish daily.
- **Crew chat and controls:** current members can chat; leaders can edit the crew, upload a private crew photo, remove members/messages, and replace invite links.
- **Run updates:** optional 30-minute reminders plus change/cancellation notices appear in `/updates` and go to opted-in push devices.
- **Your courts:** star a court to pin it to the top.
- **Alerts:** get a phone or computer alert when someone in your crew checks in, or when one of your courts hits a number of players you pick. On iPhone, add the site to your Home Screen first (Apple's rule).

Signed-out visitors see courts, hours, and player counts. Names, photos, and profiles are only visible to signed-in players.

## Privacy and feedback

- The privacy page is at `/privacy` (`src/pages/PrivacyPage.tsx`). Update it when the app starts collecting something new.
- Players can delete their account from their profile. That removes everything tied to them.
- Check-in history is deleted after 30 days by a daily database job (`delete-old-checkins`).
- Messages from the "Send feedback" form land in the `feedback` table in Supabase (Table Editor > feedback).
- Page views are counted with Vercel Web Analytics (no cookies). Invite codes and ids are stripped from page addresses before they're counted.

## How it's built

| Part | What we use |
| --- | --- |
| Website | React + Vite (TypeScript), in `src/` |
| Backend | Supabase: database, accounts, photo storage, security rules. Setup is in `supabase/migrations/` |
| Alerts | Web push. `supabase/functions/send-alerts` sends them; the database decides who gets one (`alert_targets`) |
| Map | Leaflet with OpenStreetMap tiles |
| Usage stats | Vercel Web Analytics |
| Hosting | Vercel. Every push to `main` deploys automatically once the checks pass (the deploy runs in GitHub Actions) |
| Checks | GitHub Actions runs type checks, tests, and a build on every push |

The repo lives in the `runback-app` GitHub org. Vercel's free plan won't deploy a private org repo directly, so the `deploy` job in `.github/workflows/ci.yml` does it with the Vercel CLI. It needs a `VERCEL_TOKEN` secret in the repo's Actions secrets. If deploys suddenly fail, check whether that token expired.

The main logic lives in `src/lib/` (court hours, timers, run meter, invites, profiles, alerts), and each file there has a matching `.test.ts`.

## Run it on your computer

1. Install [Node.js](https://nodejs.org) (version 22 or newer).
2. In this folder, run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Run `npm run dev` and open the link it prints.

Other commands: `npm test` runs the tests, `npm run build` makes the production build.

## To do

- [ ] **Finish SMTP, test real inboxes, then turn email confirmation back on.** `runback.net` is connected and verified in Resend. The remaining setup is a domain-restricted sending key in the shared Supabase project's SMTP settings. Confirmation is still off until delivery is tested.
- [ ] Complete real inbox tests of signup confirmation and password reset after SMTP is configured. Reset UI, password matching, and show/hide controls are implemented.
- [x] Forgot-email recovery at `/forgot-email`, with a private manual-review inbox and sign-in email shown only on the account owner's profile. Requests do not reveal or change accounts automatically.
- [ ] Optional player caps and waitlists.
- [x] Private crew chat and a separate chat for each scheduled run.
- [ ] Check that people are actually near the court when they check in.
- [ ] Let players suggest new courts.
- [ ] Holiday and game-day hours (UA Rec changes hours for home games and breaks).
- [ ] Phone app version, once people are using the website. Check the App Store name and submission requirements at that stage.

## Scheduling migration and verification

`20261102232712_runs_chat_crew_management.sql` adds schedules, per-date runs and RSVPs, crew/run chats, notifications, court detail fields, private crew photos, and role-based policies. Apply it before deploying the frontend and update `send-alerts` with the matching code. Recurring jobs are `runback-materialize-runs` and `runback-run-reminders`.

Run `npm test` and `npm run build`. `supabase/tests/runs_chat_permissions.sql` exercises recurrence, RSVP impersonation prevention, member-only chats, leader-only changes/photos, reminders and cancellation notices in a rolled-back transaction. It needs one existing crew with two members. It does not retain test data or send pushes.

Supabase Site URL is `https://runback.net`. Root, `/reset-password`, and `/join/*` redirects are allowed for both `runback.net` and the original Vercel address. The signup redirect returns a player to their crew invitation after email confirmation. A custom SMTP sender is required before promising verification/reset email delivery to players outside the Supabase project team. Do not enable email confirmation until that sender is ready.

The `20261104011300_atomic_run_rsvp.sql` migration fixes PostgREST upsert conflicts without granting updates to immutable attendance keys. The `20261104011835_crew_photo_path_permissions.sql` migration qualifies the object path in crew photo policies. Both were applied and verified against production using disposable fixtures. The public API walkthrough is `scripts/mvp-smoke.mjs`; see the operations guide before running it.

## Account recovery operations

The shared production database is `ioxmdthiblgudygedjmc` in Nick's shared organization. Apply `20261103215047_account_recovery_requests.sql` before deploying the forgot-email form. Test with `supabase/tests/account_recovery_permissions.sql`; the test rolls back every row and sends no email.

Read requests in Supabase **Table Editor > account_recovery_requests**. Both signed-out visitors and players can submit, but cannot read, update, delete, set timestamps, or retrieve other requests. Requests expire after 30 days; duplicates are silently limited to three per contact address per hour, with a total inbox limit of 100 per hour. The form has no account-lookup endpoint.

Sanjay or Nick must review this inbox and contact the supplied reply address manually. That address is an unverified claim: do not disclose a registered email or change account access based only on a display name, crew/court details, profile photo, or a message from a crewmate. Verify ownership through an existing signed-in session or the original registered inbox; if neither is available, do not transfer the account without another independently verified ownership method. Never ask for passwords or reset codes.

SMTP launch steps: verify an owned domain with the email sender, configure the sender in this shared project's **Authentication > Emails > SMTP Settings**, disable email link tracking, and run a complete real-inbox password-reset test with a non-team address. Only then enable signup confirmation. When a custom website domain is connected, add its root and `/reset-password` URLs to Auth URL Configuration, retain the existing live URLs during transition, and repeat the inbox test. A domain purchase alone does not configure email delivery.

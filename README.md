# Runback

See who's at the court before you go. Check in at a Tucson court, see who's playing, build a crew you can invite with a text, and get an alert when a run starts.

Live site: https://runback-tucson.vercel.app

## What it does

- **Courts and map:** South Rec, North Rec, Reid Park, and Himmel Park on a map, with posted hours and whether they're open right now.
- **Check-ins:** check in for 1 to 3 hours. Check-ins end on their own, so counts never go stale. One court at a time.
- **Run meter:** ten spots (two teams of five) fill up as people check in.
- **Player profiles:** photo, position, height, level, home court, and a short bio. Tap anyone to see their player card.
- **Crews:** start a crew for your regular run, then text the invite link. The crew page shows which crewmates are playing right now.
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

- [ ] **Turn email confirmation back on.** It's off right now because Supabase's free email only sends to the project's team. To fix: buy a domain, set up an email service (Resend has a free tier), add it under Supabase > Authentication > SMTP, then turn **Confirm email** back on.
- [ ] Password reset ("forgot password"), which also needs the email service above.
- [ ] **Plan runs ahead:** post a time and court, people tap "I'm in", with a player cap and waitlist. (Every similar app has this.)
- [ ] Court chat for coordinating a run.
- [ ] Check that people are actually near the court when they check in.
- [ ] Let players suggest new courts.
- [ ] Holiday and game-day hours (UA Rec changes hours for home games and breaks).
- [ ] Phone app version, once people are using the website. Note: an iPhone app called "RunItBack" already exists, so the App Store name may need a tweak.

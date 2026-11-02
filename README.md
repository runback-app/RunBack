# Runback

See who's at the court before you go. Check in at a Tucson court, see who's playing, and build a crew you can invite with a text.

## What it does

- **Courts:** South Rec, North Rec, Reid Park, and Himmel Park, with their posted hours and whether they're open right now.
- **Check-ins:** tap Check in and you show up at that court for 1 to 3 hours. Check-ins end on their own, so the counts never go stale. You can only be at one court at a time.
- **Run meter:** ten spots (two teams of five) fill up as people check in, so you can tell at a glance if there's a full run.
- **Crews:** start a crew for your regular run, then text the invite link. Friends tap it, make an account, and they're in. The crew page shows which crewmates are playing right now and where.

Signed-out visitors see courts, hours, and player counts. Names are only visible to signed-in players.

## How it's built

| Part | What we use |
| --- | --- |
| Website | React + Vite (TypeScript), in `src/` |
| Backend | Supabase (database, accounts, security rules). Database setup is in `supabase/migrations/` |
| Hosting | Vercel. Every push to `main` deploys automatically |
| Checks | GitHub Actions runs type checks, tests, and a build on every push |

The interesting logic lives in `src/lib/` (court hours, check-in timers, the run meter, invite links), and each file there has a matching `.test.ts`.

## Run it on your computer

1. Install [Node.js](https://nodejs.org) (version 22 or newer).
2. In this folder, run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Run `npm run dev` and open the link it prints.

Other commands:

- `npm test` runs the tests
- `npm run build` makes the production build

## To do

- [ ] **Turn email confirmation back on.** It's off right now because Supabase's free email only sends to the project owner. To fix: buy a domain, set up an email service (Resend has a free tier), add it under Supabase > Authentication > SMTP, then turn **Confirm email** back on.
- [ ] Password reset ("forgot password"), which also needs the email service above.
- [ ] Add more courts (and a way to suggest one).
- [ ] Holiday and game-day hours (UA Rec changes hours for home games and breaks).
- [ ] Phone app version, once people are using the website.

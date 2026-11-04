# MVP status — November 3, 2026 (Tucson)

The shareable website is **https://runback.net**. This is a web MVP; App Store work comes after the pilot.

## Completed

- [x] Connect the purchased domain to the existing app; `www` redirects to the main address.
- [x] Verify `runback.net` in Resend and add its email DNS records.
- [x] Connect custom SMTP using a sending-only key restricted to `runback.net`; send as **RunBack <noreply@runback.net>**.
- [x] Apply branded password-reset and signup-confirmation templates. Resend reported the new reset email delivered to Sanjay's existing account; its link returns to `https://runback.net/reset-password`. Sanjay also confirmed the original password-change flow worked before the sender change.
- [x] Set the shared Supabase Site URL and reset/invitation redirects for the new domain; retain old links.
- [x] Provide a private manual forgot-email request inbox, ownership rules, and the account owner's sign-in email on their profile.
- [x] Two-account API walkthrough: signup/profile creation, own-profile edits, crew creation and invitations, one-time/recurring runs, date-specific attendance changes, separate crew/run chats, private photo access, member removal, invite replacement, and cancelled dates.
- [x] Fix the RSVP save permission error and the crew photo path policy.
- [x] Accept both original and replacement invitation formats; preserve invitations through signup confirmation.
- [x] Browser walkthrough on the live domain at phone width: sign-in, crew view, attendance changes, edit a run, edit a crew, chat, and refreshed nested routes.
- [x] Rolled-back database tests of check-in/out, court switching, counts, expiry, anonymous privacy, court chat abuse rules, and run permissions/reminders/cancellation.
- [x] Add deployment/recovery instructions and a bug-report form in the shared repository.
- [x] Verify source helpers clean up private crew photos before deleting a crew or its owner account. Disposable accounts can no longer sign in after deletion.

Validation: 68 unit tests and a production build passed. Nine public API scenarios passed; additional tests used the actual source helpers for replacement invites and deletion. GitHub Actions checks and deployment succeeded. The production domain serves the matching build, and `www` returns a 308 redirect to the main address.

The browser has reconnected. The replacement-invite code and API paths pass; its final browser clickthrough remains separate from the email work. One disposable recovery request named **MVP QA Recovery 20261103** with contact **qa-recovery@runback.net** remains in the manual-review table; ignore that fixture or let the 30-day cleanup remove it. All retained API test accounts, crews, and photos were removed.

## Required before inviting a broader pilot

- [ ] Complete a fresh reset test in an ordinary non-team inbox, including inbox/spam placement, password change, and fresh sign-in. Custom SMTP is configured; the branded delivery test to the existing account passed.
- [ ] Enable signup confirmation after delivery is working; test verification and invite return on another device.
- [ ] Check on an actual iPhone and Android phone: home-screen installation, keyboard/form behavior, photos, push permission and delivery, and return visits. Desktop viewport testing cannot prove these device behaviors.
- [ ] Confirm direct Vercel project administration with Nick. Shared repository deployments work; the hosting project remains in his team.
- [ ] Have Sanjay recruit 10–15 players across two crews and run the full court/invite/attendance/check-in flow at a real session. Track failures before adding features.

Sanjay handles recovery/feedback during the pilot, with Nick as backup. Forgot-email recovery remains a private manual ownership check. Account email sending is configured and delivered in the existing-account test; finish the remaining verification and device checks before a broader pilot.

# MVP status — November 4, 2026

The shareable website is **https://runback.net**. This is a web MVP; App Store work comes after the pilot.

## Completed

- [x] Connect the purchased domain to the existing app; `www` redirects to the main address.
- [x] Verify `runback.net` in Resend and add its email DNS records.
- [x] Set the shared Supabase Site URL and reset/invitation redirects for the new domain; retain old links.
- [x] Provide a private manual forgot-email request inbox, ownership rules, and the account owner's sign-in email on their profile.
- [x] Two-account API walkthrough: signup/profile creation, own-profile edits, crew creation and invitations, one-time/recurring runs, date-specific attendance changes, separate crew/run chats, private photo access, member removal, invite replacement, and cancelled dates.
- [x] Fix the RSVP save permission error and the crew photo path policy.
- [x] Accept both original and replacement invitation formats; preserve invitations through signup confirmation.
- [x] Browser walkthrough on the live domain at phone width: sign-in, crew view, attendance changes, edit a run, edit a crew, chat, and refreshed nested routes.
- [x] Rolled-back database tests of check-in/out, court switching, counts, expiry, anonymous privacy, court chat abuse rules, and run permissions/reminders/cancellation.
- [x] Add deployment/recovery instructions and a bug-report form in the shared repository.

## Required before inviting a broader pilot

- [ ] Approve creation of a domain-restricted Resend sending credential and connect it to Supabase SMTP.
- [ ] Prove password reset reaches an ordinary non-team inbox, completes a password change, and permits a fresh sign-in.
- [ ] Enable signup confirmation after delivery is working; test verification and invite return on another device.
- [ ] Check on an actual iPhone and Android phone: home-screen installation, keyboard/form behavior, photos, push permission and delivery, and return visits. Desktop viewport testing cannot prove these device behaviors.
- [ ] Confirm direct Vercel project administration with Nick. Shared repository deployments work; the hosting project remains in his team.
- [ ] Have Sanjay recruit 10–15 players across two crews and run the full court/invite/attendance/check-in flow at a real session. Track failures before adding features.

Sanjay handles recovery/feedback during the pilot, with Nick as backup. The existing core features are available, but verified email recovery remains a launch blocker.

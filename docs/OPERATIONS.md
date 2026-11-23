# RunBack operations

## Where to go

| Need | Place |
| --- | --- |
| Use or share the app | https://runback.net |
| Sign into your player account | https://runback.net/login |
| Edit your profile and see your sign-in email | https://runback.net/me |
| Recover an unknown sign-in email | https://runback.net/forgot-email |
| Edit source code with Nick | https://github.com/runback-app/RunBack |
| Check deployments | https://github.com/runback-app/RunBack/actions/workflows/ci.yml |
| Read feedback and recovery requests | https://supabase.com/dashboard/project/ioxmdthiblgudygedjmc/editor |
| Manage accounts, auth redirects and email | https://supabase.com/dashboard/project/ioxmdthiblgudygedjmc/auth/users |
| Manage domain and DNS | https://vercel.com/sanjayv-code/~/domains/runback.net |
| Email domain delivery | https://resend.com/domains |
| Track bugs | https://github.com/runback-app/RunBack/issues |

The player login, GitHub login, Supabase login, Vercel login, and Resend login are separate accounts. Sign into GitHub as your existing `sanjayv-code` account and open the shared `runback-app/RunBack` repository. This is the project you and Nick work on.

The live Supabase project is **ioxmdthiblgudygedjmc** in **NickDotCom88's Org**. Sanjay's separate empty project is not the app's backend. The live Vercel project is still in Nick's team; Sanjay's Vercel dashboard holds the domain. GitHub Actions deploys to the correct shared project using its existing repository secret. A missing project in Sanjay's Vercel dashboard does not mean the site is gone. Direct project/team administration still requires access in Nick's Vercel team.

## Make and release changes

1. Clone the shared repository and create a branch. Follow the README's local setup; use the shared backend's public app settings in `.env.local`.
2. Make the change. Run `npm test` and `npm run build`.
3. Open a pull request for Nick or Sanjay to review. For database changes, commit a generated migration and verify row permissions before changing the frontend.
4. Merge to `main`. **Checks** runs tests and builds first; **deploy** then publishes to Vercel. Check both jobs, not just the green unit tests.
5. Open https://runback.net and exercise the changed behavior. Nested routes must work on refresh too.

To undo a broken code release, revert the offending code commit in GitHub and let Checks deploy that revert. Do not reset/force-push the shared branch. Database changes need a separate reviewed correction; rolling back frontend code does not roll back production data. The new RSVP function and photo-policy fix are additive/corrective changes and should remain applied. If deployment fails because the Vercel token expired, Nick must renew the existing `VERCEL_TOKEN` repository secret. Do not put it in source code.

## Account email delivery

The domain is verified in Resend; DNS includes DKIM, the requested sending CNAME records, and a monitoring DMARC record. Receiving mail is not enabled: buying the domain did not create an inbox at `@runback.net`.

The Resend key **RunBack account emails** has been created with **Sending access** restricted to **runback.net**. It is configured only in the shared Supabase project's Authentication → Emails → SMTP Settings:

| Setting | Value |
| --- | --- |
| Sender | `noreply@runback.net` |
| Sender name | `RunBack` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | The restricted Resend key |

Keep the key only in the SMTP password field. Leave click/open tracking off for authentication links. Keep the existing auth email rate limits during the pilot; revisit them if Resend logs show throttling.

Branded reset and signup-confirmation HTML is versioned in `supabase/templates/`; the matching subjects and dashboard paths are in its README. Those files are backups of the applied dashboard configuration, not an automatic deployment mechanism. SMTP is enabled, and Resend reported the first branded reset email delivered at about 8:28 PM Tucson time on November 3. The sender was `RunBack <noreply@runback.net>` and the recovery link returned to the correct app. Provider delivery does not establish inbox placement or completion of a new password change; Sanjay confirmed his earlier reset/password-change test worked before this sender update.

Before enabling signup confirmation, test reset delivery to an ordinary non-team inbox: request the link from `/login`, verify delivery in Resend and the inbox/spam folder, open the newest link, have the account owner choose a password, then sign out and sign back in. Test an expired/used link as well. Then enable Confirm email and test a new signup through a crew invitation, including opening the confirmation on another device. If delivery fails, keep the pilot paused; do not remove verification to work around mail problems.

## Recovery and feedback ownership

Sanjay is the primary reviewer; Nick is the backup. Check **account_recovery_requests** and **feedback** in the shared Supabase Table Editor during the pilot. These are manual inboxes; the forgot-email form does not send an automatic response or reveal a registered email. Requests expire after 30 days.

The supplied contact email is unverified. Verify ownership through an existing signed-in session or the original inbox before disclosing or changing account information. A name, photo, court, or crewmate's message is not sufficient. Never ask for passwords or reset codes. If the player cannot verify ownership, keep the account unchanged.

## Reproduce and track bugs

Use the repository's bug-report form. Include the page, steps, expected result, actual result, phone/browser, and approximate time in Tucson. Copy visible errors, but omit passwords, reset links, private messages, and keys. Check GitHub Actions for deployment failures, Supabase logs for server failures, and Resend logs for email delivery.

## Test safely

`supabase/tests/checkin_permissions.sql`, `runs_chat_permissions.sql`, `court_chat_permissions.sql`, and `account_recovery_permissions.sql` run in transactions and roll back all test data and queued pushes. The runs test requires one crew with two members. Run against the shared project, not the unused personal project.

`scripts/mvp-smoke.mjs` exercises the same public API used by the app with two disposable QA accounts and a private crew. It never posts to public court chat or checks into public courts. Run only intentionally; it creates and deletes real disposable accounts. It requires email confirmation to be off, so after verification launches use verified test accounts/manual inbox testing instead of turning confirmation off.

```bash
RUNBACK_QA_FIXTURE=/absolute/scratch/runback-qa.json node --use-env-proxy --env-file=.env.local scripts/mvp-smoke.mjs
```

Use `--keep` only for a browser walkthrough, then run the same command with `--cleanup`. The local fixture contains disposable credentials and must never be committed or shared.

## Reliable support email rollout (November 23)

Applied to the shared production project `ioxmdthiblgudygedjmc` on November 23, 2026. The updated three-file `send-alerts` deployment succeeded with its existing JWT verification setting preserved. All three migration versions are recorded in migration history. Rolled-back production permission tests passed for recurrence/cancellation, native-device privacy, feedback lookup/receipt permissions, and email retries. The five-minute retry job is active. A labeled QA feedback message was accepted by the email provider and its success receipt was recorded; this does not establish forwarding to both destination inboxes.

1. Deploy the updated `send-alerts` function including `delivery.ts` and `apns.ts`, retaining its existing JWT-verification configuration. It accepts opaque event IDs from database triggers and restricts lookups to server-side RPCs. Never add private keys to the client or repository.
2. Apply `20261117180000_serialize_recurring_run_cancellation.sql`, `20261123232932_reliable_support_email_delivery.sql`, and `20261123232938_native_iphone_push.sql` in order. The email migration replaces consuming lookups with read-only lookups, preserves service-only grants, and adds a five-minute retry job. Deploy the sender immediately before this migration; the old sender does not record receipts with the new lookup semantics.
3. Verify `RESEND_API_KEY` and `REPORT_ALERT_TO` are configured and that support forwarding reaches both Sanjay and Nick. Send explicitly labeled QA feedback and reports using disposable/private test content, then check Resend acceptance and both destination inboxes. The code does not treat provider acceptance as proof of inbox delivery.
4. Run the rolled-back permission tests in `supabase/tests/`. `npm run test:db` runs the real migration SQL and RLS locally with platform HTTP/cron stubs. It sends no mail and does not access production. With `RUNBACK_TEST_DB_URL` pointed at a disposable loopback PostgreSQL database, the suite also overlaps scheduler/stop transactions in both lock orderings. Both orderings passed on PostgreSQL 17.6; the production cancellation/permission suite also passed after rollout.

Pending feedback/court/crew report emails retry for up to 23 hours from record creation, within Resend's 24-hour idempotency window. Up to 20 per queue are retried each pass. Delivery is acknowledged only after provider acceptance. Missing credentials/provider failures leave new records pending. Review older pending records manually; no emails are automatically resent after that window.

Historical rows marked handled by the old implementation cannot safely be distinguished from delivered rows using those timestamps alone. They are not reset automatically. Review provider logs before manually resending anything old. Provider payloads use a stable event key; avoid editing the underlying report/user metadata while a retry is outstanding.

The current branch includes the work from draft PRs #19 and #20. Do not merge duplicate versions separately once this branch lands. Stripe remains paused in its separate draft.

# Account email templates

These templates are applied in the shared production project's **Authentication → Emails → Templates**. Website deployment does not automatically update them.

| File | Dashboard template | Subject |
| --- | --- | --- |
| `recovery.html` | Reset password | Reset your RunBack password |
| `confirmation.html` | Confirm sign up | Confirm your RunBack email |

Sender: **RunBack <noreply@runback.net>**, via Resend SMTP. The sending-only credential is restricted to `runback.net` and stored only in Supabase's encrypted SMTP configuration. It must never be added to this repository or any `VITE_` environment variable.

Both templates use Supabase's `{{ .ConfirmationURL }}` placeholder so the existing verification and recovery flow stays intact. Preserve that variable when editing. Tracking is not enabled. The recovery email links to the manual forgot-email help page and never discloses a password.

Verification on November 3, 2026 (Tucson): Supabase accepted a reset request for the signed-in owner's existing account; Resend reported it delivered from the configured sender with the branded subject/body. The rendered link used the shared Supabase auth project, `type=recovery`, and `redirect_to=https://runback.net/reset-password`. No password was changed during that delivery test. The owner had independently confirmed that the prior reset/password-change flow worked. Complete a fresh ordinary-user inbox walkthrough before the broader pilot.

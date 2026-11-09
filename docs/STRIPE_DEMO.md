# RunBack Stripe integration plan

RunBack helps basketball players find courts and coordinate pickup games. Use a mock $5 pickup event to demonstrate the payment flow in a Stripe sandbox. The demo runs from a terminal. It opens Stripe-hosted Checkout and reads the payment status directly from Stripe.

## Run the demo

1. In the Stripe Dashboard, select the RunBack sandbox. If a test secret key was shared in chat or elsewhere, rotate it. Prefer a restricted sandbox key with Checkout Sessions write access for this demo. Put the new key in `.env.stripe.local` at the repository root. That file is ignored by Git.

   ```dotenv
   STRIPE_SECRET_KEY=<your replacement sandbox secret key>
   ```

2. Run `npm ci`, then `npm run stripe:demo -- create`. Open the printed Checkout URL. Each run of this command creates a fresh $5 test session.
3. Confirm the Stripe checkout page indicates test mode. Pay using Stripe's test card `4242 4242 4242 4242`, any future expiration date, and any three-digit CVC. This creates a simulated payment.
4. Run `npm run stripe:demo -- verify cs_test_...` using the session ID printed in step 2. The command verifies the amount, currency, demo identifier, and paid status with Stripe. The same test payment is visible in the sandbox Dashboard.

## If RunBack introduces paid events

1. Decide which event RunBack itself will charge for and whether a paid booking reserves a spot. Use the event record as the server's source for the amount and currency.
2. Create Checkout Sessions from an authenticated server endpoint with one payment attempt per booking. Store Stripe's session ID against the booking.
3. Verify Stripe's webhook signature and mark the booking paid once when Stripe confirms payment. Handle `checkout.session.completed` and `checkout.session.async_payment_succeeded`, check that the session is paid, and handle asynchronous failures. A browser redirect is useful for navigation, but payment confirmation comes from Stripe.
4. Test paid, declined, cancelled, and duplicate webhook scenarios in a sandbox. Decide how to handle capacity and refunds before enabling live payments. If independent organizers need payouts later, evaluate Stripe Connect for that separate workflow.

[Stripe Checkout](https://docs.stripe.com/payments/checkout) · [Testing](https://docs.stripe.com/testing) · [Key safety](https://docs.stripe.com/keys-best-practices) · [Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment)

import Stripe from 'stripe';

const demoId = 'runback-pickup-sandbox-v1';
const amount = 500;
const currency = 'usd';
const home = 'https://runback.net/';

async function main(args) {
  const [command, sessionId, ...extra] = args;
  if (command === '--help' || !command) {
    console.log('Usage: npm run stripe:demo -- create | verify cs_test_…');
    return;
  }

  const creating = command === 'create' && args.length === 1;
  const verifying = command === 'verify' && !extra.length && /^cs_test_[a-zA-Z0-9]+$/.test(sessionId ?? '');
  if (!creating && !verifying) {
    throw new Error('Use create or verify with a test Checkout Session ID.');
  }

  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!/^(sk|rk)_test_[a-zA-Z0-9]+$/.test(key ?? '')) {
    throw new Error('Set STRIPE_SECRET_KEY to a Stripe sandbox secret or restricted key. This demo only accepts test keys.');
  }

  const stripe = new Stripe(key, { maxNetworkRetries: 2, timeout: 15000 });
  const session = creating
    ? await stripe.checkout.sessions.create({
        mode: 'payment',
        integration_identifier: 'runback-demo-qnldctvj',
        line_items: [{
          price_data: {
            currency,
            unit_amount: amount,
            product_data: { name: 'RunBack Pickup Event (Sandbox Demo)' },
          },
          quantity: 1,
        }],
        metadata: { runback_demo: demoId },
        success_url: new URL('?stripe_demo=complete', home).href,
        cancel_url: home,
      })
    : await stripe.checkout.sessions.retrieve(sessionId);

  if (session.livemode !== false || !session.id.startsWith('cs_test_') ||
      session.metadata?.runback_demo !== demoId ||
      session.amount_total !== amount || session.currency !== currency) {
    throw new Error('Stripe did not return the expected RunBack $5 sandbox session.');
  }

  if (creating) {
    if (!session.url || new URL(session.url).origin !== 'https://checkout.stripe.com') {
      throw new Error('Stripe did not return a hosted Checkout URL.');
    }
    console.log('RunBack $5 sandbox checkout');
    console.log('Checkout URL:', session.url);
    console.log('Test session:', session.id);
    return;
  }

  const paid = session.status === 'complete' && session.payment_status === 'paid';
  console.log('Checkout status:', session.status);
  console.log('Payment status:', session.payment_status);
  console.log(paid ? 'Verified: Stripe recorded the $5 test payment.' : 'Stripe has not recorded a completed test payment.');
  if (!paid) process.exitCode = 1;
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  if (error instanceof Stripe.errors.StripeError) {
    const detail = [error.type, error.code].filter(value => /^[a-zA-Z0-9_]+$/.test(value ?? '')).join(', ');
    console.error(`Stripe request failed${detail ? ` (${detail})` : ''}. Check the test key and its Checkout Sessions permissions.`);
  } else {
    console.error(error instanceof Error ? error.message : 'The demo could not run.');
  }
  process.exitCode = 1;
}

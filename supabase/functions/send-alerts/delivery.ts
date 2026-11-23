/** Provider acceptance comes before the receipt. A stable key makes retries safe. */
export async function deliverEmail(options: {
  apiKey: string | undefined;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  markSent: () => Promise<void>;
  fetchEmail?: typeof fetch;
}): Promise<void> {
  if (!options.apiKey) throw new Error('Support emails are not configured');
  const response = await (options.fetchEmail ?? fetch)('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': options.idempotencyKey,
    },
    body: JSON.stringify(options.payload),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
  // This records provider acceptance, not inbox delivery.
  await options.markSent();
}

import { describe, it, expect, vi } from 'vitest';
import { deliverEmail } from '../../supabase/functions/send-alerts/delivery';

describe('support email delivery', () => {
  const payload = { from: 'alerts@runback.net', to: ['support@runback.net'], text: 'QA' };
  it('never consumes pending feedback when configuration is missing', async () => {
    const markSent = vi.fn(), fetchEmail = vi.fn();
    await expect(deliverEmail({ payload, apiKey: undefined, idempotencyKey: 'feedback/1', markSent, fetchEmail })).rejects.toThrow('configured');
    expect(markSent).not.toHaveBeenCalled(); expect(fetchEmail).not.toHaveBeenCalled();
  });
  it.each([429, 500])('retains pending messages after a provider %s', async status => {
    const markSent = vi.fn();
    await expect(deliverEmail({ payload, apiKey: 'test', idempotencyKey: 'feedback/1', markSent,
      fetchEmail: vi.fn().mockResolvedValue(new Response('', { status })) })).rejects.toThrow(String(status));
    expect(markSent).not.toHaveBeenCalled();
  });
  it('reuses the provider key after a failed receipt write', async () => {
    const fetchEmail = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const markSent = vi.fn().mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValue(undefined);
    const request = { payload, apiKey: 'test', idempotencyKey: 'runback-feedback/1', markSent, fetchEmail };
    await expect(deliverEmail(request)).rejects.toThrow('database unavailable');
    await deliverEmail(request);
    expect(fetchEmail).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchEmail.mock.calls) expect(init.headers['Idempotency-Key']).toBe('runback-feedback/1');
    expect(fetchEmail.mock.calls[0][1].body).toBe(fetchEmail.mock.calls[1][1].body);
  });
  it('does not consume a message when the network fails', async () => {
    const markSent = vi.fn();
    await expect(deliverEmail({ payload, apiKey: 'test', idempotencyKey: 'report/1', markSent,
      fetchEmail: vi.fn().mockRejectedValue(new Error('timeout')) })).rejects.toThrow('timeout');
    expect(markSent).not.toHaveBeenCalled();
  });
});

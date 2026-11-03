import { describe, expect, it } from 'vitest';
import { resetRequestError, validateRecoveryRequest } from './accountRecovery';

describe('account recovery', () => {
  it('requires a usable reply address and enough context', () => {
    const request = { displayName: 'Player', contactEmail: 'player@example.com', details: 'I play with the North Rec crew.' };
    expect(validateRecoveryRequest(request)).toBeNull();
    expect(validateRecoveryRequest({ ...request, contactEmail: 'not-an-email' })).toContain('email address');
    expect(validateRecoveryRequest({ ...request, details: 'Hi' })).toContain('10–1,000');
    expect(validateRecoveryRequest({ ...request, displayName: ' '.repeat(4) })).toContain('name');
  });
  it('keeps provider details and possible account-existence errors out of reset messages', () => {
    expect(resetRequestError('User not found')).not.toContain('not found');
    expect(resetRequestError('Email address not authorized')).toContain('could not send');
    expect(resetRequestError('SMTP: secret.internal.host failed')).not.toContain('secret.internal.host');
    expect(resetRequestError('email rate limit exceeded')).toContain('wait a minute');
    expect(resetRequestError('Failed to fetch')).toContain('connection');
  });
});

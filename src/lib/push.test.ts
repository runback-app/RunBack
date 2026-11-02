import { describe, expect, it } from 'vitest';
import { VAPID_PUBLIC_KEY, alertSupport, base64UrlToBytes } from './push';

const desktop = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130',
  standalone: false,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
};

describe('base64UrlToBytes', () => {
  it('decodes the public key to a 65-byte P-256 point', () => {
    const bytes = base64UrlToBytes(VAPID_PUBLIC_KEY);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(4); // uncompressed point marker
  });

  it('handles url-safe characters and missing padding', () => {
    expect(Array.from(base64UrlToBytes('-_8'))).toEqual([251, 255]);
  });
});

describe('alertSupport', () => {
  it('works on a normal desktop browser', () => {
    expect(alertSupport(desktop)).toBe('ready');
  });

  it('asks iPhone users to add to Home Screen first', () => {
    expect(alertSupport({ ...desktop, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' })).toBe(
      'install-first',
    );
  });

  it('works on iPhone once installed', () => {
    expect(
      alertSupport({ ...desktop, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', standalone: true }),
    ).toBe('ready');
  });

  it('says unsupported when the browser has no push', () => {
    expect(alertSupport({ ...desktop, hasPushManager: false })).toBe('unsupported');
  });
});

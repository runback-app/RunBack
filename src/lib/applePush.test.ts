import { describe, expect, it, vi } from 'vitest';
import { appleAuthorization, appleDevice, sendAppleAlert } from '../../supabase/functions/send-alerts/apns';
const token = 'a'.repeat(64);
const config = { keyId: 'KEYID', teamId: 'TEAMID', topic: 'net.runback.app', privateKey: '' };
describe('Apple push transport', () => {
  it('only accepts the two fixed Apple environments', () => {
    expect(appleDevice(`apns://sandbox/${token}`)?.environment).toBe('sandbox');
    expect(appleDevice(`apns://production/${token}`)?.environment).toBe('production');
    expect(appleDevice('https://example.com/secret')).toBeNull();
    expect(appleDevice('apns://evil.example/a')).toBeNull();
  });
  it('creates a verifiable ES256 authorization token', async () => {
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pem = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey))));
    const jwt = await appleAuthorization({ ...config, privateKey: `-----BEGIN PRIVATE KEY-----\n${pem}\n-----END PRIVATE KEY-----` }, 1800000000000);
    const [header, claims, signature] = jwt.split('.');
    const decode = (v: string) => Uint8Array.from(atob(v.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    expect(JSON.parse(new TextDecoder().decode(decode(header)))).toEqual({ alg: 'ES256', kid: 'KEYID' });
    expect(JSON.parse(new TextDecoder().decode(decode(claims)))).toEqual({ iss: 'TEAMID', iat: 1800000000 });
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keys.publicKey, decode(signature), new TextEncoder().encode(`${header}.${claims}`))).toBe(true);
  });
  it('sends sandbox devices to sandbox and carries the run route', async () => {
    const fetchApple = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    expect(await sendAppleAlert({ endpoint: `apns://sandbox/${token}`, title: 'Run', body: 'Changed', url: '/updates', config, authorization: 'signed', fetchApple })).toBe('sent');
    expect(fetchApple.mock.calls[0][0]).toBe(`https://api.sandbox.push.apple.com/3/device/${token}`);
    const init = fetchApple.mock.calls[0][1];
    expect(init.headers['apns-topic']).toBe('net.runback.app');
    expect(JSON.parse(init.body).url).toBe('/updates');
  });
  it('removes unregistered devices while preserving misconfigured devices', async () => {
    const base = { endpoint: `apns://production/${token}`, title: 'Run', body: 'Changed', url: '/updates', config, authorization: 'signed' };
    expect(await sendAppleAlert({ ...base, fetchApple: vi.fn().mockResolvedValue(new Response('{"reason":"Unregistered"}', { status: 410 })) })).toBe('gone');
    await expect(sendAppleAlert({ ...base, fetchApple: vi.fn().mockResolvedValue(new Response('{"reason":"BadDeviceToken"}', { status: 400 })) })).rejects.toThrow('BadDeviceToken');
  });
});

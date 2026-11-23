export type AppleConfig = { keyId: string; teamId: string; privateKey: string; topic: string };

export function appleDevice(endpoint: string): { environment: string; token: string } | null {
  const match = /^apns:\/\/(sandbox|production)\/([a-f0-9]{64})$/.exec(endpoint);
  return match ? { environment: match[1], token: match[2] } : null;
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function appleAuthorization(config: AppleConfig, now = Date.now()): Promise<string> {
  const encode = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));
  const input = `${encode({ alg: 'ES256', kid: config.keyId })}.${encode({ iss: config.teamId, iat: Math.floor(now / 1000) })}`;
  const pem = config.privateKey.replace(/\\n/g, '\n').replace(/-----[^-]+-----|\s/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input));
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

/** Only registered Apple endpoints can choose the APNs host, never an arbitrary URL. */
export async function sendAppleAlert(options: {
  endpoint: string; title: string; body: string; url: string; config: AppleConfig;
  authorization: string; fetchApple?: typeof fetch;
}): Promise<'sent' | 'gone'> {
  const device = appleDevice(options.endpoint);
  if (!device) throw new Error('Invalid Apple device endpoint');
  const host = device.environment === 'sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
  const response = await (options.fetchApple ?? fetch)(`https://${host}/3/device/${device.token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${options.authorization}`, 'apns-topic': options.config.topic,
      'apns-push-type': 'alert', 'apns-priority': '10',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 3600),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ aps: { alert: { title: options.title, body: options.body }, sound: 'default' }, url: options.url }),
    signal: AbortSignal.timeout(15000),
  });
  if (response.ok) return 'sent';
  const detail = await response.json().catch(() => ({})) as { reason?: string };
  // BadDeviceToken can mean a mismatched build/environment: preserve it for diagnosis.
  if (response.status === 410 && detail.reason === 'Unregistered') return 'gone';
  throw new Error(`Apple push failed (${response.status}, ${detail.reason ?? 'unknown'})`);
}

// Reuse a signing token for 50 minutes; Apple rejects excessive token rotations.
const cached = new Map<string, { privateKey: string; token: Promise<string>; createdAt: number }>();
export function cachedAppleAuthorization(config: AppleConfig): Promise<string> {
  const id = `${config.teamId}/${config.keyId}`;
  const previous = cached.get(id);
  if (previous && previous.privateKey === config.privateKey && Date.now() - previous.createdAt < 50 * 60000) return previous.token;
  const token = appleAuthorization(config);
  const entry = { token, privateKey: config.privateKey, createdAt: Date.now() };
  cached.set(id, entry);
  void token.catch(() => { if (cached.get(id) === entry) cached.delete(id); });
  return token;
}

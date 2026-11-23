import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({
  userId: 'owner', listeners: new Map<string, (v: unknown) => void>(),
  permission: vi.fn(), request: vi.fn(), register: vi.fn(), unregister: vi.fn(),
  rpc: vi.fn(), remove: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'ios' } }));
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: {
  checkPermissions: fake.permission, requestPermissions: fake.request,
  register: fake.register, unregister: fake.unregister, removeAllDeliveredNotifications: vi.fn(),
  addListener: vi.fn(async (name: string, fn: (v: unknown) => void) => {
    fake.listeners.set(name, fn); return { remove: async () => { fake.listeners.delete(name); } };
  }),
} }));
vi.mock('./supabase', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: fake.userId } } } }) },
  rpc: fake.rpc, from: () => ({ delete: () => ({ eq: fake.remove }) }),
} }));

beforeEach(() => {
  vi.resetModules(); vi.stubEnv('VITE_NATIVE_PUSH_ENABLED', 'true'); vi.stubEnv('VITE_NATIVE_PUSH_ENVIRONMENT', 'sandbox');
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  fake.userId = 'owner'; fake.listeners.clear();
  fake.permission.mockReset().mockResolvedValue({ receive: 'granted' });
  fake.request.mockReset().mockResolvedValue({ receive: 'granted' });
  fake.rpc.mockReset().mockResolvedValue({ error: null }); fake.remove.mockReset().mockResolvedValue({ error: null });
  fake.register.mockReset().mockImplementation(async () => fake.listeners.get('registration')?.({ value: 'a'.repeat(64) }));
  fake.unregister.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('iPhone notification consent and account ownership', () => {
  it('registers the correct environment and removes the server device on disable', async () => {
    const push = await import('./nativePush');
    await push.enableNativeAlerts();
    expect(fake.rpc).toHaveBeenCalledWith('save_native_push_subscription', { p_token: 'a'.repeat(64), p_environment: 'sandbox' });
    expect((await push.currentNativeDevice())?.userId).toBe('owner');
    await push.disableNativeAlerts();
    expect(fake.remove).toHaveBeenCalledWith('endpoint', `apns://sandbox/${'a'.repeat(64)}`);
    expect(await push.currentNativeDevice()).toBeNull();
  });
  it('never prompts for permission during startup refresh', async () => {
    localStorage.setItem('runback-native-alerts', JSON.stringify({ userId: 'owner', endpoint: 'apns://sandbox/' + 'a'.repeat(64) }));
    fake.permission.mockResolvedValue({ receive: 'prompt' });
    const push = await import('./nativePush');
    await expect(push.refreshNativeAlerts('owner')).rejects.toThrow('Allow notifications');
    expect(fake.request).not.toHaveBeenCalled(); expect(fake.register).not.toHaveBeenCalled();
  });
  it('does not inherit another account’s notification opt-in', async () => {
    localStorage.setItem('runback-native-alerts', JSON.stringify({ userId: 'other', endpoint: 'apns://sandbox/' + 'a'.repeat(64) }));
    const push = await import('./nativePush');
    await push.refreshNativeAlerts('owner');
    expect(fake.register).not.toHaveBeenCalled(); expect(await push.currentNativeDevice()).toBeNull();
  });
  it('does not save a late registration after alerts are turned off', async () => {
    fake.register.mockImplementation(async () => undefined);
    const push = await import('./nativePush');
    const enabling = push.enableNativeAlerts();
    const rejected = expect(enabling).rejects.toThrow('Account changed');
    await vi.waitFor(() => expect(fake.register).toHaveBeenCalled());
    await push.disableNativeAlerts();
    fake.listeners.get('registration')?.({ value: 'a'.repeat(64) });
    await rejected;
    expect(fake.rpc).not.toHaveBeenCalled();
  });
});

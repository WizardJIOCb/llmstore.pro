const DEVICE_FINGERPRINT_KEY = 'llmstore_device_fingerprint';

export function getOrCreateDeviceFingerprint(): string {
  if (typeof window === 'undefined') {
    return 'server-side-fingerprint';
  }

  const existing = window.localStorage.getItem(DEVICE_FINGERPRINT_KEY);
  if (existing) return existing;

  const created = window.crypto?.randomUUID?.() ?? `fp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(DEVICE_FINGERPRINT_KEY, created);
  return created;
}

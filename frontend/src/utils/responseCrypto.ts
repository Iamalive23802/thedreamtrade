type EncBody = { v: 1; iv: string; tag: string; ct: string };

const KEY_B64 = import.meta.env.VITE_RESPONSE_ENC_KEY as string | undefined;

function isEnc(data: unknown): data is EncBody {
  if (!data || typeof data !== 'object') return false;
  const body = data as EncBody;
  return body.v === 1 && typeof body.iv === 'string' && typeof body.tag === 'string' && typeof body.ct === 'string';
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

let keyPromise: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  if (!KEY_B64 || !globalThis.crypto?.subtle) {
    return Promise.reject(new Error('Response decryption is unavailable'));
  }
  if (!keyPromise) {
    const raw = b64ToBytes(KEY_B64);
    keyPromise = crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['decrypt']);
  }
  return keyPromise;
}

export async function decryptResponseData<T>(data: T): Promise<T> {
  let parsed: unknown = data;
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data);
    } catch {
      return data;
    }
  }
  if (!isEnc(parsed)) return data;

  const key = await getKey();
  const iv = b64ToBytes(parsed.iv);
  const tag = b64ToBytes(parsed.tag);
  const ct = b64ToBytes(parsed.ct);
  const combined = new Uint8Array(ct.length + tag.length);
  combined.set(ct, 0);
  combined.set(tag, ct.length);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    combined as BufferSource
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

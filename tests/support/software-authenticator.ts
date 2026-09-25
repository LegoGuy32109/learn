// A minimal software passkey for tests that run without a browser. It produces the
// same JSON shapes a browser's `credential.toJSON()` returns, with "none" attestation
// and an ES256 key, so the server's verification runs exactly as it does in production.
// Tests choose the origin, relying-party ID, challenge and sign count per ceremony,
// which is how a wrong origin or a replayed challenge is exercised.

import {
  base64Url,
  fromBase64Url,
} from "../../src/server/identity/encoding.ts";

export interface Ceremony {
  challenge: string;
  origin: string;
  rpId: string;
  /** Defaults to true. False leaves the UV flag clear. */
  userVerified?: boolean;
}

const encoder = new TextEncoder();

function header(major: number, length: number): Uint8Array {
  if (length < 24) return Uint8Array.of((major << 5) | length);
  if (length < 256) return Uint8Array.of((major << 5) | 24, length);
  if (length < 65536) {
    return Uint8Array.of((major << 5) | 25, length >> 8, length & 0xff);
  }
  return Uint8Array.of(
    (major << 5) | 26,
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
  );
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

/** Enough CBOR for an attestation object: ints, byte strings, text and maps. */
export function cbor(
  value:
    | number
    | string
    | Uint8Array
    | Map<number | string, unknown>
    | Record<string, unknown>,
): Uint8Array {
  if (typeof value === "number") {
    if (value >= 0) return header(0, value);
    return header(1, -1 - value);
  }
  if (typeof value === "string") {
    const bytes = encoder.encode(value);
    return concat(header(3, bytes.byteLength), bytes);
  }
  if (value instanceof Uint8Array) {
    return concat(header(2, value.byteLength), value);
  }
  const entries = value instanceof Map
    ? Array.from(value.entries())
    : Object.entries(value);
  const encoded = entries.map(([key, item]) =>
    concat(
      cbor(key as number | string),
      cbor(item as Parameters<typeof cbor>[0]),
    )
  );
  return concat(header(5, entries.length), ...encoded);
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer),
  );
}

function uint32(value: number): Uint8Array {
  return Uint8Array.of(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  );
}

/** WebCrypto returns r||s; WebAuthn signatures are ASN.1 DER. */
function derSignature(raw: Uint8Array): Uint8Array {
  const integer = (bytes: Uint8Array) => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start += 1;
    let body: Uint8Array = bytes.slice(start);
    if (body[0] & 0x80) body = concat(Uint8Array.of(0), body);
    return concat(Uint8Array.of(0x02, body.length), body);
  };
  const r = integer(raw.slice(0, 32));
  const s = integer(raw.slice(32));
  return concat(Uint8Array.of(0x30, r.length + s.length), r, s);
}

function clientData(
  type: "webauthn.create" | "webauthn.get",
  ceremony: Ceremony,
): Uint8Array {
  return encoder.encode(
    JSON.stringify({
      type,
      challenge: ceremony.challenge,
      origin: ceremony.origin,
      crossOrigin: false,
    }),
  );
}

function flags(ceremony: Ceremony, attested: boolean): number {
  return 0x01 | (ceremony.userVerified === false ? 0 : 0x04) |
    (attested ? 0x40 : 0);
}

export class SoftwareAuthenticator {
  private constructor(
    private keyPair: CryptoKeyPair,
    private credentialId: Uint8Array,
    private coseKey: Uint8Array,
    public userHandle: Uint8Array | null,
    public signCount: number,
  ) {}

  static async create(): Promise<SoftwareAuthenticator> {
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const jwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const coseKey = cbor(
      new Map<number, unknown>([[1, 2], [3, -7], [-1, 1], [
        -2,
        fromBase64Url(jwk.x!)!,
      ], [-3, fromBase64Url(jwk.y!)!]]),
    );
    return new SoftwareAuthenticator(
      keyPair,
      crypto.getRandomValues(new Uint8Array(16)),
      coseKey,
      null,
      0,
    );
  }

  get id(): string {
    return base64Url(this.credentialId);
  }

  /** The value `navigator.credentials.create(...)` would hand to `toJSON()`, given server options. */
  async register(
    options: { challenge: string; user: { id: string } },
    ceremony: Omit<Ceremony, "challenge">,
  ): Promise<Record<string, unknown>> {
    const full = { ...ceremony, challenge: options.challenge };
    this.userHandle = fromBase64Url(options.user.id);
    const authData = concat(
      await sha256(encoder.encode(ceremony.rpId)),
      Uint8Array.of(flags(full, true)),
      uint32(this.signCount),
      new Uint8Array(16),
      Uint8Array.of(
        this.credentialId.length >> 8,
        this.credentialId.length & 0xff,
      ),
      this.credentialId,
      this.coseKey,
    );
    const attestationObject = cbor({ fmt: "none", attStmt: {}, authData });
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: {
        clientDataJSON: base64Url(clientData("webauthn.create", full)),
        attestationObject: base64Url(attestationObject),
        transports: ["internal"],
      },
    };
  }

  /** The value `navigator.credentials.get(...)` would hand to `toJSON()`. Advances the sign count unless told otherwise. */
  async assert(
    options: { challenge: string },
    ceremony: Omit<Ceremony, "challenge">,
    signCount?: number,
  ): Promise<Record<string, unknown>> {
    const full = { ...ceremony, challenge: options.challenge };
    if (signCount === undefined) this.signCount += 1;
    const counter = signCount ?? this.signCount;
    const authenticatorData = concat(
      await sha256(encoder.encode(ceremony.rpId)),
      Uint8Array.of(flags(full, false)),
      uint32(counter),
    );
    const client = clientData("webauthn.get", full);
    const signed = concat(authenticatorData, await sha256(client));
    const raw = new Uint8Array(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        this.keyPair.privateKey,
        signed.buffer as ArrayBuffer,
      ),
    );
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: {
        clientDataJSON: base64Url(client),
        authenticatorData: base64Url(authenticatorData),
        signature: base64Url(derSignature(raw)),
        userHandle: this.userHandle ? base64Url(this.userHandle) : undefined,
      },
    };
  }
}

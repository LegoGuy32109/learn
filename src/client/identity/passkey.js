// @ts-check
// Passkey registration and sign-in in the browser, with no client dependency.
// The server issues the options and verifies the credential; this module only
// runs the WebAuthn ceremony between the two calls and reports a plain outcome.

/** @typedef {{ ok: true, displayName: string } | { ok: false, message: string }} Outcome */

/** @returns {boolean} */
export function isPasskeySupported() {
  return typeof PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function" &&
    typeof navigator.credentials?.get === "function";
}

/** @param {string} value @returns {ArrayBuffer} */
function base64UrlToBuffer(value) {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

/** @param {ArrayBuffer | Uint8Array} value @returns {string} */
function bufferToBase64Url(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(
    /=+$/,
    "",
  );
}

/**
 * Prefer the native JSON parser; older browsers get a manual decode.
 * @param {any} optionsJson
 * @returns {PublicKeyCredentialCreationOptions}
 */
function parseCreationOptions(optionsJson) {
  if (typeof PublicKeyCredential.parseCreationOptionsFromJSON === "function") {
    return PublicKeyCredential.parseCreationOptionsFromJSON(optionsJson);
  }
  return /** @type {PublicKeyCredentialCreationOptions} */ (/** @type {unknown} */ ({
    ...optionsJson,
    challenge: base64UrlToBuffer(optionsJson.challenge),
    user: { ...optionsJson.user, id: base64UrlToBuffer(optionsJson.user.id) },
    excludeCredentials: (optionsJson.excludeCredentials ?? []).map((
      /** @type {any} */ credential,
    ) => ({
      id: base64UrlToBuffer(credential.id),
      type: "public-key",
      transports: credential.transports,
    })),
  }));
}

/**
 * @param {any} optionsJson
 * @returns {PublicKeyCredentialRequestOptions}
 */
function parseRequestOptions(optionsJson) {
  if (typeof PublicKeyCredential.parseRequestOptionsFromJSON === "function") {
    return PublicKeyCredential.parseRequestOptionsFromJSON(optionsJson);
  }
  return /** @type {PublicKeyCredentialRequestOptions} */ (/** @type {unknown} */ ({
    ...optionsJson,
    challenge: base64UrlToBuffer(optionsJson.challenge),
    allowCredentials: (optionsJson.allowCredentials ?? []).map((
      /** @type {any} */ credential,
    ) => ({
      id: base64UrlToBuffer(credential.id),
      type: "public-key",
      transports: credential.transports,
    })),
  }));
}

/**
 * Serialize a credential the way the server expects. Prefers the native `toJSON`.
 * @param {PublicKeyCredential} credential
 * @returns {any}
 */
function encodeCredential(credential) {
  const native =
    /** @type {{ toJSON?: () => unknown }} */ (/** @type {unknown} */ (credential));
  if (typeof native.toJSON === "function") return native.toJSON();
  const response = /** @type {any} */ (credential.response);
  /** @type {Record<string, unknown>} */
  const encoded = {
    clientDataJSON: bufferToBase64Url(response.clientDataJSON),
  };
  if (response.attestationObject) {
    encoded.attestationObject = bufferToBase64Url(response.attestationObject);
  }
  if (response.authenticatorData) {
    encoded.authenticatorData = bufferToBase64Url(response.authenticatorData);
  }
  if (response.signature) {
    encoded.signature = bufferToBase64Url(response.signature);
  }
  if (response.userHandle) {
    encoded.userHandle = bufferToBase64Url(response.userHandle);
  }
  if (typeof response.getTransports === "function") {
    encoded.transports = response.getTransports();
  }
  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: "public-key",
    clientExtensionResults: {},
    response: encoded,
  };
}

/**
 * @param {unknown} error
 * @param {string} verb
 * @returns {string}
 */
function friendlyError(error, verb) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") return `Passkey ${verb} was cancelled.`;
  if (name === "AbortError") return `Passkey ${verb} timed out. Try again.`;
  if (name === "InvalidStateError") {
    return "This passkey is already registered on this device.";
  }
  return `Could not ${verb} the passkey. Try again.`;
}

/**
 * @param {string} path
 * @param {unknown} payload
 * @returns {Promise<{ ok: boolean, status: number, body: any }>}
 */
async function post(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

/** @param {{ status: number, body: any }} failed @param {string} fallback */
function problemMessage(failed, fallback) {
  return typeof failed.body?.detail === "string"
    ? failed.body.detail
    : fallback;
}

/**
 * Register a passkey for the account named by a one-time invite, and sign in.
 * @param {string} invite
 * @returns {Promise<Outcome>}
 */
export async function registerWithInvite(invite) {
  if (!isPasskeySupported()) {
    return {
      ok: false,
      message: "Passkeys are not supported in this browser.",
    };
  }
  const options = await post("/api/v1/passkeys/registration-options", {
    invite,
  });
  if (!options.ok) {
    return {
      ok: false,
      message: problemMessage(options, "Could not start passkey registration."),
    };
  }
  let credential;
  try {
    credential = await navigator.credentials.create({
      publicKey: parseCreationOptions(options.body.options),
    });
  } catch (error) {
    return { ok: false, message: friendlyError(error, "registration") };
  }
  if (!(credential instanceof PublicKeyCredential)) {
    return { ok: false, message: "Could not register the passkey. Try again." };
  }
  const verified = await post("/api/v1/passkeys/registrations", {
    invite,
    credential: encodeCredential(credential),
  });
  if (!verified.ok) {
    return {
      ok: false,
      message: problemMessage(verified, "Could not verify the new passkey."),
    };
  }
  return { ok: true, displayName: String(verified.body.displayName) };
}

/**
 * Sign in with a passkey already registered on this device.
 * @returns {Promise<Outcome>}
 */
export async function signInWithPasskey() {
  if (!isPasskeySupported()) {
    return {
      ok: false,
      message: "Passkeys are not supported in this browser.",
    };
  }
  const options = await post("/api/v1/passkeys/authentication-options", {});
  if (!options.ok) {
    return {
      ok: false,
      message: problemMessage(options, "Could not start passkey sign-in."),
    };
  }
  let credential;
  try {
    credential = await navigator.credentials.get({
      publicKey: parseRequestOptions(options.body.options),
    });
  } catch (error) {
    return { ok: false, message: friendlyError(error, "sign-in") };
  }
  if (!(credential instanceof PublicKeyCredential)) {
    return {
      ok: false,
      message: "Could not sign in with the passkey. Try again.",
    };
  }
  const verified = await post("/api/v1/passkeys/authentications", {
    credential: encodeCredential(credential),
  });
  if (!verified.ok) {
    return {
      ok: false,
      message: problemMessage(verified, "Could not verify the passkey."),
    };
  }
  return { ok: true, displayName: String(verified.body.displayName) };
}

/**
 * End the browser session. The passkey stays on the device.
 * @returns {Promise<boolean>}
 */
export async function signOut() {
  const response = await fetch("/api/v1/session", { method: "DELETE" });
  await response.body?.cancel();
  return response.ok;
}

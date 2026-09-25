const encoder = new TextEncoder();

export async function tokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(
    /=+$/,
    "",
  );
}

export function newPersonalToken(): { token: string; prefix: string } {
  const secret = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const prefix = secret.slice(0, 10);
  return { token: `learn_pat_${prefix}_${secret}`, prefix };
}

const COOKIE_NAME = "lsa_admin";
const SESSION_SECONDS = 8 * 60 * 60;

const encoder = new TextEncoder();

function decodeBase64Url(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function encodeBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function verifyAdminPin(pin: string): Promise<boolean> {
  const storedHash = process.env.ADMIN_PIN_HASH;
  if (!storedHash) throw new Error("ADMIN_PIN_HASH is not configured.");

  const [algorithm, iterationText, saltText, expectedText] = storedHash.split(":");
  const iterations = Number(iterationText);
  if (algorithm !== "pbkdf2" || !Number.isInteger(iterations) || iterations < 1 || !saltText || !expectedText) {
    throw new Error("ADMIN_PIN_HASH has an invalid format.");
  }
  if (iterations > 100_000) {
    throw new Error("ADMIN_PIN_HASH exceeds Cloudflare's supported iteration limit. Generate a new hash.");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: decodeBase64Url(saltText),
      iterations,
    },
    key,
    256,
  );

  return safeEqual(new Uint8Array(derived), new Uint8Array(decodeBase64Url(expectedText)));
}

async function sign(payload: string): Promise<string> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not configured.");

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return encodeBase64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

function cookieValue(request: Request): string | undefined {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === COOKIE_NAME)?.[1];
}

export async function hasAdminSession(request: Request): Promise<boolean> {
  const token = cookieValue(request);
  if (!token) return false;

  const separator = token.indexOf(".");
  if (separator < 1) return false;
  const expiresText = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  const expiresAt = Number(expiresText);
  if (!Number.isInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;

  const expectedSignature = await sign(expiresText);
  return safeEqual(
    new Uint8Array(decodeBase64Url(suppliedSignature)),
    new Uint8Array(decodeBase64Url(expectedSignature)),
  );
}

export async function createAdminCookie(request: Request): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const signature = await sign(String(expiresAt));
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${expiresAt}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function clearAdminCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function requireAdmin(request: Request): Promise<Response | null> {
  return (await hasAdminSession(request))
    ? null
    : Response.json({ error: "Admin login required." }, { status: 401 });
}

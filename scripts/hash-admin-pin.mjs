import { pbkdf2Sync, randomBytes } from "node:crypto";

const pin = process.argv[2];

if (!/^\d{4,8}$/.test(pin ?? "")) {
  console.error("Usage: npm run admin:hash-pin -- 123456");
  console.error("Choose a 4-8 digit PIN; 6 or more digits is recommended.");
  process.exit(1);
}

// Cloudflare Workers supports at most 100,000 PBKDF2 iterations per operation.
const iterations = 100_000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(pin, salt, iterations, 32, "sha256");

// Colons are intentionally used instead of dollar signs because dotenv loaders
// may treat dollar-prefixed hash segments as environment-variable expansion.
console.log(`pbkdf2:${iterations}:${salt.toString("base64url")}:${hash.toString("base64url")}`);

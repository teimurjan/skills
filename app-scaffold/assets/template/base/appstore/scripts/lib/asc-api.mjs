// A minimal App Store Connect API client: token, JSON:API requests, pagination, and the
// chunked upload every media resource uses.
//
// It exists for what deliver cannot do — today, the creative assets — and reads the same
// key file the menu writes for deliver, so there is one credential to set up, not two.
// No SDK: ES256 signing is in node:crypto, and the rest is fetch.

import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { APPSTORE_DIR } from "./screenshot-kit.mjs";

const BASE = "https://api.appstoreconnect.apple.com";

/** Where the App Store Connect API key JSON lives. This is a different key from
 * the APPLE_INAPP_* one in .env — that is an In-App Purchase key for the App
 * Store Server API and cannot touch metadata. */
export const API_KEY_PATH = process.env.ASC_API_KEY_PATH ?? path.join(APPSTORE_DIR, "fastlane", "asc-api-key.json");

/** Apple caps a token at 20 minutes; a full push outlives that, so tokens are minted on
 * demand and replaced a minute before they lapse. */
const TOKEN_TTL_S = 1200;

const base64url = (value) => Buffer.from(value).toString("base64url");

export function createClient(keyPath = API_KEY_PATH) {
  const { key_id: keyId, issuer_id: issuerId, key } = JSON.parse(readFileSync(keyPath, "utf8"));
  const privateKey = createPrivateKey(key);
  let cached = { token: "", expiresAt: 0 };

  const token = () => {
    const now = Math.floor(Date.now() / 1000);
    if (cached.expiresAt - now > 60) return cached.token;
    const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
    const claims = base64url(JSON.stringify({ iss: issuerId, iat: now, exp: now + TOKEN_TTL_S, aud: "appstoreconnect-v1" }));
    const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key: privateKey, dsaEncoding: "ieee-p1363" });
    cached = { token: `${header}.${claims}.${base64url(signature)}`, expiresAt: now + TOKEN_TTL_S };
    return cached.token;
  };

  /** One JSON:API call. Apple's error envelope is turned into the message a person would
   * want to read — the detail, not "422". */
  async function request(method, target, body) {
    const response = await fetch(target.startsWith("http") ? target : BASE + target, {
      method,
      headers: { Authorization: `Bearer ${token()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 204) return null;
    const text = await response.text();
    const json = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const detail = json?.errors?.map((error) => error.detail ?? error.title).join("; ") ?? text;
      throw new Error(`${method} ${target} → ${response.status}: ${detail}`);
    }
    return json;
  }

  /** Every page of a collection, following `links.next`. */
  async function all(target) {
    const items = [];
    for (let next = target; next; ) {
      const page = await request("GET", next);
      items.push(...page.data);
      next = page.links?.next;
    }
    return items;
  }

  return { request, all, get: (target) => request("GET", target) };
}

/** Sends a reserved file's bytes the way Apple asked for them: one request per upload
 * operation, each a slice of the file with its own headers. */
export async function uploadParts(bytes, operations) {
  for (const { method, url, offset, length, requestHeaders = [] } of operations) {
    const response = await fetch(url, {
      method,
      headers: Object.fromEntries(requestHeaders.map(({ name, value }) => [name, value])),
      body: bytes.subarray(offset, offset + length),
    });
    if (!response.ok) throw new Error(`upload part at ${offset} → ${response.status}`);
  }
}

/** Polls until `ready` says so, failing after `timeoutMs`. */
export async function waitFor(check, { intervalMs = 2000, timeoutMs = 180_000, label }) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await check();
    if (result) return result;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await sleep(intervalMs);
  }
}

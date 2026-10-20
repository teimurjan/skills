import "server-only";

/** Which build of the app is calling.
 *
 * The iOS client stamps its marketing version onto every backend request as
 * `X-App-Version` (ios/Appname/Shared/Networking/BackendAuth.swift).
 * Builds shipped before the header existed send nothing, so absence — like
 * anything unparseable — always compares as older than any gate. `withLogging`
 * puts the raw value on every request's log line as `appVersion`.
 */

const HEADER = "x-app-version";

export function clientVersion(request: Request): string | null {
  return request.headers.get(HEADER);
}

/** True when the calling build is `minimum` ("1.2") or newer. */
export function clientAtLeast(request: Request, minimum: string): boolean {
  const version = parse(clientVersion(request));
  if (!version) return false;
  const floor = parse(minimum);
  // A bad `minimum` is a typo in a route, not a bad client — fail loudly.
  if (!floor) throw new Error(`unparseable minimum version: ${minimum}`);

  for (let i = 0; i < Math.max(version.length, floor.length); i++) {
    const part = version[i] ?? 0;
    const floorPart = floor[i] ?? 0;
    if (part !== floorPart) return part > floorPart;
  }
  return true;
}

/** "1.2.3" → [1, 2, 3]; null for anything that isn't dotted non-negative
 * integers. */
function parse(raw: string | null): number[] | null {
  if (!raw) return null;
  const parts = raw.trim().split(".").map(Number);
  if (parts.some((part) => !Number.isInteger(part) || part < 0)) return null;
  return parts;
}

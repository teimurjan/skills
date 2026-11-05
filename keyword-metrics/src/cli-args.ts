import { InvalidArgumentError } from "commander";

const MAX_GEOS = 10;

export const positiveInt = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new InvalidArgumentError("expected a positive integer");
  return parsed;
};

export const criterionId = (value: string): string => {
  if (!/^\d+$/.test(value)) throw new InvalidArgumentError("expected a numeric id");
  return value;
};

export const geoIds = (value: string): string[] => {
  const ids = value.split(",").map((id) => criterionId(id.trim()));
  if (ids.length > MAX_GEOS) throw new InvalidArgumentError(`expected at most ${MAX_GEOS} locations`);
  return ids;
};

// A function declaration, so TypeScript narrows after calls that never return.
export function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

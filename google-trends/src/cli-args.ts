import { InvalidArgumentError } from "commander";

export const positiveInt = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new InvalidArgumentError("expected a positive integer");
  return parsed;
};

export const nonNegativeNumber = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new InvalidArgumentError("expected a number of seconds");
  return parsed;
};

// A function declaration, so TypeScript narrows after calls that never return.
export function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

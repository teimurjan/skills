import { readFile } from "node:fs/promises";
import { z } from "zod";
import { err, ok, type Result } from "./types.ts";

export const parseJsonAs = <T>(text: string, schema: z.ZodType<T>, label: string): Result<T, string> => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return err(`invalid JSON in ${label}`);
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? ok(parsed.data) : err(`unexpected data in ${label}: ${z.prettifyError(parsed.error)}`);
};

export const readJsonAs = async <T>(path: string, schema: z.ZodType<T>): Promise<Result<T, string>> => {
  try {
    return parseJsonAs(await readFile(path, "utf8"), schema, path);
  } catch (error) {
    return err(`cannot read ${path}: ${(error as Error).message}`);
  }
};

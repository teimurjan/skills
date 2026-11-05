import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { readJsonAs } from "./read-json.ts";
import type { Result } from "./types.ts";

export const CREDENTIALS_PATH = join(homedir(), ".config", "keyword-metrics", "credentials.json");

const CustomerId = z
  .string()
  .transform((id) => id.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^\d{10}$/, "expected a 10-digit customer id"));

export const CredentialsFile = z.object({
  developerToken: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  refreshToken: z.string().min(1),
  /** The account that the requests run against. */
  customerId: CustomerId,
  /** The manager account, when access to customerId goes through one. */
  loginCustomerId: CustomerId.optional(),
});

export type Credentials = z.infer<typeof CredentialsFile>;

export const loadCredentials = (path: string): Promise<Result<Credentials, string>> => readJsonAs(path, CredentialsFile);

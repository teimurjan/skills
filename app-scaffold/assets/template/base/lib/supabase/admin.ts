import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "";
export const isServiceConfigured = Boolean(SUPABASE_URL && SECRET_KEY);

/** Elevated server client using the Supabase secret key — bypasses RLS.
 * Server-only; never expose the key.
 *
 * Every table has RLS on with no policies, so this client is the only one that can read
 * them, and the explicit `.eq("user_id", …)` in each query is the access check. The user
 * comes from the bearer token, never from the body. */
export const createAdminClient = () =>
  createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });

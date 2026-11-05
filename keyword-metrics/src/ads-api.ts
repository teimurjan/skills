import { z } from "zod";
import type { Credentials } from "./credentials.ts";
import { parseMetricsResponse, type KeywordResult, type Targeting } from "./metrics.ts";
import { err, ok, type Result } from "./types.ts";

export type AdsFailure = { kind: "rate_limited" | "auth" | "bad_request" | "bad_response"; message: string };

export type AdsClient = {
  fetchMetrics: (keywords: readonly string[], targeting: Targeting) => Promise<Result<KeywordResult[], AdsFailure>>;
};

const API_VERSION = "v26";
const API_BASE = `https://googleads.googleapis.com/${API_VERSION}`;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REQUEST_TIMEOUT_MS = 60_000;

const TokenResponse = z.looseObject({ access_token: z.string() });

const ApiError = z.looseObject({
  error: z.looseObject({
    message: z.string().optional(),
    status: z.string().optional(),
    details: z
      .array(
        z.looseObject({
          requestId: z.string().optional(),
          errors: z
            .array(
              z.looseObject({
                errorCode: z.record(z.string(), z.unknown()).optional(),
                message: z.string().optional(),
                trigger: z.looseObject({ stringValue: z.string().optional() }).optional(),
                location: z
                  .looseObject({
                    fieldPathElements: z
                      .array(z.looseObject({ fieldName: z.string().optional(), index: z.number().optional() }))
                      .optional(),
                  })
                  .optional(),
              }),
            )
            .optional(),
        }),
      )
      .optional(),
  }),
});

const readJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const describeLocation = (elements: readonly { fieldName?: string | undefined; index?: number | undefined }[]): string =>
  elements.map(({ fieldName, index }) => `${fieldName ?? "?"}${index === undefined ? "" : `[${index}]`}`).join(".");

/** Puts the specific Google Ads errors first, because the top-level message is often only "invalid argument". */
export const describeApiError = (httpStatus: number, body: string): string => {
  const parsed = ApiError.safeParse(readJson(body));
  if (!parsed.success) return `HTTP ${httpStatus}`;
  const { message, status, details } = parsed.data.error;
  const specifics = (details ?? []).flatMap((detail) =>
    (detail.errors ?? []).map((error) => {
      const code = Object.values(error.errorCode ?? {}).join(", ");
      const location = describeLocation(error.location?.fieldPathElements ?? []);
      const trigger = error.trigger?.stringValue;
      return [code, error.message, trigger && `"${trigger}"`, location && `at ${location}`].filter(Boolean).join(": ");
    }),
  );
  const requestId = details?.find((detail) => detail.requestId)?.requestId;
  const summary = specifics.length > 0 ? specifics.join("; ") : (message ?? status ?? `HTTP ${httpStatus}`);
  return requestId ? `${summary} (request id ${requestId})` : summary;
};

const classify = (httpStatus: number, body: string): AdsFailure["kind"] => {
  if (httpStatus === 429 || body.includes("RESOURCE_EXHAUSTED")) return "rate_limited";
  return httpStatus === 401 || httpStatus === 403 ? "auth" : "bad_request";
};

export const buildMetricsRequest = (keywords: readonly string[], { geo, language }: Targeting) => ({
  keywords,
  keywordPlanNetwork: "GOOGLE_SEARCH",
  ...(geo.length > 0 && { geoTargetConstants: geo.map((id) => `geoTargetConstants/${id}`) }),
  ...(language !== null && { language: `languageConstants/${language}` }),
});

const post = async (url: string, init: RequestInit): Promise<Result<{ status: number; ok: boolean; body: string }, string>> => {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    return ok({ status: response.status, ok: response.ok, body: await response.text() });
  } catch (error) {
    return err((error as Error).message);
  }
};

const fetchAccessToken = async (credentials: Credentials): Promise<Result<string, AdsFailure>> => {
  const response = await post(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
    }),
  });
  if (!response.ok) return err({ kind: "bad_response", message: `cannot reach the token endpoint: ${response.error}` });
  // Google's token errors hold no secrets, and only the error code is printed.
  const code = z.looseObject({ error: z.string() }).safeParse(readJson(response.value.body));
  if (!response.value.ok) return err({ kind: "auth", message: `token refresh failed: ${code.success ? code.data.error : `HTTP ${response.value.status}`}` });
  const token = TokenResponse.safeParse(readJson(response.value.body));
  return token.success ? ok(token.data.access_token) : err({ kind: "bad_response", message: "token response has no access token" });
};

export const openClient = async (credentials: Credentials): Promise<Result<AdsClient, AdsFailure>> => {
  const token = await fetchAccessToken(credentials);
  if (!token.ok) return token;
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${token.value}`,
    "developer-token": credentials.developerToken,
    ...(credentials.loginCustomerId && { "login-customer-id": credentials.loginCustomerId }),
  };
  const url = `${API_BASE}/customers/${credentials.customerId}:generateKeywordHistoricalMetrics`;
  return ok({
    fetchMetrics: async (keywords, targeting) => {
      const response = await post(url, { method: "POST", headers, body: JSON.stringify(buildMetricsRequest(keywords, targeting)) });
      if (!response.ok) return err({ kind: "bad_response", message: `cannot reach the Google Ads API: ${response.error}` });
      const { status, body } = response.value;
      if (!response.value.ok) return err({ kind: classify(status, body), message: describeApiError(status, body) });
      const parsed = parseMetricsResponse(body);
      return parsed.ok ? parsed : err({ kind: "bad_response", message: parsed.error });
    },
  });
};

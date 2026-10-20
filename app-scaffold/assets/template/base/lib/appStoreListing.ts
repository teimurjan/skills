const APP_STORE_ID = process.env.NEXT_PUBLIC_APP_STORE_ID ?? "";

/** Null until `NEXT_PUBLIC_APP_STORE_ID` is set: a badge that 404s is worse than no badge. */
export const appStoreUrl = APP_STORE_ID ? `https://apps.apple.com/app/id${APP_STORE_ID}` : null;

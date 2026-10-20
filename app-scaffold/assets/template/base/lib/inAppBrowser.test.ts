import { describe, expect, test } from "bun:test";
import { inAppBrowser } from "./inAppBrowser";

const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)";

describe("inAppBrowser", () => {
  test("names each of Meta's in-app browsers", () => {
    expect(
      inAppBrowser(`${IOS} Mobile/21F90 [FBAN/FBIOS;FBAV/467.0.0.36.109;FBDV/iPhone15,2;FBSN/iOS]`),
    ).toBe("facebook");
    expect(
      inAppBrowser(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240705.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.134 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.53.108;]",
      ),
    ).toBe("facebook");
    expect(
      inAppBrowser(`${IOS} Mobile/21F90 Instagram 338.0.0.31.87 (iPhone15,2; iOS 17_5_1; en_US; scale=3.00)`),
    ).toBe("instagram");
    expect(inAppBrowser(`${IOS} Mobile/21F90 Barcelona 338.0.0.34.88 iOS`)).toBe("threads");
  });

  test("the system browser is nobody's", () => {
    expect(inAppBrowser(`${IOS} Version/17.5 Mobile/15E148 Safari/604.1`)).toBeNull();
    expect(
      inAppBrowser(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
      ),
    ).toBeNull();
  });
});

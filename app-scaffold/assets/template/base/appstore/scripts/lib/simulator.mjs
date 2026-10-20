// The simulator, driven from a script: boot it, build the Debug app (the one with the
// `#if DEBUG` screenshot harness compiled in), install, pin the status bar, and photograph
// one seeded screen per launch.

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { CACHE_DIR, DEVICES, IOS_PROJECT } from "./screenshot-kit.mjs";

export const SCHEME = "Appname";
export const BUNDLE_ID = "com.example.appname";
export const DEFAULT_DEVICE = DEVICES.iphone.simulator;

// Long enough for a warm launch; at two seconds some screens came back as photographs of
// the launch screen. The first launch after an install is slower still, which `warmUp` spends.
export const DEFAULT_DELAY = 4000;
const DERIVED_DATA = path.join(CACHE_DIR, "DerivedData");

export function simctl(args, { allowFail = false } = {}) {
  try {
    return execFileSync("xcrun", ["simctl", ...args], { stdio: "pipe" }).toString();
  } catch (error) {
    if (allowFail) return "";
    throw new Error(`xcrun simctl ${args.join(" ")} failed: ${error.stderr?.toString() ?? error.message}`);
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function resolveDevice(name) {
  const devices = JSON.parse(simctl(["list", "devices", "available", "--json"])).devices;
  const candidates = Object.values(devices)
    .flat()
    .filter((d) => d.name === name);
  if (candidates.length === 0) {
    throw new Error(`No available simulator named "${name}". Open Xcode > Settings > Platforms to install one.`);
  }
  return candidates.find((d) => d.state === "Booted") ?? candidates[0];
}

/** Headless on purpose: every step is simctl, which renders without a window, and Xcode 27
 * dropped Simulator.app (it became Device Hub), so `open -a Simulator` fails. */
export function bootIfNeeded(device) {
  if (device.state === "Booted") return;
  console.log("Booting simulator…");
  simctl(["boot", device.udid]);
  simctl(["bootstatus", device.udid, "-b"]);
}

export function buildDebugApp(device) {
  console.log("Building Debug configuration (includes the screenshot harness)…");
  mkdirSync(DERIVED_DATA, { recursive: true });
  execFileSync(
    "xcodebuild",
    [
      "-project", IOS_PROJECT,
      "-scheme", SCHEME,
      "-sdk", "iphonesimulator",
      "-configuration", "Debug",
      "-destination", `id=${device.udid}`,
      "-derivedDataPath", DERIVED_DATA,
      "build",
    ],
    { stdio: "inherit" },
  );
}

function findBuiltApp() {
  const productsDir = path.join(DERIVED_DATA, "Build", "Products", "Debug-iphonesimulator");
  const appPath = path.join(productsDir, `${SCHEME}.app`);
  if (!existsSync(appPath)) throw new Error(`Built app not found at ${appPath}`);
  return appPath;
}

export function installApp(device) {
  const appPath = findBuiltApp();
  console.log(`Installing ${appPath}…`);
  simctl(["install", device.udid, appPath]);
}

export function pinStatusBar(device) {
  console.log("Pinning status bar…");
  simctl(
    [
      "status_bar", device.udid, "override",
      "--time", "9:41",
      "--dataNetwork", "wifi", "--wifiMode", "active", "--wifiBars", "3",
      "--cellularMode", "active", "--cellularBars", "4",
      "--batteryState", "charged", "--batteryLevel", "100",
    ],
    { allowFail: true },
  );
}

export function clearStatusBar(device) {
  simctl(["status_bar", device.udid, "clear"], { allowFail: true });
}

/** Resolve, boot, build, install, pin: the simulator ready to photograph. `posture` asks for
 * the device on its side, open or closed, and comes back as the display to photograph. */
export function prepareSimulator(name = DEFAULT_DEVICE, posture = {}) {
  console.log(`Resolving simulator "${name}"…`);
  const device = resolveDevice(name);
  bootIfNeeded(device);
  const display = posture.landscape || posture.open !== undefined ? litDisplay(device, posture) : null;
  buildDebugApp(device);
  installApp(device);
  pinStatusBar(device);
  return { ...device, display };
}

/**
 * The lit display, refused unless it is in `posture`. Only Device Hub turns or folds a
 * simulator, so the run stops and says what to do there. `simctl io screenshot` reads the
 * primary display by default, which on an open iPhone Duo is the dark outer one.
 */
function litDisplay(device, { landscape, open }) {
  const file = path.join(CACHE_DIR, "displays.json");
  mkdirSync(CACHE_DIR, { recursive: true });
  execFileSync(
    "xcrun",
    ["devicectl", "device", "info", "displays", "--device", device.udid, "--timeout", "15", "--json-output", file],
    { stdio: "ignore" },
  );
  const displays = JSON.parse(readFileSync(file, "utf8")).result.displays;
  const lit = displays.find((display) => display.active) ?? displays[0];
  if (open === true && lit.primary) {
    throw new Error(`The ${device.name} simulator is closed. Open it in Device Hub, then run again.`);
  }
  if (open === false && !lit.primary) {
    throw new Error(`The ${device.name} simulator is open. Close it in Device Hub, then run again.`);
  }
  const turned = ["rot90", "rot270"].includes(lit.currentOrientation);
  if (landscape && !turned) {
    throw new Error(`The ${device.name} simulator is upright. Turn it on its side in Device Hub, then run again.`);
  }
  if (!landscape && turned) {
    throw new Error(`The ${device.name} simulator is on its side. Turn it upright in Device Hub, then run again.`);
  }
  return lit.displayId;
}

/**
 * Launch the harness once after the install and keep no picture. That first launch is the
 * slow one, and a run of one screen has no second frame for the twin check to catch it with.
 */
export async function warmUp(device, screen) {
  const launched = simctl(["launch", "--terminate-running-process", device.udid, BUNDLE_ID, "--screenshot", screen]);
  await sleep(DEFAULT_DELAY);
  assertStillRunning(launched, `warm-up/${screen}`);
  simctl(["terminate", device.udid, BUNDLE_ID], { allowFail: true });
}

/**
 * Launch the harness on one screen, wait for it to draw, photograph it, quit.
 *
 * `locale` and `sim` land in NSArgumentDomain for this launch only — the simulator's own
 * language is left alone, so locales can be captured back to back.
 *
 * @param {{ udid: string, display?: number | null }} device
 * @param {{ screen: string, locale?: string, sim?: string, file: string, delay?: number }} options
 */
export async function captureScreen(device, { screen, locale = "en", sim = "en_US", file, delay = DEFAULT_DELAY }) {
  const report = calloutReport(device);
  rmSync(report, { force: true });
  const launched = simctl([
    "launch", "--terminate-running-process", device.udid, BUNDLE_ID,
    "--screenshot", screen,
    "-AppleLanguages", `(${locale})`,
    "-AppleLocale", sim,
  ]);
  await sleep(delay);
  assertStillRunning(launched, `${locale}/${screen}`);
  simctl(["io", device.udid, "screenshot", "--type", "png", ...(device.display ? [`--display=${device.display}`] : []), file]);
  simctl(["terminate", device.udid, BUNDLE_ID], { allowFail: true });

  // Beside the capture, so the frame that lifts a widget out finds where it was drawn.
  const calloutFile = file.replace(/\.png$/, ".json");
  if (existsSync(report)) copyFileSync(report, calloutFile);
  else rmSync(calloutFile, { force: true });
}

/** Where `ScreenshotCallout` writes the frames of the widgets a screen names, in points. */
function calloutReport(device) {
  const container = simctl(["get_app_container", device.udid, BUNDLE_ID, "data"]).trim();
  return path.join(container, "Documents", "screenshot-callouts.json");
}

/**
 * Fail the run if the app died between launch and the screenshot.
 *
 * Without this the capture is silent about a crash: `simctl io screenshot` photographs
 * whatever is on the display, which after a crash is the home screen — and that image gets
 * composited into a store frame and uploaded, looking like a deliberate one, which is worse
 * than a failed build, because a failed build stops.
 *
 * Simulator apps are ordinary host processes, so the pid `simctl launch` prints can be
 * probed with signal 0 directly.
 */
export function assertStillRunning(launchOutput, label) {
  const pid = Number(launchOutput.trim().split(":").pop());
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`${label}: could not read a pid from simctl launch — refusing to screenshot blind`);
  }
  try {
    process.kill(pid, 0);
  } catch {
    throw new Error(
      `${label}: the app is no longer running — it crashed during launch. `
      + `Run the "${label.split("/")[1]}" screen in Xcode to see why; the screenshot was not taken.`,
    );
  }
}

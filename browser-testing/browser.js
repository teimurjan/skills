#!/usr/bin/env -S deno run -A
// browser.js — Full Agent Browser Protocol (ABP) CLI
// https://github.com/theredsix/agent-browser-protocol

// Originally from https://github.com/snqb/my-skills/blob/main/browser-testing/SKILL.md

import { decodeBase64 } from "jsr:@std/encoding@^1.0.11/base64";

const API = "http://localhost:8222/api/v1";
const HOME = Deno.env.get("HOME") || "/tmp";

// ── HTTP ──

async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(`${API}${path}`, opts);
  if (r.status === 204) return {};
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || d.error || r.statusText);
  return d;
}

function unwrap(data) {
  const r = data?.result;
  return r && typeof r === "object" && "value" in r ? r.value : r;
}

async function activeTab(id) {
  if (id) return id;
  try {
    const tabs = await api("GET", "/tabs");
    const t = tabs.find((t) => t.active) || tabs[0];
    if (t) return t.id;
    return (await api("POST", "/tabs", { url: "about:blank" })).id;
  } catch {
    throw new Error("ABP not running. Run: browser.js start");
  }
}

// ── Screenshot & Events ──

function saveShot(envelope, label) {
  const s = envelope?.screenshot_after;
  if (!s?.data) return null;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const tmp = Deno.env.get("TMPDIR") || "/tmp";
  const p = `${tmp}/${label || "shot"}-${ts}.${s.format || "webp"}`;
  Deno.writeFileSync(p, decodeBase64(s.data));
  return p;
}

function printEvents(data) {
  for (const e of data?.events || []) {
    const d = e.data || {};
    const msgs = {
      navigation: `→ ${d.url}`,
      dialog: `⚠ dialog (${d.dialog_type}): ${d.message}`,
      file_chooser: `📁 file chooser id=${d.id} type=${d.chooser_type}`,
      download_started: `⬇ download: ${d.url || d.filename}`,
      download_completed: `✓ download: ${d.filename}`,
      select_open: `▾ select id=${d.id} (${d.options?.length} options)`,
      permission_requested: `🔐 permission id=${d.id} ${d.permission_type}`,
      popup: `↗ popup: ${d.url}`,
    };
    console.log(`  ${msgs[e.type] || `${e.type}: ${JSON.stringify(d)}`}`);
  }
}

function out(data, label) {
  if (flags.json) return console.log(JSON.stringify(data, null, 2));
  if (flags.shot || flags.markup) {
    const p = saveShot(data, label);
    if (p) console.log(p);
  }
  printEvents(data);
  if (data?.scroll && ["scroll", "nav", "screenshot"].includes(cmd)) {
    const s = data.scroll;
    console.log(
      `  scroll: ${s.scrollX},${s.scrollY} page: ${s.pageWidth}×${s.pageHeight}`,
    );
  }
}

function shotOpts() {
  if (!flags.shot && !flags.markup && !flags.format) return {};
  return {
    screenshot: {
      format: flags.format || "webp",
      markup:
        flags.markup === "none"
          ? []
          : flags.markup
            ? flags.markup.split(",")
            : "interactive",
    },
  };
}

// ── Args ──

const args = Deno.args;
const cmd = args[0];
const flags = {},
  pos = [];
for (let i = 1; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    const k = args[i].slice(2);
    flags[k] = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true;
  } else pos.push(args[i]);
}

// ── Pick script (injected into browser) ──

const pickJS = (msg) => `(async () => {
	return new Promise((resolve) => {
		const sels = [], selEls = new Set();
		const ov = document.createElement("div");
		ov.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;pointer-events:none";
		const hl = document.createElement("div");
		hl.style.cssText = "position:absolute;border:2px solid #3b82f6;background:rgba(59,130,246,0.1);transition:all 0.1s";
		ov.appendChild(hl);
		const bn = document.createElement("div");
		bn.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1f2937;color:white;padding:12px 24px;border-radius:8px;font:14px sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);pointer-events:auto;z-index:2147483647";
		const upd = () => { bn.textContent = "${msg.replace(/"/g, '\\"')} (" + sels.length + " selected, Cmd/Ctrl+click to add, Enter to finish, ESC to cancel)"; };
		upd(); document.body.append(bn, ov);
		const clean = () => { document.removeEventListener("mousemove",onM,true); document.removeEventListener("click",onC,true); document.removeEventListener("keydown",onK,true); ov.remove(); bn.remove(); selEls.forEach(e => e.style.outline = ""); };
		const info = (el) => ({ tag: el.tagName.toLowerCase(), id: el.id||null, class: el.className||null, text: el.textContent?.trim().slice(0,200)||null, html: el.outerHTML.slice(0,500) });
		const onM = (e) => { const el = document.elementFromPoint(e.clientX,e.clientY); if(!el||ov.contains(el)||bn.contains(el)) return; const r = el.getBoundingClientRect(); Object.assign(hl.style,{top:r.top+"px",left:r.left+"px",width:r.width+"px",height:r.height+"px"}); };
		const onC = (e) => { if(bn.contains(e.target)) return; e.preventDefault(); e.stopPropagation(); const el = document.elementFromPoint(e.clientX,e.clientY); if(!el||ov.contains(el)||bn.contains(el)) return; if(e.metaKey||e.ctrlKey){if(!selEls.has(el)){selEls.add(el);el.style.outline="3px solid #10b981";sels.push(info(el));upd();}}else{clean();resolve(JSON.stringify(sels.length>0?sels:info(el)));} };
		const onK = (e) => { if(e.key==="Escape"){e.preventDefault();clean();resolve("null");}else if(e.key==="Enter"&&sels.length>0){e.preventDefault();clean();resolve(JSON.stringify(sels));} };
		document.addEventListener("mousemove",onM,true); document.addEventListener("click",onC,true); document.addEventListener("keydown",onK,true);
	});
})()`;

// ── Commands ──

async function run() {
  switch (cmd) {
    // ═══ Lifecycle ═══

    case "start": {
      try {
        if ((await fetch(`${API}/browser/status`)).ok)
          return console.log("✓ ABP already running on :8222");
      } catch {}
      const dir = `${HOME}/.cache/browser-tools`;
      await Deno.mkdir(dir, { recursive: true });
      const child = new Deno.Command("npx", {
        args: [
          "-y",
          "agent-browser-protocol",
          "--port",
          "8222",
          "--session-dir",
          dir,
        ],
        stdin: "null",
        stdout: "null",
        stderr: "null",
      }).spawn();
      child.unref();
      for (let i = 0; i < 60; i++) {
        try {
          if ((await fetch(`${API}/browser/status`)).ok)
            return console.log("✓ ABP started on :8222");
        } catch {}
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error("Timed out starting ABP");
    }

    case "status":
      return console.log(
        JSON.stringify(await api("GET", "/browser/status"), null, 2),
      );

    case "shutdown":
      await api("POST", "/browser/shutdown", {
        timeout_ms: Number(flags.timeout) || 5000,
      });
      return console.log("✓ Shutdown");

    // ═══ Navigation ═══

    case "nav": {
      const url = pos[0];
      if (!url) throw new Error("Usage: nav <url> [--new]");
      if (flags.new) {
        out(await api("POST", "/tabs", { url, ...shotOpts() }), "nav");
        console.log(`✓ new tab: ${url}`);
      } else {
        const id = await activeTab(flags.tab);
        out(
          await api("POST", `/tabs/${id}/navigate`, { url, ...shotOpts() }),
          "nav",
        );
        console.log(`✓ ${url}`);
      }
      return;
    }

    case "back": {
      const id = await activeTab(flags.tab);
      out(await api("POST", `/tabs/${id}/back`, shotOpts()), "back");
      return;
    }
    case "forward": {
      const id = await activeTab(flags.tab);
      out(await api("POST", `/tabs/${id}/forward`, shotOpts()), "fwd");
      return;
    }
    case "reload": {
      const id = await activeTab(flags.tab);
      out(await api("POST", `/tabs/${id}/reload`, shotOpts()), "reload");
      return;
    }

    // ═══ Mouse ═══

    case "click": {
      const [x, y] = pos.map(Number);
      if (isNaN(x) || isNaN(y))
        throw new Error(
          "Usage: click <x> <y> [--right] [--double] [--mod CTRL,SHIFT]",
        );
      const body = { x, y, ...shotOpts() };
      if (flags.right) body.button = "right";
      if (flags.double) body.click_count = 2;
      if (flags.mod)
        body.modifiers = flags.mod.split(",").map((m) => m.toUpperCase());
      const id = await activeTab(flags.tab);
      out(await api("POST", `/tabs/${id}/click`, body), "click");
      console.log(`✓ click ${x},${y}`);
      return;
    }

    case "hover": {
      const [x, y] = pos.map(Number);
      if (isNaN(x) || isNaN(y)) throw new Error("Usage: hover <x> <y>");
      const id = await activeTab(flags.tab);
      out(
        await api("POST", `/tabs/${id}/move`, { x, y, ...shotOpts() }),
        "hover",
      );
      console.log(`✓ hover ${x},${y}`);
      return;
    }

    case "scroll": {
      const [x, y] = pos.map(Number);
      if (isNaN(x) || isNaN(y))
        throw new Error("Usage: scroll <x> <y> --dy N [--dx N]");
      const scrolls = [];
      if (flags.dy)
        scrolls.push({ delta_px: Number(flags.dy), direction: "y" });
      if (flags.dx)
        scrolls.push({ delta_px: Number(flags.dx), direction: "x" });
      if (!scrolls.length) throw new Error("Need --dy and/or --dx");
      const id = await activeTab(flags.tab);
      out(
        await api("POST", `/tabs/${id}/scroll`, {
          x,
          y,
          scrolls,
          ...shotOpts(),
        }),
        "scroll",
      );
      console.log(`✓ scroll at ${x},${y}`);
      return;
    }

    case "drag": {
      const [x1, y1, x2, y2] = pos.map(Number);
      if ([x1, y1, x2, y2].some(isNaN))
        throw new Error("Usage: drag <x1> <y1> <x2> <y2> [--steps N]");
      const body = {
        start_x: x1,
        start_y: y1,
        end_x: x2,
        end_y: y2,
        ...shotOpts(),
      };
      if (flags.steps) body.steps = Number(flags.steps);
      const id = await activeTab(flags.tab);
      out(await api("POST", `/tabs/${id}/drag`, body), "drag");
      console.log(`✓ drag ${x1},${y1} → ${x2},${y2}`);
      return;
    }

    // ═══ Keyboard ═══

    case "type": {
      const text = pos.join(" ");
      if (!text) throw new Error("Usage: type <text>");
      const id = await activeTab(flags.tab);
      out(
        await api("POST", `/tabs/${id}/type`, { text, ...shotOpts() }),
        "type",
      );
      console.log(`✓ typed: ${text}`);
      return;
    }

    case "key": {
      const key = pos[0];
      if (!key)
        throw new Error(
          "Usage: key <KEY> [--mod CTRL,SHIFT] [--action down|up]",
        );
      const body = { key: key.toUpperCase(), ...shotOpts() };
      if (flags.mod)
        body.modifiers = flags.mod.split(",").map((m) => m.toUpperCase());
      const action = flags.action || "press";
      const ep = action === "press" ? "keyboard/press" : `keyboard/${action}`;
      const id = await activeTab(flags.tab);
      out(await api("POST", `/tabs/${id}/${ep}`, body), "key");
      console.log(`✓ key ${key}${flags.mod ? ` +${flags.mod}` : ""}`);
      return;
    }

    // ═══ Input Helpers ═══

    case "slider": {
      const [x, y, value] = pos.map(Number);
      if ([x, y, value].some(isNaN))
        throw new Error("Usage: slider <x> <y> <value>");
      const id = await activeTab(flags.tab);
      out(
        await api("POST", `/tabs/${id}/slider`, { x, y, value, ...shotOpts() }),
        "slider",
      );
      console.log(`✓ slider → ${value}`);
      return;
    }

    case "clear": {
      const [x, y] = pos.map(Number);
      if (isNaN(x) || isNaN(y)) throw new Error("Usage: clear <x> <y>");
      const id = await activeTab(flags.tab);
      out(
        await api("POST", `/tabs/${id}/clear-text`, { x, y, ...shotOpts() }),
        "clear",
      );
      console.log("✓ cleared");
      return;
    }

    case "pick": {
      const msg = pos.join(" ") || "Click an element";
      const id = await activeTab(flags.tab);
      const data = await api("POST", `/tabs/${id}/execute`, {
        script: pickJS(msg),
      });
      const result = JSON.parse(unwrap(data));
      if (!result) return console.log("Cancelled");
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // ═══ Screenshot & Content ═══

    case "screenshot": {
      const id = await activeTab(flags.tab);
      const body = {
        screenshot: {
          format: flags.format || "webp",
          markup:
            flags.markup === "none"
              ? []
              : flags.markup
                ? flags.markup.split(",")
                : "interactive",
        },
      };
      const data = await api("POST", `/tabs/${id}/screenshot`, body);
      if (flags.json) return console.log(JSON.stringify(data, null, 2));
      const p = saveShot(data, "screenshot");
      if (p) console.log(p);
      else console.error("✗ No screenshot data");
      printEvents(data);
      return;
    }

    case "text": {
      const id = await activeTab(flags.tab);
      const data = await api(
        "POST",
        `/tabs/${id}/text`,
        pos[0] ? { selector: pos[0] } : {},
      );
      console.log(unwrap(data) ?? JSON.stringify(data));
      return;
    }

    case "eval": {
      const code = pos.join(" ");
      if (!code) throw new Error("Usage: eval '<code>'");
      const id = await activeTab(flags.tab);
      const data = await api("POST", `/tabs/${id}/execute`, {
        script: code,
        ...shotOpts(),
      });
      if (flags.json) return console.log(JSON.stringify(data, null, 2));
      const result = unwrap(data);
      if (result !== undefined && result !== null)
        console.log(
          typeof result === "object" ? JSON.stringify(result, null, 2) : result,
        );
      if (flags.shot) {
        const p = saveShot(data, "eval");
        if (p) console.log(p);
      }
      printEvents(data);
      return;
    }

    case "content": {
      const url = pos[0];
      const id = await activeTab(flags.tab);
      if (url) await api("POST", `/tabs/${id}/navigate`, { url });
      const raw = await api("POST", `/tabs/${id}/execute`, {
        script:
          "({ html: document.documentElement.outerHTML, url: window.location.href, title: document.title })",
      });
      const { html, url: finalUrl, title } = unwrap(raw);
      const [
        { Readability },
        { JSDOM },
        { default: TurndownService },
        { gfm },
      ] = await Promise.all([
        import("npm:@mozilla/readability@^0.6.0"),
        import("npm:jsdom@^29.1.1"),
        import("npm:turndown@^7.2.4"),
        import("npm:turndown-plugin-gfm@^1.0.2"),
      ]);
      const doc = new JSDOM(html, { url: finalUrl });
      const article = new Readability(doc.window.document).parse();
      const td = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
      });
      td.use(gfm);
      let md;
      if (article?.content) {
        md = td.turndown(article.content);
      } else {
        const fb = new JSDOM(html, { url: finalUrl });
        fb.window.document
          .querySelectorAll("script,style,noscript,nav,header,footer,aside")
          .forEach((e) => {
            e.remove();
          });
        md = td.turndown(fb.window.document.body.innerHTML || "");
      }
      console.log(`URL: ${finalUrl}\nTitle: ${article?.title || title}\n`);
      console.log(md.replace(/\n{3,}/g, "\n\n").trim() || "(No content)");
      return;
    }

    case "cookies": {
      const id = await activeTab(flags.tab);
      const str = unwrap(
        await api("POST", `/tabs/${id}/execute`, { script: "document.cookie" }),
      );
      if (!str) return console.log("No cookies (or all HttpOnly)");
      for (const c of str.split("; ")) {
        const [n, ...v] = c.split("=");
        console.log(`${n}: ${v.join("=")}`);
      }
      return;
    }

    // ═══ Tabs ═══

    case "tabs": {
      const [action = "list", arg] = pos;
      if (action === "list") {
        for (const t of await api("GET", "/tabs"))
          console.log(
            `${t.active ? "→" : " "} ${t.id}  ${t.url}  ${t.title || ""}`,
          );
      } else if (action === "new") {
        console.log(
          `✓ ${(await api("POST", "/tabs", { url: arg || "about:blank" })).id}`,
        );
      } else if (action === "close") {
        await api("DELETE", `/tabs/${arg}`);
        console.log("✓ closed");
      } else if (action === "activate") {
        await api("POST", `/tabs/${arg}/activate`);
        console.log("✓ activated");
      } else if (action === "info") {
        console.log(JSON.stringify(await api("GET", `/tabs/${arg}`), null, 2));
      } else if (action === "stop") {
        await api("POST", `/tabs/${arg}/stop`);
        console.log("✓ stopped");
      } else throw new Error(`Unknown: tabs ${action}`);
      return;
    }

    // ═══ Dialogs ═══

    case "dialog": {
      const [action = "check"] = pos;
      const id = await activeTab(flags.tab);
      if (action === "check") {
        console.log(
          JSON.stringify(await api("GET", `/tabs/${id}/dialog`), null, 2),
        );
      } else if (action === "accept") {
        await api(
          "POST",
          `/tabs/${id}/dialog/accept`,
          pos[1] ? { prompt_text: pos[1] } : {},
        );
        console.log("✓ accepted");
      } else if (action === "dismiss") {
        await api("POST", `/tabs/${id}/dialog/dismiss`);
        console.log("✓ dismissed");
      } else throw new Error(`Unknown: dialog ${action}`);
      return;
    }

    // ═══ Downloads ═══

    case "download": {
      const [action = "list", arg] = pos;
      if (action === "list")
        console.log(JSON.stringify(await api("GET", "/downloads"), null, 2));
      else if (action === "status")
        console.log(
          JSON.stringify(await api("GET", `/downloads/${arg}`), null, 2),
        );
      else if (action === "cancel") {
        await api("POST", `/downloads/${arg}/cancel`);
        console.log("✓");
      } else if (action === "get")
        console.log(
          JSON.stringify(
            await api("GET", `/downloads/${arg}/content`),
            null,
            2,
          ),
        );
      else throw new Error(`Unknown: download ${action}`);
      return;
    }

    // ═══ File Chooser ═══

    case "file": {
      const fid = pos[0];
      if (!fid)
        throw new Error(
          "Usage: file <chooser_id> <paths...> [--cancel] [--save path]",
        );
      if (flags.cancel) {
        await api("POST", `/file-chooser/${fid}`, { cancel: true });
      } else if (flags.save) {
        await api("POST", `/file-chooser/${fid}`, { path: flags.save });
      } else {
        const files = pos.slice(1);
        if (!files.length)
          throw new Error("Provide file paths, --cancel, or --save <path>");
        await api("POST", `/file-chooser/${fid}`, { files });
      }
      console.log("✓");
      return;
    }

    // ═══ Native Select ═══

    case "select": {
      const [sid, idx] = pos;
      if (!sid || idx === undefined)
        throw new Error("Usage: select <select_id> <index>");
      await api("POST", `/select/${sid}`, { index: Number(idx) });
      console.log(`✓ option ${idx}`);
      return;
    }

    // ═══ Wait ═══

    case "wait": {
      const ms = Number(pos[0]);
      if (isNaN(ms)) throw new Error("Usage: wait <ms>");
      const id = await activeTab(flags.tab);
      out(await api("POST", `/tabs/${id}/wait`, { ms, ...shotOpts() }), "wait");
      console.log(`✓ ${ms}ms`);
      return;
    }

    // ═══ Execution Control ═══

    case "execution": {
      const [action = "status"] = pos;
      const id = await activeTab(flags.tab);
      if (action === "status")
        console.log(
          JSON.stringify(await api("GET", `/tabs/${id}/execution`), null, 2),
        );
      else if (action === "pause") {
        await api("POST", `/tabs/${id}/execution`, { paused: true });
        console.log("✓ paused");
      } else if (action === "resume") {
        await api("POST", `/tabs/${id}/execution`, { paused: false });
        console.log("✓ resumed");
      } else throw new Error(`Unknown: execution ${action}`);
      return;
    }

    // ═══ Permissions ═══

    case "permission": {
      const [action = "list"] = pos;
      if (action === "list")
        return console.log(
          JSON.stringify(await api("GET", "/permissions"), null, 2),
        );
      if (action === "grant") {
        const body = {};
        if (flags.lat && flags.lng)
          body.geolocation = {
            latitude: Number(flags.lat),
            longitude: Number(flags.lng),
          };
        await api("POST", `/permissions/${pos[1]}/grant`, body);
        console.log("✓ granted");
      } else if (action === "deny") {
        await api("POST", `/permissions/${pos[1]}/deny`);
        console.log("✓ denied");
      } else throw new Error(`Unknown: permission ${action}`);
      return;
    }

    // ═══ Batch ═══

    case "batch": {
      const json = pos.join(" ");
      if (!json)
        throw new Error(
          'Usage: batch \'[{"type":"mouse_click","x":100,"y":200},{"type":"keyboard_type","text":"hi"}]\'',
        );
      const actions = JSON.parse(json);
      const id = await activeTab(flags.tab);
      out(
        await api("POST", `/tabs/${id}/batch`, { actions, ...shotOpts() }),
        "batch",
      );
      console.log(`✓ ${actions.length} actions`);
      return;
    }

    // ═══ History ═══

    case "history": {
      const [action = "sessions"] = pos;
      if (action === "sessions")
        return console.log(
          JSON.stringify(await api("GET", "/history/sessions"), null, 2),
        );
      if (action === "current")
        return console.log(
          JSON.stringify(
            await api("GET", "/history/sessions/current"),
            null,
            2,
          ),
        );
      if (action === "actions")
        return console.log(
          JSON.stringify(await api("GET", "/history/actions"), null, 2),
        );
      if (action === "clear") {
        await api("DELETE", "/history");
        console.log("✓ cleared");
        return;
      }
      throw new Error(`Unknown: history ${action}`);
    }

    // ═══ Help ═══

    default:
      console.log(`ABP Browser CLI — full Agent Browser Protocol access

BROWSE
  nav <url> [--new]          Navigate (--new for new tab)
  back | forward | reload    History navigation
  screenshot                 Capture viewport
  text [selector]            Visible text (API, fast)
  content [url]              Article as Markdown (Readability)
  eval '<code>'              Execute JavaScript

MOUSE
  click <x> <y>              Click [--right] [--double] [--mod CTRL,SHIFT]
  hover <x> <y>              Move mouse
  scroll <x> <y> --dy N      Mouse wheel [--dx N]
  drag <x1> <y1> <x2> <y2>   Drag [--steps N]

KEYBOARD
  type <text>                Type string
  key <KEY>                  Press key [--mod CTRL,SHIFT] [--action down|up]
                             Keys: ENTER TAB ESCAPE BACKSPACE ARROWUP ARROWDOWN
                                   ARROWLEFT ARROWRIGHT DELETE HOME END PAGEUP PAGEDOWN

HELPERS
  slider <x> <y> <value>     Set range input
  clear <x> <y>              Clear text field (click+select all+delete)
  pick [message]             Interactive element picker (user clicks in browser)
  wait <ms>                  Wait duration
  batch '<json>'             Multiple actions in one call
  cookies                    View non-HttpOnly cookies

TABS
  tabs                       List all tabs
  tabs new [url]             New tab
  tabs close|activate|info|stop <id>

EVENTS
  dialog [check|accept|dismiss]    JS dialogs (alert/confirm/prompt)
  download [list|status|cancel|get]  Manage downloads
  file <id> <paths...>             Respond to file chooser [--cancel] [--save path]
  select <id> <index>              Native <select> dropdown
  permission [list|grant|deny]     Permission prompts [--lat N --lng N]

CONTROL
  start                      Launch ABP on :8222
  status                     Browser status
  shutdown                   Graceful shutdown [--timeout ms]
  execution [status|pause|resume]  JS execution & virtual time
  history [sessions|current|actions|clear]

FLAGS (any command)
  --tab <id>       Target specific tab (default: active)
  --shot           Include screenshot in response
  --markup <X>     interactive | clickable,typeable,scrollable,grid,selected | none
  --format <X>     webp (default) | png | jpeg
  --json           Raw JSON response`);
  }
}

run().catch((e) => {
  console.error(`✗ ${e.message}`);
  Deno.exit(1);
});

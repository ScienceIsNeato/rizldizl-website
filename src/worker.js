// Cloudflare Worker for rizldizl.com.
//
// Serves the static site from the [assets] binding and exposes one small API
// endpoint, POST /api/contact, which relays contact / effect-request messages
// to Brevo's transactional email API. The Brevo key never reaches the browser.
//
// Required bindings (see wrangler.toml [vars] + secrets):
//   BREVO_API_KEY      (secret)  — Brevo transactional API key
//   BREVO_SENDER_EMAIL (var)     — verified Brevo sender, e.g. no-reply@rizldizl.com
//   BREVO_SENDER_NAME  (var)     — display name for the sender
//   CONTACT_RECIPIENT  (var)     — where messages land, e.g. support@rizldizl.com

const MAX_FIELD = 5000;

// The R2-hosted installer the /download redirect points at, and the Cloudflare
// account whose Analytics Engine holds the count.
const DMG_URL = "https://dl.rizldizl.com/RizlDizl.dmg";
const ACCOUNT_ID = "4c2341810414766ae8cbf672785e82c5";

// Count one download (server-side, no cookies / no PII beyond a coarse
// country), then redirect to the actual file on R2. The R2 domain serves the
// bytes directly, so routing the click through here is how we get a count.
function handleDownload(request, env) {
  if (env.METRICS) {
    env.METRICS.writeDataPoint({
      blobs: ["download", request.headers.get("cf-ipcountry") || "??"],
      indexes: ["download"],
    });
  }
  // Explicit 302 with no-store: a cached redirect would let repeat clicks
  // bypass the Worker and undercount downloads.
  return new Response(null, {
    status: 302,
    headers: { Location: DMG_URL, "cache-control": "no-store" },
  });
}

// Cached (5 min) all-time download total from Analytics Engine, for the page.
async function handleDownloadCount(env, ctx, url) {
  const cache = caches.default;
  const key = new Request(url.origin + "/api/downloads?v=1");
  const hit = await cache.match(key);
  if (hit) return hit;

  let downloads = 0;
  let ok = false;
  if (env.CF_ANALYTICS_TOKEN) {
    try {
      const sql = "SELECT sum(_sample_interval) AS n FROM rizldizl_web WHERE blob1='download'";
      const resp = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/analytics_engine/sql`,
        { method: "POST", headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` }, body: sql }
      );
      if (resp.ok) {
        const j = await resp.json();
        downloads = Math.round(Number(j?.data?.[0]?.n ?? 0));
        ok = true;
      }
    } catch { /* leave ok=false so a transient failure isn't cached as zero */ }
  }

  const out = new Response(JSON.stringify({ downloads }), {
    headers: {
      "content-type": "application/json",
      "cache-control": ok ? "public, max-age=300" : "no-store",
    },
  });
  if (ok) ctx.waitUntil(cache.put(key, out.clone()));
  return out;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isValidEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320;
}

function clamp(value) {
  return typeof value === "string" ? value.trim().slice(0, MAX_FIELD) : "";
}

async function handleContact(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  // Honeypot — bots fill hidden fields; humans never see it.
  if (clamp(body.company) !== "") {
    return json({ ok: true }); // pretend success, drop silently
  }

  const email = clamp(body.email);
  const message = clamp(body.message);
  const effect = clamp(body.effect);
  const type = body.type === "effect-request" ? "effect-request" : "support";

  if (!isValidEmail(email)) {
    return json({ ok: false, error: "Please enter a valid email address." }, 400);
  }
  if (message === "") {
    return json({ ok: false, error: "Please include a message." }, 400);
  }

  if (!env.BREVO_API_KEY) {
    console.error("[contact] BREVO_API_KEY not configured");
    return json({ ok: false, error: "Email is not configured yet. Try again later." }, 503);
  }

  const recipient = env.CONTACT_RECIPIENT || "support@rizldizl.com";
  const senderEmail = env.BREVO_SENDER_EMAIL || recipient;
  const senderName = env.BREVO_SENDER_NAME || "RizlDizl";

  const subject =
    type === "effect-request"
      ? `Effect request${effect ? `: ${effect}` : ""}`
      : "RizlDizl support request";

  const rows = [
    ["Type", type === "effect-request" ? "Effect request" : "Support"],
    effect ? ["Effect", effect] : null,
    ["From", email],
  ].filter(Boolean);

  const htmlContent = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#16161c;">
      <h2 style="margin:0 0 12px;">${escapeHtml(subject)}</h2>
      <table style="border-collapse:collapse;margin:0 0 16px;">
        ${rows
          .map(
            ([k, v]) =>
              `<tr><td style="padding:2px 12px 2px 0;color:#6b6b7b;">${escapeHtml(
                k,
              )}</td><td style="padding:2px 0;">${escapeHtml(v)}</td></tr>`,
          )
          .join("")}
      </table>
      <p style="white-space:pre-wrap;line-height:1.5;margin:0;">${escapeHtml(message)}</p>
    </div>`;

  const textContent = [
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    message,
  ].join("\n");

  const payload = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: recipient }],
    replyTo: { email },
    subject,
    htmlContent,
    textContent,
  };

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": env.BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error(`[contact] Brevo ${res.status}: ${detail}`);
      return json({ ok: false, error: "Couldn't send your message. Please try again." }, 502);
    }
  } catch (err) {
    console.error("[contact] Brevo request threw:", err);
    return json({ ok: false, error: "Couldn't send your message. Please try again." }, 502);
  }

  return json({ ok: true });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "Method not allowed." }, 405);
      }
      return handleContact(request, env);
    }

    if (url.pathname === "/download") {
      // Count only real download navigations; HEAD/link-checker probes shouldn't
      // inflate the total.
      if (request.method !== "GET") {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
      }
      return handleDownload(request, env);
    }

    if (url.pathname === "/api/downloads") {
      return handleDownloadCount(env, ctx, url);
    }

    // Everything else is the static site.
    return env.ASSETS.fetch(request);
  },
};

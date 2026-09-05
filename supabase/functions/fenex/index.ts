import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * The only place Virtus talks to Fenex.
 *
 * It runs server-side for two reasons. The Fenex token must never reach the
 * browser, where anyone could read it and issue fiscal documents under the
 * account's RUC. And Fenex sees one fixed address rather than every customer's
 * browser, so it can be allowlisted.
 *
 * The user's Supabase login identifies them, and RLS on ht_issuers scopes the
 * issuer rows to them. Tokens live apart in ht_issuer_tokens, which has RLS on
 * and NO policy — unreadable by anon and authenticated alike, reachable only
 * with the service role key held here. A token issues fiscal documents under
 * its account's RUC, so a browser must not be able to read one even for its
 * own account: with several issuers, one of those logins belongs to somebody
 * else.
 *
 * An account may hold SEVERAL issuers. Fenex takes no issuer fields — it reads
 * who issued a document from the token — so filing under another name means
 * using that person's own Fenex login, which is theirs to give. Every action
 * therefore names an issuer; omitting it falls back to the default one.
 */

const FENEX_BASE = Deno.env.get("FENEX_BASE_URL") ?? "https://api.fenexpy.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Bypasses RLS, so every query made with it MUST filter by user_id by hand.
 * Used only for ht_issuer_tokens; everything else goes through the caller's
 * own client, where the database enforces ownership.
 */
function adminClient() {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) {
    // Failing loudly beats quietly falling back to a client that cannot read
    // the tokens and reporting "no Fenex account linked".
    throw Object.assign(
      new Error("Server misconfigured: SUPABASE_SERVICE_ROLE_KEY is not set."),
      { status: 500 },
    );
  }
  return createClient(Deno.env.get("SUPABASE_URL")!, key);
}

const ISSUER_COLUMNS =
  "id, label, fenex_email, account_id, subscription_status, paid_until, linked_at, " +
  "is_default, razon_social, ruc, ruc_dv, address, phone, email";

type Action =
  | "link"
  | "unlink"
  | "status"
  | "issuers"
  | "saveIssuer"
  | "setDefaultIssuer"
  | "departments"
  | "districts"
  | "cities"
  | "customers"
  | "products"
  | "create"
  | "pdf";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return json({ error: "Not authenticated" }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch { /* handled below */ }

  const action = body.action as Action | undefined;
  if (!action) return json({ error: "An action is required" }, 400);

  const issuerId = body.issuerId == null ? null : String(body.issuerId);

  try {
    switch (action) {
      case "link":
        return await link(supabase, user.id, body);
      case "unlink": {
        // Scoped to one issuer. Without the id this would unlink every issuer
        // on the account, which is never what a person clicking "unlink" on a
        // single profile means.
        if (!issuerId) return json({ error: "issuerId is required to unlink" }, 400);
        await supabase.from("ht_issuers").delete()
          .eq("id", issuerId).eq("user_id", user.id);
        return json({ linked: false, id: issuerId });
      }
      case "status":
        return json(await readIssuer(supabase, user.id, issuerId, false));
      case "issuers":
        return json({ issuers: await listIssuers(supabase, user.id) });
      case "saveIssuer":
        return await saveIssuer(supabase, user.id, body);
      case "setDefaultIssuer":
        return await setDefaultIssuer(supabase, user.id, issuerId);
      case "departments":
        return json(await proxy(
          supabase, user.id, issuerId, "GET", "/geography/departments?q=&limit=200",
        ));
      case "districts":
        return json(await proxy(
          supabase, user.id, issuerId, "GET",
          `/geography/districts?departmentCode=${enc(body.departmentCode)}`,
        ));
      case "cities":
        return json(await proxy(
          supabase, user.id, issuerId, "GET",
          `/geography/cities?departmentCode=${enc(body.departmentCode)}&districtCode=${enc(body.districtCode)}`,
        ));
      case "customers": {
        const issuer = await readIssuer(supabase, user.id, issuerId, true);
        return json(await proxy(
          supabase, user.id, issuerId, "GET",
          `/customers?accountId=${enc(issuer.account_id)}`,
        ));
      }
      case "products": {
        const issuer = await readIssuer(supabase, user.id, issuerId, true);
        return json(await proxy(
          supabase, user.id, issuerId, "GET",
          `/products?accountId=${enc(issuer.account_id)}`,
        ));
      }
      case "create":
        return json(await proxy(
          supabase, user.id, issuerId, "POST", "/mobile/remissions", body.payload,
        ));
      case "pdf":
        return await fetchPdf(supabase, user.id, issuerId, String(body.remissionId ?? ""));
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    const err = e as { status?: number; message?: string; detail?: unknown };
    return json(
      { error: err.message ?? String(e), detail: err.detail ?? null },
      err.status ?? 500,
    );
  }
});

// ── Issuers ────────────────────────────────────────────────────────────────

async function listIssuers(
  supabase: ReturnType<typeof createClient>,
  userId: string,
) {
  const { data } = await supabase
    .from("ht_issuers")
    .select(ISSUER_COLUMNS)
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("label");
  // Tokens are deliberately not in ISSUER_COLUMNS: this list goes to a browser.
  return data ?? [];
}

/**
 * Exchanges email and password for a token, once. The password is used for
 * this request and then discarded — it is never written anywhere. Fenex tokens
 * last about six months, so this is a twice-a-year action.
 *
 * Re-linking an existing issuer refreshes its token in place, keyed on the
 * Fenex email: the same login must never become a second profile, or a
 * document could be filed under a stale token nobody realises is there.
 */
async function link(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  const label = String(body.label ?? "").trim();
  if (!email || !password) return json({ error: "Email and password are required" }, 400);

  const res = await fetch(`${FENEX_BASE}/mobile/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const text = await res.text();
  if (!res.ok) {
    // 401 is a wrong password; anything else is Fenex having a problem. The
    // person on the other end needs to know which.
    return json(
      {
        error: res.status === 401
          ? "Fenex rejected that email or password."
          : `Fenex returned ${res.status}. ${text.slice(0, 300)}`,
      },
      res.status === 401 ? 401 : 502,
    );
  }

  const auth = JSON.parse(text) as {
    token?: string;
    accountId?: string;
    subscriptionStatus?: string;
    paidUntil?: string;
    email?: string;
  };

  if (!auth.token) return json({ error: "Fenex did not return a token" }, 502);

  const fenexEmail = auth.email ?? email;

  const { data: existing } = await supabase
    .from("ht_issuers")
    .select("id, label, is_default")
    .eq("user_id", userId)
    .eq("fenex_email", fenexEmail)
    .maybeSingle();

  // The first issuer on an account becomes the default, so a person who only
  // ever has one never has to think about the concept at all.
  const { count } = await supabase
    .from("ht_issuers")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  const row = {
    id: existing?.id ?? crypto.randomUUID(),
    user_id: userId,
    label: label || existing?.label || fenexEmail,
    fenex_email: fenexEmail,
    token: auth.token,   // split off below; never stored on ht_issuers
    account_id: auth.accountId ?? null,
    subscription_status: auth.subscriptionStatus ?? null,
    paid_until: auth.paidUntil ?? null,
    is_default: existing?.is_default ?? (count ?? 0) === 0,
    linked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { token, ...issuerRow } = row;
  const { error } = await supabase.from("ht_issuers").upsert(issuerRow, { onConflict: "id" });
  if (error) return json({ error: error.message }, 500);

  // Written with the service role, because the browser-facing roles cannot
  // touch this table at all. The issuer row above was written by the caller's
  // own client, so RLS has already proved they own it.
  const { error: tokenError } = await adminClient().from("ht_issuer_tokens").upsert(
    { issuer_id: row.id, user_id: userId, token, updated_at: new Date().toISOString() },
    { onConflict: "issuer_id" },
  );
  if (tokenError) return json({ error: tokenError.message }, 500);

  // The token itself never goes back to the browser.
  return json({
    linked: true,
    id: row.id,
    label: row.label,
    fenex_email: fenexEmail,
    account_id: row.account_id,
    subscription_status: row.subscription_status,
    paid_until: row.paid_until,
    is_default: row.is_default,
  });
}

/** The transportista details and the label. Never the token. */
async function saveIssuer(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const id = String(body.issuerId ?? "");
  if (!id) return json({ error: "issuerId is required" }, 400);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ["label", "razon_social", "ruc", "ruc_dv", "address", "phone", "email"]) {
    if (key in body) patch[key] = body[key] == null ? null : String(body[key]).trim() || null;
  }

  const { error } = await supabase.from("ht_issuers")
    .update(patch).eq("id", id).eq("user_id", userId);
  if (error) return json({ error: error.message }, 500);
  return json({ issuers: await listIssuers(supabase, userId) });
}

async function setDefaultIssuer(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  issuerId: string | null,
): Promise<Response> {
  if (!issuerId) return json({ error: "issuerId is required" }, 400);
  // Cleared first: a unique partial index allows only one default per account,
  // so setting the new one before clearing the old would be rejected.
  await supabase.from("ht_issuers").update({ is_default: false })
    .eq("user_id", userId).eq("is_default", true);
  const { error } = await supabase.from("ht_issuers").update({ is_default: true })
    .eq("id", issuerId).eq("user_id", userId);
  if (error) return json({ error: error.message }, 500);
  return json({ issuers: await listIssuers(supabase, userId) });
}

/**
 * The issuer a request runs as. A named issuer must exist and belong to the
 * caller; without a name, the default is used.
 */
async function readIssuer(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  issuerId: string | null,
  requireToken: boolean,
) {
  // The caller's own client, so RLS decides which issuers exist for them.
  let query = supabase.from("ht_issuers").select(ISSUER_COLUMNS).eq("user_id", userId);

  query = issuerId
    ? query.eq("id", issuerId)
    : query.order("is_default", { ascending: false }).order("linked_at");

  const { data } = await query.limit(1).maybeSingle();
  if (!data) {
    if (requireToken) {
      throw Object.assign(
        new Error(
          issuerId
            ? "That issuer is not linked to a Fenex account."
            : "No Fenex account is linked yet.",
        ),
        { status: 409 },
      );
    }
    return { linked: false };
  }

  if (!requireToken) return { ...data, linked: true, token: undefined };

  // The row above came back through RLS, so it is the caller's. The user_id
  // filter here is belt and braces: this client bypasses RLS entirely, and a
  // missing filter would hand out another account's token.
  const { data: secret } = await adminClient()
    .from("ht_issuer_tokens")
    .select("token")
    .eq("issuer_id", (data as { id: string }).id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!secret?.token) {
    throw Object.assign(
      new Error("That issuer has no Fenex session. Re-link it in Account > Nota de Remision."),
      { status: 409 },
    );
  }
  return { ...data, linked: true, token: secret.token };
}

// ── Calling Fenex ──────────────────────────────────────────────────────────

async function proxy(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  issuerId: string | null,
  method: string,
  path: string,
  payload?: unknown,
): Promise<unknown> {
  const issuer = await readIssuer(supabase, userId, issuerId, true);

  const res = await fetch(`${FENEX_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${issuer.token}`,
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });

  const text = await res.text();

  if (res.status === 401 || res.status === 403) {
    // Six-month tokens do expire eventually. Say so plainly rather than
    // surfacing a bare 401 that reads like a bug — and name the issuer, since
    // an account may hold several and only one of them has gone stale.
    throw Object.assign(
      new Error(
        `The Fenex session for ${issuer.label ?? issuer.fenex_email ?? "this issuer"} has expired. ` +
        "Re-link it in Account → Nota de Remisión.",
      ),
      { status: 401 },
    );
  }

  if (!res.ok) {
    let detail: unknown = text.slice(0, 1200);
    try { detail = JSON.parse(text); } catch { /* keep the raw text */ }
    throw Object.assign(new Error(`Fenex rejected the request (${res.status}).`), {
      status: 502,
      detail,
    });
  }

  try { return JSON.parse(text); } catch { return text; }
}

/**
 * The KuDE endpoint returns PDF bytes behind the token, so a driver could never
 * open it directly. The bytes are copied into Supabase Storage once, which
 * gives a link that can be forwarded over WhatsApp and does not depend on Fenex
 * being reachable later.
 */
async function fetchPdf(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  issuerId: string | null,
  remissionId: string,
): Promise<Response> {
  if (!remissionId) return json({ error: "remissionId is required" }, 400);
  const issuer = await readIssuer(supabase, userId, issuerId, true);

  const res = await fetch(`${FENEX_BASE}/remissions/${remissionId}/kude`, {
    headers: { Authorization: `Bearer ${issuer.token}` },
  });
  if (!res.ok) {
    return json({ error: `Fenex returned ${res.status} for the KuDE PDF.` }, 502);
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  const path = `${userId}/${remissionId}.pdf`;

  const { error } = await supabase.storage
    .from("remisiones")
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });

  if (error) return json({ error: `Could not store the PDF: ${error.message}` }, 500);

  // Signed rather than public: the path is guessable from the remission id, and
  // the document carries a RUC, an address and the driver's cédula.
  const { data: signed } = await supabase.storage
    .from("remisiones")
    .createSignedUrl(path, 60 * 60 * 24 * 365);

  return json({ path, url: signed?.signedUrl ?? null });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function enc(v: unknown): string {
  return encodeURIComponent(String(v ?? ""));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

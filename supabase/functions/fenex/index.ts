import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const columns = "id,label,is_default,razon_social,ruc,ruc_dv,address,phone,email";
type Connection = {
  id: string; requesterId: string; label: string; status: string;
  ruc: string; legalName: string | null; updatedAt: string;
};
type DraftSummary = {
  id: string;
  connectionId: string;
  remissionId: string;
  status: "DRAFT" | "READY" | "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED";
  reviewStatus: "PENDING" | "ACCEPTED" | "REJECTED";
  rejectionReason: string | null;
  remissionNumber: string | null;
  cdc: string | null;
  issuedAt: string | null;
  updatedAt: string;
};
type DraftDetail = { summary: DraftSummary; remission: Record<string, unknown> };
const unavailable = "Fenex connections are not available yet. The updated backend must be deployed and connected.";

async function partner(path: string, method = "GET", payload?: unknown) {
  const base = Deno.env.get("FENEX_PARTNER_BASE_URL");
  const key = Deno.env.get("FENEX_PARTNER_KEY");
  if (!base || !key) throw new Error(unavailable);
  if (!base.startsWith("https://")) throw new Error("Fenex connection requires HTTPS.");
  const response = await fetch(base.replace(/\/$/, "") + "/integrations/virtus" + path, {
    method, redirect: "error",
    headers: { "X-Virtus-Key": key, "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    // Never forward upstream bodies: they may contain internal details or secrets.
    if (response.status === 404) throw new Error("Fenex could not find this account or connection endpoint. Confirm the RUC with the issuer.");
    if (response.status === 401 || response.status === 403) throw new Error("The Virtus–Fenex server connection is not authorized.");
    if (response.status === 409) throw new Error("Fenex reports that this request has already been decided.");
    throw new Error("Fenex could not complete the request (" + response.status + ").");
  }
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
}

async function partnerPdf(path: string) {
  const base = Deno.env.get("FENEX_PARTNER_BASE_URL");
  const key = Deno.env.get("FENEX_PARTNER_KEY");
  if (!base || !key) throw new Error(unavailable);
  if (!base.startsWith("https://")) throw new Error("Fenex connection requires HTTPS.");
  const response = await fetch(base.replace(/\/$/, "") + "/integrations/virtus" + path, {
    redirect: "error",
    headers: { "X-Virtus-Key": key },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    if (response.status === 409) throw new Error("The signed PDF is not available until SIFEN approves the remisión.");
    if (response.status === 401 || response.status === 403) throw new Error("The Virtus–Fenex server connection is not authorized.");
    throw new Error("Fenex could not return the signed PDF (" + response.status + ").");
  }
  if (!response.headers.get("content-type")?.includes("application/pdf"))
    throw new Error("Fenex returned an invalid PDF response.");
  return new Uint8Array(await response.arrayBuffer());
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return json({ error: "Please sign in to Virtus again." }, 401);
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json({ error: "Invalid request" }, 400); }
  const issuerId = String(body.issuerId ?? "");

  async function localProfiles() {
    const { data, error } = await db.from("ht_issuers").select(columns).eq("user_id", user!.id);
    if (error) throw new Error("Could not load saved profiles.");
    return data ?? [];
  }
  async function sync() {
    const local = await localProfiles();
    if (!Deno.env.get("FENEX_PARTNER_BASE_URL") || !Deno.env.get("FENEX_PARTNER_KEY"))
      return local.map(p => ({ ...p, connection_status: "UNAVAILABLE" }));
    const remote = await partner("/connections?requesterId=" + encodeURIComponent(user!.id)) as Connection[];
    if (!Array.isArray(remote) || remote.some(c => c.requesterId !== user!.id ||
        !/^[0-9a-f-]{36}$/i.test(c.id) || !["PENDING","APPROVED","REJECTED","REVOKED"].includes(c.status)))
      throw new Error("Fenex returned an invalid connection response.");
    // Materialize public profiles for the existing remisión FK. Authorization
    // always comes from Fenex; local metadata never grants connection access.
    if (remote.length) {
      const { error } = await db.from("ht_issuers").upsert(remote.map(c => {
        const [ruc, dv] = c.ruc.split("-");
        return { id: c.id, user_id: user!.id, label: c.label,
          is_default: local.find(p => p.id === c.id)?.is_default ?? false,
          razon_social: c.status === "APPROVED" ? c.legalName : null, ruc, ruc_dv: dv,
          updated_at: new Date().toISOString() };
      }), { onConflict: "id" });
      if (error) throw new Error("Fenex received the request, but Virtus could not save its profile. Refresh to recover it.");
    }
    return remote.map(c => ({
      id: c.id, label: c.label, connection_status: c.status,
      ruc: c.ruc.split("-")[0], ruc_dv: c.ruc.split("-")[1],
      razon_social: c.status === "APPROVED" ? c.legalName : null,
      is_default: local.find(p => p.id === c.id)?.is_default ?? false,
    }));
  }
  try {
    switch (body.action) {
      case "issuers": return json({ issuers: await sync() });
      case "requestConnection": {
        if (!user.email || !user.email_confirmed_at) return json({ error: "Confirm your Virtus email first." }, 403);
        const label = String(body.label ?? "").trim();
        const ruc = String(body.ruc ?? "").trim();
        if (!label || label.length > 120 || !/^[0-9]{3,8}-[0-9]$/.test(ruc))
          return json({ error: "Enter a profile name and RUC including its DV (for example 80012345-6)." }, 400);
        await partner("/connections", "POST", {
          requesterId: user.id, requesterEmail: user.email, label, ruc,
        });
        return json({ issuers: await sync() });
      }
      case "unlink": {
        if (!/^[0-9a-f-]{36}$/i.test(issuerId)) return json({ error: "Invalid connection" }, 400);
        await partner("/connections/" + issuerId + "?requesterId=" + encodeURIComponent(user.id), "DELETE");
        return json({ issuers: await sync() });
      }
      case "setDefaultIssuer": {
        const profiles = await sync();
        if (!profiles.some(p => p.id === issuerId && p.connection_status === "APPROVED"))
          return json({ error: "Choose a connected profile." }, 409);
        const { error: clearError } = await db.from("ht_issuers").update({ is_default: false })
          .eq("user_id", user.id).eq("is_default", true);
        if (clearError) throw new Error("Could not change default profile.");
        const { error } = await db.from("ht_issuers").update({ is_default: true })
          .eq("user_id", user.id).eq("id", issuerId);
        if (error) throw new Error("Could not set default profile.");
        return json({ issuers: await sync() });
      }
      case "link": return json({ error: "Password linking has been replaced by issuer approval. Refresh Virtus." }, 409);
      case "create":
        return json({ error: "Immediate remisión issuance is disabled. Send a draft for issuer approval." }, 409);
      case "sendDraft": {
        if (!/^[0-9a-f-]{36}$/i.test(issuerId))
          return json({ error: "Choose an approved issuer." }, 400);
        const payload = body.payload as Record<string, unknown> | null;
        if (!payload || typeof payload !== "object"
            || typeof payload.idempotencyKey !== "string"
            || typeof payload.remission !== "object"
            || !Array.isArray(payload.items))
          return json({ error: "Invalid remisión draft." }, 400);
        const detail = await partner("/remission-drafts", "POST", {
          requesterId: user.id,
          connectionId: issuerId,
          idempotencyKey: payload.idempotencyKey,
          remission: payload.remission,
          items: payload.items,
        }) as DraftDetail;
        if (!isDraftDetail(detail))
          throw new Error("Fenex returned an invalid draft response.");
        return json(result(detail.summary));
      }
      case "remissions":
        return json({ remissions: await syncRemissions(db, user.id) });
      case "departments":
        return json(await partner("/geography/departments"));
      case "districts":
        return json(await partner(
          "/geography/districts?departmentCode=" + encodeURIComponent(String(body.departmentCode ?? "")),
        ));
      case "cities":
        return json(await partner(
          "/geography/cities?departmentCode=" + encodeURIComponent(String(body.departmentCode ?? ""))
            + "&districtCode=" + encodeURIComponent(String(body.districtCode ?? "")),
        ));
      case "pdf":
        return await fetchPdf(
          db,
          user.id,
          String(body.remissionId ?? ""),
        );
      case "customers":
      case "products":
        return json({ error: "Virtus now sends destination and crop snapshots; an issuer catalogue is not required." }, 409);
      default: return json({ error: "Unsupported Fenex action." }, 400);
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Fenex connection failed." }, 502);
  }
});

function isDraftSummary(value: unknown): value is DraftSummary {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string"
    && typeof item.connectionId === "string"
    && typeof item.remissionId === "string"
    && ["DRAFT", "READY", "SUBMITTED", "APPROVED", "REJECTED", "CANCELLED"].includes(String(item.status))
    && ["PENDING", "ACCEPTED", "REJECTED"].includes(String(item.reviewStatus));
}

function isDraftDetail(value: unknown): value is DraftDetail {
  return !!value && typeof value === "object"
    && isDraftSummary((value as Record<string, unknown>).summary);
}

function result(summary: DraftSummary) {
  return {
    id: summary.id,
    fenexRemissionId: summary.remissionId,
    remissionNumber: summary.remissionNumber,
    cdc: summary.cdc,
    status: summary.status,
    reviewStatus: summary.reviewStatus,
    rejectionReason: summary.rejectionReason,
    issuedAt: summary.issuedAt,
    updatedAt: summary.updatedAt,
  };
}

async function syncRemissions(
  db: ReturnType<typeof createClient>,
  userId: string,
) {
  const remote = await partner(
    "/remission-drafts?requesterId=" + encodeURIComponent(userId),
  ) as unknown;
  if (!Array.isArray(remote) || remote.some(item => !isDraftSummary(item)))
    throw new Error("Fenex returned an invalid remisión status response.");

  const now = new Date().toISOString();
  for (const summary of remote as DraftSummary[]) {
    const rejected = summary.status === "REJECTED";
    const { error } = await db.from("ht_remisiones").update({
      status: summary.status === "APPROVED" ? "issued" : rejected ? "failed" : "sending",
      fenex_status: summary.status,
      numero: summary.remissionNumber,
      cdc: summary.cdc,
      issued_at: summary.issuedAt,
      response_payload: result(summary),
      error_message: rejected
        ? summary.rejectionReason ?? "The issuer or SIFEN rejected this remisión."
        : null,
      updated_at: now,
    }).eq("user_id", userId).eq("fenex_remission_id", summary.id);
    if (error) throw new Error("Fenex status arrived, but Virtus could not save it.");
  }
  return (remote as DraftSummary[]).map(result);
}

async function fetchPdf(
  db: ReturnType<typeof createClient>,
  userId: string,
  integrationDraftId: string,
) {
  if (!/^[0-9a-f-]{36}$/i.test(integrationDraftId))
    return json({ error: "Invalid remisión identifier." }, 400);

  const { data: local, error: readError } = await db.from("ht_remisiones")
    .select("closing_weighing_id,pdf_path")
    .eq("user_id", userId)
    .eq("fenex_remission_id", integrationDraftId)
    .maybeSingle();
  if (readError || !local)
    return json({ error: "This remisión does not belong to the signed-in Virtus account." }, 404);

  const bytes = await partnerPdf(
    "/remission-drafts/" + integrationDraftId + "/kude?requesterId="
      + encodeURIComponent(userId),
  );
  const path = local.pdf_path || userId + "/" + crypto.randomUUID() + ".pdf";
  const { error: uploadError } = await db.storage.from("remisiones").upload(
    path,
    bytes,
    { contentType: "application/pdf", upsert: true },
  );
  if (uploadError) throw new Error("Could not safely store the signed PDF.");

  const { data: signed, error: signError } = await db.storage.from("remisiones")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signError || !signed?.signedUrl)
    throw new Error("Could not create a share link for the signed PDF.");

  const { error: saveError } = await db.from("ht_remisiones").update({
    pdf_path: path,
    pdf_url: signed.signedUrl,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId).eq("fenex_remission_id", integrationDraftId);
  if (saveError) throw new Error("The PDF was stored but its link could not be saved.");
  return json({ path, url: signed.signedUrl });
}

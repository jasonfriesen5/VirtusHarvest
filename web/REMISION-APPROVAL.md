# RUC-based issuer approval

Virtus collects a profile name and issuer RUC-DV, never a Fenex password. The
Supabase `fenex` function authenticates the Virtus user, derives their UUID
and confirmed email, and calls Fenex using a server-only partner key. Fenex owns
PENDING / APPROVED / REJECTED / REVOKED connection decisions. Only approved
connections are selectable.

The backend implementation is on `codex/virtus-ruc-connections` in
`JonaPY222/fenex-backend`. Its `VIRTUS-CONNECTIONS.md` contains the API and
deployment checklist. Git changes alone do not deploy Jonathan's running API.

## Deployment prerequisites

- Deploy the backend and Flyway V37–V38 to an isolated test installation first.
- Set `VIRTUS_INTEGRATION_KEY` on that server using a random secret of at
  least 32 characters.
- Set `FENEX_PARTNER_BASE_URL` and the matching `FENEX_PARTNER_KEY` in
  Supabase Edge Function secrets. Never put them in Vite/browser variables.
- Wire the Fenex notification centre to `/mobile/virtus-connections` and
  `/mobile/virtus-remissions`, including pending counts and decisions.
- Confirm the round trip with two distinct accounts before production rollout.

Without this configuration, Virtus reports the integration as unavailable. The
legacy issuer-token tables remain in Supabase for migration safety, but the new
proxy neither reads nor writes them.

## Draft and legal-document boundary

Connection approval is not permission to sign a document. Virtus sends only to
`/integrations/virtus/remission-drafts`; it never calls the old
`/mobile/remissions` endpoint that finalizes immediately.

Fenex resolves the issuer from the approved RUC connection and rechecks sender,
account and approval on every request. A draft is an immutable, fully validated
snapshot. An identical idempotent retry returns the same draft; changed content
returns conflict. Only the active Fenex account owner can approve and trigger
finalization/submission. Rejection consumes no number and calls no SIFEN
service. Virtus polls account-scoped status and can fetch the KuDE only after
SIFEN approval.

Drafts use wet kilograms. Web load edits freeze from sending onward, including
uncertain outcomes and rejection. The phone app must honor the same locks for
cross-device enforcement. A CDC alone does not prove SIFEN approval.

Trial mode is removed. Tests:

```text
npm run build --prefix web
node --test web/remision-workflow.test.cjs
```

Backend and web unit tests do not replace a live app round trip against a
disposable database and non-production SIFEN setup. No fiscal compliance
certification is claimed.

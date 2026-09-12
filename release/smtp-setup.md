# Custom SMTP for Supabase — exact steps

Fixes "email rate limit exceeded" and removes the ceiling on customer signups.

Sending goes on the subdomain **`send.virtusharvest.com`** so it can't disturb the
Cloudflare Email Routing that delivers `support@` and `demo@virtusharvest.com` to
your Gmail.

---

## PART 1 — Resend account and domain

1. Go to **resend.com** → **Sign Up**. Use `friesenj.jason@gmail.com`.
2. Verify the sign-up email Resend sends you.
3. In the Resend dashboard, click **Domains** in the left sidebar.
4. Click **Add Domain** (top right).
5. In the Name field type exactly:

       send.virtusharvest.com

   Not `virtusharvest.com`. The subdomain is what protects your existing mail.
6. Region: pick the one closest to you — **North Virginia (us-east-1)** is fine.
7. Click **Add**.
8. Resend now shows a **DNS Records** table with 3 rows: one **MX**, one **TXT**
   (SPF), one **TXT** (DKIM). Leave this tab open — you'll copy from it.

---

## PART 2 — Add those records in Cloudflare

9. Open **dash.cloudflare.com** → click **virtusharvest.com** → **DNS** →
   **Records**.

### ⚠ The mistake everyone makes

Cloudflare **automatically appends `.virtusharvest.com`** to whatever you type in
the Name field.

So when Resend shows a record named `send.virtusharvest.com`, you type only:

       send

If you paste the full `send.virtusharvest.com`, Cloudflare creates
`send.virtusharvest.com.virtusharvest.com` and verification fails with no useful
error.

Same for DKIM: if Resend shows `resend._domainkey.send.virtusharvest.com`, type
only `resend._domainkey.send`.

10. Click **Add record**. Create the **MX** row:

    - Type: **MX**
    - Name: `send`
    - Mail server: *(paste the value Resend shows, e.g. `feedback-smtp.us-east-1.amazonses.com`)*
    - Priority: *(as Resend shows, usually `10`)*
    - Save

11. Click **Add record**. Create the **SPF TXT** row:

    - Type: **TXT**
    - Name: `send`
    - Content: *(paste exactly, e.g. `v=spf1 include:amazonses.com ~all`)*
    - Save

12. Click **Add record**. Create the **DKIM TXT** row:

    - Type: **TXT**
    - Name: *(the DKIM host Resend shows, minus the `.virtusharvest.com` suffix — usually `resend._domainkey.send`)*
    - Content: the long `p=…` string. **Copy it whole**; it's easy to truncate.
    - Save

13. **Do not touch** the three existing root MX records
    (`route1/2/3.mx.cloudflare.net`) or the root TXT
    (`v=spf1 include:_spf.mx.cloudflare.net ~all`). Those run your inbound mail.

14. If any record shows an orange cloud, click it to set **DNS only** (grey).
    Mail records must not be proxied. TXT and MX normally aren't proxyable — this
    is just a check.

---

## PART 3 — Verify

15. Back in Resend → **Domains** → your domain → click **Verify DNS Records**.
16. Status should go to **Verified**, usually within a couple of minutes on
    Cloudflare. If it doesn't, re-read the ⚠ box above — a doubled domain name is
    the cause about nine times in ten.

---

## PART 4 — API key

17. Resend → **API Keys** → **Create API Key**.
18. Name: `supabase-auth`. Permission: **Sending access**.
19. **Copy the key now** — Resend shows it once and never again.

---

## PART 5 — Point Supabase at it

20. Supabase Dashboard → your project → **Authentication** (left sidebar) →
    **Emails** → **SMTP Settings** tab.
21. Turn on **Enable Custom SMTP**.
22. Fill in exactly:

    | Field | Value |
    |---|---|
    | Sender email | `noreply@send.virtusharvest.com` |
    | Sender name | `Virtus Cart` |
    | Host | `smtp.resend.com` |
    | Port | `587` |
    | Username | `resend` |
    | Password | *(the API key from step 19)* |

    The username really is the literal word `resend`, not your email.

23. **Save**.

---

## PART 6 — Raise the rate limit ⭐

**This is the step that actually fixes your problem.** Custom SMTP alone does not
lift Supabase's own auth throttle.

24. Supabase → **Authentication** → **Rate Limits**.
25. Find **"Rate limit for sending emails"** — it will show the low default.
    Change it to **100** per hour.
26. **Save**.

---

## PART 7 — Test

27. In the app, tap Create Account with a fresh address. Gmail's plus trick gives
    you unlimited unique addresses that all land in your inbox:

        jasonfriesen579+test1@gmail.com

28. The confirmation email should arrive within seconds, **from
    `noreply@send.virtusharvest.com`** rather than Supabase's shared sender.
29. Check spam on the first one. A brand-new sending domain has no reputation
    yet; it settles after a few sends.
30. Resend → **Logs** shows every message and whether it was delivered, which is
    the fastest way to tell "Supabase never sent it" from "it sent and landed in
    spam".

---

## Afterwards

Tell me when the DNS is in and I'll verify all three records resolve correctly
from outside, and confirm the root MX and SPF are still intact.

Optional polish, once this works: point the sender at `support@virtusharvest.com`
instead of `noreply@`, so a customer replying to a confirmation email reaches you
rather than a black hole. That needs `virtusharvest.com` verified as a sending
domain too, which means merging the SPF — worth doing later, not now.

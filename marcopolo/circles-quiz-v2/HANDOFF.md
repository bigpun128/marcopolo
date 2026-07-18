# Circles Survey v2 — Engineering Handoff

**What this is:** working prototypes of the redesigned Circles onboarding survey and
checkout, plus the spec for wiring them to Airtable and Stripe.

| Piece | Prototype | Live preview |
|---|---|---|
| Survey (12 screens) | `marcopolo/circles-quiz-v2/index.html` | `/marcopolo/circles-quiz-v2/` |
| Checkout | `marcopolo/circles-checkout-v2/index.html` | `/marcopolo/circles-checkout-v2/` |

Base URL for previews: `https://marcopolo-ten.vercel.app`

**Why it changed:** the live survey is 6 screens and converts ~0.5–3.5% at checkout
against a 10–18% benchmark. v2 is 12 screens designed to build intent before the
ask, and to capture the lead at a point where it's actually complete.

Open them on a phone and click through. Nothing is wired; the survey logs its
payload to the console and the checkout simulates a charge.

---

## 1. The one rule

> **Send the lead to Airtable exactly once, when first name, last name, email and
> phone are all present and valid — at the end of the Contact screen (11 of 12).**

Not before. Partial survey progress must **not** create Airtable records.

**Why here and not at purchase:** most people who finish contact do not buy today.
Those are still real leads worth remarketing. Firing at purchase would discard them.

**Why not earlier:** anything before Contact has no way to reach the person, so the
record is unusable and pollutes the base.

---

## 2. Flow and fire point

```
1  season        ─┐
2  age            │
3  woman          │  tap-only, no keyboard
4  hardest        │  (answers become the "brief")
5  want           │
6  interests     ─┘
7  reflection      no input
8  brief           shows their answers back
9  matcher         Lauren + how it works
10 name            first + last          ← keyboard starts
11 contact         email + phone + SMS consent
   ─────────────────────────────────────  ★ FIRE LEAD HERE
12 price           value checklist
   → checkout  (circles-checkout-v2)
```

In the prototype this is `submitLead()`, called from `wireContact()` after
validation passes. Search `★` / `submitLead` in `index.html`.

---

## 3. Payload contract

`POST /api/lead` · `Content-Type: application/json`

```json
{
  "leadId": "b3f1c0a2-5d9e-4a11-9c3d-0f2c7a8e1b44",
  "surveyVersion": "v2",
  "submittedAt": "2026-07-22T15:04:05.000Z",
  "contact": {
    "firstName": "Sarah",
    "lastName": "Miller",
    "email": "sarah@example.com",
    "phone": "(555) 123-4567",
    "phoneE164": "+15551234567"
  },
  "consent": {
    "sms": true,
    "disclosureShown": "By checking this box you agree to receive recurring automated marketing texts…",
    "capturedAt": "2026-07-22T15:04:05.000Z"
  },
  "brief": {
    "season": "new-mom",
    "seasonLabel": "A new mom",
    "age": "25–34",
    "hardest": ["I don't have anyone to call", "Everyone's busy with their own lives"],
    "lookingFor": ["Someone who just gets it", "Somewhere to be honest"],
    "interests": ["Fitness", "Books"]
  },
  "attribution": {
    "utm_source": "ig",
    "utm_medium": "paid",
    "utm_campaign": "ej_learning_campaign",
    "utm_content": null,
    "utm_term": null,
    "referrer": "https://l.instagram.com/",
    "landing_path": "/?utm_campaign=ej_learning_campaign"
  }
}
```

**Notes**
- `leadId` is a client-generated UUID, created on first load and stable across the
  whole session. **Use it as the idempotency key.**
- `phoneE164` assumes US (+1). If you open international, send the country code.
- `brief.*` values are the **human-readable labels**, not internal option values, so
  Lauren can read the record without a lookup table.
- `attribution` is **first-touch**, captured on landing and persisted. This is
  deliberate: today `campaignId` only survives Landing Page View, which is why
  checkout can't be segmented by creative. Persisting it here fixes that.

---

## 4. Airtable schema

Table: **Leads** (one record per lead)

| Field | Type | Source |
|---|---|---|
| Lead ID | Single line text (**unique**) | `leadId` |
| Created At | Date/time | `submittedAt` |
| First Name | Single line text | `contact.firstName` |
| Last Name | Single line text | `contact.lastName` |
| Email | Email | `contact.email` |
| Phone | Phone | `contact.phone` |
| Phone E164 | Single line text | `contact.phoneE164` |
| SMS Consent | Checkbox | `consent.sms` |
| SMS Consent At | Date/time | `consent.capturedAt` |
| SMS Disclosure | Long text | `consent.disclosureShown` |
| Season | Single select | `brief.season` |
| Age | Single select | `brief.age` |
| Navigating | Multiple select | `brief.hardest` |
| Looking For | Multiple select | `brief.lookingFor` |
| Interests | Multiple select | `brief.interests` |
| UTM Source / Medium / Campaign / Content / Term | Single line text | `attribution.*` |
| Referrer | URL | `attribution.referrer` |
| Landing Path | Single line text | `attribution.landing_path` |
| Survey Version | Single line text | `surveyVersion` |
| Status | Single select | server-set: `lead` → `purchased` |
| Purchased At | Date/time | set on purchase |

**Store the SMS disclosure text with the record.** If consent is ever challenged you
must be able to show what the user actually saw. Don't just store `true`.

---

## 5. Endpoint behaviour

**`POST /api/lead`**

1. Validate server-side. Never trust the client:
   - `firstName`, `lastName` non-empty
   - `email` valid
   - `phoneE164` matches `^\+1\d{10}$`
   - reject if any missing → `400`
2. **Upsert by `leadId`.** If a record exists, update it. Never create a duplicate.
3. Respond `200 {"ok":true,"recordId":"rec…"}`.
4. Rate-limit by IP. Add a honeypot or timing check — this endpoint is public.

**On purchase** (checkout success): `PATCH` the same record by `leadId` →
`Status = purchased`, `Purchased At = now`. The client already has `leadId` in
sessionStorage; pass it through checkout.

**Failure handling:** a failed write must **never block the user**. The prototype
fires and forgets, retries once on the price screen and again on the checkout click.
Server-side, queue failed Airtable writes and retry with backoff — Airtable rate
limits at **5 requests/sec per base** and will 429 under ad load.

---

## 6. Analytics

Fire **Complete Registration at the Contact screen**, the same moment as the lead —
not at survey end.

```js
window.dataLayer.push({ event: 'complete_registration', leadId });
```

This matters: Meta currently optimises to Complete Registration. v2 is twice as long
as v1, so if the event stays at the end of the funnel, volume collapses and the
algorithm re-enters learning. Firing at Contact keeps it at a comparable funnel depth.

Also send the Meta **Conversions API** event server-side from `/api/lead` with the
hashed email/phone, using `leadId` as `event_id` so it deduplicates against the
browser pixel.

---

## 7. Compliance (please don't skip)

The SMS checkbox is **unchecked by default** and consent is **not** a condition of
purchase. Both are required for TCPA. Keep it that way.

- Store the disclosure text, the timestamp, and the IP with the record.
- Only send marketing SMS where `SMS Consent = true`.
- Honour STOP/HELP in whatever sends the texts (Simple Texting).
- Have whoever owns compliance approve the final wording before launch. If Simple
  Texting mandates specific language, theirs wins over what's in the prototype.

Statutory damages are $500–$1,500 **per message**, so this is the highest-risk item
in the build.

---

## 8. Checkout

`marcopolo/circles-checkout-v2/index.html`. Deliberately shares the survey's shell,
palette and type so survey → checkout reads as one flow rather than a handoff to a
different product.

**Contents:** compact order summary (5 to 8 women, hand-matched · 4 weeks guided ·
$75), express-pay button, card fields with live formatting, the one-free-rematch
guarantee directly above the pay button, and a success state that greets the user by
name and lists what happens next.

**To wire it up**

1. Replace the fake card inputs with **Stripe Elements** (or Payment Element). The
   current fields are presentational only and must not be used to touch real card data.
2. On payment success, `PATCH` the lead by `leadId` (from `sessionStorage.circles-v2`)
   → `Status = purchased`, `Purchased At = now`. See §5.
3. Fire the purchase event to Meta both client-side and via Conversions API, using
   `leadId` as `event_id` so they deduplicate.
4. If payment fails, keep the user on the page with an inline error. The lead is
   already saved, so a failed charge must never lose the record.

**⚠️ Test in the Meta in-app browser, not Chrome.**

Roughly all paid traffic arrives inside the Instagram/Facebook webview, not Safari or
Chrome. Prior funnel data showed payment-specific events (`PURCHASE PAYMENT INFO ADD`,
`EXPRESS CHECKOUT CLICK`) firing at **zero** across hundreds of sessions while generic
click events fired normally, and the broader site converting at 10.4% on iPhone. That
pattern is consistent with Stripe Elements failing to initialise in the webview, and it
will not reproduce if you test by opening the checkout URL in a desktop browser.

Before signing off: tap a real ad on a real phone, complete the flow inside the
in-app browser, and confirm Apple/Google Pay availability and card entry both behave.

---

## 9. Prototype → production

The prototype is one static HTML file. Porting to the Next.js app:

- `SCREENS` is a plain array of screen definitions — port it as data, not markup.
- `SEASONS` holds the per-audience copy. **One survey, five themed experiences**:
  screen 1 self-selects the audience and swaps ~4 strings. Don't fork the funnel.
- Toggle at the top of the script:
  ```js
  const PROTOTYPE = true;      // set false: enables the real POST
  const LEAD_ENDPOINT = '/api/lead';
  ```
- State lives in `sessionStorage` under `circles-v2` so a refresh doesn't lose
  progress. Keep that.
- Design constraints that are load-bearing, please preserve:
  - **no keyboard before screen 10** — typing is the top mobile drop trigger
  - single-select **auto-advances**; multi-select gates a Continue button
  - `main` centres with `margin-block:auto`, **not** `justify-content:center`
    (the latter makes overflowing content unreachable on small screens)

---

## 10. Acceptance criteria

- [ ] Completing screens 1–10 creates **no** Airtable record
- [ ] Completing Contact creates **exactly one** record with all fields populated
- [ ] Going back and re-submitting Contact **updates**, never duplicates
- [ ] Refreshing mid-survey preserves answers and still produces one record
- [ ] Invalid email or a 9-digit phone blocks submission with an inline error
- [ ] Unchecked SMS box → record saved with `SMS Consent = false` (still a valid lead)
- [ ] Checked SMS box → disclosure text and timestamp stored
- [ ] Airtable outage → user still reaches the price screen; write retries
- [ ] `complete_registration` fires once, at Contact
- [ ] Purchase patches the same record to `purchased`
- [ ] UTMs captured on landing survive to the record (test with
      `?utm_campaign=ej_learning_campaign`)
- [ ] Full run on a real phone in the **Instagram in-app browser**, not just Chrome
- [ ] Card entry and express pay both work inside the in-app browser
- [ ] Successful payment patches the lead to `purchased`
- [ ] Failed payment keeps the user on the page and does not lose the lead
- [ ] Success screen shows the user's first name from the survey

---

## 11. Open items

| Item | Owner | Notes |
|---|---|---|
| Lauren's photo | Marketing | monogram "L" is a placeholder |
| Per-season testimonials | Marketing | currently 3 quotes recycled across 5 seasons; a new mom seeing an empty-nester quote reads false |
| Rematch policy wording | Ops/Legal | prototype says "one free rematch" |
| SMS disclosure sign-off | Legal | see §7 |
| Airtable base/table IDs + PAT | Eng | server-side only, never client |

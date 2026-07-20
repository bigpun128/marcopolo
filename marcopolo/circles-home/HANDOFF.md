# Circles v2 Funnel — Engineering Handoff (Landing)

**What this covers:** the generic Circles landing page (`circles-home`) and how it
plugs into the rest of the v2 funnel. The lead-capture / Airtable / checkout contract
lives in a companion doc — see [§7](#7-related-docs).

| Piece | Prototype | Live preview |
|---|---|---|
| **Landing** (this doc) | `marcopolo/circles-home/index.html` | `/marcopolo/circles-home/` |
| Survey (12 screens) | `marcopolo/circles-quiz-v2/index.html` | `/marcopolo/circles-quiz-v2/` |
| Checkout | `marcopolo/circles-checkout-v2/index.html` | `/marcopolo/circles-checkout-v2/` |

Base URL for previews: `https://marcopolo-ten.vercel.app`

---

## 1. What it is

A **generic** top-of-funnel landing in the Circles brand aesthetic, mobile-first.
Purpose: sell the offer clearly (with price), then send everyone into the survey,
which self-selects audience at screen 1. There is **no per-audience landing** — one
page, one CTA target.

**Why generic:** the previous approach used per-campaign landing variants keyed off
`utm_campaign`, which silently fell back to a default when a UTM was mistyped and made
downstream segmentation impossible (campaign data died at Landing Page View). Moving
audience into a survey answer makes it first-party data that survives to purchase.

**Page order:** hero (group photo) → trust bar → what's included → why Marco Polo
(video) → pricing card → why it works (human matching) → testimonials → FAQ → closing
CTA → footer. A sticky bottom CTA appears once the hero button scrolls out of view.

---

## 2. Structure & assets

Single self-contained HTML file, no build step, no framework. Inline `<style>`, one
small vanilla `<script>` (sticky-CTA IntersectionObserver + reduced-motion video pause).
Head includes OpenGraph/Twitter cards, `theme-color`, and `<link rel="prefetch">` of
the survey (next hop). **Note:** the `og:image` URL is hardcoded to the `marcopolo-ten`
preview domain — update it to the production domain at launch.

**Assets**
- `assets/women-group.jpg` — hero photo, **served locally** (optimized 13.7MB → 185KB,
  1500×626). Not an external dependency.
- Marco Polo demo video referenced from `../v3a/assets/marco-polo-why.mp4` (3.3MB,
  autoplay/muted/loop/playsinline, `preload="metadata"`, `aria-hidden`).

**Fonts:** Bricolage Grotesque + DM Mono (Google Fonts). Same tokens as the survey and
checkout so the funnel reads as one product.

**Responsive:** mobile-first single column; an `@media (min-width:860px)` breakpoint
reflows to desktop — two-column hero (copy + photo), two-column "Why Marco Polo"
(copy + video) and pricing (intro + card), 2-up "what's included", 3-up testimonials.
The hero, Why-Marco-Polo and pricing markup are grouped into paired columns so the
grid has something to place — preserve that grouping when porting.

**Section rhythm:** backgrounds alternate for separation — cream ↔ blush (`--blush`)
across the light sections, with two dark plum bands (What's included, closing) and the
dark trust bar/footer. Keep the alternation when adding/removing sections.

**Accessibility (already implemented — keep it on the Next.js port):**
- `<main>` landmark + skip-to-content link; `<nav aria-label="Primary">`.
- `:focus-visible` outlines on links, buttons, FAQ summaries.
- Decorative icons and the silent demo video are `aria-hidden`; video is `tabindex=-1`.
- `prefers-reduced-motion`: transitions/animations/smooth-scroll disabled and the
  video does not autoplay (JS checks the media query).
- Single `<h1>`; sequential `<h2>`; FAQ uses native `<details>/<summary>`.
- Body-copy contrast meets AA.

---

## 3. The only functional behaviour

Everything on this page is presentational **except the CTAs**. Every CTA points to the
survey:

```
../circles-quiz-v2/         (nav, hero, pricing card, closing, sticky bottom bar)
```

Nothing on the landing writes data. Do not add lead capture here — the lead fires at
the survey's Contact screen (see the survey handoff).

**Port note (Next.js):** when this moves into the app, the CTA target becomes the
survey route (e.g. `/survey`) and the pricing shown here (`$75`) must match the
survey's price screen and the checkout. Keep price in one shared constant.

---

## 4. Analytics & attribution (the important part)

This is the first page in the funnel, so **first-touch attribution is captured here**
and must be preserved end-to-end.

1. **Load GTM** (`GTM-KSK39L4L`) and the Meta Pixel, same container as the current site.
2. **Capture UTMs + referrer on first load** and persist to `sessionStorage`
   (the survey reads them into the lead payload). The survey prototype already does
   this in `captureAttribution()`; if the landing sets them first, the survey will
   reuse them (first-touch wins). Keys: `utm_source/medium/campaign/content/term`,
   `referrer`, `landing_path`.
3. **Fire `ViewContent` / page view** on load.
4. **Fire a CTA click event** when someone taps into the survey, so landing→survey
   drop-off is measurable:
   ```js
   window.dataLayer.push({ event: 'start_survey', cta_location: 'hero' | 'pricing' | 'sticky' | 'nav' | 'closing' });
   ```
   Pass `cta_location` so we can see which CTA converts.

**Do not** fire Complete Registration here. That belongs at the survey's Contact
screen — firing it on the landing would collapse Meta's optimisation signal.

---

## 5. Mobile-first, but responsive (99% of traffic is mobile)

- Mobile: single column, max-width 520px, big (≥56px) tap targets. Desktop breakpoint
  at 860px (see §2). Sticky bottom CTA is mobile-only; hidden ≥600px.
- **Test inside the Instagram/Facebook in-app browser**, not desktop Chrome. This is
  where all paid traffic lands and where earlier funnel issues hid.
- The hero video autoplays: keep `muted playsinline preload="metadata"`. Consider a
  poster image and load-on-tap if cellular data becomes a concern (3.3MB).
- Sticky bottom CTA must clear the iOS home indicator (`env(safe-area-inset-bottom)`
  — already handled).
- Verify the hero image and video both render in-app; if either fails, the page must
  still look intact (image has fixed `width`/`height` to avoid layout shift).

---

## 6. Content still to finalise (placeholders)

| Item | Status |
|---|---|
| Hero photo | ✅ real (supplied group photo) |
| Marco Polo video | ✅ real (existing asset) |
| "A human builds every circle" avatar | ♥ monogram placeholder — swap for a real matching-team/Lauren photo |
| Testimonials | Bethany / Laurie / Lisa, from the live site — confirm still approved |
| Footer legal links | `#` placeholders — point at real Terms / Privacy / California Notice / Community Guidelines |
| Price ($75) | confirm final; must match survey + checkout |

---

## 7. Related docs

- **Survey + lead capture + checkout contract:** `marcopolo/circles-quiz-v2/HANDOFF.md`
  — the Airtable payload, the fire-once-at-Contact rule, endpoint behaviour, TCPA/SMS
  compliance, Stripe/checkout, and the in-app-browser payment warning. **Read that one
  for anything involving data.**

---

## 8. Acceptance criteria (landing)

- [ ] Every CTA (nav, hero, pricing, sticky, closing) opens the survey
- [ ] UTMs + referrer captured on load and readable by the survey (test with
      `?utm_campaign=ej_learning_campaign`)
- [ ] `start_survey` fires with `cta_location` on each CTA
- [ ] Complete Registration does **not** fire on this page
- [ ] Hero image + Marco Polo video render in the Instagram in-app browser
- [ ] No layout shift as the hero image loads
- [ ] Price on the landing matches the survey price screen and checkout
- [ ] Sticky CTA appears after the hero button scrolls away and clears the home indicator

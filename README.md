# Exhbt Studio — client projects

Static HTML client work, no build step. One folder per client, served at its own path.

## Structure

```
/
├── index.html                → Exhbt studio directory (links to each client)
├── vercel.json               → clean URLs, no trailing slash
│
├── expomanagementinc/        → Expo Management Inc.
│   ├── index.html            → project hub (two landing directions + email flows)
│   ├── template-1-botanical/ → Home & Garden Show landing (editorial / serif)
│   ├── template-2-retrofair/ → Home & Garden Show landing (retro fair / playful)
│   └── emails/               → onboarding + re-engagement email flows (both designs)
│
└── marcopolo/                → Marco Polo (Circles)
    ├── index.html            → Circles landing chooser
    ├── v1..v4, v3a..v3d      → landing directions
    ├── circles-quiz/         → quiz flow
    ├── circles-checkout/     → checkout flow
    ├── emails/               → Circles email designs
    └── ads/                  → static ad sets
```

Deployed paths:
- `/`                          → studio directory
- `/expomanagementinc/`        → Expo Management hub
- `/expomanagementinc/template-1-botanical` → landing template 1
- `/expomanagementinc/emails/` → email flows preview
- `/marcopolo/`                → Circles chooser

## Adding a new client

1. Create a top-level folder named for the client (e.g. `newclient/`).
2. Put the work inside it. Use **relative** links between files in the folder so it stays portable.
3. Add a card to the top-level `index.html` directory.

## Deploy

Connected to Vercel via GitHub. Every push to `main` auto-deploys. Framework preset: Other, no build command.

## Notes

- Images are Unsplash placeholders in most templates — swap in real photography before production, using relative paths inside each client folder.
- Registration forms and email calendar links are front-end demos, ready to wire to a form endpoint / ESP.

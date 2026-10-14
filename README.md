# Upcard

A blackjack study tool. It works out the best move from the cards still in the deck and shows the numbers behind it.

- **Calculator** — type in a hand you saw elsewhere and get the best move.
- **Simulator** — play for chips (no help, full report when you end the session) or in Trainer (hints on request, each hand marked).
- Custom rules, four counting systems, bankroll tools, and a batch simulator that plays up to a million hands to check the maths.

For practice and study only. Do not use it at a real table.

## Run it locally

```bash
npm ci
npm run dev       # local dev server
npm run check     # unit tests + production build (this is the deploy gate)
npm run e2e       # browser tests against a local build; set BASE_URL to test a live site
```

## Deploy to Cloudflare Pages

The site is fully static and deploys through Git integration (not Direct Upload, which can never be switched to Git later).

1. Push this repo to GitHub.
2. In Cloudflare: **Workers & Pages > Create > Pages > Import an existing Git repository** (not "Upload assets"), and pick this repo.
3. Project name `upcards`. Check the preview URL reads exactly `upcards.pages.dev` before saving; the name can't be changed later.
4. Production branch `main`, framework preset **Vite**, build command `npm run check`, output directory `dist`, root directory blank. Node is pinned by `.node-version`.
5. Save and Deploy. Every push to `main` redeploys, and a failing unit test stops the deploy. Branches named `preview/*` get their own preview URLs.

The footer shows the running version and commit (for example `v1.0.0 · abc1234`).

## License

MIT. Provided as is, with no warranty. See the disclaimer at the bottom of the app.

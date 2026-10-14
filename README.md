# Upcard

A blackjack study tool. It works out the best move from the cards still in the deck and shows the numbers behind it.

- **Calculator** — type in a hand you saw elsewhere and get the best move.
- **Simulator** — play for chips (no help, full report when you end the session) or in Trainer (hints on request, each hand marked).
- Custom rules, four counting systems, bankroll tools, and a batch simulator that plays up to a million hands to check the maths.

For practice and study only. Do not use it at a real table.

## Run it locally

```bash
npm install
npm run dev
```

## Deploy to Cloudflare Pages

1. Push this repo to GitHub.
2. In Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**, pick this repo.
3. Framework preset **Vite**, build command `npm run build`, output directory `dist`.
4. Deploy. Every push to `main` redeploys.

## License

MIT. Provided as is, with no warranty. See the disclaimer at the bottom of the app.

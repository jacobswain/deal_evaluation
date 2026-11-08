# Cedar Creek Deal Screen (deal_evaluation)

Single-page, password-protected screen for mineral/royalty packages: parse a broker teaser or PDF, review extracted fields, model PDP + PDNP cash flow, build a max bid, size an RBL, score financeability.

## Layout
- `src/model.js`: Arps decline, pricing, deductions, NPV/IRR, bid build, RBL borrowing base, scorecard, verdict.
- `src/parser.js`: teaser text parser (regex + heuristics).
- `src/app.js`, `src/styles.css`, `src/index.html`: UI. Chart.js 4.4.1 and pdf.js 3.11.174 load from cdnjs.
- `build.js`: inlines everything into `dist/plain.html` (gitignored, never committed).
- `scripts/deploy.sh`: test → build → PageCrypt encrypt → push `index.html` to the public `deal-screen` repo → enable Pages → wait for build.

## Commands
```bash
npm install
npm test                 # model + parser unit tests
npm run test:e2e         # encrypts with a throwaway test password, decrypts in headless Chromium, uploads a PDF, checks charts
export DEAL_SCREEN_PASSWORD='…'   # never commit this
npm run deploy           # rebuild, re-encrypt, publish
```
`npm run deploy` needs `gh` authenticated as the repo owner.

## Defaults
Every assumption is editable in the Inputs tab, saved in localStorage, and resettable per section. The default strip is NYMEX settles as of 2026-11-06 (calendar-year averages). RBL advance rates and bank decks are lender rules of thumb, not filed terms.

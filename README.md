# token-radar-01 entry

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Whenruq/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Whenruq/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar built for make.fun's "Build the best token launch radar"
bounty. `main.ts` (Node 22, standard library only) reads the sealed DefiLlama
snapshot at `/input/snapshot.json`, ranks every protocol that records no token
by an implied launch value, and writes a static dashboard a reader can use
offline: the ranked board, a detail view with a farm plan for every protocol,
and the live-token calibration the model was priced from.

## The model

Implied value follows only from the snapshot's own figures:

- **Category multiple** — the median market-cap / TVL of protocols in the same
  category whose token already trades (at least 3 samples, clamped to
  0.05–4x), else the global median. A pre-token protocol is priced the way the
  market prices its trading peers.
- **Growth** — the 7-day TVL change, clamped to −50%…+100%, weighted ×0.6.
- **Maturity** — days since DefiLlama began tracking the protocol, saturating
  at 1,460 days (multiplier 0.55 → 1.00).

`implied = TVL × multiple × growth × maturity`. The board covers the whole
watchlist and adds the strongest rankable pre-token protocols below the
watchlist floor (wrapped, staked, bridged and exchange products excluded, as
the watchlist rule does). Every row carries a seven-step farm plan with costs
and times, derived from the protocol's category, chains, TVL and age.

## Run it

```
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Outputs `board.json`, `data.js`, `dashboard/`, `screenshots/` and
`dossier.json` (via `vendor/makefun-board.ts`, the kit's library). Two runs
write the same bytes.

## What's inside

- `main.ts` — the program: snapshot in, board + dashboard data + dossier out.
- `lib/model.ts` — the scoring model and the farm-plan generator.
- `dashboard/` — the static page (index.html, app.css, app.js); renders
  offline from `data.js`, sortable and filterable, with a detail drawer per
  protocol showing the model's arithmetic and the farm plan.
- `screenshots/` — the board, a protocol's detail view, a filtered view.
- `vendor/makefun-board.ts` — the kit's dossier library, byte for byte.

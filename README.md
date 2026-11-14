# Token Radar — radar-3 size-fit board

Pre-token protocols ranked by implied launch value, from the sealed
DefiLlama snapshot (758 protocols at or above $5M TVL, fetched
2026-11-14). 200 rows: all 40 watchlist protocols plus the 160
pre-token protocols below the $50M floor with the most TVL, skipping
wrapped, staked and bridged products of tokens that already trade.

## The model

`log10(mcap) = 3.025 + 0.522 x log10(TVL)`, fitted by OLS at build time
on the snapshot's own 128 live-token peers (R² 0.19). Growth: 7-day TVL
change clamped to -60%/+120% at half weight. Maturity: 0.6 for a new
record, rising to 1.0 at 3 years tracked.

Backtest on the 128 peers (mean |log10 error|): size fit **0.6953** vs
flat 0.25x TVL **0.7726** — 10.0% better on the mean, 25.4% on the
median. Category-median comparables scored 0.8255, worse than flat,
so the model uses no category term.

Top implied value: $71,161,725. Bottom: $2,561,833.

## Farm plans

10 steps per protocol, each with a cost and a time: why this protocol,
a category action and follow-up, a per-chain gas/bridge note, a
per-size note, a weekly action, hold, claim, log, and a scam warning.
The same builder runs in `lib/model.ts` (board.json) and in
`dashboard/app.js` (detail view), so screenshots and code agree.

## Dashboard

Board (sortable, filterable), detail view per protocol, live-token
comparison view (mcap/TVL multiples and bars, median 0.223x), and a
model-fit panel stating the backtest. Static page, no network.

## Run

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Writes `out/board.json`, `out/data.js`, `out/dashboard/`,
`out/screenshots/` and `out/dossier.json`. Two runs are byte-identical.

## Files

- `main.ts` — entrypoint: reads the snapshot, writes the outputs
- `lib/model.ts` — size fit, board selection, farm-plan builder
- `dashboard/` — `index.html`, `app.css`, `app.js`
- `screenshots/` — board, detail and filtered views (1440x900)
- `vendor/makefun-board.ts` — dossier builder from the kit

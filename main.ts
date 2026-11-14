// main.ts — token-radar-01 entrypoint (radar-3).
//
// Reads the sealed snapshot, builds the 200-row board with lib/model.ts,
// and writes the graded outputs: board.json, the dashboard's data.js,
// dashboard/ and screenshots/ copies, and dossier.json via buildDossier.
//
// Run locally:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
// In the grading sandbox the same paths default to /input/snapshot.json
// and /output (MAKEFUN_OUTPUT_DIR), with no arguments at all.
//
// The program is deterministic: same snapshot in, same bytes out. No
// timestamps, no randomness, no network — the sandbox has none anyway.
import fs from 'node:fs';
import path from 'node:path';
import { buildBoard } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

function flagValue(argv: string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
  const prefixed = argv.find((a) => a.startsWith(name + '='));
  if (prefixed) return prefixed.slice(name.length + 1);
  return null;
}

function main(): void {
  const argv = process.argv.slice(2);
  const inputPath =
    flagValue(argv, '--input') ??
    process.env.MAKEFUN_INPUT ??
    '/input/snapshot.json';
  const outDir =
    flagValue(argv, '--output') ??
    process.env.MAKEFUN_OUTPUT_DIR ??
    '/output';
  const repoRoot = path.dirname(new URL(import.meta.url).pathname);

  const snapshot = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const board = buildBoard(snapshot);

  fs.mkdirSync(outDir, { recursive: true });

  // 1. The ranked board: exactly the five fields the gate reads per row.
  const boardJson = {
    model: {
      name: 'radar-3',
      kind: 'size-fit log-log, fitted on the snapshot’s own live-token peers',
      intercept: board.fit.intercept,
      slope: board.fit.slope,
      rSquared: board.fit.rSquared,
      peers: board.fit.peers,
      backtest: {
        fitMeanLogError: board.backtest.fitMean,
        fitMedianLogError: board.backtest.fitMedian,
        flatMeanLogError: board.backtest.flatMean,
        flatMedianLogError: board.backtest.flatMedian,
      },
      medianLiveMultiple: board.medianMultiple,
      flatTopUsd: board.flatTopUsd,
    },
    rows: board.rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      rank: r.rank,
      implied_value_usd: r.impliedUsd,
      farm_steps: r.farmSteps,
    })),
  };
  fs.writeFileSync(path.join(outDir, 'board.json'), JSON.stringify(boardJson, null, 2) + '\n');

  // 2. The dashboard's data, beside the page: board rows plus the
  // live-token comparison set the dashboard's second view renders.
  const data = {
    asOf: board.asOf,
    floorUsd: board.floorUsd,
    model: {
      name: 'radar-3',
      intercept: board.fit.intercept,
      slope: board.fit.slope,
      rSquared: board.fit.rSquared,
      peers: board.fit.peers,
      fitMae: board.backtest.fitMean,
      fitMedian: board.backtest.fitMedian,
      flatMae: board.backtest.flatMean,
      flatMedian: board.backtest.flatMedian,
      medianMultiple: board.medianMultiple,
      flatTopUsd: board.flatTopUsd,
    },
    rows: board.rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvlUsd: r.tvlUsd,
      change7d: r.change7d,
      ageDays: r.ageDays,
      watchlist: r.watchlist,
      impliedUsd: r.impliedUsd,
      rank: r.rank,
    })),
    live: board.live,
  };
  fs.writeFileSync(
    path.join(outDir, 'data.js'),
    'window.TOKEN_RADAR = ' + JSON.stringify(data, null, 2) + ';\n',
  );

  // 3. The dashboard and the screenshots, copied verbatim.
  fs.cpSync(path.join(repoRoot, 'dashboard'), path.join(outDir, 'dashboard'), {
    recursive: true,
  });
  const shotsDir = path.join(repoRoot, 'screenshots');
  const shotFiles = fs.existsSync(shotsDir)
    ? fs.readdirSync(shotsDir).filter((f) => !f.startsWith('.'))
    : [];
  if (shotFiles.length > 0) {
    fs.cpSync(shotsDir, path.join(outDir, 'screenshots'), { recursive: true });
  }

  // 4. The dossier the judge reads. It needs screenshots in place; on a
  // first local run before any screenshot exists it is skipped (and the
  // run still writes everything else), then rebuilt on the next run.
  if (shotFiles.length > 0) {
    const dossier = buildDossier(outDir, {
      text_max_bytes: 65536,
      screenshots: { max: 4, max_bytes: 524288 },
      dashboard: { max_files: 400, max_bytes: 4194304 },
    });
    fs.writeFileSync(path.join(outDir, 'dossier.json'), dossier);
  } else {
    console.warn('no screenshots yet — dossier.json skipped this run');
  }

  const top = board.rows[0];
  const bottom = board.rows[board.rows.length - 1];
  console.log(
    'radar-3 board: ' + board.rows.length + ' rows, top #' + top.rank + ' ' + top.slug +
    ' $' + top.impliedUsd + ', bottom #' + bottom.rank + ' ' + bottom.slug +
    ' $' + bottom.impliedUsd,
  );
  console.log(
    'size fit: intercept ' + board.fit.intercept.toFixed(4) + ', slope ' +
    board.fit.slope.toFixed(4) + ', R2 ' + board.fit.rSquared.toFixed(3) +
    ', peers ' + board.fit.peers,
  );
  console.log(
    'backtest mean |log10 err|: fit ' + board.backtest.fitMean.toFixed(4) +
    ' vs flat ' + board.backtest.flatMean.toFixed(4),
  );
}

main();

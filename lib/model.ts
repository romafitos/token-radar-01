// lib/model.ts — radar-3 value model and farm plans for token-radar-01.
//
// The model is a size fit: log10(market cap) is regressed on log10(TVL)
// over the snapshot's own live-token protocols (128 peers), fitted at build
// time from the snapshot itself — no hardcoded constants, no name list.
// A protocol's implied value is the fitted curve at its TVL, pulled by its
// 7-day growth (clamped) and by how long it has run with no token.
//
// Backtest on the same 128 peers (mean |log10 error|): size fit 0.6953 vs
// flat 0.25x TVL 0.7726 — 10.0% better on the mean, 25.4% on the median.
// Category-median comparables were tested and rejected: they score worse
// than flat (0.8255), so no category term is used anywhere in this model.
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface SizeFit {
  intercept: number;
  slope: number;
  rSquared: number;
  peers: number;
}

export interface Backtest {
  fitMean: number;
  fitMedian: number;
  flatMean: number;
  flatMedian: number;
}

export interface BoardRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvlUsd: number;
  change7d: number | null;
  ageDays: number | null;
  watchlist: boolean;
  impliedUsd: number;
  rank: number;
  farmSteps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  tvlUsd: number;
  mcapUsd: number;
  multiple: number;
}

export interface BuiltBoard {
  asOf: string;
  floorUsd: number;
  fit: SizeFit;
  backtest: Backtest;
  flatTopUsd: number;
  medianMultiple: number;
  rows: BoardRow[];
  live: LiveRow[];
}

export const MODEL_NAME = 'radar-3';
export const BOARD_ROWS = 200;
const FLAT_MULTIPLE = 0.25;
const DAY_MS = 86400000;
const MATURITY_DAYS = 1095;
const GROWTH_WEIGHT = 0.5;

// Categories the watchlist rule already treats as wrapped, staked or
// bridged products of a token that trades. The discovery set below the
// floor mirrors that spirit, so it never ranks a restaking wrapper as a
// fresh launch candidate.
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\bwrapped\b/i;

export function ageInDays(asOf: string, listedAt: string | null): number | null {
  if (!listedAt) return null;
  const start = Date.parse(asOf + 'T00:00:00Z');
  const listed = Date.parse(listedAt + 'T00:00:00Z');
  if (!Number.isFinite(start) || !Number.isFinite(listed)) return null;
  return Math.max(0, Math.floor((start - listed) / DAY_MS));
}

// 7-day TVL growth, clamped to -60%..+120%, at half weight.
export function growthFactor(change7d: number | null): number {
  const g = Math.min(120, Math.max(-60, change7d ?? 0));
  return 1 + (g / 100) * GROWTH_WEIGHT;
}

// Maturity: 0.6 for a brand-new record, rising to 1.0 at 3 years tracked.
export function maturityFactor(ageDays: number | null): number {
  const age = ageDays ?? 365;
  const capped = Math.min(Math.max(age, 0), MATURITY_DAYS);
  return 0.6 + (capped / MATURITY_DAYS) * 0.4;
}

function livePeers(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => p.mcap_usd != null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
}

export function fitSizeModel(snapshot: Snapshot): SizeFit {
  const peers = livePeers(snapshot);
  const xs = peers.map((p) => Math.log10(p.tvl_usd));
  const ys = peers.map((p) => Math.log10(p.mcap_usd as number));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) * (xs[i] - mx);
  }
  const slope = num / den;
  const intercept = my - slope * mx;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < xs.length; i++) {
    const fitted = intercept + slope * xs[i];
    ssTot += (ys[i] - my) * (ys[i] - my);
    ssRes += (ys[i] - fitted) * (ys[i] - fitted);
  }
  return { intercept, slope, rSquared: 1 - ssRes / ssTot, peers: peers.length };
}

export function impliedValueUsd(
  p: SnapshotProtocol,
  fit: SizeFit,
  asOf: string,
): number {
  const base = Math.pow(10, fit.intercept + fit.slope * Math.log10(p.tvl_usd));
  const age = ageInDays(asOf, p.listed_at);
  return Math.max(1, Math.round(base * growthFactor(p.change_7d) * maturityFactor(age)));
}

export function flatValueUsd(p: SnapshotProtocol, asOf: string): number {
  const age = ageInDays(asOf, p.listed_at);
  return Math.max(
    1,
    Math.round(p.tvl_usd * FLAT_MULTIPLE * growthFactor(p.change_7d) * maturityFactor(age)),
  );
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function meanOf(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function backtestModel(snapshot: Snapshot, fit: SizeFit): Backtest {
  const peers = livePeers(snapshot);
  const fitErrs: number[] = [];
  const flatErrs: number[] = [];
  for (const p of peers) {
    const actual = Math.log10(p.mcap_usd as number);
    fitErrs.push(Math.abs(Math.log10(impliedValueUsd(p, fit, snapshot.as_of)) - actual));
    flatErrs.push(Math.abs(Math.log10(flatValueUsd(p, snapshot.as_of)) - actual));
  }
  return {
    fitMean: meanOf(fitErrs),
    fitMedian: medianOf(fitErrs),
    flatMean: meanOf(flatErrs),
    flatMedian: medianOf(flatErrs),
  };
}

// ---- text helpers (mirrored in dashboard/app.js — keep both identical) ----

export function moneyShort(n: number): string {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + String(Math.round(n));
}

export function moneyFull(n: number): string {
  return '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function pctText(g: number | null): string {
  if (g == null) return 'n/a';
  return (g >= 0 ? '+' : '') + g.toFixed(1) + '%';
}

export function ageText(ageDays: number | null): string {
  if (ageDays == null) return 'age unreported';
  if (ageDays < 365) return ageDays + ' days';
  return (ageDays / 365).toFixed(1) + ' yrs';
}

export function gasText(chains: string[]): string {
  if (chains.includes('Ethereum')) return '$8-15';
  if (chains.includes('Bitcoin')) return '$5-20';
  if (chains.includes('Solana')) return 'under $0.01';
  return 'under $0.50';
}

function chainText(chains: string[]): string {
  if (chains.length <= 3) return chains.join(', ');
  return chains.slice(0, 3).join(', ') + ' +' + (chains.length - 3) + ' more';
}

// ---- farm plans: 10 concrete steps per protocol, each with cost/time ----

type CategoryPlay = [string, string];

const CATEGORY_PLAYS: Record<string, CategoryPlay> = {
  Dexs: [
    'Swap $25-50 through the deepest pool on {chain} twice this week; keep slippage under 0.5% and hold what you receive instead of swapping straight back. ~10 min per swap, gas ~{gas}.',
    'Add $25-50 of liquidity to the same pool for 2 weeks to earn fees and show sustained use; withdraw only after the position has aged. ~20 min to set up, gas ~{gas}.',
  ],
  Lending: [
    'Supply $25-50 of collateral on {chain} and borrow a small amount, under 30% of the collateral, to open a live borrow position. ~15 min, gas ~{gas}.',
    'Repay part of the borrow weekly and top up collateral if its health factor falls under 1.5; keep the position open for 4+ weeks. ~15 min per week, gas ~{gas}.',
  ],
  Yield: [
    'Deposit $25-50 into the highest-TVL vault on {chain} and leave it earning for at least 2 weeks. ~10 min, gas ~{gas}.',
    'Harvest or compound the yield weekly; move half the yield back into the vault to show compounding use. ~10 min per week, gas ~{gas}.',
  ],
  Bridge: [
    'Bridge $25-50 to {chain} through the protocol’s own bridge and use the received asset on the destination chain the same day. ~15 min, gas ~{gas}.',
    'Bridge back half the amount after a week so the record shows two-way use; keep receipts for both directions. ~15 min per bridge, gas ~{gas}.',
  ],
  RWA: [
    'Buy or mint $25-50 of the tokenised asset on {chain} and hold it in the wallet that will claim any launch reward. ~15 min, gas ~{gas}.',
    'Check the asset’s backing report monthly and add $25 on each new issuance to stay an active holder. ~15 min, gas ~{gas}.',
  ],
  Derivatives: [
    'Open a small $25-50 perpetual or options position on {chain} at under 2x leverage and close it after a day. ~15 min, gas ~{gas}.',
    'Repeat a small position weekly, alternating long and short, and never risk more than $50 per trade. ~15 min per trade, gas ~{gas}.',
  ],
  'Risk Curators': [
    'Deposit $25-50 into the curator vault with the longest track record on {chain} and read its strategy note before depositing. ~20 min, gas ~{gas}.',
    'Compare the vault’s weekly return against its benchmark and move $25 to a second curator after 2 weeks to diversify. ~20 min, gas ~{gas}.',
  ],
  'Liquid Staking': [
    'Stake $25-50 of the base asset through the protocol on {chain} and hold the liquid staking receipt in the same wallet. ~10 min, gas ~{gas}.',
    'Restake or compound the staking yield weekly; unstake only a small test amount first to check the exit works. ~10 min, gas ~{gas}.',
  ],
  'Onchain Capital Allocator': [
    'Allocate $25-50 to the allocator’s top strategy on {chain} and note the strategy’s stated risk and lock-up before confirming. ~20 min, gas ~{gas}.',
    'Review the allocation’s performance after 2 weeks and move $25 to a second strategy to show active management. ~20 min, gas ~{gas}.',
  ],
  'Leveraged Farming': [
    'Open a $25-50 leveraged farm position on {chain} at under 2x leverage and set a stop or health alert. ~15 min, gas ~{gas}.',
    'Close and reopen the position weekly to refresh activity, and cut leverage if the health factor nears 1.3. ~15 min per week, gas ~{gas}.',
  ],
  'Decentralized BTC': [
    'Deposit $25-50 of BTC value through the protocol’s Bitcoin route on {chain} and confirm the deposit lands on-chain. ~30 min, gas ~{gas}.',
    'Use the wrapped or vault position in one more protocol action (lend or swap) so the record shows two uses, not one deposit. ~30 min, gas ~{gas}.',
  ],
  Restaking: [
    'Restake $25-50 through the protocol on {chain} and hold the restaking receipt; check the operator’s slash history first. ~15 min, gas ~{gas}.',
    'Delegate to a second operator after 2 weeks and keep the total restaked under $100 until the token exists. ~15 min, gas ~{gas}.',
  ],
  CDP: [
    'Mint $25-50 of the stable asset against $50+ of collateral on {chain}, keeping collateral above 200%. ~15 min, gas ~{gas}.',
    'Repay $10 of the minted amount weekly and watch the collateral ratio after each market move. ~15 min per week, gas ~{gas}.',
  ],
  Options: [
    'Buy a $25-50 low-cost option on {chain} expiring in 2+ weeks and let it run to expiry or close at 2x. ~15 min, gas ~{gas}.',
    'Repeat monthly with a different strike; never spend more than $50 per month on options. ~15 min per trade, gas ~{gas}.',
  ],
};

export function categoryPlay(category: string | null): CategoryPlay {
  if (category && CATEGORY_PLAYS[category]) return CATEGORY_PLAYS[category];
  const label = category ?? 'protocol';
  return [
    'Use the protocol’s main ' + label + ' flow on {chain}: put $25-50 to work in its core action twice this week and confirm the position shows in the app. ~20 min, gas ~{gas}.',
    'Repeat the core action weekly for 4 weeks, varying the amount slightly ($25-50) so the record shows sustained, human use. ~20 min per week, gas ~{gas}.',
  ];
}

function fill(template: string, chain: string, gas: string): string {
  return template.replaceAll('{chain}', chain).replaceAll('{gas}', gas);
}

function chainNote(chains: string[]): string {
  let note = 'Chains: ' + chainText(chains) + '.';
  if (chains.includes('Ethereum')) {
    note += ' Ethereum transactions cost $8-15 each, so batch actions and farm during low-gas hours.';
  }
  if (chains.includes('Solana')) {
    note += ' Solana transactions cost under $0.01, so small frequent actions are cheap.';
  }
  if (chains.includes('Bitcoin')) {
    note += ' Bitcoin route: use the protocol’s official bridge only, expect $5-20 in fees, and allow 30-60 min for confirmation.';
  }
  if (!chains.includes('Ethereum') && !chains.includes('Solana') && !chains.includes('Bitcoin')) {
    note += ' Most of these are low-fee L2s or alt-L1s at under $0.50 per transaction.';
  }
  return note;
}

function sizeNote(tvlUsd: number): string {
  if (tvlUsd >= 1e9) {
    return (
      'At ' + moneyShort(tvlUsd) + ' TVL this is a large protocol: split activity across 2 wallets ' +
      '($25-50 each) so no single wallet looks farmed, and expect any launch to be widely shared. Setup ~30 min.'
    );
  }
  if (tvlUsd >= 1e8) {
    return (
      'At ' + moneyShort(tvlUsd) + ' TVL this is mid-size: one wallet with $25-50 is enough, and a launch ' +
      'here would be competitive but not crowded. Setup ~20 min.'
    );
  }
  return (
    'At ' + moneyShort(tvlUsd) + ' TVL this is early and small: re-check TVL monthly, keep positions ' +
    'small ($25), and be ready to add $25 if TVL doubles. Checking takes ~5 min a month.'
  );
}

export function buildFarmSteps(p: SnapshotProtocol, fit: SizeFit, asOf: string): string[] {
  const age = ageInDays(asOf, p.listed_at);
  const implied = impliedValueUsd(p, fit, asOf);
  const chain = p.chains.length > 0 ? p.chains[0] : 'its main chain';
  const gas = gasText(p.chains);
  const play = categoryPlay(p.category);
  const growth =
    p.change_7d == null ? '7d change unreported' : pctText(p.change_7d) + ' in 7 days';
  const why =
    p.name + ' records no token yet: ' + (p.category ?? 'uncategorised') + ' protocol on ' +
    chainText(p.chains) + ', ' + moneyShort(p.tvl_usd) + ' TVL (' + growth + ', tracked ' +
    ageText(age) + '). The size-fit model prices a launch at ' + moneyShort(implied) +
    ' — farm it now while the record is early. Research time ~15 min, $0.';
  return [
    why,
    fill(play[0], chain, gas),
    fill(play[1], chain, gas),
    chainNote(p.chains) + ' Total gas budget for this plan: ~' + gas + ' per action over 4 weeks.',
    sizeNote(p.tvl_usd),
    'Every week, repeat the core action once ($25-50) and use one new feature of the app (a new pool, vault or market) so the record shows breadth, not repetition. ~20-40 min per week, gas ~' + gas + '.',
    'Hold the position for at least 4 weeks without withdrawing: snapshots reward patience, and churning in and out reads as farming. Waiting costs $0, just discipline.',
    'If a token launches, claim only through the protocol’s official app or site: verify the URL from its official social accounts first, never sign a blind approval, and expect ~' + gas + ' gas and ~10 min.',
    'Log every transaction hash, date and amount in a notes file, and screenshot balances weekly: if a claim needs proof, the log is the proof. ~5 min per week, $0.',
    'No token exists yet, so any token, presale or “claim now” link is a scam: check the protocol’s official channels before every session and report fakes. ~5 min per session, $0.',
  ];
}

function isDiscoveryCandidate(p: SnapshotProtocol): boolean {
  if (EXCLUDED_CATEGORIES.has(p.category ?? '')) return false;
  if (VERSION_MARKER.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (/stak/i.test(p.name + ' ' + (p.category ?? ''))) return false;
  return true;
}

export function buildBoard(snapshot: Snapshot): BuiltBoard {
  const fit = fitSizeModel(snapshot);
  const backtest = backtestModel(snapshot, fit);
  const watchlist = new Set(snapshot.watchlist);
  const watchRows = snapshot.protocols.filter((p) => watchlist.has(p.slug));
  const extras = snapshot.protocols
    .filter(
      (p) =>
        p.mcap_usd == null &&
        !watchlist.has(p.slug) &&
        p.tvl_usd < snapshot.floor_usd &&
        isDiscoveryCandidate(p),
    )
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, BOARD_ROWS - watchRows.length);
  const picked = [...watchRows, ...extras];
  const rows: BoardRow[] = picked
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvlUsd: p.tvl_usd,
      change7d: p.change_7d,
      ageDays: ageInDays(snapshot.as_of, p.listed_at),
      watchlist: watchlist.has(p.slug),
      impliedUsd: impliedValueUsd(p, fit, snapshot.as_of),
      rank: 0,
      farmSteps: buildFarmSteps(p, fit, snapshot.as_of),
    }))
    .sort((a, b) => b.impliedUsd - a.impliedUsd || (a.slug < b.slug ? -1 : 1));
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  const flatTopUsd = Math.max(...rows.map((r) => {
    const p = snapshot.protocols.find((x) => x.slug === r.slug) as SnapshotProtocol;
    return flatValueUsd(p, snapshot.as_of);
  }));
  const live: LiveRow[] = livePeers(snapshot)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      tvlUsd: p.tvl_usd,
      mcapUsd: p.mcap_usd as number,
      multiple: (p.mcap_usd as number) / p.tvl_usd,
    }))
    .sort((a, b) => b.multiple - a.multiple);
  return {
    asOf: snapshot.as_of,
    floorUsd: snapshot.floor_usd,
    fit,
    backtest,
    flatTopUsd,
    medianMultiple: medianOf(live.map((r) => r.multiple)),
    rows,
    live,
  };
}

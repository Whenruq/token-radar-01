// The token radar's model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds the
// strongest pre-token protocols below the watchlist floor: the early rows the radar exists to find.
// A protocol is pre-token when its snapshot entry records no token (no market cap, no CoinGecko id,
// no symbol). Protocols whose token already trades are never ranked; they calibrate the model and
// are shown apart, at the market's own values.
//
// Implied value follows only from the snapshot's own figures:
//
//   multiple   = the category's median market-cap / TVL among protocols whose token already trades
//                (at least 3 samples, else the global median), clamped to [0.05, 4]
//   base       = tvl_usd x multiple
//   growthMult = 1 + clamp(change_7d, -50, 100) / 100 x 0.6
//   maturity   = 0.55 + 0.45 x min(age_days, 1460) / 1460   (age unknown: 365)
//   implied    = max(1, round(base x growthMult x maturity))
//
// The multiple is read off the snapshot itself, so the model prices a pre-token protocol the way
// the market already prices its trading peers. No protocol name is ever special-cased: the same
// function scores every row, and the dashboard states the constants beside the board.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  multiple_floor: number;
  multiple_cap: number;
  multiple_min_samples: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  multiple_floor: 0.05,
  multiple_cap: 4,
  multiple_min_samples: 3,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1460,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it beside the board. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 260;

/** How many live-token protocols the calibration view carries, by market cap. */
export const LIVE_ROWS = 30;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  signal_score: number;
  model: {
    category_multiple: number;
    multiple_source: 'category' | 'global';
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one row: the board row's figures plus its farm plan, verbatim. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  signal_score: number;
  category_multiple: number;
  multiple_source: 'category' | 'global';
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl_multiple: number | null;
}

/** One category's calibration: how the market prices its trading members. */
export interface CategoryCalibration {
  category: string;
  samples: number;
  median_multiple: number;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_multiple: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  scanned: number;
  total_implied_usd: number;
  rows: RadarRow[];
  live: LiveRow[];
  calibration: CategoryCalibration[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are wrapped, staked or bridged products of a token that already trades. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** A whole word wrapped, staked or staking anywhere in the name. */
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;

/** Exchange names a product's name may begin with. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/**
 * Whether a protocol is one the radar may rank: pre-token, and not a wrapped, staked or bridged
 * product of a token that trades. The rule mirrors the house's watchlist rule, applied below the
 * floor as well, so the early rows are early protocols, not products of live ones.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (PRODUCT_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The mcap/TVL multiples of every protocol whose token trades, grouped by category. */
export function categoryMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): { global: number; byCategory: Map<string, CategoryCalibration> } {
  const all: number[] = [];
  const grouped = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const multiple = p.mcap_usd / p.tvl_usd;
    all.push(multiple);
    if (p.category !== null) {
      const list = grouped.get(p.category) ?? [];
      list.push(multiple);
      grouped.set(p.category, list);
    }
  }
  const clamp = (n: number): number => Math.min(model.multiple_cap, Math.max(model.multiple_floor, n));
  const global = all.length > 0 ? clamp(median(all)) : 0.25;
  const byCategory = new Map<string, CategoryCalibration>();
  for (const [category, values] of grouped) {
    if (values.length >= model.multiple_min_samples) {
      byCategory.set(category, { category, samples: values.length, median_multiple: round4(clamp(median(values))) });
    }
  }
  return { global: round4(global), byCategory };
}

/** The multiple one protocol gets: its category's median where the snapshot supports one. */
export function multipleFor(p: SnapshotProtocol, calibration: { global: number; byCategory: Map<string, CategoryCalibration> }): { multiple: number; source: 'category' | 'global' } {
  if (p.category !== null) {
    const entry = calibration.byCategory.get(p.category);
    if (entry !== undefined) return { multiple: entry.median_multiple, source: 'category' };
  }
  return { multiple: calibration.global, source: 'global' };
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiple: number,
  model: ModelConstants,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult));
  return { implied, growthPct, growthMult, maturityMult, age };
}

/**
 * A 0-100 signal score for the dashboard's at-a-glance bar: scale (log TVL), momentum (7-day
 * growth), endurance (age with no token) and reach (chains). Rank stays by implied value; the
 * signal is a reading aid, never a second ranking.
 */
export function signalScore(p: SnapshotProtocol, age: number | null, model: ModelConstants = MODEL): number {
  const tvlPart = Math.min(1, Math.max(0, (Math.log10(Math.max(p.tvl_usd, 1)) - 6) / (Math.log10(3e9) - 6)));
  const growth = Math.min(60, Math.max(-30, finite(p.change_7d, 0)));
  const growthPart = (growth + 30) / 90;
  const agePart = Math.min(age ?? model.unknown_age_days, model.maturity_days) / model.maturity_days;
  const chainPart = Math.min(p.chains.length, 5) / 5;
  return Math.round(100 * (0.45 * tvlPart + 0.25 * growthPart + 0.2 * agePart + 0.1 * chainPart));
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);
  const calibration = categoryMultiples(snapshot, model);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug the snapshot carries goes on the board.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable pre-token protocols below the watchlist floor, by TVL, capped.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { multiple, source } = multipleFor(p, calibration);
    const { implied, growthPct, growthMult, maturityMult, age } = impliedValue(p, snapshot.as_of, multiple, model);
    return { p, multiple, source, implied, growthPct, growthMult, maturityMult, age, signal: signalScore(p, age, model) };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    on_watchlist: watchlist.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    signal_score: s.signal,
    model: {
      category_multiple: s.multiple,
      multiple_source: s.source,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 500;
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 10_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 90;
  if (age < 365) return 60;
  if (age < 730) return 45;
  return 30;
}

/** The category's main farming action, in words a farmer can follow. */
function mainAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend')) return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow a small amount against it and repay, so both sides of the market record your wallet.`;
  if (c.includes('cdp')) return `Open a vault on ${name} (${chain}) with $${capital} of collateral, mint a modest amount of its stablecoin, and keep the vault healthy.`;
  if (c.includes('dex')) return `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain}, split across the pair's two assets, and leave the position in place.`;
  if (c.includes('yield aggregator')) return `Deposit $${capital} into ${name}'s highest-TVL vault on ${chain} and let the strategy compound; do not chase the highest APY vault.`;
  if (c.includes('yield')) return `Deposit $${capital} into ${name}'s main yield product on ${chain} and keep the receipt token in the same wallet.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} — pick the vault with the most depositors, not the highest rate — and keep the shares.`;
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('basis')) return `Deposit $${capital} of USDC as margin on ${name} and trade small, hedged positions so volume, not direction, is what the protocol records.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} and take a few small positions in its most active markets, spread over several days.`;
  if (c.includes('rwa')) return `Mint or buy $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it; note any lock-up before you commit.`;
  if (c.includes('staking pool') || c.includes('staking')) return `Stake $${capital} of the chain's asset through ${name} on ${chain} and keep the liquid receipt in the farming wallet.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} for a position you already hold, and keep the policy active.`;
  if (c.includes('stable')) return `Mint $${capital} of ${name}'s stable asset on ${chain}, use it once inside the app, and hold the balance.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC through ${name} to ${chain} and make one transaction on the far side so both ends record activity.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} through its own app and keep the position open.`;
}

/** A second, distinct qualifying action for the same protocol. */
function secondAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend')) return `A week later, add $${Math.round(capital / 2)} more supply on ${chain} and leave a small borrow open overnight before repaying.`;
  if (c.includes('dex')) return `Swap a small amount through ${name} on ${chain} once a week; real usage beside the LP position reads better than either alone.`;
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('basis')) return `Add one more small trade on ${name} each week and keep total fees under 1% of the margin you deposited.`;
  if (c.includes('curator') || c.includes('allocator')) return `Split a second, smaller deposit into another ${name} vault on ${chain} so the wallet is active in more than one strategy.`;
  if (c.includes('prediction')) return `Return to ${name} weekly and settle or roll one position, so the account shows activity across several market cycles.`;
  return `Make one more qualifying action on ${name} each week — a deposit, a swap, a vote or a claim — sized small enough that gas stays trivial.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 250 ? 8 : capital >= 100 ? 5 : 3;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline and never typed into a website.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: mainAction(p, capital, chain),
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondAction(p, capital, chain),
      cost: 'about $2 of gas each time',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, and top it up once midway.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Open ${p.name}'s own points, rewards or quests page from its official site once a week and finish any free task it lists.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes a week',
    },
    {
      text: `Before you withdraw, check the same official page for a claim window; a real airdrop never asks for your seed phrase or a payment.`,
      cost: 'nothing but attention',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log so you can repeat the position or unwind it cleanly.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's calibration view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl_multiple: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's dashboard form: the same figures and the same farm plan board.json carries. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    on_watchlist: row.on_watchlist,
    implied_value_usd: row.implied_value_usd,
    signal_score: row.signal_score,
    category_multiple: row.model.category_multiple,
    multiple_source: row.model.multiple_source,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const calibration = categoryMultiples(snapshot, model);
  const early = board.filter((r) => !r.on_watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_multiple: calibration.global,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    scanned: snapshot.protocols.length,
    total_implied_usd: board.reduce((sum, r) => sum + r.implied_value_usd, 0),
    rows: board.map(radarRow),
    live,
    calibration: [...calibration.byCategory.values()].sort((a, b) => b.samples - a.samples),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows, under the gate's 100`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

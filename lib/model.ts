// Ashlar comparable: implied value from this snapshot only.
//
// A protocol that already records a market cap supplies a mcap/TVL ratio. Each ratio is clipped to
// this file's 10th–90th percentile before any median, so one tiny book with a huge recorded cap
// cannot set a category. Each category median is then shrunk toward the file-wide median
// (8 pseudo-peers). A protocol that records no token is scored as:
//
//   implied = TVL × shrunk multiple × breadth × momentum × tenure
//
// rounded to a whole dollar. Breadth, momentum and tenure stay inside a few percent. The result is
// a comparable, not a forecast that a token will be issued and not a price.

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

export const MODEL_VERSION = 'ashlar-comparable-1';
export const SHRINK_PSEUDO = 8;
export const MOMENTUM_CLAMP = 30;
export const MOMENTUM_BPS_PER_PCT = 20;
export const TENURE_FLOOR_BPS = 9000;
export const TENURE_SPAN_BPS = 1000;
export const TENURE_DAYS = 540;
export const UNKNOWN_TENURE_BPS = 9600;

const BAD_CATEGORY = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const VERSION_TAIL = /\s(?:V\d+(?:\.\d+)?|v\d+(?:\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(?:wrapped|staked|staking)\b/i;
const EXCHANGE_HEAD = /^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  on_watchlist: boolean;
  list_role: 'watch' | 'early' | 'gap';
  age_days: number | null;
  multiple_bps: number;
  category_median_bps: number | null;
  peer_n: number;
  global_median_bps: number;
  breadth_bps: number;
  momentum_bps: number;
  tenure_bps: number;
}

export interface RadarData {
  model_version: string;
  as_of: string;
  source: string;
  floor_usd: number;
  shrink_pseudo: number;
  global_median_bps: number;
  clip_low_bps: number;
  clip_high_bps: number;
  peer_n: number;
  watchlist_size: number;
  row_count: number;
  rows: BoardRow[];
}

export function parseSnapshot(text: string): Snapshot {
  const doc = JSON.parse(text) as Snapshot;
  if (!Array.isArray(doc.protocols) || !Array.isArray(doc.watchlist) || typeof doc.as_of !== 'string') {
    throw new Error('snapshot: expected as_of, protocols and watchlist');
  }
  return doc;
}

function recordsToken(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

function fieldClean(p: SnapshotProtocol): boolean {
  if (recordsToken(p)) return false;
  if (p.category !== null && BAD_CATEGORY.has(p.category)) return false;
  if (VERSION_TAIL.test(p.name) || WRAPPED_WORD.test(p.name) || EXCHANGE_HEAD.test(p.name)) return false;
  return true;
}

function utcDay(iso: string): number {
  const [y, m, d] = iso.split('-').map((part) => Number(part));
  return Math.floor(Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

function median(sorted: number[]): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  if (n % 2 === 1) return sorted[(n - 1) / 2]!;
  return Math.round((sorted[n / 2 - 1]! + sorted[n / 2]!) / 2);
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.round((sorted.length - 1) * p);
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))]!;
}

function breadthBps(chains: number): number {
  if (chains <= 1) return 10_000;
  if (chains === 2) return 10_200;
  if (chains === 3) return 10_400;
  return 10_600;
}

function momentumBps(change: number | null): number {
  if (change === null) return 10_000;
  const clamped = Math.max(-MOMENTUM_CLAMP, Math.min(MOMENTUM_CLAMP, change));
  return 10_000 + Math.round(clamped * MOMENTUM_BPS_PER_PCT);
}

function tenureBps(age: number | null): number {
  if (age === null) return UNKNOWN_TENURE_BPS;
  const days = Math.max(0, Math.min(TENURE_DAYS, age));
  return TENURE_FLOOR_BPS + Math.round((days * TENURE_SPAN_BPS) / TENURE_DAYS);
}

function usd(n: number): string {
  const sign = n < 0 ? '-' : '';
  const body = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${body}`;
}

function multipleText(bps: number): string {
  const whole = Math.trunc(bps / 10_000);
  const frac = String(Math.abs(bps % 10_000)).padStart(4, '0');
  return `${whole}.${frac}x`;
}

function chainText(chains: string[]): string {
  if (chains.length === 0) return 'no chain named in the snapshot';
  if (chains.length <= 4) return chains.join(', ');
  return `${chains.slice(0, 4).join(', ')} and ${chains.length - 4} more`;
}

function opener(p: SnapshotProtocol): string {
  const where = chainText(p.chains);
  const tvl = usd(p.tvl_usd);
  const cat = p.category ?? 'an unnamed category';
  if (p.category === 'Dexs') {
    return `On ${where}, open the pool or book that DefiLlama counts as ${p.name} and compare its visible depth with the recorded TVL of ${tvl}. This file lists no pool address.`;
  }
  if (p.category === 'Lending') {
    return `If you supply assets to ${p.name} on ${where}, treat ${tvl} as the recorded book, not a rate. Utilization, collateral factors and liquidations are not in the snapshot.`;
  }
  if (p.category === 'RWA') {
    return `Before sizing ${p.name}, identify the off-chain asset in the app on ${where}. Recorded TVL is ${tvl}; the snapshot does not name the issuer, the legal wrapper or the redemption terms.`;
  }
  if (p.category === 'Derivatives') {
    return `Use ${p.name} on ${where} only after you can see margin and funding in the app. The snapshot records ${tvl} of TVL and no funding rate, open interest or insurance fund.`;
  }
  if (p.category === 'CDP') {
    return `A position in ${p.name} means posting collateral on ${where}. Recorded TVL is ${tvl}. Liquidation thresholds and oracle sources are not in this file, so read them in the app before minting.`;
  }
  if (p.category === 'Risk Curators' || p.category === 'Onchain Capital Allocator') {
    return `Capital in ${p.name} is handed to a strategy on ${where}, not to a token you can price here. Recorded TVL is ${tvl}. The snapshot has no mandate, no fee and no withdrawal clock.`;
  }
  if (cat === 'Yield' || cat === 'Yield Aggregator' || cat === 'Farm') {
    return `If you deposit in ${p.name} on ${where}, do not read the recorded TVL of ${tvl} as a yield. The snapshot has no APY, no reward token and no schedule.`;
  }
  return `Open ${p.name} (${cat}) on ${where} and confirm the app in front of you is the one counted at ${tvl} of TVL. The snapshot carries no contract address.`;
}

function farmSteps(p: SnapshotProtocol, row: Omit<BoardRow, 'farm_steps'>, floor: number): string[] {
  const change = p.change_7d === null ? 'unreported' : `${p.change_7d}%`;
  const cap = Math.max(1, Math.round(p.tvl_usd * 5 / 10_000));
  const cat = p.category ?? 'Uncategorized';
  const peers = row.peer_n === 0
    ? `no tokenized ${cat} peer in this file, so the multiple is the file-wide median ${multipleText(row.global_median_bps)}`
    : `${row.peer_n} tokenized ${cat} peers have a median ${multipleText(row.category_median_bps ?? 0)}, shrunk toward the file-wide median ${multipleText(row.global_median_bps)} with ${SHRINK_PSEUDO} pseudo-peers`;
  let list: string;
  if (row.list_role === 'watch') {
    list = `${p.name} is on the house watchlist: TVL at or above ${usd(floor)}, no gecko id and no symbol in this file, and it passed the house wrapped-product screen. A missing record is not proof that no token exists.`;
  } else if (row.list_role === 'gap') {
    list = `${p.name} records no token and sits above ${usd(floor)}, but the house watchlist leaves it out. parentProtocol is not a field in this file; it may be someone else's product. Treat the comparable as weaker.`;
  } else {
    list = `${p.name} is under the ${usd(floor)} watchlist floor, with no gecko id and no symbol recorded. The same multiple is applied; the smaller book is why the implied value is smaller.`;
  }
  return [
    opener(p),
    `Keep a first live size under five basis points of recorded TVL, ${usd(cap)} at this snapshot's figure. That is a research cap so you are not the book, and it ignores slippage and withdrawal delays.`,
    `The seven-day TVL change is ${change}. Use it only as a reason to look again before adding size. It is not a yield, a price return or evidence that a token is coming.`,
    `The implied value ${usd(row.implied_value_usd)} is recorded TVL times ${multipleText(row.multiple_bps)} after small breadth, momentum and tenure adjustments. ${peers}. It is not a market price and not an offer.`,
    list,
    `This snapshot is frozen at ${row.listed_at === null ? 'an unknown listing day' : `${p.name} tracked since ${row.listed_at}`} and the file date is fixed. Recheck the app before and after any deposit; nothing here updates, settles or signs a transaction.`,
  ];
}

function listRole(onWatch: boolean, tvl: number, floor: number): BoardRow['list_role'] {
  if (onWatch) return 'watch';
  if (tvl >= floor) return 'gap';
  return 'early';
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const floor = snapshot.floor_usd;
  const asOf = utcDay(snapshot.as_of);
  const watch = new Set(snapshot.watchlist);
  const byCategory = new Map<string, number[]>();
  const allRatios: number[] = [];
  for (const p of snapshot.protocols) {
    if (!recordsToken(p) || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const bps = Math.round((p.mcap_usd * 10_000) / p.tvl_usd);
    allRatios.push(bps);
    const key = p.category ?? '';
    const bucket = byCategory.get(key);
    if (bucket) bucket.push(bps);
    else byCategory.set(key, [bps]);
  }
  allRatios.sort((a, b) => a - b);
  const clipLow = percentile(allRatios, 0.1);
  const clipHigh = percentile(allRatios, 0.9);
  const clipped = allRatios.map((bps) => Math.max(clipLow, Math.min(clipHigh, bps)));
  const globalMedian = median(clipped);
  if (globalMedian === null) throw new Error('snapshot: no tokenized peer with both TVL and market cap');
  const categoryMedian = new Map<string, { n: number; bps: number }>();
  for (const [key, ratios] of byCategory) {
    const sorted = ratios.map((bps) => Math.max(clipLow, Math.min(clipHigh, bps))).sort((a, b) => a - b);
    const mid = median(sorted);
    if (mid !== null) categoryMedian.set(key, { n: sorted.length, bps: mid });
  }

  const drafts: Omit<BoardRow, 'farm_steps' | 'rank'>[] = [];
  for (const p of snapshot.protocols) {
    const onWatch = watch.has(p.slug);
    if (!onWatch && !fieldClean(p)) continue;
    const key = p.category ?? '';
    const peers = categoryMedian.get(key);
    const peerN = peers?.n ?? 0;
    const catBps = peers?.bps ?? null;
    const multiple = peerN === 0 ? globalMedian : Math.round((peerN * peers!.bps + SHRINK_PSEUDO * globalMedian) / (peerN + SHRINK_PSEUDO));
    const age = p.listed_at === null ? null : asOf - utcDay(p.listed_at);
    const breadth = breadthBps(p.chains.length);
    const momentum = momentumBps(p.change_7d);
    const tenure = tenureBps(age);
    let implied = p.tvl_usd;
    implied = Math.round((implied * multiple) / 10_000);
    implied = Math.round((implied * breadth) / 10_000);
    implied = Math.round((implied * momentum) / 10_000);
    implied = Math.round((implied * tenure) / 10_000);
    if (!Number.isSafeInteger(implied) || implied > 100_000_000_000_000) {
      throw new Error(`implied value out of range for ${p.slug}`);
    }
    implied = Math.max(1, implied);
    drafts.push({
      slug: p.slug,
      name: p.name,
      implied_value_usd: implied,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      on_watchlist: onWatch,
      list_role: listRole(onWatch, p.tvl_usd, floor),
      age_days: age,
      multiple_bps: multiple,
      category_median_bps: catBps,
      peer_n: peerN,
      global_median_bps: globalMedian,
      breadth_bps: breadth,
      momentum_bps: momentum,
      tenure_bps: tenure,
    });
  }

  drafts.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const board: BoardRow[] = drafts.map((row, i) => {
    const ranked = { ...row, rank: i + 1 };
    return { ...ranked, farm_steps: farmSteps(
      {
        slug: row.slug,
        name: row.name,
        category: row.category,
        chains: row.chains,
        tvl_usd: row.tvl_usd,
        change_7d: row.change_7d,
        mcap_usd: null,
        listed_at: row.listed_at,
        gecko_id: null,
        symbol: null,
      },
      ranked,
      floor,
    ) };
  });

  const radar: RadarData = {
    model_version: MODEL_VERSION,
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: floor,
    shrink_pseudo: SHRINK_PSEUDO,
    global_median_bps: globalMedian,
    clip_low_bps: clipLow,
    clip_high_bps: clipHigh,
    peer_n: allRatios.length,
    watchlist_size: snapshot.watchlist.length,
    row_count: board.length,
    rows: board,
  };
  return { board, radar };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `row count ${board.length}`;
  const seen = new Set<string>();
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  let prev = Infinity;
  let distinct = 0;
  const values = new Set<number>();
  for (const row of board) {
    if (!slugs.has(row.slug) || seen.has(row.slug) || row.name.trim() === '') return `bad identity ${row.slug}`;
    seen.add(row.slug);
    if (row.rank !== distinct + 1) return `rank ${row.rank} at ${row.slug}`;
    distinct += 1;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd < 1 || row.implied_value_usd > prev) return `value ${row.slug}`;
    prev = row.implied_value_usd;
    values.add(row.implied_value_usd);
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `steps ${row.slug}`;
    for (const step of row.farm_steps) {
      const n = step.trim().length;
      if (n < 20 || n > 600) return `step length ${n} on ${row.slug}`;
    }
  }
  if (values.size < 2) return 'implied values are constant';
  for (const slug of snapshot.watchlist) if (!seen.has(slug)) return `missing watchlist ${slug}`;
  const outside = board.filter((row) => !snapshot.watchlist.includes(row.slug)).length;
  if (outside < 60) return `only ${outside} rows outside the watchlist`;
  return null;
}

export function dataScript(radar: RadarData): string {
  return `globalThis.ASHLAR=${JSON.stringify(radar)};\n`;
}

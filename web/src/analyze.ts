import {
  calendarDate,
  doorplateProperty,
  exclusionReason,
  formatLotNumber,
  listingUrlProperty,
  MicroPricingInputError,
  parseLandParcelProperty,
  quoteMarket,
  type MarketQuote,
  type Property,
} from "../../src/micro-pricing/index.js";
import { corpusNote, type DemoCorpus } from "./fixtures.js";
import type { InteriorActualPriceFeed } from "./services/api.js";

const LOT_QUERY = /^(.+?[縣市])(.+?(?:區|鄉|鎮|市))(.+?段)\s*(\d{1,4}(?:-\d{1,4})?)$/u;

export type StageLamp = "baseline" | "expanded" | "stopped";

export type StageView = {
  readonly lamp: StageLamp;
  readonly tone: "green" | "yellow" | "red";
  readonly title: string;
  readonly detail: string;
};

export type DealRow = {
  readonly id: string;
  readonly address: string;
  readonly tradedOn: string;
  readonly distanceMeters: number;
  readonly assetLabel: string;
  readonly verdict: string;
  readonly included: boolean;
};

export type AnalysisView = {
  readonly subjectLabel: string;
  readonly corpus: DemoCorpus;
  readonly note: string;
  readonly quote: MarketQuote;
  readonly stage: StageView;
  readonly excludedParking: number;
  readonly excludedLand: number;
  readonly inseparable: number;
  readonly rows: readonly DealRow[];
};

export function readSubject(raw: string): string {
  const text = raw.trim();
  if (text.length === 0) {
    throw new MicroPricingInputError("請輸入門牌地址或地號");
  }
  subjectFromQuery(text);
  return text;
}

export function analyzeQuery(raw: string, feed: InteriorActualPriceFeed): AnalysisView {
  const text = readSubject(raw);
  const subject = subjectFromQuery(text);
  const corpus = feed.corpus;
  const quote = quoteMarket({
    subject,
    asOf: calendarDate(feed.asOf),
    api: { listings: feed.listings },
  });
  const included = includedIds(quote);
  let excludedParking = 0;
  let excludedLand = 0;
  let inseparable = 0;
  const rows: DealRow[] = [];

  for (const record of quote.result.history.records) {
    const reason = exclusionReason(record.deal);
    if (reason === "pure-parking") excludedParking += 1;
    if (reason === "pure-land") excludedLand += 1;
    if (reason === "parking-not-separable") inseparable += 1;
    rows.push({
      id: record.deal.id,
      address: record.deal.publishedAddress,
      tradedOn: record.deal.tradedOn,
      distanceMeters: record.distanceMeters,
      assetLabel: assetLabel(record.deal.asset),
      verdict: verdictLabel(reason),
      included: included.has(record.deal.id),
    });
  }

  rows.sort((left, right) => left.distanceMeters - right.distanceMeters);

  return {
    subjectLabel: formatSubject(subject),
    corpus,
    note: feed.note || corpusNote(corpus),
    quote,
    stage: stageView(quote),
    excludedParking,
    excludedLand,
    inseparable,
    rows,
  };
}

export function phaseLabel(phase: string): string {
  switch (phase) {
    case "baseline":
      return "基準窗";
    case "time-widened":
      return "放寬時間";
    case "distance-widened":
      return "放寬距離";
    case "exhausted":
      return "停止擴張";
    default:
      return phase;
  }
}

function subjectFromQuery(text: string): Property {
  if (/^https?:\/\//i.test(text)) {
    return listingUrlProperty(text);
  }
  const lot = LOT_QUERY.exec(text);
  if (lot !== null) {
    const county = lot[1];
    const district = lot[2];
    const section = lot[3];
    const code = lot[4];
    if (county === undefined || district === undefined || section === undefined || code === undefined) {
      throw new MicroPricingInputError("地號請寫成縣市、行政區、地段與地號");
    }
    return parseLandParcelProperty({ county, district, section, lot: code });
  }
  return doorplateProperty(text);
}

function formatSubject(subject: Property): string {
  switch (subject.kind) {
    case "doorplate":
      return subject.address;
    case "listing-url":
      return subject.url;
    case "land-parcel":
      return `${subject.area.county}${subject.area.district}${subject.section} ${formatLotNumber(subject.lot)}`;
  }
}

function includedIds(quote: MarketQuote): ReadonlySet<string> {
  if (quote.result.kind !== "matched") return new Set();
  return new Set(quote.result.valuation.weightedAverage.dealIds);
}

function stageView(quote: MarketQuote): StageView {
  const searched = quote.result.history.searched;
  const windowText = `${searched.radiusMeters} 公尺 / ${searched.withinMonths} 個月`;
  switch (searched.phase) {
    case "baseline":
      return {
        lamp: "baseline",
        tone: "green",
        title: "第一階・基準窗",
        detail: `${windowText}內已有可比較建物，未啟動擴張。`,
      };
    case "time-widened":
      return {
        lamp: "expanded",
        tone: "yellow",
        title: "擴展・放寬時間",
        detail: `基準窗沒有可比較建物。時間已放寬，目前為 ${windowText}。`,
      };
    case "distance-widened":
      return {
        lamp: "expanded",
        tone: "yellow",
        title: "第二階擴展・放寬距離",
        detail: `放寬時間後仍不足，距離已再放寬。目前為 ${windowText}。`,
      };
    case "exhausted":
      return {
        lamp: "stopped",
        tone: "red",
        title: "第三階・停止擴張",
        detail: `搜尋停在 ${windowText}。${quote.result.kind === "insufficient" ? quote.result.warning : ""}`,
      };
  }
}

function assetLabel(asset: "building" | "land" | "parking"): string {
  switch (asset) {
    case "building":
      return "建物";
    case "land":
      return "土地";
    case "parking":
      return "車位";
  }
}

function verdictLabel(reason: ReturnType<typeof exclusionReason>): string {
  switch (reason) {
    case "pure-parking":
      return "已排除・純車位";
    case "pure-land":
      return "已排除・純土地";
    case "parking-not-separable":
      return "未計入・車位無法拆分";
    case undefined:
      return "計入加權均價";
  }
}

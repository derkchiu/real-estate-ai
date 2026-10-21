/**
 * 行情資料服務層。
 * 微觀成交從 data/real-estate-db.json 依地址字串對上路段；對不上就交給三階防呆。
 */
import {
  MicroPricingInputError,
  buildingDeal,
  landDeal,
  parkingDeal,
  type NearbyInput,
} from "../../../src/micro-pricing/index.js";
import realEstateDb from "../../../data/real-estate-db.json" with { type: "json" };
import { type DemoCorpus } from "../fixtures.js";

const SIMULATED_NETWORK_MS = 1_500;

/** 未來改接內政部不動產實價登錄開放資料。 */
export const INTERIOR_ACTUAL_PRICE_API = "interior-actual-price-api" as const;

/** 未來改接線上售屋與建設進度爬蟲。 */
export const ONLINE_COMPETITOR_CRAWLER = "online-competitor-crawler" as const;

export type InteriorActualPriceFeed = {
  readonly source: typeof INTERIOR_ACTUAL_PRICE_API;
  readonly provider: "內政部實價登錄";
  readonly asOf: string;
  readonly corpus: DemoCorpus;
  readonly note: string;
  readonly listings: readonly NearbyInput[];
};

export type ConstructionState = "verified" | "verifying";

export type ConstructionProject = {
  readonly id: string;
  readonly name: string;
  readonly state: ConstructionState;
  readonly badge: string;
  readonly milestone: string | null;
};

export type CompetitorCrawlTarget = {
  readonly area: string;
};

export type CompetitorCrawlResult = {
  readonly source: typeof ONLINE_COMPETITOR_CRAWLER;
  readonly provider: "線上競品爬蟲";
  readonly area: string;
  readonly observedOn: string;
  readonly projects: readonly ConstructionProject[];
};

const CONSTRUCTION_TIMELINE: readonly ConstructionProject[] = [
  {
    id: "hanshin-intercontinental",
    name: "漢神洲際購物廣場",
    state: "verified",
    badge: "已驗證：末段補漲",
    milestone: "2026-04 已開幕",
  },
  {
    id: "taichung-dome",
    name: "台中巨蛋",
    state: "verifying",
    badge: "驗證中：中階增值",
    milestone: null,
  },
];

function simulateNetwork(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, SIMULATED_NETWORK_MS);
  });
}

/** 內政部實價登錄 API。依標的地址對行情資料庫，取回該路段的周邊成交。 */
export async function fetchInteriorActualPrices(query: string): Promise<InteriorActualPriceFeed> {
  const subject = query.trim();
  if (subject.length === 0) {
    throw new MicroPricingInputError("請輸入門牌地址或地號");
  }

  await simulateNetwork();

  const street = streetForQuery(subject, PRICE_DATABASE.streets);
  if (street === undefined) {
    return {
      source: INTERIOR_ACTUAL_PRICE_API,
      provider: "內政部實價登錄",
      asOf: PRICE_DATABASE.asOf,
      corpus: "scarce",
      note: "行情資料庫沒有這個地址的成交，已停止擴張。",
      listings: [],
    };
  }

  return {
    source: INTERIOR_ACTUAL_PRICE_API,
    provider: "內政部實價登錄",
    asOf: PRICE_DATABASE.asOf,
    corpus: "baseline",
    note: `${street.name}（${street.area}）：已對上行情資料庫的周邊成交。`,
    listings: street.listings.map(toNearby),
  };
}

/** 線上競品爬蟲。查核重大建設進度，供宏觀趨勢與即時校正使用。 */
export async function crawlOnlineCompetitors(target: CompetitorCrawlTarget): Promise<CompetitorCrawlResult> {
  const area = target.area.trim();
  if (area.length === 0) {
    throw new MicroPricingInputError("請提供要查核的縣市或行政區");
  }

  await simulateNetwork();

  return {
    source: ONLINE_COMPETITOR_CRAWLER,
    provider: "線上競品爬蟲",
    area,
    observedOn: PRICE_DATABASE.asOf,
    projects: CONSTRUCTION_TIMELINE,
  };
}

const PRICE_DATABASE = readPriceDatabase(realEstateDb);

type ParkingRecord =
  | { readonly kind: "none" }
  | {
      readonly kind: "priced";
      readonly spaceCount: number;
      readonly price: number;
      readonly areaPing: number | null;
    }
  | {
      readonly kind: "unpriced";
      readonly spaceCount: number;
      readonly areaPing: number | null;
    };

type DealRecord =
  | {
      readonly asset: "building";
      readonly id: string;
      readonly tradedOn: string;
      readonly publishedAddress: string;
      readonly totalPrice: number;
      readonly buildingAreaPing: number;
      readonly landSharePing: number | null;
      readonly parking: ParkingRecord;
    }
  | {
      readonly asset: "land";
      readonly id: string;
      readonly tradedOn: string;
      readonly publishedAddress: string;
      readonly totalPrice: number;
      readonly landAreaPing: number;
    }
  | {
      readonly asset: "parking";
      readonly id: string;
      readonly tradedOn: string;
      readonly publishedAddress: string;
      readonly totalPrice: number;
      readonly spaceCount: number;
      readonly areaPing: number | null;
    };

type ListingRecord = {
  readonly distanceMeters: number;
  readonly deal: DealRecord;
};

type StreetRecord = {
  readonly id: string;
  readonly name: string;
  readonly area: string;
  readonly match: readonly string[];
  readonly listings: readonly ListingRecord[];
};

type PriceDatabase = {
  readonly asOf: string;
  readonly streets: readonly StreetRecord[];
};

function readPriceDatabase(raw: unknown): PriceDatabase {
  if (!isRecord(raw) || typeof raw.asOf !== "string" || !Array.isArray(raw.streets)) {
    throw new MicroPricingInputError("行情資料庫格式不正確");
  }
  return {
    asOf: raw.asOf,
    streets: raw.streets.map(readStreet),
  };
}

function readStreet(raw: unknown): StreetRecord {
  if (
    !isRecord(raw) ||
    typeof raw.id !== "string" ||
    typeof raw.name !== "string" ||
    typeof raw.area !== "string" ||
    !Array.isArray(raw.match) ||
    !Array.isArray(raw.listings)
  ) {
    throw new MicroPricingInputError("行情資料庫的路段格式不正確");
  }
  const match = raw.match.filter((token): token is string => typeof token === "string" && token.trim().length > 0);
  if (match.length === 0) {
    throw new MicroPricingInputError("行情資料庫的路段缺少比對字");
  }
  return {
    id: raw.id,
    name: raw.name,
    area: raw.area,
    match,
    listings: raw.listings.map(readListing),
  };
}

function readListing(raw: unknown): ListingRecord {
  if (!isRecord(raw) || typeof raw.distanceMeters !== "number" || !isRecord(raw.deal)) {
    throw new MicroPricingInputError("行情資料庫的成交格式不正確");
  }
  return { distanceMeters: raw.distanceMeters, deal: readDeal(raw.deal) };
}

function readDeal(raw: Record<string, unknown>): DealRecord {
  const id = textField(raw, "id");
  const tradedOn = textField(raw, "tradedOn");
  const publishedAddress = textField(raw, "publishedAddress");
  const totalPrice = numberField(raw, "totalPrice");
  if (raw.asset === "building") {
    return {
      asset: "building",
      id,
      tradedOn,
      publishedAddress,
      totalPrice,
      buildingAreaPing: numberField(raw, "buildingAreaPing"),
      landSharePing: nullableNumber(raw, "landSharePing"),
      parking: readParking(raw.parking),
    };
  }
  if (raw.asset === "land") {
    return {
      asset: "land",
      id,
      tradedOn,
      publishedAddress,
      totalPrice,
      landAreaPing: numberField(raw, "landAreaPing"),
    };
  }
  if (raw.asset === "parking") {
    return {
      asset: "parking",
      id,
      tradedOn,
      publishedAddress,
      totalPrice,
      spaceCount: numberField(raw, "spaceCount"),
      areaPing: nullableNumber(raw, "areaPing"),
    };
  }
  throw new MicroPricingInputError("行情資料庫的成交類型不正確");
}

function readParking(raw: unknown): ParkingRecord {
  if (!isRecord(raw)) throw new MicroPricingInputError("行情資料庫的車位格式不正確");
  if (raw.kind === "none") return { kind: "none" };
  if (raw.kind === "priced") {
    return {
      kind: "priced",
      spaceCount: numberField(raw, "spaceCount"),
      price: numberField(raw, "price"),
      areaPing: nullableNumber(raw, "areaPing"),
    };
  }
  if (raw.kind === "unpriced") {
    return {
      kind: "unpriced",
      spaceCount: numberField(raw, "spaceCount"),
      areaPing: nullableNumber(raw, "areaPing"),
    };
  }
  throw new MicroPricingInputError("行情資料庫的車位格式不正確");
}

function streetForQuery(query: string, streets: readonly StreetRecord[]): StreetRecord | undefined {
  const text = normalizePlace(query);
  let best: { readonly street: StreetRecord; readonly length: number } | undefined;
  for (const street of streets) {
    for (const token of street.match) {
      const key = normalizePlace(token);
      if (!text.includes(key)) continue;
      if (best === undefined || key.length > best.length) {
        best = { street, length: key.length };
      }
    }
  }
  return best?.street;
}

function toNearby(listing: ListingRecord): NearbyInput {
  const deal = listing.deal;
  if (deal.asset === "building") {
    return { distanceMeters: listing.distanceMeters, deal: buildingDeal(deal) };
  }
  if (deal.asset === "land") {
    return { distanceMeters: listing.distanceMeters, deal: landDeal(deal) };
  }
  return { distanceMeters: listing.distanceMeters, deal: parkingDeal(deal) };
}

function normalizePlace(value: string): string {
  return value.trim().replaceAll("臺", "台");
}

function textField(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new MicroPricingInputError(`行情資料庫缺少 ${key}`);
  }
  return value;
}

function numberField(raw: Record<string, unknown>, key: string): number {
  const value = raw[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new MicroPricingInputError(`行情資料庫的 ${key} 必須是數字`);
  }
  return value;
}

function nullableNumber(raw: Record<string, unknown>, key: string): number | null {
  const value = raw[key];
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new MicroPricingInputError(`行情資料庫的 ${key} 必須是數字或 null`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

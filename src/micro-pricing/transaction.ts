import { MicroPricingInputError } from "./errors.js";
import { type ScarcityWarning } from "./failsafe-config.js";
import {
  calendarDate,
  distanceMeters,
  isOnOrBetween,
  labeledText,
  ping,
  positiveInt,
  shiftMonths,
  transactionId,
  twd,
  twdPerPing,
  type CalendarDate,
  type Meters,
  type Ping,
  type PositiveInt,
  type TransactionId,
  type Twd,
  type TwdPerPing,
} from "./measure.js";
import { type Property } from "./property.js";
import {
  stopExpandingWindow,
  widenDistanceWindow,
  widenTimeWindow,
  type BaselineWindow,
  type DistanceWidenedWindow,
  type ExhaustedWindow,
  type OpenSearchWindow,
  type SearchWindow,
  type TimeWidenedWindow,
} from "./search-window.js";

const historyBrand: unique symbol = Symbol("TransactionHistory");
const attemptBrand: unique symbol = Symbol("SearchAttempt");
const averageBrand: unique symbol = Symbol("Valuation");

export type Known<T> =
  | { readonly status: "known"; readonly value: T }
  | { readonly status: "unknown" };

export type Parking =
  | { readonly kind: "none" }
  | {
      readonly kind: "priced";
      readonly spaceCount: PositiveInt;
      readonly price: Twd;
      readonly area: Known<Ping>;
    }
  | {
      readonly kind: "unpriced";
      readonly spaceCount: PositiveInt;
      readonly area: Known<Ping>;
    };

type DealBase = {
  readonly id: TransactionId;
  readonly tradedOn: CalendarDate;
  readonly publishedAddress: string;
};

/** 建物。單價不存在這個物件上，避免和總價、坪數互相矛盾。 */
export type BuildingDeal = DealBase & {
  readonly asset: "building";
  readonly totalPrice: Twd;
  readonly buildingAreaPing: Ping;
  readonly landShare: Known<Ping>;
  readonly parking: Parking;
};

export type LandDeal = DealBase & {
  readonly asset: "land";
  readonly totalPrice: Twd;
  readonly landAreaPing: Ping;
};

export type ParkingDeal = DealBase & {
  readonly asset: "parking";
  readonly totalPrice: Twd;
  readonly spaceCount: PositiveInt;
  readonly area: Known<Ping>;
};

export type ActualPriceDeal = BuildingDeal | LandDeal | ParkingDeal;

/** 距離是這次搜尋的結果，不寫進成交本身，避免同一筆成交對不同標的卻帶著固定距離。 */
export type NearbyTransaction = {
  readonly distanceMeters: Meters;
  readonly deal: ActualPriceDeal;
};

export type NonEmptyRecords = readonly [NearbyTransaction, ...NearbyTransaction[]];

export type TransactionHistory<
  W extends SearchWindow = SearchWindow,
  R extends readonly NearbyTransaction[] = readonly NearbyTransaction[],
> = {
  readonly [historyBrand]: true;
  readonly subject: Property;
  readonly searched: W;
  readonly records: R;
};

export type BuildingDealInput = {
  readonly id: string;
  readonly tradedOn: string;
  readonly publishedAddress: string;
  readonly totalPrice: number;
  readonly buildingAreaPing: number;
  /** `null` 只存在於原始輸入，代表實價登錄沒有土地持分。領域物件會改成 `unknown`。 */
  readonly landSharePing: number | null;
  readonly parking:
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
};

export type LandDealInput = {
  readonly id: string;
  readonly tradedOn: string;
  readonly publishedAddress: string;
  readonly totalPrice: number;
  readonly landAreaPing: number;
};

export type ParkingDealInput = {
  readonly id: string;
  readonly tradedOn: string;
  readonly publishedAddress: string;
  readonly totalPrice: number;
  readonly spaceCount: number;
  readonly areaPing: number | null;
};

export function buildingDeal(input: BuildingDealInput): BuildingDeal {
  const totalPrice = twd(input.totalPrice);
  const buildingAreaPing = ping(input.buildingAreaPing);
  const parking = parseParking(input.parking, totalPrice);
  if (parking.kind !== "none" && parking.area.status === "known" && parking.area.value >= buildingAreaPing) {
    throw new MicroPricingInputError("車位坪數必須小於建物坪數");
  }
  return Object.freeze({
    asset: "building" as const,
    id: transactionId(input.id),
    tradedOn: calendarDate(input.tradedOn),
    publishedAddress: labeledText(input.publishedAddress, "交易地址"),
    totalPrice,
    buildingAreaPing,
    landShare: knownPing(input.landSharePing),
    parking,
  });
}

export function landDeal(input: LandDealInput): LandDeal {
  return Object.freeze({
    asset: "land" as const,
    id: transactionId(input.id),
    tradedOn: calendarDate(input.tradedOn),
    publishedAddress: labeledText(input.publishedAddress, "交易地址"),
    totalPrice: twd(input.totalPrice),
    landAreaPing: ping(input.landAreaPing),
  });
}

export function parkingDeal(input: ParkingDealInput): ParkingDeal {
  return Object.freeze({
    asset: "parking" as const,
    id: transactionId(input.id),
    tradedOn: calendarDate(input.tradedOn),
    publishedAddress: labeledText(input.publishedAddress, "交易地址"),
    totalPrice: twd(input.totalPrice),
    spaceCount: positiveInt(input.spaceCount),
    area: knownPing(input.areaPing),
  });
}

export type NearbyInput = {
  readonly distanceMeters: number;
  readonly deal: ActualPriceDeal;
};

export function assembleHistory<W extends SearchWindow>(input: {
  readonly subject: Property;
  readonly searched: W;
  readonly nearby: readonly [];
}): TransactionHistory<W, readonly []>;
export function assembleHistory<W extends SearchWindow>(input: {
  readonly subject: Property;
  readonly searched: W;
  readonly nearby: readonly [NearbyInput, ...NearbyInput[]];
}): TransactionHistory<W, NonEmptyRecords>;
export function assembleHistory<W extends SearchWindow>(input: {
  readonly subject: Property;
  readonly searched: W;
  readonly nearby: readonly NearbyInput[];
}): TransactionHistory<W, readonly NearbyTransaction[]>;
export function assembleHistory<W extends SearchWindow>(input: {
  readonly subject: Property;
  readonly searched: W;
  readonly nearby: readonly NearbyInput[];
}): TransactionHistory<W, readonly NearbyTransaction[]> {
  const earliest = shiftMonths(input.searched.asOf, -input.searched.withinMonths);
  const seen = new Set<string>();
  const records: NearbyTransaction[] = [];

  for (const item of input.nearby) {
    const distance = distanceMeters(item.distanceMeters);
    if (distance > input.searched.radiusMeters) {
      throw new MicroPricingInputError(
        `交易 ${item.deal.id} 距離 ${distance} 公尺，超出這個搜尋窗的 ${input.searched.radiusMeters} 公尺`,
      );
    }
    if (!isOnOrBetween(item.deal.tradedOn, earliest, input.searched.asOf)) {
      throw new MicroPricingInputError(
        `交易 ${item.deal.id} 的日期 ${item.deal.tradedOn} 不在 ${earliest} 到 ${input.searched.asOf}`,
      );
    }
    if (seen.has(item.deal.id)) {
      throw new MicroPricingInputError(`交易編號重複：${item.deal.id}`);
    }
    seen.add(item.deal.id);
    records.push(Object.freeze({ distanceMeters: distance, deal: item.deal }));
  }

  return Object.freeze({
    [historyBrand]: true as const,
    subject: input.subject,
    searched: input.searched,
    records: Object.freeze(records),
  });
}

/** 已拆開車位總價與車位坪數、可進入加權均價的建物。 */
export type PricedBuildingRecord = {
  readonly distanceMeters: Meters;
  readonly deal: BuildingDeal;
  readonly netPrice: Twd;
  readonly netPing: Ping;
};

export type ExclusionReason = "pure-parking" | "pure-land" | "parking-not-separable";

export type Hit<W extends OpenSearchWindow = OpenSearchWindow> = {
  readonly [attemptBrand]: true;
  readonly kind: "hit";
  readonly history: TransactionHistory<W, NonEmptyRecords>;
  readonly comparables: readonly [PricedBuildingRecord, ...PricedBuildingRecord[]];
};

/** 這一階沒有可比較建物。紀錄裡仍可能留著純車位或純土地。 */
export type Miss<W extends OpenSearchWindow = OpenSearchWindow> = {
  readonly [attemptBrand]: true;
  readonly kind: "miss";
  readonly history: TransactionHistory<W>;
};

export type SearchAttempt<W extends OpenSearchWindow = OpenSearchWindow> = Hit<W> | Miss<W>;

export function classifyAttempt<W extends OpenSearchWindow>(
  history: TransactionHistory<W, readonly []>,
): Miss<W>;
export function classifyAttempt<W extends OpenSearchWindow>(
  history: TransactionHistory<W, NonEmptyRecords>,
): SearchAttempt<W>;
export function classifyAttempt<W extends OpenSearchWindow>(
  history: TransactionHistory<W, readonly NearbyTransaction[]>,
): SearchAttempt<W>;
export function classifyAttempt<W extends OpenSearchWindow>(
  history: TransactionHistory<W, readonly NearbyTransaction[]>,
): SearchAttempt<W> {
  const comparables = pricedBuildings(history.records);
  const comparableTuple = nonEmptyComparables(comparables);
  if (comparableTuple === undefined) {
    return Object.freeze({
      [attemptBrand]: true as const,
      kind: "miss" as const,
      history,
    });
  }
  return Object.freeze({
    [attemptBrand]: true as const,
    kind: "hit" as const,
    history: history as TransactionHistory<W, NonEmptyRecords>,
    comparables: comparableTuple,
  });
}

/**
 * 只有「這一階沒有可比較建物」才能進下一階。
 * 純車位、純土地不能撐起這一階，也不能阻止放寬。
 * 基準窗的空結果不能直接變成警語；已有可比較建物就不能再放寬。
 */
export function advanceAfterMiss(miss: Miss<BaselineWindow>): TimeWidenedWindow;
export function advanceAfterMiss(miss: Miss<TimeWidenedWindow>): DistanceWidenedWindow;
export function advanceAfterMiss(miss: Miss<DistanceWidenedWindow>): ExhaustedWindow;
export function advanceAfterMiss(
  miss: Miss<OpenSearchWindow>,
): TimeWidenedWindow | DistanceWidenedWindow | ExhaustedWindow {
  const searched = miss.history.searched;
  switch (searched.phase) {
    case "baseline":
      return widenTimeWindow(searched);
    case "time-widened":
      return widenDistanceWindow(searched);
    case "distance-widened":
      return stopExpandingWindow(searched);
  }
}

const WEIGHTED_NET_OF_PARKING = "area-weighted-net-of-parking" as const;

/**
 * 加權均價 = 符合條件的總價扣除車位總價後加總 ÷ 總坪數扣除車位坪數後加總。
 * 純車位、純土地不在分子也不在分母。
 */
export type WeightedAverage = {
  readonly [averageBrand]: true;
  readonly method: typeof WEIGHTED_NET_OF_PARKING;
  readonly dealIds: readonly [TransactionId, ...TransactionId[]];
  readonly netPriceTotal: Twd;
  readonly netPingTotal: Ping;
  readonly averageUnitPricePerPing: TwdPerPing;
};

export type ValuationReport = {
  readonly weightedAverage: WeightedAverage;
};

export function deriveValuation(records: readonly NearbyTransaction[]): ValuationReport | undefined {
  const comparables = nonEmptyComparables(pricedBuildings(records));
  if (comparables === undefined) return undefined;
  return Object.freeze({
    weightedAverage: weightedAverageOf(comparables),
  });
}

export type MatchedResult = {
  readonly kind: "matched";
  readonly history: TransactionHistory<OpenSearchWindow, NonEmptyRecords>;
  readonly valuation: ValuationReport;
};

export type InsufficientResult = {
  readonly kind: "insufficient";
  readonly history: TransactionHistory<ExhaustedWindow>;
  readonly warning: ScarcityWarning;
};

export type MicroPricingResult = MatchedResult | InsufficientResult;

export function publishMatched<W extends OpenSearchWindow>(hit: Hit<W>): MatchedResult {
  return Object.freeze({
    kind: "matched" as const,
    history: hit.history,
    valuation: Object.freeze({
      weightedAverage: weightedAverageOf(hit.comparables),
    }),
  });
}

export function publishInsufficient(history: TransactionHistory<ExhaustedWindow>): InsufficientResult {
  if (pricedBuildings(history.records).length > 0) {
    throw new MicroPricingInputError("仍有可計算加權均價的建物交易，不能發表交易極少");
  }
  return Object.freeze({
    kind: "insufficient" as const,
    history,
    warning: history.searched.warning,
  });
}

function parseParking(parking: BuildingDealInput["parking"], totalPrice: Twd): Parking {
  if (parking.kind === "none") {
    return Object.freeze({ kind: "none" });
  }

  const spaceCount = positiveInt(parking.spaceCount);
  const area = knownPing(parking.areaPing);
  if (parking.kind === "unpriced") {
    return Object.freeze({ kind: "unpriced", spaceCount, area });
  }

  const price = twd(parking.price);
  if (price > totalPrice) {
    throw new MicroPricingInputError("車位價不能高於交易總價");
  }
  return Object.freeze({ kind: "priced", spaceCount, price, area });
}

function knownPing(value: number | null): Known<Ping> {
  if (value === null) return Object.freeze({ status: "unknown" });
  return Object.freeze({ status: "known", value: ping(value) });
}

/**
 * 無車位視為車位總價 0、車位坪數 0。
 * 車位價未知，或有車位價但沒有車位坪數時，無法拆開，回傳 undefined。
 */
export function netOfParking(deal: BuildingDeal): { readonly netPrice: Twd; readonly netPing: Ping } | undefined {
  if (deal.parking.kind === "unpriced") return undefined;
  if (deal.parking.kind === "priced" && deal.parking.area.status !== "known") return undefined;

  const parkingPrice = deal.parking.kind === "priced" ? deal.parking.price : 0;
  const parkingPing =
    deal.parking.kind === "priced" && deal.parking.area.status === "known" ? deal.parking.area.value : 0;
  const netPingValue = deal.buildingAreaPing - parkingPing;
  if (netPingValue <= 0) {
    throw new MicroPricingInputError("扣除車位後的坪數必須大於 0");
  }
  return Object.freeze({
    netPrice: twd(deal.totalPrice - parkingPrice),
    netPing: ping(netPingValue),
  });
}

export function exclusionReason(deal: ActualPriceDeal): ExclusionReason | undefined {
  if (deal.asset === "parking") return "pure-parking";
  if (deal.asset === "land") return "pure-land";
  if (netOfParking(deal) === undefined) return "parking-not-separable";
  return undefined;
}

function nonEmptyComparables(
  comparables: readonly PricedBuildingRecord[],
): readonly [PricedBuildingRecord, ...PricedBuildingRecord[]] | undefined {
  const first = comparables[0];
  if (first === undefined) return undefined;
  return Object.freeze([first, ...comparables.slice(1)]);
}

function pricedBuildings(records: readonly NearbyTransaction[]): PricedBuildingRecord[] {
  const comparables: PricedBuildingRecord[] = [];
  for (const record of records) {
    if (record.deal.asset !== "building") continue;
    const net = netOfParking(record.deal);
    if (net === undefined) continue;
    comparables.push(
      Object.freeze({
        distanceMeters: record.distanceMeters,
        deal: record.deal,
        netPrice: net.netPrice,
        netPing: net.netPing,
      }),
    );
  }
  return comparables;
}

function weightedAverageOf(comparables: readonly [PricedBuildingRecord, ...PricedBuildingRecord[]]): WeightedAverage {
  let netPriceTotal = 0;
  let netPingTotal = 0;
  const dealIds: TransactionId[] = [];
  for (const item of comparables) {
    netPriceTotal += item.netPrice;
    netPingTotal += item.netPing;
    dealIds.push(item.deal.id);
  }
  return Object.freeze({
    [averageBrand]: true as const,
    method: WEIGHTED_NET_OF_PARKING,
    dealIds: Object.freeze(dealIds as unknown as readonly [TransactionId, ...TransactionId[]]),
    netPriceTotal: twd(netPriceTotal),
    netPingTotal: ping(netPingTotal),
    averageUnitPricePerPing: twdPerPing(netPriceTotal / netPingTotal),
  });
}

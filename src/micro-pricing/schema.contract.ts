import { MicroPricingInputError } from "./errors.js";
import {
  advanceAfterMiss,
  assembleHistory,
  buildingDeal,
  calendarDate,
  classifyAttempt,
  DEFAULT_FAILSAFE_POLICY,
  defineFailsafePolicy,
  doorplateProperty,
  formatLotNumber,
  landDeal,
  listingUrlProperty,
  openDefaultBaseline,
  parkingDeal,
  parseAdministrativeArea,
  parseLandParcelProperty,
  publishInsufficient,
  publishMatched,
  SCARCITY_WARNING,
  shiftMonths,
} from "./index.js";

const asOf = calendarDate("2026-10-21");
const subject = doorplateProperty("臺北市大安區仁愛路四段1號");

assert(shiftMonths(calendarDate("2024-03-31"), -1) === "2024-02-29", "跨月應夾到該月最後一天");
assert(shiftMonths(asOf, -12) === "2025-10-21", "往前 12 個月應落在同月同日");

const taipei = parseAdministrativeArea("台北市", "大安区");
assert(taipei.county === "臺北市" && taipei.district === "大安區", "台／区應收成目錄用字");

assertThrows(() => parseAdministrativeArea("臺北市", "板橋區"), "沒有行政區");

const parcel = parseLandParcelProperty({
  county: "台北市",
  district: "大安區",
  section: "通化段",
  lot: "12-3",
});
assert(parcel.kind === "land-parcel", "地籍應是單一 kind");
assert(parcel.area.county === "臺北市" && parcel.area.district === "大安區", "地籍縣市行政區應成對");
assert(formatLotNumber(parcel.lot) === "0012-0003", "地號應補成 4 碼母號與子號");

assertThrows(() => doorplateProperty("https://sale.591.com.tw/home/123"), "售屋網址");
assert(listingUrlProperty("https://sale.591.com.tw/home/123").kind === "listing-url", "https 網址應可作為標的");
assertThrows(() => listingUrlProperty("ftp://example.com/a"), "http 或 https");

assertThrows(
  () =>
    defineFailsafePolicy({
      baseline: { withinMonths: 24, radiusMeters: 500 },
      onNoData: [
        { stage: "widen-time", withinMonths: 24 },
        { stage: "widen-distance", radiusMeters: 1000 },
        { stage: "stop", warning: SCARCITY_WARNING },
      ],
    }),
  "月份必須大於",
);
assertThrows(
  () =>
    defineFailsafePolicy({
      baseline: { withinMonths: 12, radiusMeters: 1000 },
      onNoData: [
        { stage: "widen-time", withinMonths: 24 },
        { stage: "widen-distance", radiusMeters: 1000 },
        { stage: "stop", warning: SCARCITY_WARNING },
      ],
    }),
  "半徑必須大於",
);

const baseline = openDefaultBaseline(asOf);
assert(baseline.phase === "baseline" && baseline.withinMonths === 12 && baseline.radiusMeters === 500, "基準窗應為 12 個月、500 公尺");
assert(baseline.policy === DEFAULT_FAILSAFE_POLICY, "搜尋窗應沿用同一份設定");

const timeWidened = advanceAfterMiss(
  classifyAttempt(assembleHistory({ subject, searched: baseline, nearby: [] })),
);
assert(
  timeWidened.phase === "time-widened" && timeWidened.withinMonths === 24 && timeWidened.radiusMeters === 500,
  "第一階只放寬時間",
);

const distanceWidened = advanceAfterMiss(
  classifyAttempt(assembleHistory({ subject, searched: timeWidened, nearby: [] })),
);
assert(
  distanceWidened.phase === "distance-widened" &&
    distanceWidened.withinMonths === 24 &&
    distanceWidened.radiusMeters === 1000,
  "第二階只放寬距離",
);

const exhausted = advanceAfterMiss(
  classifyAttempt(assembleHistory({ subject, searched: distanceWidened, nearby: [] })),
);
assert(exhausted.phase === "exhausted" && exhausted.warning === SCARCITY_WARNING, "第三階停止並帶固定警語");

const insufficient = publishInsufficient(
  assembleHistory({ subject, searched: exhausted, nearby: [] }),
);
assert(insufficient.kind === "insufficient" && insufficient.warning === SCARCITY_WARNING, "沒有樣本的最終結果必須帶警語");
assert(insufficient.history.records.length === 0, "警語結果不能夾帶成交");

const withinWindow = buildingDeal({
  id: "B1",
  tradedOn: "2025-10-21",
  publishedAddress: "臺北市大安區通化街10號",
  totalPrice: 30_000_000,
  buildingAreaPing: 30,
  landSharePing: 4.2,
  parking: { kind: "none" },
});
const pricedParking = buildingDeal({
  id: "B2",
  tradedOn: "2026-02-02",
  publishedAddress: "臺北市大安區通化街20號",
  totalPrice: 32_000_000,
  buildingAreaPing: 30,
  landSharePing: null,
  parking: { kind: "priced", spaceCount: 1, price: 2_000_000, areaPing: 8 },
});
const unpricedParking = buildingDeal({
  id: "B3",
  tradedOn: "2026-03-03",
  publishedAddress: "臺北市大安區通化街30號",
  totalPrice: 36_000_000,
  buildingAreaPing: 30,
  landSharePing: null,
  parking: { kind: "unpriced", spaceCount: 1, areaPing: null },
});
const land = landDeal({
  id: "L1",
  tradedOn: "2026-01-15",
  publishedAddress: "臺北市大安區通化段",
  totalPrice: 10_000_000,
  landAreaPing: 50,
});

assembleHistory({
  subject,
  searched: baseline,
  nearby: [{ distanceMeters: 500, deal: withinWindow }],
});
assertThrows(
  () =>
    assembleHistory({
      subject,
      searched: baseline,
      nearby: [{ distanceMeters: 500.1, deal: withinWindow }],
    }),
  "超出",
);
assertThrows(
  () =>
    assembleHistory({
      subject,
      searched: baseline,
      nearby: [
        {
          distanceMeters: 10,
          deal: buildingDeal({
            id: "OLD",
            tradedOn: "2025-10-20",
            publishedAddress: "臺北市大安區通化街1號",
            totalPrice: 1,
            buildingAreaPing: 1,
            landSharePing: null,
            parking: { kind: "none" },
          }),
        },
      ],
    }),
  "不在",
);
assertThrows(
  () =>
    assembleHistory({
      subject,
      searched: baseline,
      nearby: [
        { distanceMeters: 10, deal: withinWindow },
        { distanceMeters: 20, deal: withinWindow },
      ],
    }),
  "重複",
);
assertThrows(
  () =>
    buildingDeal({
      id: "P",
      tradedOn: "2026-01-01",
      publishedAddress: "臺北市大安區通化街2號",
      totalPrice: 1_000_000,
      buildingAreaPing: 10,
      landSharePing: null,
      parking: { kind: "priced", spaceCount: 1, price: 2_000_000, areaPing: null },
    }),
  "車位價不能高於",
);

const mixed = classifyAttempt(
  assembleHistory({
    subject,
    searched: baseline,
    nearby: [
      { distanceMeters: 100, deal: withinWindow },
      { distanceMeters: 180, deal: pricedParking },
      { distanceMeters: 240, deal: unpricedParking },
      { distanceMeters: 300, deal: land },
      {
        distanceMeters: 320,
        deal: parkingDeal({
          id: "P1",
          tradedOn: "2026-05-05",
          publishedAddress: "臺北市大安區通化街車位",
          totalPrice: 2_000_000,
          spaceCount: 1,
          areaPing: null,
        }),
      },
    ],
  }),
);
assert(mixed.kind === "hit", "可拆車位的建物應視為有樣本");
if (mixed.kind !== "hit") throw new Error("可拆車位的建物應視為有樣本");

const matched = publishMatched(mixed);
const weighted = matched.valuation.weightedAverage;
assert(matched.kind === "matched", "有可比較建物時結果應是 matched");
assert(weighted.method === "area-weighted-net-of-parking", "均價方法應為扣除車位後的加權均價");
assert(weighted.netPriceTotal === 60_000_000, "分子應為總價扣除車位總價後加總");
assert(weighted.netPingTotal === 52, "分母應為總坪數扣除車位坪數後加總");
assert(weighted.averageUnitPricePerPing === 60_000_000 / 52, "加權均價應為分子除以分母");
assert(weighted.dealIds.length === 2, "只有可拆車位的建物進入均價");
assert(weighted.dealIds.includes(withinWindow.id), "無車位建物應納入");
assert(weighted.dealIds.includes(pricedParking.id), "已分離車位價與坪數的建物應納入");
assert(!weighted.dealIds.includes(unpricedParking.id), "車位價未知的建物不納入加權均價");
assert(!weighted.dealIds.includes(land.id), "純土地不納入加權均價");
assert(!("averageUnitPricePerPing" in matched.valuation), "總表本身不能直接掛一個均價");

const parkingOnly = classifyAttempt(
  assembleHistory({
    subject,
    searched: baseline,
    nearby: [
      {
        distanceMeters: 15,
        deal: parkingDeal({
          id: "P2",
          tradedOn: "2026-06-06",
          publishedAddress: "臺北市大安區通化街地下車位",
          totalPrice: 1_800_000,
          spaceCount: 1,
          areaPing: 6,
        }),
      },
    ],
  }),
);
assert(parkingOnly.kind === "miss", "純車位不計入歷史筆數");
if (parkingOnly.kind === "miss") {
  assert(advanceAfterMiss(parkingOnly).phase === "time-widened", "純車位不能阻止防呆");
}

const landOnly = classifyAttempt(
  assembleHistory({
    subject,
    searched: baseline,
    nearby: [{ distanceMeters: 40, deal: land }],
  }),
);
assert(landOnly.kind === "miss", "純土地不計入歷史筆數");

const unpricedOnly = classifyAttempt(
  assembleHistory({
    subject,
    searched: baseline,
    nearby: [{ distanceMeters: 25, deal: unpricedParking }],
  }),
);
assert(unpricedOnly.kind === "miss", "車位價或車位坪無法拆開的建物不能當成有樣本");

console.log("schema contract ok");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(run: () => void, messageIncludes: string): void {
  try {
    run();
  } catch (error) {
    if (error instanceof MicroPricingInputError && error.message.includes(messageIncludes)) return;
    throw error;
  }
  throw new Error(`預期拒絕輸入：${messageIncludes}`);
}

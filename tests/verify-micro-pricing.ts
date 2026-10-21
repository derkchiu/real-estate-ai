/**
 * 微觀行情比對的本地驗證。
 * 模擬實價登錄，確認加權均價與三階防呆。
 *
 * (A) 500 公尺內已有可比較建物，直接算出加權均價。
 * (B) 500 公尺內只有純車位、純土地與無法拆車位的建物，放到 1000 公尺才有樣本。
 * (C) 放寬到 1000 公尺、24 個月仍沒有可比較建物，停止並回傳警語。
 */
import {
  buildingDeal,
  calendarDate,
  doorplateProperty,
  landDeal,
  parkingDeal,
  quoteMarket,
  type NearbyInput,
} from "../src/micro-pricing/index.js";

const asOf = calendarDate("2026-10-21");
const subject = doorplateProperty("臺北市大安區仁愛路四段1號");
const failures: string[] = [];

const normal = quoteMarket({
  subject,
  asOf,
  api: {
    listings: [
      at(120, buildingDeal({
        id: "A-small",
        tradedOn: "2026-06-01",
        publishedAddress: "臺北市大安區仁愛路四段10號",
        totalPrice: 20_000_000,
        buildingAreaPing: 10,
        landSharePing: 2,
        parking: { kind: "none" },
      })),
      at(420, buildingDeal({
        id: "A-large",
        tradedOn: "2026-08-01",
        publishedAddress: "臺北市大安區仁愛路四段20號",
        totalPrice: 45_000_000,
        buildingAreaPing: 48,
        landSharePing: null,
        parking: { kind: "priced", spaceCount: 1, price: 5_000_000, areaPing: 8 },
      })),
      at(50, parkingDeal({
        id: "A-parking",
        tradedOn: "2026-07-01",
        publishedAddress: "臺北市大安區仁愛路四段車位",
        totalPrice: 2_500_000,
        spaceCount: 1,
        areaPing: 6,
      })),
      at(300, landDeal({
        id: "A-land",
        tradedOn: "2026-04-01",
        publishedAddress: "臺北市大安區仁愛段",
        totalPrice: 80_000_000,
        landAreaPing: 40,
      })),
      at(800, buildingDeal({
        id: "A-far",
        tradedOn: "2026-09-01",
        publishedAddress: "臺北市大安區仁愛路四段80號",
        totalPrice: 10_000_000,
        buildingAreaPing: 10,
        landSharePing: null,
        parking: { kind: "none" },
      })),
    ],
  },
});

if (normal.result.kind !== "matched") {
  failures.push("(A) 應在 500 公尺內算出加權均價");
} else {
  const price = normal.result.valuation.weightedAverage;
  const searched = normal.result.history.searched;
  // (20_000_000 + 40_000_000) / (10 + 40)。各筆單價平均會得到 1_500_000。
  check(searched.phase === "baseline", "(A) 停在基準窗");
  check(searched.radiusMeters === 500, "(A) 半徑維持 500 公尺");
  check(searched.withinMonths === 12, "(A) 時間維持 12 個月");
  check(samePhases(normal.phases, ["baseline"]), "(A) 沒有往後放寬");
  check(price.netPriceTotal === 60_000_000, "(A) 分子為總價扣除車位總價後加總 60,000,000");
  check(price.netPingTotal === 50, "(A) 分母為總坪數扣除車位坪數後加總 50");
  check(price.averageUnitPricePerPing === 1_200_000, "(A) 加權均價 1,200,000 元/坪");
  check(sameIds(price.dealIds, ["A-small", "A-large"]), "(A) 只計入兩筆可拆車位的建物");
  check(lacks(price.dealIds, "A-parking"), "(A) 純車位不計入歷史筆數");
  check(lacks(price.dealIds, "A-land"), "(A) 純土地不計入均價");
  check(lacks(price.dealIds, "A-far"), "(A) 800 公尺外的建物不進入 500 公尺結果");
}

const widened = quoteMarket({
  subject,
  asOf,
  api: {
    listings: [
      at(100, parkingDeal({
        id: "B-parking",
        tradedOn: "2026-09-01",
        publishedAddress: "臺北市大安區通化街車位",
        totalPrice: 2_200_000,
        spaceCount: 1,
        areaPing: 5,
      })),
      at(400, landDeal({
        id: "B-land",
        tradedOn: "2026-03-01",
        publishedAddress: "臺北市大安區通化段",
        totalPrice: 50_000_000,
        landAreaPing: 25,
      })),
      at(200, buildingDeal({
        id: "B-unpriced",
        tradedOn: "2026-05-01",
        publishedAddress: "臺北市大安區通化街8號",
        totalPrice: 33_000_000,
        buildingAreaPing: 22,
        landSharePing: null,
        parking: { kind: "unpriced", spaceCount: 1, areaPing: 6 },
      })),
      at(650, buildingDeal({
        id: "B-one",
        tradedOn: "2026-02-01",
        publishedAddress: "臺北市大安區通化街60號",
        totalPrice: 30_000_000,
        buildingAreaPing: 20,
        landSharePing: 3,
        parking: { kind: "none" },
      })),
      at(980, buildingDeal({
        id: "B-two",
        tradedOn: "2026-01-15",
        publishedAddress: "臺北市大安區通化街90號",
        totalPrice: 28_000_000,
        buildingAreaPing: 24,
        landSharePing: null,
        parking: { kind: "priced", spaceCount: 1, price: 4_000_000, areaPing: 4 },
      })),
    ],
  },
});

if (widened.result.kind !== "matched") {
  failures.push("(B) 放到 1000 公尺後應算出加權均價");
} else {
  const price = widened.result.valuation.weightedAverage;
  const searched = widened.result.history.searched;
  // (30_000_000 + 24_000_000) / (20 + 20)
  check(samePhases(widened.phases, ["baseline", "time-widened", "distance-widened"]), "(B) 先放寬時間，再放寬距離");
  check(searched.phase === "distance-widened", "(B) 停在第二階放寬距離");
  check(searched.radiusMeters === 1000, "(B) 半徑為 1000 公尺");
  check(searched.withinMonths === 24, "(B) 時間維持已放寬的 24 個月");
  check(price.netPriceTotal === 54_000_000, "(B) 分子 54,000,000");
  check(price.netPingTotal === 40, "(B) 分母 40 坪");
  check(price.averageUnitPricePerPing === 1_350_000, "(B) 加權均價 1,350,000 元/坪");
  check(sameIds(price.dealIds, ["B-one", "B-two"]), "(B) 只計入 1000 公尺內的兩筆建物");
  check(lacks(price.dealIds, "B-parking"), "(B) 500 公尺內的純車位沒有阻止放寬");
  check(lacks(price.dealIds, "B-land"), "(B) 純土地沒有阻止放寬");
  check(lacks(price.dealIds, "B-unpriced"), "(B) 無法拆車位的建物沒有被當成足夠資料");
}

const stopped = quoteMarket({
  subject,
  asOf,
  api: {
    listings: [
      at(100, parkingDeal({
        id: "C-parking",
        tradedOn: "2026-08-01",
        publishedAddress: "臺北市大安區復興南路車位",
        totalPrice: 1_900_000,
        spaceCount: 1,
        areaPing: 5,
      })),
      at(800, landDeal({
        id: "C-land",
        tradedOn: "2026-04-01",
        publishedAddress: "臺北市大安區復興段",
        totalPrice: 60_000_000,
        landAreaPing: 30,
      })),
      at(600, buildingDeal({
        id: "C-unpriced",
        tradedOn: "2026-07-01",
        publishedAddress: "臺北市大安區復興南路30號",
        totalPrice: 40_000_000,
        buildingAreaPing: 25,
        landSharePing: null,
        parking: { kind: "priced", spaceCount: 1, price: 3_000_000, areaPing: null },
      })),
      at(1500, buildingDeal({
        id: "C-far",
        tradedOn: "2026-06-01",
        publishedAddress: "臺北市大安區復興南路150號",
        totalPrice: 20_000_000,
        buildingAreaPing: 20,
        landSharePing: null,
        parking: { kind: "none" },
      })),
      at(200, buildingDeal({
        id: "C-old",
        tradedOn: "2023-06-01",
        publishedAddress: "臺北市大安區復興南路2號",
        totalPrice: 20_000_000,
        buildingAreaPing: 20,
        landSharePing: null,
        parking: { kind: "none" },
      })),
    ],
  },
});

if (stopped.result.kind !== "insufficient") {
  failures.push("(C) 第三階應停止，不能算出均價");
} else {
  const seen = stopped.result.history.records.map((record) => record.deal.id);
  check(
    samePhases(stopped.phases, ["baseline", "time-widened", "distance-widened", "exhausted"]),
    "(C) 走完三階後進入逃生艙",
  );
  check(stopped.result.history.searched.phase === "exhausted", "(C) 搜尋窗已停止擴張");
  check(stopped.result.warning === "⚠️ 周邊交易極少，僅供參考", "(C) 回傳規定警語");
  check(!("valuation" in stopped.result), "(C) 停損結果沒有均價");
  check(seen.some((id) => id === "C-parking"), "(C) 純車位有被看到，但沒有阻止警語");
  check(seen.some((id) => id === "C-land"), "(C) 純土地有被看到，但沒有被拿來計價");
  check(lacks(seen, "C-far"), "(C) 1500 公尺外的建物不進入 1000 公尺搜尋");
  check(lacks(seen, "C-old"), "(C) 超過 24 個月的建物不進入搜尋");
}

if (failures.length > 0) {
  throw new Error(failures.map((failure) => `FAIL ${failure}`).join("\n"));
} else {
  console.log("verification ok");
  console.log("(A) 正常情境：500m / 12 個月，加權均價 1,200,000 元/坪（2 筆建物，已排除純車位與純土地）");
  console.log("(B) 擴展情境：純車位未阻止防呆，第二階 1000m / 24 個月，加權均價 1,350,000 元/坪");
  console.log("(C) 停損情境：⚠️ 周邊交易極少，僅供參考");
}

function at(distanceMeters: number, deal: NearbyInput["deal"]): NearbyInput {
  return { distanceMeters, deal };
}

function check(condition: boolean, message: string): void {
  if (!condition) failures.push(message);
}

function samePhases(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((phase, index) => phase === expected[index]);
}

function sameIds(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && expected.every((id) => actual.includes(id));
}

function lacks(actual: readonly string[], id: string): boolean {
  return !actual.includes(id);
}

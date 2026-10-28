/**
 * BFF 驗證：政府資料清洗、加權均價、三階防呆，以及時間軸／雷達圖的 JSON 形狀。
 */
import { GovUpstreamError } from "../src/bff/errors.js";
import { handleTransactionsRequest, type TransactionsDeps } from "../src/bff/http.js";

const failures: string[] = [];
const configured = "https://gov.example/actual-price";

const caseA = await post(
  { query: "臺北市大安區仁愛路四段1號" },
  ready({
    asOf: "2026-10-21",
    listings: [
      building(120, "A-small", "2026-06-01", 20_000_000, 10, { kind: "none" }),
      building(420, "A-large", "2026-08-01", 45_000_000, 48, {
        kind: "priced",
        spaceCount: 1,
        price: 5_000_000,
        areaPing: 8,
      }),
      {
        distanceMeters: 50,
        deal: {
          asset: "parking",
          id: "A-parking",
          tradedOn: "2026-07-01",
          publishedAddress: "臺北市大安區仁愛路四段車位",
          totalPrice: 2_500_000,
          spaceCount: 1,
          areaPing: 6,
        },
      },
      {
        distanceMeters: 300,
        deal: {
          asset: "land",
          id: "A-land",
          tradedOn: "2026-04-01",
          publishedAddress: "臺北市大安區仁愛段",
          totalPrice: 80_000_000,
          landAreaPing: 40,
        },
      },
      building(800, "A-far", "2026-09-01", 10_000_000, 10, { kind: "none" }),
    ],
  }),
);
check(caseA.status === 200, "(A) 成功應為 200");
const priced = await json(caseA);
if (priced.ok !== true || priced.outcome !== "matched" || priced.micro === null || priced.micro === undefined) {
  failures.push("(A) 應算出均價");
} else {
  check(priced.micro.weightedAverage?.averageUnitPricePerPing === 1_200_000, "(A) 加權均價 1,200,000");
  check(priced.micro.weightedAverage?.netPriceTotal === 60_000_000, "(A) 分子扣除車位總價");
  check(priced.micro.weightedAverage?.netPingTotal === 50, "(A) 分母扣除車位坪數");
  check(sameIds(priced.micro.weightedAverage?.dealIds ?? [], ["A-small", "A-large"]), "(A) 只計入兩筆建物");
  check(priced.micro.excludedParking === 1, "(A) 純車位有排除計數");
  check(priced.micro.excludedLand === 1, "(A) 純土地有排除計數");
  check(priced.micro.stage.lamp === "baseline", "(A) 停在第一階");
  check(priced.macro.projects.length === 2, "(A) 時間軸有兩筆建設");
  check(priced.macro.projects[0]?.id === "hanshin-intercontinental", "(A) 雷達圖認得出漢神");
  check(priced.macro.projects[1]?.id === "taichung-dome", "(A) 雷達圖認得出巨蛋");
  check(priced.macro.projects[1]?.milestone === null, "(A) 驗證中的建設沒有里程碑");
  check(priced.macro.area === "台北市", "(A) 觀測範圍取自標的縣市");
  check(priced.macro.provider === "線上競品爬蟲", "(A) 雷達圖的資料來源名稱");
}

const moi = await post(
  { query: "台中市北屯區南興一路" },
  ready({
    asOf: "2026-10-21",
    records: [
      {
        編號: "M-building",
        交易標的: "房地",
        交易年月日: "1150601",
        土地位置建物門牌: "台中市北屯區南興一路35號",
        總價元: 20_000_000,
        建物移轉總面積平方公尺: 10 * 3.305785,
        距離公尺: 100,
      },
      {
        編號: "M-parking",
        交易標的: "車位",
        交易年月日: "1150701",
        土地位置建物門牌: "台中市北屯區南興一路車位",
        總價元: 2_500_000,
        車位移轉總面積平方公尺: 6 * 3.305785,
        距離公尺: 40,
      },
    ],
  }),
);
const moiBody = await json(moi);
if (moiBody.ok !== true || moiBody.micro === null || moiBody.micro === undefined) {
  failures.push("(MOI) 內政部欄位應能進入引擎");
} else {
  const average = moiBody.micro.weightedAverage?.averageUnitPricePerPing ?? Number.NaN;
  check(Math.abs(average - 2_000_000) < 1, "(MOI) 平方公尺換算後約為 2,000,000 元/坪");
  check(moiBody.micro.excludedParking === 1, "(MOI) 純車位沒有進入均價");
  check(!moiBody.micro.weightedAverage?.dealIds.includes("M-parking"), "(MOI) 車位編號不在分子");
  check(moiBody.macro.area === "台中市", "(MOI) 時間軸範圍是台中市");
}

const scarce = await post(
  { query: "臺北市大安區通化街1號" },
  ready({
    asOf: "2026-10-21",
    listings: [
      {
        distanceMeters: 100,
        deal: {
          asset: "parking",
          id: "only-parking",
          tradedOn: "2026-09-01",
          publishedAddress: "臺北市大安區通化街車位",
          totalPrice: 2_000_000,
          spaceCount: 1,
          areaPing: 5,
        },
      },
    ],
  }),
);
check(scarce.status === 200, "(C) 走完防呆仍是 200，前端才畫得出紅燈");
const stopped = await json(scarce);
if (stopped.ok !== true || stopped.outcome !== "insufficient" || stopped.micro === null || stopped.micro === undefined) {
  failures.push("(C) 沒有可比較建物應回 insufficient");
} else {
  check(stopped.micro.warning === "⚠️ 周邊交易極少，僅供參考", "(C) 警語是規定字句");
  check(stopped.micro.weightedAverage === null, "(C) 沒有均價");
  check(stopped.micro.stage.lamp === "stopped", "(C) 第三階燈號");
  check(stopped.micro.excludedParking === 1, "(C) 純車位沒有阻止警語");
}

const unconfigured = await post({ query: "臺北市大安區仁愛路四段1號" }, {
  today: () => "2026-10-21",
  fetchGov: async () => {
    failures.push("未設定網址時不該呼叫政府 API");
    return { listings: [] };
  },
});
check(unconfigured.status === 503, "未設定 GOV_OPEN_DATA_URL 應為 503");

const timeout = await post({ query: "臺北市大安區仁愛路四段1號" }, {
  govOpenDataUrl: configured,
  today: () => "2026-10-21",
  fetchGov: () => Promise.reject(new DOMException("逾時", "TimeoutError")),
});
check(timeout.status === 504, "政府 API 逾時應為 504");

const down = await post({ query: "臺北市大安區仁愛路四段1號" }, {
  govOpenDataUrl: configured,
  today: () => "2026-10-21",
  fetchGov: () => Promise.reject(new GovUpstreamError(503)),
});
check(down.status === 502, "政府 503 應轉成 502");

const badPayload = await post({ query: "臺北市大安區仁愛路四段1號" }, ready({ nope: true }));
check(badPayload.status === 422, "無法辨識的政府 JSON 應為 422");

const noDistance = await post({ query: "臺北市大安區仁愛路四段1號" }, ready({
  records: [{ 編號: "x", 交易標的: "房地", 交易年月日: "1150601", 土地位置建物門牌: "某址", 總價元: 1, 建物移轉總面積平方公尺: 30 }],
}));
check(noDistance.status === 422, "沒有距離不能假裝做過半徑防呆");

const emptyQuery = await get("https://real-estate-ai.local/api/transactions");
check(emptyQuery.status === 400, "空白查詢應為 400");

const macroOnly = await get("https://real-estate-ai.local/api/transactions?area=台中市");
const macroBody = await json(macroOnly);
check(macroOnly.status === 200, "只問行政區時回時間軸");
if (macroBody.ok === true) {
  check(macroBody.outcome === "macro-only", "未查實價時不跑均價");
  check(macroBody.micro === null, "時間軸回應沒有微觀均價");
  check(macroBody.macro.projects[0]?.state === "verified", "已驗證建設的狀態");
  check(macroBody.macro.projects[1]?.state === "verifying", "驗證中建設的狀態");
}

if (failures.length > 0) {
  throw new Error(failures.map((failure) => `FAIL ${failure}`).join("\n"));
}

console.log("bff verification ok");
console.log("(A) 加權均價 1,200,000，純車位與純土地已排除");
console.log("(MOI) 內政部欄位可換算後進入同一套引擎");
console.log("(C) 沒有可比較建物時回 200 與第三階警語");

function ready(payload: unknown): TransactionsDeps {
  return {
    govOpenDataUrl: configured,
    today: () => "2026-10-21",
    fetchGov: async () => payload,
  };
}

function post(body: unknown, deps: TransactionsDeps): Promise<Response> {
  return handleTransactionsRequest(
    new Request("https://real-estate-ai.local/api/transactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    deps,
  );
}

function get(url: string): Promise<Response> {
  return handleTransactionsRequest(new Request(url), { today: () => "2026-10-21" });
}

function building(
  distanceMeters: number,
  id: string,
  tradedOn: string,
  totalPrice: number,
  buildingAreaPing: number,
  parking: { kind: "none" } | { kind: "priced"; spaceCount: number; price: number; areaPing: number },
) {
  return {
    distanceMeters,
    deal: {
      asset: "building" as const,
      id,
      tradedOn,
      publishedAddress: `臺北市大安區仁愛路四段${id}`,
      totalPrice,
      buildingAreaPing,
      landSharePing: null,
      parking,
    },
  };
}

async function json(response: Response): Promise<{
  ok: boolean;
  outcome?: string;
  micro?: {
    warning: string | null;
    stage: { lamp: string };
    excludedParking: number;
    excludedLand: number;
    weightedAverage: {
      averageUnitPricePerPing: number;
      netPriceTotal: number;
      netPingTotal: number;
      dealIds: string[];
    } | null;
  } | null;
  macro: {
    area: string;
    provider: string;
    projects: { id: string; state: string; milestone: string | null }[];
  };
}> {
  return response.json() as Promise<{
    ok: boolean;
    outcome?: string;
    micro?: {
      warning: string | null;
      stage: { lamp: string };
      excludedParking: number;
      excludedLand: number;
      weightedAverage: {
        averageUnitPricePerPing: number;
        netPriceTotal: number;
        netPingTotal: number;
        dealIds: string[];
      } | null;
    } | null;
    macro: {
      area: string;
      provider: string;
      projects: { id: string; state: string; milestone: string | null }[];
    };
  }>;
}

function check(condition: boolean, message: string): void {
  if (!condition) failures.push(message);
}

function sameIds(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && expected.every((id) => actual.includes(id));
}

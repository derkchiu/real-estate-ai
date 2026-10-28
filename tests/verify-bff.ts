/**
 * BFF 驗證：政府資料清洗、加權均價、三階防呆，以及時間軸／雷達圖的 JSON 形狀。
 */
import { GovUpstreamError } from "../src/bff/errors.js";
import { GOV_OPEN_DATA_URL } from "../src/bff/gov-open-data.js";
import { handleTransactionsRequest, type TransactionsDeps } from "../src/bff/http.js";
import { buildGovOpenDataUrl, parseGovBody, rocDateToIso, unitPriceWanPerPing } from "../src/bff/moi-fields.js";

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
        單價元平方公尺: 60_000,
        距離公尺: 100,
      },
      {
        編號: "M-parking",
        交易標的: "車位",
        交易年月日: "1150701",
        土地位置建物門牌: "台中市北屯區南興一路車位",
        總價元: 2_500_000,
        車位移轉總面積平方公尺: 6 * 3.305785,
        單價元平方公尺: 20_000,
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
  govOpenDataUrl: "REPLACE_WITH_INTERIOR_ACTUAL_PRICE_ENDPOINT",
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

const cleaned = await post({ query: "臺北市大安區仁愛路四段1號" }, ready({
  records: [
    {
      鄉鎮市區: "大安區",
      編號: "keep",
      交易標的: "房地",
      交易年月日: "1150601",
      土地位置建物門牌: "臺北市大安區仁愛路四段10號",
      總價元: 20_000_000,
      建物移轉總面積平方公尺: 10 * 3.305785,
      單價元平方公尺: 60_000,
      備註: "",
    },
    {
      鄉鎮市區: "大安區",
      編號: "relative",
      交易標的: "房地",
      交易年月日: "1150602",
      土地位置建物門牌: "臺北市大安區仁愛路四段11號",
      總價元: 30_000_000,
      建物移轉總面積平方公尺: 10 * 3.305785,
      單價元平方公尺: 90_000,
      備註: "親友、員工、共有人或其他特殊關係間之交易",
    },
    {
      鄉鎮市區: "大安區",
      編號: "blank-price",
      交易標的: "房地",
      交易年月日: "1150603",
      土地位置建物門牌: "臺北市大安區仁愛路四段12號",
      總價元: 10_000_000,
      建物移轉總面積平方公尺: 10 * 3.305785,
      單價元平方公尺: 0,
      備註: "持分",
    },
    {
      鄉鎮市區: "信義區",
      編號: "other-district",
      交易標的: "房地",
      交易年月日: "1150604",
      土地位置建物門牌: "臺北市信義區市府路1號",
      總價元: 50_000_000,
      建物移轉總面積平方公尺: 10 * 3.305785,
      單價元平方公尺: 150_000,
      備註: "",
    },
    {
      鄉鎮市區: "大安區",
      編號: "shell",
      交易標的: "房地",
      交易年月日: "1150605",
      土地位置建物門牌: "臺北市大安區仁愛路四段13號",
      總價元: 40_000_000,
      建物移轉總面積平方公尺: 10 * 3.305785,
      單價元平方公尺: 120_000,
      備註: "毛胚屋",
    },
  ],
}));
const cleanedBody = await json(cleaned);
if (cleanedBody.ok !== true || cleanedBody.micro === null || cleanedBody.micro === undefined) {
  failures.push("(清洗) 有效成交應算出均價");
} else {
  check(cleaned.status === 200, "(清洗) 缺距離時仍回 200，因為官方檔沒有距離");
  check(cleanedBody.micro.weightedAverage?.dealIds.length === 1, "(清洗) 只有一筆進入均價");
  check(cleanedBody.micro.weightedAverage?.dealIds.includes("keep") === true, "(清洗) 正常建物有計入");
  check(cleanedBody.micro.excludedAbnormal === 2, "(清洗) 親友與毛胚不進均價");
  check(cleanedBody.micro.excludedInvalidUnitPrice === 1, "(清洗) 單價 0 被剔除");
  check(cleanedBody.micro.distanceKnown === false, "(清洗) 沒有距離公尺就不要宣稱是半徑搜尋");
  check(cleanedBody.micro.stage.detail.includes("不是 500 公尺圓"), "(清洗) 燈號說明寫明不是 500 公尺圓");
  const kept = cleanedBody.micro.rows.find((row) => row.id === "keep");
  check(kept?.unitPriceWanPerPing === 19.8, "(清洗) 60000 元/平方公尺是 19.8 萬/坪");
  check(kept?.tradedOn === "2026-06-01", "(清洗) 1150601 轉成 2026-06-01");
  check(cleanedBody.micro.rows.some((row) => row.id === "relative" && row.verdict === "已排除・備註異常"), "(清洗) 親友交易留在清單但標成排除");
  check(!cleanedBody.micro.rows.some((row) => row.id === "other-district"), "(清洗) 別的行政區不進入這次查詢");
  check(!cleanedBody.micro.rows.some((row) => row.id === "blank-price"), "(清洗) 單價 0 不留在清單");
}

const noDistance = await post({ query: "臺北市大安區仁愛路四段1號" }, ready({
  records: [{ 編號: "x", 交易標的: "房地", 交易年月日: "1150601", 土地位置建物門牌: "某址", 總價元: 1, 建物移轉總面積平方公尺: 30 }],
}));
check(noDistance.status === 200, "沒有單價的官方列被剔除，請求本身仍然完成");

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

check(rocDateToIso(1121015) === "2023-10-15", "民國 1121015 是 2023-10-15");
check(rocDateToIso("1150902") === "2026-09-02", "民國 1150902 是 2026-09-02");
check(unitPriceWanPerPing(82_975) === 27.4, "82975 元/平方公尺是 27.4 萬/坪");
const endpoint = buildGovOpenDataUrl("臺北市大安區仁愛路四段1號", "2026-10-21", GOV_OPEN_DATA_URL);
check(endpoint.startsWith("https://plvr.land.moi.gov.tw/DownloadSeason?"), "使用內政部 DownloadSeason");
check(endpoint.includes("season=115S3"), "2026 年 10 月抓上一季 115S3");
check(endpoint.includes("fileName=A_lvr_land_A.csv"), "臺北市檔名是 A_lvr_land_A.csv");
const table = parseGovBody(`鄉鎮市區,交易標的,土地位置建物門牌,交易年月日,總價元,單價元平方公尺,建物移轉總面積平方公尺,備註
district,sign,plate,day,price,unit,area,note
大安區,房地,臺北市大安區仁愛路,"1150601",20000000,60000,33.06,"親友、員工，含逗號"
`);
const first = Array.isArray(table) ? (table[0] as { 備註?: string; 交易年月日?: string }) : undefined;
check(first?.交易年月日 === "1150601", "CSV 會跳過英文標題列");
check(first?.備註 === "親友、員工，含逗號", "備註裡的逗號不會把欄位切開");

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

type ApiBody = {
  ok: boolean;
  outcome?: string;
  micro?: {
    warning: string | null;
    stage: { lamp: string; detail: string };
    excludedParking: number;
    excludedLand: number;
    excludedAbnormal: number;
    excludedInvalidUnitPrice: number;
    distanceKnown: boolean;
    weightedAverage: {
      averageUnitPricePerPing: number;
      netPriceTotal: number;
      netPingTotal: number;
      dealIds: string[];
    } | null;
    rows: { id: string; tradedOn: string; verdict: string; unitPriceWanPerPing: number | null }[];
  } | null;
  macro: {
    area: string;
    provider: string;
    projects: { id: string; state: string; milestone: string | null }[];
  };
};

async function json(response: Response): Promise<ApiBody> {
  return response.json() as Promise<ApiBody>;
}

function check(condition: boolean, message: string): void {
  if (!condition) failures.push(message);
}

function sameIds(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && expected.every((id) => actual.includes(id));
}

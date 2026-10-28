import { calendarDate, MicroPricingInputError } from "../micro-pricing/index.js";
import { GovPayloadError } from "./errors.js";

/** 1 坪 = 3.30579 平方公尺。只用於「單價元平方公尺」換成萬/坪。 */
export const SQM_TO_PING = 3.30579;

const ABNORMAL_REMARKS = ["親友", "關係人", "毛胚", "持分"] as const;

/** 內政部實價登錄檔的縣市代碼。檔名第一個字母。 */
const COUNTY_CODES: Readonly<Record<string, string>> = {
  臺北市: "A",
  臺中市: "B",
  基隆市: "C",
  臺南市: "D",
  高雄市: "E",
  新北市: "F",
  宜蘭縣: "G",
  桃園市: "H",
  嘉義市: "I",
  新竹縣: "J",
  苗栗縣: "K",
  南投縣: "M",
  彰化縣: "N",
  新竹市: "O",
  雲林縣: "P",
  嘉義縣: "Q",
  屏東縣: "T",
  花蓮縣: "U",
  臺東縣: "V",
  金門縣: "W",
  澎湖縣: "X",
  連江縣: "Z",
};

export type GovLocation = {
  readonly county: string;
  readonly code: string;
  readonly district: string | null;
};

/** 1121015、1150902，或已經是 YYYY-MM-DD。 */
export function rocDateToIso(raw: string | number): string {
  const text = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(text)) return calendarDate(text);
  const digits = text.replace(/\D/gu, "");
  if (digits.length !== 7) {
    throw new GovPayloadError(`交易年月日無法換算：${text}`);
  }
  const iso = `${Number(digits.slice(0, 3)) + 1911}-${digits.slice(3, 5)}-${digits.slice(5, 7)}`;
  try {
    return calendarDate(iso);
  } catch (caught) {
    if (caught instanceof MicroPricingInputError) {
      throw new GovPayloadError(`交易年月日無法換算：${text}`);
    }
    throw caught;
  }
}

/** 空值、空白或 0 都是無效單價，不能進入加權均價。 */
export function readUnitPricePerSqm(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim();
  if (text.length === 0) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

/** 單價元平方公尺 × 3.30579，再除以 10000，取到小數第一位。 */
export function unitPriceWanPerPing(unitPricePerSqm: number): number {
  const wan = (unitPricePerSqm * SQM_TO_PING) / 10_000;
  return Math.round(wan * 10) / 10;
}

export function hasAbnormalRemark(note: string): boolean {
  return ABNORMAL_REMARKS.some((word) => note.includes(word));
}

export function locateGovFile(query: string): GovLocation {
  const text = query.trim().replaceAll("台", "臺");
  const countyMatch = /^(.+?[縣市])/u.exec(text);
  const county = countyMatch?.[1];
  if (county === undefined) {
    throw new MicroPricingInputError("請在標的裡寫上縣市，例如臺北市大安區仁愛路");
  }
  const code = COUNTY_CODES[county];
  if (code === undefined) {
    throw new MicroPricingInputError(`內政部開放資料沒有「${county}」的縣市檔`);
  }
  const districtMatch = /^(.+?[縣市])(.+?(?:區|鄉|鎮|市))/u.exec(text);
  const district = districtMatch?.[2] ?? null;
  return { county, code, district: district === null || district.length === 0 ? null : district };
}

/** 當季通常還沒公布，抓上一個已結束的季。2026-10-21 → 115S3。 */
export function previousPublishedSeason(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/u.exec(isoDate);
  const yearText = match?.[1];
  const monthText = match?.[2];
  if (yearText === undefined || monthText === undefined) {
    throw new GovPayloadError("資料日必須是 YYYY-MM-DD");
  }
  const year = Number(yearText);
  const month = Number(monthText);
  const currentQuarter = Math.floor((month - 1) / 3) + 1;
  const publishedQuarter = currentQuarter === 1 ? 4 : currentQuarter - 1;
  const publishedYear = currentQuarter === 1 ? year - 1 : year;
  return `${publishedYear - 1911}S${publishedQuarter}`;
}

export function buildGovOpenDataUrl(query: string, today: string, base: string): string {
  const located = locateGovFile(query);
  const url = new URL(base);
  url.searchParams.set("season", previousPublishedSeason(today));
  url.searchParams.set("fileName", `${located.code}_lvr_land_A.csv`);
  return url.toString();
}

export function samePlaceName(left: string, right: string): boolean {
  return left.replaceAll("臺", "台") === right.replaceAll("臺", "台");
}

/** 官方檔是 CSV。轉成與開放資料 JSON 相同的一列一個物件。 */
export function parseGovBody(text: string): unknown {
  const trimmed = text.trimStart().replace(/^\uFEFF/u, "");
  if (trimmed.startsWith("<")) {
    throw new GovPayloadError("內政部這一季的實價登錄檔尚未公布");
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      throw new GovPayloadError("政府回傳不是 JSON");
    }
  }
  return csvToRecords(trimmed);
}

export function csvToRecords(text: string): Record<string, string>[] {
  const table = parseCsvTable(text);
  const headers = table[0];
  if (headers === undefined || !headers.includes("交易年月日") || !headers.includes("單價元平方公尺")) {
    throw new GovPayloadError("政府 CSV 缺少交易年月日或單價元平方公尺");
  }
  const second = table[1]?.[0] ?? "";
  const dataStart = /[A-Za-z]/u.test(second) ? 2 : 1;
  const records: Record<string, string>[] = [];
  for (const row of table.slice(dataStart)) {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });
    records.push(record);
  }
  return records;
}

function parseCsvTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const source = text.replace(/^\uFEFF/u, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else if (char !== undefined) {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r" && char !== undefined) {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value.trim().length > 0));
}

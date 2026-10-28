import { GovNotConfiguredError, GovPayloadError, GovUpstreamError } from "./errors.js";
import { parseGovBody } from "./moi-fields.js";

/**
 * 內政部不動產成交案件實際資訊資料供應系統。
 * 依縣市組出 `season` 與 `fileName`，例如 115S3 的臺北市買賣檔。
 * 實際回應是 CSV，進 API 前會轉成與開放資料 JSON 相同的一列一個物件。
 */
export const GOV_OPEN_DATA_URL = "https://plvr.land.moi.gov.tw/DownloadSeason";

export const GOV_FETCH_TIMEOUT_MS = 20_000;
const MAX_GOV_BODY_CHARS = 20_000_000;

export function isGovOpenDataConfigured(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function taipeiToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export async function fetchGovOpenData(input: {
  readonly query: string;
  readonly url: string;
  readonly signal: AbortSignal;
}): Promise<unknown> {
  if (!isGovOpenDataConfigured(input.url)) {
    throw new GovNotConfiguredError(
      "政府 Open Data 網址尚未設定。請把 GOV_OPEN_DATA_URL 換成內政部實價登錄端點。",
    );
  }

  let response: Response;
  try {
    response = await fetch(input.url, {
      method: "GET",
      headers: {
        accept: "text/csv, application/json;q=0.9, */*;q=0.8",
        "user-agent": "real-estate-ai/1.0",
      },
      signal: input.signal,
      redirect: "follow",
    });
  } catch (caught) {
    if (isTimeoutError(caught)) throw caught;
    throw new GovUpstreamError(0);
  }

  if (!response.ok) {
    throw new GovUpstreamError(response.status);
  }

  const text = await response.text();
  if (text.length > MAX_GOV_BODY_CHARS) {
    throw new GovPayloadError("政府回傳超過可處理的大小");
  }
  return parseGovBody(text);
}

export function isTimeoutError(caught: unknown): boolean {
  return caught instanceof Error && (caught.name === "TimeoutError" || caught.name === "AbortError");
}

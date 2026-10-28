import { GovNotConfiguredError, GovPayloadError, GovUpstreamError } from "./errors.js";

/**
 * 內政部不動產實價登錄 Open Data 的預留位置。
 * 換成實際的 https 端點後，`/api/transactions` 才會向外抓資料。
 * 在那之前故意不是網址，請求會回 503，不會打到猜出來的主機。
 */
export const GOV_OPEN_DATA_URL = "REPLACE_WITH_INTERIOR_ACTUAL_PRICE_ENDPOINT";

export const GOV_FETCH_TIMEOUT_MS = 8_000;
const MAX_GOV_BODY_CHARS = 5_000_000;

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

  const endpoint = new URL(input.url);
  endpoint.searchParams.set("q", input.query);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: { accept: "application/json" },
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
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new GovPayloadError("政府回傳不是 JSON");
  }
}

export function isTimeoutError(caught: unknown): boolean {
  return caught instanceof Error && (caught.name === "TimeoutError" || caught.name === "AbortError");
}

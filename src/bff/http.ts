import { MicroPricingInputError } from "../micro-pricing/index.js";
import { GovNotConfiguredError, GovPayloadError, GovUpstreamError } from "./errors.js";
import {
  fetchGovOpenData,
  GOV_FETCH_TIMEOUT_MS,
  GOV_OPEN_DATA_URL,
  isGovOpenDataConfigured,
  isTimeoutError,
  taipeiToday,
} from "./gov-open-data.js";
import { areaFromQuery, macroTimeline, type MacroTimelinePayload } from "./macro-timeline.js";
import { normalizeGovPayload } from "./normalize-listings.js";
import { quoteNormalized, readSubject, type MicroQuotePayload } from "./quote-response.js";

export type TransactionsDeps = {
  readonly govOpenDataUrl?: string;
  readonly fetchGov?: (input: {
    readonly query: string;
    readonly url: string;
    readonly signal: AbortSignal;
  }) => Promise<unknown>;
  readonly today?: () => string;
};

type ErrorCode =
  | "BAD_QUERY"
  | "GOV_NOT_CONFIGURED"
  | "GOV_TIMEOUT"
  | "GOV_UPSTREAM"
  | "GOV_PAYLOAD"
  | "INTERNAL";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "cache-control": "no-store",
};

export async function handleTransactionsRequest(request: Request, deps: TransactionsDeps = {}): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return fail(405, "BAD_QUERY", "只接受 GET 或 POST");
  }

  try {
    const asked = await readRequestQuery(request);
    if (asked.query.length === 0 && asked.area.length === 0) {
      return fail(400, "BAD_QUERY", "請輸入門牌地址或地號");
    }

    const today = deps.today?.() ?? taipeiToday();
    const area = areaFromQuery(asked.query, asked.area);
    if (asked.query.length === 0) {
      return ok({
        ok: true,
        outcome: "macro-only",
        micro: null,
        macro: macroTimeline({ area, observedOn: today }),
      });
    }

    readSubject(asked.query);
    const url = deps.govOpenDataUrl ?? GOV_OPEN_DATA_URL;
    if (!isGovOpenDataConfigured(url)) {
      throw new GovNotConfiguredError(
        "政府 Open Data 網址尚未設定。請把 GOV_OPEN_DATA_URL 換成內政部實價登錄端點。",
      );
    }

    const payload = await loadGovPayload(asked.query, url, deps.fetchGov);
    const quoted = quoteNormalized({
      query: asked.query,
      feed: normalizeGovPayload(payload),
      today,
    });
    return ok({
      ok: true,
      outcome: quoted.outcome,
      source: "interior-actual-price-api",
      provider: "內政部實價登錄",
      asOf: quoted.asOf,
      query: asked.query,
      micro: quoted.micro,
      macro: macroTimeline({ area, observedOn: quoted.asOf }),
    });
  } catch (caught) {
    return failFrom(caught);
  }
}

async function loadGovPayload(
  query: string,
  url: string,
  fetchGov: TransactionsDeps["fetchGov"],
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException("政府 Open Data 逾時", "TimeoutError"));
  }, GOV_FETCH_TIMEOUT_MS);
  try {
    const load = fetchGov ?? fetchGovOpenData;
    return await load({ query, url, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readRequestQuery(request: Request): Promise<{ query: string; area: string }> {
  if (request.method === "GET") {
    const url = new URL(request.url);
    return {
      query: textParam(url.searchParams.get("q") ?? url.searchParams.get("query")),
      area: textParam(url.searchParams.get("area")),
    };
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new MicroPricingInputError("請提供 JSON，包含 query");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new MicroPricingInputError("請提供 JSON，包含 query");
  }
  const record = body as Record<string, unknown>;
  const query = record.query ?? record.q;
  const area = record.area;
  if (query !== undefined && typeof query !== "string") {
    throw new MicroPricingInputError("query 必須是字串");
  }
  if (area !== undefined && typeof area !== "string") {
    throw new MicroPricingInputError("area 必須是字串");
  }
  return {
    query: textParam(typeof query === "string" ? query : null),
    area: textParam(typeof area === "string" ? area : null),
  };
}

function textParam(value: string | null): string {
  return value === null ? "" : value.trim();
}

function failFrom(caught: unknown): Response {
  if (caught instanceof MicroPricingInputError) return fail(400, "BAD_QUERY", caught.message);
  if (caught instanceof GovNotConfiguredError) return fail(503, "GOV_NOT_CONFIGURED", caught.message);
  if (isTimeoutError(caught)) return fail(504, "GOV_TIMEOUT", "政府 Open Data 逾時，請稍後再試");
  if (caught instanceof GovUpstreamError) {
    const message =
      caught.status === 0 ? "無法連線到政府 Open Data" : `政府 Open Data 回應 ${caught.status}`;
    return fail(502, "GOV_UPSTREAM", message);
  }
  if (caught instanceof GovPayloadError) return fail(422, "GOV_PAYLOAD", caught.message);
  console.error(caught);
  return fail(500, "INTERNAL", "行情服務暫時無法完成計算");
}

function ok(body: {
  readonly ok: true;
  readonly outcome: "macro-only" | "matched" | "insufficient";
  readonly source?: "interior-actual-price-api";
  readonly provider?: "內政部實價登錄";
  readonly asOf?: string;
  readonly query?: string;
  readonly micro: MicroQuotePayload | null;
  readonly macro: MacroTimelinePayload;
}): Response {
  return Response.json(body, { status: 200, headers: CORS_HEADERS });
}

function fail(status: number, code: ErrorCode, message: string): Response {
  return Response.json(
    { ok: false, error: { code, message } },
    { status, headers: CORS_HEADERS },
  );
}

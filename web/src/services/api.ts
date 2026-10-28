/**
 * 瀏覽器只打同源的 /api/transactions。
 * 清洗、加權均價與三階防呆都在後端完成。
 */

export type ConstructionState = "verified" | "verifying";

export type ConstructionProject = {
  readonly id: string;
  readonly name: string;
  readonly state: ConstructionState;
  readonly badge: string;
  readonly milestone: string | null;
};

export type CompetitorCrawlResult = {
  readonly source: "online-competitor-crawler";
  readonly provider: "線上競品爬蟲";
  readonly area: string;
  readonly observedOn: string;
  readonly projects: readonly ConstructionProject[];
};

export type StageLamp = "baseline" | "expanded" | "stopped";

export type DealRow = {
  readonly id: string;
  readonly address: string;
  readonly tradedOn: string;
  readonly distanceMeters: number;
  readonly assetLabel: string;
  readonly verdict: string;
  readonly included: boolean;
  readonly unitPriceWanPerPing: number | null;
};

export type MicroQuote = {
  readonly subjectLabel: string;
  readonly note: string;
  readonly stage: {
    readonly lamp: StageLamp;
    readonly tone: "green" | "yellow" | "red";
    readonly title: string;
    readonly detail: string;
  };
  readonly phases: readonly string[];
  readonly searched: {
    readonly phase: string;
    readonly radiusMeters: number;
    readonly withinMonths: number;
  };
  readonly warning: string | null;
  readonly weightedAverage: {
    readonly method: "area-weighted-net-of-parking";
    readonly averageUnitPricePerPing: number;
    readonly netPriceTotal: number;
    readonly netPingTotal: number;
    readonly dealIds: readonly string[];
  } | null;
  readonly excludedParking: number;
  readonly excludedLand: number;
  readonly inseparable: number;
  readonly excludedInvalidUnitPrice: number;
  readonly excludedAbnormal: number;
  readonly distanceKnown: boolean;
  readonly rows: readonly DealRow[];
};

export type TransactionsPayload = {
  readonly ok: true;
  readonly outcome: "matched" | "insufficient";
  readonly asOf: string;
  readonly micro: MicroQuote;
  readonly macro: CompetitorCrawlResult;
};

export async function fetchTransactions(query: string): Promise<TransactionsPayload> {
  const response = await fetch(`/api/transactions?q=${encodeURIComponent(query.trim())}`);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("伺服器沒有回傳可讀的行情資料");
  }
  if (!response.ok || !isTransactionsPayload(body)) {
    throw new Error(errorMessage(body, response.status));
  }
  return body;
}

function errorMessage(body: unknown, status: number): string {
  if (isRecord(body) && isRecord(body.error) && typeof body.error.message === "string" && body.error.message.trim().length > 0) {
    return body.error.message;
  }
  if (status === 504) return "內政部資料下載逾時，請稍後再試";
  return `查詢失敗（${status}）`;
}

function isTransactionsPayload(value: unknown): value is TransactionsPayload {
  if (!isRecord(value) || value.ok !== true) return false;
  if (value.outcome !== "matched" && value.outcome !== "insufficient") return false;
  if (typeof value.asOf !== "string") return false;
  return isMicroQuote(value.micro) && isMacro(value.macro);
}

function isMicroQuote(value: unknown): value is MicroQuote {
  if (!isRecord(value)) return false;
  if (typeof value.subjectLabel !== "string" || typeof value.note !== "string") return false;
  if (!isRecord(value.stage) || !isLamp(value.stage.lamp) || typeof value.stage.title !== "string") return false;
  if (typeof value.stage.detail !== "string") return false;
  if (!Array.isArray(value.phases) || !Array.isArray(value.rows)) return false;
  if (!isRecord(value.searched) || typeof value.searched.withinMonths !== "number") return false;
  if (typeof value.searched.radiusMeters !== "number" || typeof value.searched.phase !== "string") return false;
  if (value.warning !== null && typeof value.warning !== "string") return false;
  if (typeof value.distanceKnown !== "boolean") return false;
  if (typeof value.excludedParking !== "number" || typeof value.excludedLand !== "number") return false;
  if (typeof value.excludedInvalidUnitPrice !== "number" || typeof value.excludedAbnormal !== "number") return false;
  if (typeof value.inseparable !== "number") return false;
  if (value.weightedAverage !== null && !isWeightedAverage(value.weightedAverage)) return false;
  return value.rows.every(isDealRow);
}

function isWeightedAverage(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.averageUnitPricePerPing === "number" &&
    typeof value.netPriceTotal === "number" &&
    typeof value.netPingTotal === "number" &&
    Array.isArray(value.dealIds)
  );
}

function isDealRow(value: unknown): value is DealRow {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.address === "string" &&
    typeof value.tradedOn === "string" &&
    typeof value.distanceMeters === "number" &&
    typeof value.assetLabel === "string" &&
    typeof value.verdict === "string" &&
    typeof value.included === "boolean" &&
    (value.unitPriceWanPerPing === null || typeof value.unitPriceWanPerPing === "number")
  );
}

function isMacro(value: unknown): value is CompetitorCrawlResult {
  if (!isRecord(value) || typeof value.area !== "string" || typeof value.observedOn !== "string") return false;
  if (value.provider !== "線上競品爬蟲" || !Array.isArray(value.projects)) return false;
  return value.projects.every(isProject);
}

function isProject(value: unknown): value is ConstructionProject {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.state === "verified" || value.state === "verifying") &&
    typeof value.badge === "string" &&
    (value.milestone === null || typeof value.milestone === "string")
  );
}

function isLamp(value: unknown): value is StageLamp {
  return value === "baseline" || value === "expanded" || value === "stopped";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import { GovPayloadError } from "./errors.js";
import {
  buildingDeal,
  calendarDate,
  distanceMeters,
  landDeal,
  MicroPricingInputError,
  parkingDeal,
  type NearbyInput,
} from "../micro-pricing/index.js";

const SQM_PER_PING = 3.305785;

export type NormalizedFeed = {
  readonly asOf: string | null;
  readonly listings: readonly NearbyInput[];
};

/** 把政府 JSON 收成行情引擎吃的周邊成交。純車位與純土地留著，交給三階防呆判斷。 */
export function normalizeGovPayload(payload: unknown): NormalizedFeed {
  if (Array.isArray(payload)) {
    return { asOf: null, listings: payload.map((row, index) => readMoi(row, index)) };
  }
  if (!isRecord(payload)) {
    throw new GovPayloadError("政府回傳必須是 JSON 物件或陣列");
  }

  const asOf = readOptionalDate(payload.asOf);
  if (Array.isArray(payload.listings)) {
    return { asOf, listings: payload.listings.map((row, index) => readPrepared(row, index)) };
  }
  if (Array.isArray(payload.records)) {
    return { asOf, listings: payload.records.map((row, index) => readMoi(row, index)) };
  }
  throw new GovPayloadError("政府回傳缺少 listings 或 records");
}

function readPrepared(raw: unknown, index: number): NearbyInput {
  if (!isRecord(raw) || !isRecord(raw.deal)) {
    throw new GovPayloadError(`第 ${index + 1} 筆成交格式不正確`);
  }
  const meters = readDistance(raw.distanceMeters, index);
  try {
    return { distanceMeters: distanceMeters(meters), deal: readPreparedDeal(raw.deal) };
  } catch (caught) {
    rethrowAsPayload(caught, index);
  }
}

function readPreparedDeal(raw: Record<string, unknown>) {
  const id = textField(raw, "id");
  const tradedOn = textField(raw, "tradedOn");
  const publishedAddress = textField(raw, "publishedAddress");
  const totalPrice = integerField(raw, "totalPrice");
  if (raw.asset === "building") {
    return buildingDeal({
      id,
      tradedOn,
      publishedAddress,
      totalPrice,
      buildingAreaPing: numberField(raw, "buildingAreaPing"),
      landSharePing: nullableNumber(raw, "landSharePing"),
      parking: readParking(raw.parking),
    });
  }
  if (raw.asset === "land") {
    return landDeal({
      id,
      tradedOn,
      publishedAddress,
      totalPrice,
      landAreaPing: numberField(raw, "landAreaPing"),
    });
  }
  if (raw.asset === "parking") {
    return parkingDeal({
      id,
      tradedOn,
      publishedAddress,
      totalPrice,
      spaceCount: numberField(raw, "spaceCount"),
      areaPing: nullableNumber(raw, "areaPing"),
    });
  }
  throw new GovPayloadError("成交類型必須是 building、land 或 parking");
}

function readMoi(raw: unknown, index: number): NearbyInput {
  if (!isRecord(raw)) throw new GovPayloadError(`第 ${index + 1} 筆不是物件`);
  const meters = readDistance(raw["距離公尺"] ?? raw.distanceMeters, index);
  const id = textOr(raw, ["編號", "id"], `gov-${index + 1}`);
  const tradedOn = toIsoDate(raw["交易年月日"] ?? raw.tradedOn, index);
  const publishedAddress = textOr(raw, ["土地位置建物門牌", "publishedAddress"], "");
  if (publishedAddress.length === 0) {
    throw new GovPayloadError(`第 ${index + 1} 筆缺少土地位置建物門牌`);
  }
  const totalPrice = integerOr(raw, ["總價元", "totalPrice"], index);
  const asset = moiAsset(raw["交易標的"] ?? raw.asset, index);

  try {
    if (asset === "land") {
      return {
        distanceMeters: distanceMeters(meters),
        deal: landDeal({
          id,
          tradedOn,
          publishedAddress,
          totalPrice,
          landAreaPing: pingFrom(raw, ["土地移轉總面積平方公尺", "landAreaPing"], index),
        }),
      };
    }
    if (asset === "parking") {
      return {
        distanceMeters: distanceMeters(meters),
        deal: parkingDeal({
          id,
          tradedOn,
          publishedAddress,
          totalPrice,
          spaceCount: positiveOr(raw, ["車位移轉總筆數", "spaceCount"], 1),
          areaPing: optionalPing(raw, ["車位移轉總面積平方公尺", "areaPing"]) ?? null,
        }),
      };
    }
    return {
      distanceMeters: distanceMeters(meters),
      deal: buildingDeal({
        id,
        tradedOn,
        publishedAddress,
        totalPrice,
        buildingAreaPing: pingFrom(raw, ["建物移轉總面積平方公尺", "buildingAreaPing"], index),
        landSharePing: null,
        parking: moiParking(raw),
      }),
    };
  } catch (caught) {
    rethrowAsPayload(caught, index);
  }
}

function moiAsset(raw: unknown, index: number): "building" | "land" | "parking" {
  if (raw === "building" || raw === "land" || raw === "parking") return raw;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new GovPayloadError(`第 ${index + 1} 筆缺少交易標的`);
  }
  const label = raw.trim();
  if (label === "車位") return "parking";
  if (label === "土地") return "land";
  return "building";
}

function moiParking(raw: Record<string, unknown>) {
  const price = optionalInteger(raw, ["車位總價元"]);
  const area = optionalPing(raw, ["車位移轉總面積平方公尺"]);
  if (price === undefined && area === undefined) return { kind: "none" as const };
  const spaceCount = positiveOr(raw, ["車位移轉總筆數"], 1);
  if (price === undefined || price <= 0) {
    return { kind: "unpriced" as const, spaceCount, areaPing: area ?? null };
  }
  return { kind: "priced" as const, spaceCount, price, areaPing: area ?? null };
}

function pingFrom(raw: Record<string, unknown>, keys: readonly string[], index: number): number {
  const ping = optionalPing(raw, keys);
  if (ping === undefined) throw new GovPayloadError(`第 ${index + 1} 筆缺少面積`);
  return ping;
}

function optionalPing(raw: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (value === undefined || value === null || value === "") continue;
    const amount = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new GovPayloadError(`${key} 必須是不小於 0 的數字`);
    }
    if (amount === 0) return undefined;
    return key.endsWith("平方公尺") ? amount / SQM_PER_PING : amount;
  }
  return undefined;
}

function readDistance(raw: unknown, index: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    throw new GovPayloadError(`第 ${index + 1} 筆缺少距離公尺，還不能做半徑防呆`);
  }
  return raw;
}

function readOptionalDate(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") throw new GovPayloadError("asOf 必須是 YYYY-MM-DD");
  try {
    return calendarDate(raw);
  } catch (caught) {
    if (caught instanceof MicroPricingInputError) throw new GovPayloadError(caught.message);
    throw caught;
  }
}

function toIsoDate(raw: unknown, index: number): string {
  if (typeof raw !== "string" && typeof raw !== "number") {
    throw new GovPayloadError(`第 ${index + 1} 筆缺少交易年月日`);
  }
  const text = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(text)) return text;
  const digits = text.replace(/\D/gu, "");
  if (digits.length !== 7) throw new GovPayloadError(`第 ${index + 1} 筆的交易年月日無法換算`);
  const rocYear = Number(digits.slice(0, 3));
  return `${rocYear + 1911}-${digits.slice(3, 5)}-${digits.slice(5, 7)}`;
}

function readParking(raw: unknown) {
  if (!isRecord(raw)) throw new GovPayloadError("車位格式不正確");
  if (raw.kind === "none") return { kind: "none" as const };
  if (raw.kind === "priced") {
    return {
      kind: "priced" as const,
      spaceCount: numberField(raw, "spaceCount"),
      price: integerField(raw, "price"),
      areaPing: nullableNumber(raw, "areaPing"),
    };
  }
  if (raw.kind === "unpriced") {
    return {
      kind: "unpriced" as const,
      spaceCount: numberField(raw, "spaceCount"),
      areaPing: nullableNumber(raw, "areaPing"),
    };
  }
  throw new GovPayloadError("車位格式不正確");
}

function textOr(raw: Record<string, unknown>, keys: readonly string[], fallback: string): string {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return fallback;
}

function integerOr(raw: Record<string, unknown>, keys: readonly string[], index: number): number {
  for (const key of keys) {
    if (raw[key] !== undefined) return integerValue(raw[key], key);
  }
  throw new GovPayloadError(`第 ${index + 1} 筆缺少總價元`);
}

function optionalInteger(raw: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (value === undefined || value === null || value === "") continue;
    return integerValue(value, key);
  }
  return undefined;
}

function positiveOr(raw: Record<string, unknown>, keys: readonly string[], fallback: number): number {
  const value = optionalInteger(raw, keys);
  return value === undefined ? fallback : value;
}

function textField(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new GovPayloadError(`缺少 ${key}`);
  }
  return value;
}

function numberField(raw: Record<string, unknown>, key: string): number {
  const value = raw[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new GovPayloadError(`${key} 必須是數字`);
  }
  return value;
}

function integerField(raw: Record<string, unknown>, key: string): number {
  return integerValue(raw[key], key);
}

function integerValue(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new GovPayloadError(`${key} 必須是整數元`);
  }
  return value;
}

function nullableNumber(raw: Record<string, unknown>, key: string): number | null {
  const value = raw[key];
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new GovPayloadError(`${key} 必須是數字或 null`);
  }
  return value;
}

function rethrowAsPayload(caught: unknown, index: number): never {
  if (caught instanceof GovPayloadError) throw caught;
  if (caught instanceof MicroPricingInputError) {
    throw new GovPayloadError(`第 ${index + 1} 筆成交無法計價：${caught.message}`);
  }
  throw caught;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

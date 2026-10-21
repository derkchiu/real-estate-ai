import { MicroPricingInputError } from "./errors.js";

declare const calendarDateBrand: unique symbol;
declare const monthsBrand: unique symbol;
declare const metersBrand: unique symbol;
declare const twdBrand: unique symbol;
declare const pingBrand: unique symbol;
declare const twdPerPingBrand: unique symbol;
declare const positiveIntBrand: unique symbol;
declare const transactionIdBrand: unique symbol;

/** ISO 日期 `YYYY-MM-DD`。不用 `Date`，避免時區把同一天拆成兩個瞬間。 */
export type CalendarDate = string & { readonly [calendarDateBrand]: "CalendarDate" };

/** 正整數月數。不能和公尺、金額互換。 */
export type Months = number & { readonly [monthsBrand]: "Months" };

/** 距離（公尺）。搜尋半徑必須大於 0；成交距標的可以是 0。 */
export type Meters = number & { readonly [metersBrand]: "Meters" };

/** 新臺幣整數元。 */
export type Twd = number & { readonly [twdBrand]: "Twd" };

/** 坪。只在邊界由平方公尺換算進來，領域內不再同時保存兩種面積。 */
export type Ping = number & { readonly [pingBrand]: "Ping" };

/** 每坪單價。只能由總價與坪數算出，呼叫端不能另外填一個對不上的單價。 */
export type TwdPerPing = number & { readonly [twdPerPingBrand]: "TwdPerPing" };

export type PositiveInt = number & { readonly [positiveIntBrand]: "PositiveInt" };

export type TransactionId = string & { readonly [transactionIdBrand]: "TransactionId" };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function calendarDate(raw: string): CalendarDate {
  const match = ISO_DATE.exec(raw.trim());
  const yearText = match?.[1];
  const monthText = match?.[2];
  const dayText = match?.[3];
  if (yearText === undefined || monthText === undefined || dayText === undefined) {
    throw new MicroPricingInputError("日期必須是 YYYY-MM-DD");
  }

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new MicroPricingInputError(`不存在的日期：${raw}`);
  }

  return `${yearText}-${monthText}-${dayText}` as CalendarDate;
}

export function months(value: number): Months {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new MicroPricingInputError("月份必須是正整數");
  }
  return value as Months;
}

/** 搜尋半徑。0 公尺不能當成搜尋窗。 */
export function searchRadius(value: number): Meters {
  if (!Number.isFinite(value) || value <= 0) {
    throw new MicroPricingInputError("搜尋半徑必須大於 0 公尺");
  }
  return value as Meters;
}

/** 成交與標的的距離。同一棟可以是 0。 */
export function distanceMeters(value: number): Meters {
  if (!Number.isFinite(value) || value < 0) {
    throw new MicroPricingInputError("距離不能是負數");
  }
  return value as Meters;
}

export function twd(value: number): Twd {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new MicroPricingInputError("金額必須是不小於 0 的整數元");
  }
  return value as Twd;
}

export function ping(value: number): Ping {
  if (!Number.isFinite(value) || value <= 0) {
    throw new MicroPricingInputError("坪數必須大於 0");
  }
  return value as Ping;
}

export function twdPerPing(value: number): TwdPerPing {
  if (!Number.isFinite(value) || value < 0) {
    throw new MicroPricingInputError("單價必須是不小於 0 的有限數");
  }
  return value as TwdPerPing;
}

export function positiveInt(value: number): PositiveInt {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new MicroPricingInputError("數量必須是正整數");
  }
  return value as PositiveInt;
}

export function transactionId(value: string): TransactionId {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new MicroPricingInputError("交易編號不可為空白");
  }
  return trimmed as TransactionId;
}

export function labeledText(value: string, label: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) {
    throw new MicroPricingInputError(`${label}不可為空白`);
  }
  return trimmed;
}

export function shiftMonths(date: CalendarDate, deltaMonths: number): CalendarDate {
  if (!Number.isInteger(deltaMonths)) {
    throw new MicroPricingInputError("月份偏移必須是整數");
  }

  const { year, month, day } = splitDate(date);
  const index = year * 12 + (month - 1) + deltaMonths;
  const nextYear = Math.floor(index / 12);
  const nextMonth = index - nextYear * 12 + 1;
  const nextDay = Math.min(day, daysInMonth(nextYear, nextMonth));

  return calendarDate(
    `${String(nextYear).padStart(4, "0")}-${pad2(nextMonth)}-${pad2(nextDay)}`,
  );
}

/** 交易日落在 `(asOf 減 within 個月, asOf]` 的閉區間內（兩端都含）。 */
export function isOnOrBetween(date: CalendarDate, earliest: CalendarDate, latest: CalendarDate): boolean {
  return date >= earliest && date <= latest;
}

function splitDate(date: CalendarDate): { year: number; month: number; day: number } {
  const [yearText, monthText, dayText] = date.split("-");
  return {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

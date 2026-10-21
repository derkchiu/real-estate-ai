/**
 * 這些呼叫必須維持編譯失敗。
 * 它們不參與執行，用來鎖住「非法狀態無法被表示」。
 */
import {
  administrativeArea,
  advanceAfterMiss,
  assembleHistory,
  buildingDeal,
  calendarDate,
  classifyAttempt,
  DEFAULT_FAILSAFE_POLICY,
  defineFailsafePolicy,
  distanceMeters,
  doorplateProperty,
  landParcelProperty,
  openBaseline,
  publishInsufficient,
  publishMatched,
  SCARCITY_WARNING,
  type AdministrativeArea,
  type Months,
  type Property,
} from "./index.js";
import { widenDistanceWindow } from "./search-window.js";

const asOf = calendarDate("2026-10-21");
const subject = doorplateProperty("臺北市大安區仁愛路四段1號");
const baseline = openBaseline(DEFAULT_FAILSAFE_POLICY, asOf);
const doorplate = doorplateProperty("臺北市大安區仁愛路四段1號");

// @ts-expect-error 縣市與行政區必須成對，臺北市沒有板橋區
({ county: "臺北市", district: "板橋區" }) satisfies AdministrativeArea;

// @ts-expect-error 臺北市沒有板橋區
administrativeArea("臺北市", "板橋區");

// @ts-expect-error 地籍不能配對錯誤的行政區
landParcelProperty({ county: "臺北市", district: "板橋區", section: "通化段", lot: "12" });

// @ts-expect-error 地籍必須同時有縣市、行政區、地段、地號
landParcelProperty({ county: "臺北市", district: "大安區", section: "通化段" });

// @ts-expect-error 門牌與網址不能同時是同一個標的
({ kind: "doorplate", address: doorplate.address, url: "https://example.com/sale" }) satisfies Property;

// @ts-expect-error 公尺不能當成月份
const swapped: Months = distanceMeters(500);

// @ts-expect-error 第一階只能放寬時間，不能先放寬距離
defineFailsafePolicy({ baseline: { withinMonths: 12, radiusMeters: 500 }, onNoData: [{ stage: "widen-distance", radiusMeters: 1000 }, { stage: "widen-time", withinMonths: 24 }, { stage: "stop", warning: SCARCITY_WARNING }] });

// @ts-expect-error 第三階警語不可改寫
defineFailsafePolicy({ baseline: { withinMonths: 12, radiusMeters: 500 }, onNoData: [{ stage: "widen-time", withinMonths: 24 }, { stage: "widen-distance", radiusMeters: 1000 }, { stage: "stop", warning: "資料很少" }] });

const empty = assembleHistory({ subject, searched: baseline, nearby: [] });

// @ts-expect-error 基準窗還沒走完三階，不能發表交易極少
publishInsufficient(empty);

// @ts-expect-error 空的歷史不能發表均價
publishMatched(empty);

// @ts-expect-error 還沒放寬時間，不能直接放寬距離
widenDistanceWindow(baseline);

const hit = classifyAttempt(
  assembleHistory({
    subject,
    searched: baseline,
    nearby: [
      {
        distanceMeters: 80,
        deal: buildingDeal({
          id: "A1",
          tradedOn: "2026-04-01",
          publishedAddress: "臺北市大安區通化街1號",
          totalPrice: 30_000_000,
          buildingAreaPing: 30,
          landSharePing: null,
          parking: { kind: "none" },
        }),
      },
    ],
  }),
);

// @ts-expect-error 已經有成交樣本，不能再放寬條件
advanceAfterMiss(hit);

void swapped;
void asOf;

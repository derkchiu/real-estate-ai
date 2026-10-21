import { MicroPricingInputError } from "./errors.js";
import { months, searchRadius, type Meters, type Months } from "./measure.js";

/**
 * 實價登錄沒有樣本時的固定收尾句。
 * 字句本身是型別，不能換成另一句還假裝是同一階。
 */
export const SCARCITY_WARNING = "⚠️ 周邊交易極少，僅供參考";

export type ScarcityWarning = typeof SCARCITY_WARNING;

const policyBrand: unique symbol = Symbol("FailsafePolicy");

/**
 * 三階的順序寫死在 tuple 裡：
 * 1. 只放寬時間
 * 2. 只放寬距離
 * 3. 停止，並帶固定警語
 * 無法表示「先放寬距離」或「停了還繼續放寬」。
 */
export type FailsafePolicy = {
  readonly [policyBrand]: true;
  readonly baseline: {
    readonly withinMonths: Months;
    readonly radiusMeters: Meters;
  };
  readonly onNoData: readonly [
    { readonly stage: "widen-time"; readonly withinMonths: Months },
    { readonly stage: "widen-distance"; readonly radiusMeters: Meters },
    { readonly stage: "stop"; readonly warning: ScarcityWarning },
  ];
};

export type FailsafePolicyInput = {
  readonly baseline: {
    readonly withinMonths: number;
    readonly radiusMeters: number;
  };
  readonly onNoData: readonly [
    { readonly stage: "widen-time"; readonly withinMonths: number },
    { readonly stage: "widen-distance"; readonly radiusMeters: number },
    { readonly stage: "stop"; readonly warning: ScarcityWarning },
  ];
};

export function defineFailsafePolicy(input: FailsafePolicyInput): FailsafePolicy {
  const baselineMonths = months(input.baseline.withinMonths);
  const baselineRadius = searchRadius(input.baseline.radiusMeters);
  const widenedMonths = months(input.onNoData[0].withinMonths);
  const widenedRadius = searchRadius(input.onNoData[1].radiusMeters);
  const warning = input.onNoData[2].warning;

  if (widenedMonths <= baselineMonths) {
    throw new MicroPricingInputError("放寬後的月份必須大於基準月份");
  }
  if (widenedRadius <= baselineRadius) {
    throw new MicroPricingInputError("放寬後的半徑必須大於基準半徑");
  }
  if (warning !== SCARCITY_WARNING) {
    throw new MicroPricingInputError("第三階只能使用規定警語");
  }

  const onNoData = [
    Object.freeze({ stage: "widen-time" as const, withinMonths: widenedMonths }),
    Object.freeze({ stage: "widen-distance" as const, radiusMeters: widenedRadius }),
    Object.freeze({ stage: "stop" as const, warning }),
  ] as const;

  return Object.freeze({
    [policyBrand]: true as const,
    baseline: Object.freeze({
      withinMonths: baselineMonths,
      radiusMeters: baselineRadius,
    }),
    onNoData,
  });
}

/** Ticket 1 預設：12 個月 / 500 公尺 → 24 個月 → 1000 公尺 → 停止。 */
export const DEFAULT_FAILSAFE_POLICY: FailsafePolicy = defineFailsafePolicy({
  baseline: { withinMonths: 12, radiusMeters: 500 },
  onNoData: [
    { stage: "widen-time", withinMonths: 24 },
    { stage: "widen-distance", radiusMeters: 1000 },
    { stage: "stop", warning: SCARCITY_WARNING },
  ],
});

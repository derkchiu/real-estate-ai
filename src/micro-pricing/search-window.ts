import {
  DEFAULT_FAILSAFE_POLICY,
  type FailsafePolicy,
  type ScarcityWarning,
} from "./failsafe-config.js";
import { type CalendarDate, type Meters, type Months } from "./measure.js";

const windowBrand: unique symbol = Symbol("SearchWindow");

type WindowBase = {
  readonly [windowBrand]: true;
  readonly policy: FailsafePolicy;
  readonly asOf: CalendarDate;
  readonly withinMonths: Months;
  readonly radiusMeters: Meters;
};

/** 基準窗。月份與半徑只能來自設定檔，不能手填一組跳階的數字。 */
export type BaselineWindow = WindowBase & {
  readonly phase: "baseline";
};

/** 只放寬時間。半徑仍是基準半徑。 */
export type TimeWidenedWindow = WindowBase & {
  readonly phase: "time-widened";
};

/** 時間維持已放寬的值，再放寬半徑。 */
export type DistanceWidenedWindow = WindowBase & {
  readonly phase: "distance-widened";
};

/** 停止擴張。這扇窗沒有下一階。 */
export type ExhaustedWindow = WindowBase & {
  readonly phase: "exhausted";
  readonly warning: ScarcityWarning;
};

export type OpenSearchWindow = BaselineWindow | TimeWidenedWindow | DistanceWidenedWindow;

export type SearchWindow = OpenSearchWindow | ExhaustedWindow;

export function openBaseline(policy: FailsafePolicy, asOf: CalendarDate): BaselineWindow {
  return Object.freeze({
    [windowBrand]: true as const,
    phase: "baseline" as const,
    policy,
    asOf,
    withinMonths: policy.baseline.withinMonths,
    radiusMeters: policy.baseline.radiusMeters,
  });
}

export function openDefaultBaseline(asOf: CalendarDate): BaselineWindow {
  return openBaseline(DEFAULT_FAILSAFE_POLICY, asOf);
}

export function widenTimeWindow(window: BaselineWindow): TimeWidenedWindow {
  const [widenTime] = window.policy.onNoData;
  return Object.freeze({
    [windowBrand]: true as const,
    phase: "time-widened" as const,
    policy: window.policy,
    asOf: window.asOf,
    withinMonths: widenTime.withinMonths,
    radiusMeters: window.radiusMeters,
  });
}

export function widenDistanceWindow(window: TimeWidenedWindow): DistanceWidenedWindow {
  const widenDistance = window.policy.onNoData[1];
  return Object.freeze({
    [windowBrand]: true as const,
    phase: "distance-widened" as const,
    policy: window.policy,
    asOf: window.asOf,
    withinMonths: window.withinMonths,
    radiusMeters: widenDistance.radiusMeters,
  });
}

export function stopExpandingWindow(window: DistanceWidenedWindow): ExhaustedWindow {
  const stop = window.policy.onNoData[2];
  return Object.freeze({
    [windowBrand]: true as const,
    phase: "exhausted" as const,
    policy: window.policy,
    asOf: window.asOf,
    withinMonths: window.withinMonths,
    radiusMeters: window.radiusMeters,
    warning: stop.warning,
  });
}

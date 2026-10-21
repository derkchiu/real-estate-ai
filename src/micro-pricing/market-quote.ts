import { DEFAULT_FAILSAFE_POLICY, type FailsafePolicy } from "./failsafe-config.js";
import { isOnOrBetween, shiftMonths, type CalendarDate } from "./measure.js";
import { type Property } from "./property.js";
import { openBaseline, type SearchWindow } from "./search-window.js";
import {
  advanceAfterMiss,
  assembleHistory,
  classifyAttempt,
  publishInsufficient,
  publishMatched,
  type MicroPricingResult,
  type NearbyInput,
} from "./transaction.js";

/** 模擬實價登錄。呼叫端給全量成交，搜尋窗自己決定這一階看得到哪些筆。 */
export type SimulatedActualPriceApi = {
  readonly listings: readonly NearbyInput[];
};

export type MarketQuote = {
  readonly phases: readonly SearchWindow["phase"][];
  readonly result: MicroPricingResult;
};

/**
 * 依三階防呆查模擬實價：基準窗有可比較建物就停；
 * 沒有就先放寬時間、再放寬距離，最後才停止並帶警語。
 */
export function quoteMarket(input: {
  readonly subject: Property;
  readonly asOf: CalendarDate;
  readonly api: SimulatedActualPriceApi;
  readonly policy?: FailsafePolicy;
}): MarketQuote {
  const policy = input.policy ?? DEFAULT_FAILSAFE_POLICY;
  const baseline = openBaseline(policy, input.asOf);
  const atBaseline = classifyAttempt(historyFor(input, baseline));
  if (atBaseline.kind === "hit") {
    return freezeQuote(["baseline"], publishMatched(atBaseline));
  }

  const timeWidened = advanceAfterMiss(atBaseline);
  const atTime = classifyAttempt(historyFor(input, timeWidened));
  if (atTime.kind === "hit") {
    return freezeQuote(["baseline", "time-widened"], publishMatched(atTime));
  }

  const distanceWidened = advanceAfterMiss(atTime);
  const atDistance = classifyAttempt(historyFor(input, distanceWidened));
  if (atDistance.kind === "hit") {
    return freezeQuote(["baseline", "time-widened", "distance-widened"], publishMatched(atDistance));
  }

  const exhausted = advanceAfterMiss(atDistance);
  return freezeQuote(
    ["baseline", "time-widened", "distance-widened", "exhausted"],
    publishInsufficient(historyFor(input, exhausted)),
  );
}

function historyFor<W extends SearchWindow>(
  input: {
    readonly subject: Property;
    readonly api: SimulatedActualPriceApi;
  },
  window: W,
) {
  return assembleHistory({
    subject: input.subject,
    searched: window,
    nearby: listingsInside(input.api.listings, window),
  });
}

function freezeQuote(phases: readonly SearchWindow["phase"][], result: MicroPricingResult): MarketQuote {
  return Object.freeze({
    phases: Object.freeze(phases),
    result,
  });
}

function listingsInside(listings: readonly NearbyInput[], window: SearchWindow): NearbyInput[] {
  const earliest = shiftMonths(window.asOf, -window.withinMonths);
  return listings.filter(
    (item) =>
      item.distanceMeters >= 0 &&
      item.distanceMeters <= window.radiusMeters &&
      isOnOrBetween(item.deal.tradedOn, earliest, window.asOf),
  );
}

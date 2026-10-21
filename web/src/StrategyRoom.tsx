import { useState } from "react";

type PsycheId = "rational" | "defensive" | "pride";

const PSYCHES: readonly {
  id: PsycheId;
  emoji: string;
  label: string;
  title: string;
}[] = [
  { id: "rational", emoji: "📊", label: "理性數據型", title: "數據錨定策略" },
  { id: "defensive", emoji: "🛡️", label: "風險防禦型", title: "安全邊際策略" },
  { id: "pride", emoji: "👑", label: "情感自負型 (天價屋主)", title: "VIP 精品定價策略" },
];

export function StrategyRoom({
  averagePerPing,
  subjectLabel,
}: {
  averagePerPing: number | null;
  subjectLabel: string;
}) {
  const [psyche, setPsyche] = useState<PsycheId>("pride");
  const place = placeLabel(subjectLabel);
  const selected = PSYCHES.find((item) => item.id === psyche) ?? PSYCHES[2];
  const script =
    averagePerPing === null || selected === undefined
      ? null
      : scriptFor(selected.id, selected.title, place, averagePerPing);

  return (
    <section
      className="rounded-2xl bg-ink p-5 text-slate-100 shadow-sm sm:p-6"
      aria-labelledby="strategy-room-heading"
      data-testid="strategy-room"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-brass">從數據到開口</p>
          <h2 id="strategy-room-heading" className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
            🎯 戰略情報室 (Strategy Room)
          </h2>
        </div>
        <p className="text-sm text-slate-300" data-testid="strategy-anchor">
          {averagePerPing === null
            ? "這一階還沒有可引用的加權均價"
            : `話術已帶入 ${place} 加權均價 ${formatWan(averagePerPing)} 萬/坪`}
        </p>
      </div>

      <div className="mt-5">
        <p className="text-xs tracking-[0.14em] text-slate-400">客戶心理選擇器</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3" role="tablist" aria-label="客戶心理類型">
          {PSYCHES.map((item) => {
            const active = item.id === psyche;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`psyche-tab-${item.id}`}
                aria-selected={active}
                aria-controls="strategy-script"
                data-testid={`psyche-${item.id}`}
                onClick={() => setPsyche(item.id)}
                className={`rounded-xl border px-4 py-4 text-left transition ${
                  active
                    ? "border-brass bg-white text-ink shadow-sm"
                    : "border-white/15 bg-white/5 text-slate-100 hover:border-white/40 hover:bg-white/10"
                }`}
              >
                <span className="block text-2xl leading-none" aria-hidden="true">
                  {item.emoji}
                </span>
                <span className="mt-2 block text-sm font-medium leading-6">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <article
        key={`${psyche}-${averagePerPing ?? "none"}-${place}`}
        id="strategy-script"
        role="tabpanel"
        aria-labelledby={`psyche-tab-${psyche}`}
        data-testid="strategy-script"
        className="strategy-reveal mt-4 rounded-2xl border border-white/10 bg-white p-5 text-ink sm:p-6"
      >
        <p className="text-xs tracking-[0.14em] text-slate-500">系統建議話術</p>
        {script === null ? (
          <p className="mt-4 text-sm leading-7 text-slate-700" data-testid="strategy-copy">
            周邊交易太少，加權均價還沒有站住。先不要對客戶報甜蜜點；等這一階算出均價，話術裡的數字會跟著換。
          </p>
        ) : (
          <p className="mt-4 text-base leading-8 text-slate-800" data-testid="strategy-copy">
            【{script.title}】：{script.body}
          </p>
        )}
      </article>
    </section>
  );
}

function scriptFor(
  psyche: PsycheId,
  title: string,
  place: string,
  perPing: number,
): { title: string; body: string } {
  const wan = formatWan(perPing);
  if (psyche === "pride") {
    const band = wanBand(perPing, 1.03, 1.07);
    return {
      title,
      body: `王董，您這間房子在${place}上絕對是極品。但我們實算過，排除極端值後周邊最乾淨的加權均價落在 ${wan} 萬/坪。為了精準鎖定金字塔頂端的置產客，我們建議採用精品定價，將價格微調至 ${band} 萬的甜蜜點。同時，趁現在高點獲利了結，我們能將資金轉入具備『中階增值』潛力的台中巨蛋周邊，長線增值絕對遠勝過在這裡跟單一買方耗時間。`,
    };
  }
  if (psyche === "rational") {
    const band = wanBand(perPing, 0.98, 1.02);
    return {
      title,
      body: `王董，把${place}攤開來對。我們實算過，排除極端值後周邊最乾淨的加權均價落在 ${wan} 萬/坪。建議掛牌就錨在 ${band} 萬，買方估價表會自己對上，情緒殺價少一輪。條件可以談，錨點不要先讓。`,
    };
  }
  const band = wanBand(perPing, 0.96, 1);
  return {
    title,
    body: `王董，${place}現在最貴的不是少賣一點，是掛太久。我們實算過，排除極端值後周邊最乾淨的加權均價落在 ${wan} 萬/坪。建議把可成交帶放在 ${band} 萬的內側，先鎖有把握的買方。成交後把資金轉進台中巨蛋周邊，空窗的利息比多扛幾週價格更貴。`,
  };
}

function wanBand(perPing: number, lowRatio: number, highRatio: number): string {
  const wan = perPing / 10_000;
  const low = Math.round(wan * lowRatio);
  const high = Math.max(low, Math.round(wan * highRatio));
  return `${low}-${high}`;
}

function formatWan(perPing: number): string {
  const wan = perPing / 10_000;
  const digits = Number.isInteger(wan) ? 0 : 1;
  return wan.toLocaleString("zh-TW", {
    minimumFractionDigits: digits,
    maximumFractionDigits: 1,
  });
}

function placeLabel(subject: string): string {
  const road = /(?:^|市|縣|區|鄉|鎮|村|里)([^\s市縣區鄉鎮村里]{1,10}(?:路|街|大道)(?:[一二三四五六七八九十\d]{1,3}段)?)/gu;
  let found: string | undefined;
  for (const match of subject.matchAll(road)) {
    const name = match[1];
    if (name !== undefined) found = name;
  }
  if (found !== undefined) return found;
  const section = subject.match(/(?:區|鄉|鎮|市|縣)([\u4e00-\u9fff]{1,8}段)/u);
  if (section?.[1] !== undefined) return section[1];
  return "這個路段";
}

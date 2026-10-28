import { useRef, useState, type FormEvent } from "react";
import { DEFAULT_FAILSAFE_POLICY, SCARCITY_WARNING } from "../../src/micro-pricing/index.js";
import { SAMPLE_QUERIES } from "./fixtures.js";
import { LoadingPanel, MacroTrendSection } from "./MacroTrend.js";
import { StrategyRoom } from "./StrategyRoom.js";
import { fetchTransactions, type CompetitorCrawlResult, type MicroQuote, type StageLamp } from "./services/api.js";

const [widenTime, widenDistance] = DEFAULT_FAILSAFE_POLICY.onNoData;
const baseline = DEFAULT_FAILSAFE_POLICY.baseline;

type LampTone = "green" | "yellow" | "red";

const LAMPS: readonly {
  id: StageLamp;
  tone: LampTone;
  kicker: string;
  title: string;
  lines: readonly [string, string];
}[] = [
  {
    id: "baseline",
    tone: "green",
    kicker: "綠燈",
    title: "第一階",
    lines: [`${baseline.radiusMeters} 公尺`, `${baseline.withinMonths} 個月`],
  },
  {
    id: "expanded",
    tone: "yellow",
    kicker: "黃燈",
    title: "第二階擴展",
    lines: [`${widenDistance.radiusMeters} 公尺`, `${widenTime.withinMonths} 個月`],
  },
  {
    id: "stopped",
    tone: "red",
    kicker: "紅燈",
    title: "第三階",
    lines: ["停止擴張", "僅供參考"],
  },
];

export function App() {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<MicroQuote | null>(null);
  const [macro, setMacro] = useState<CompetitorCrawlResult | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const runId = useRef(0);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = runId.current + 1;
    runId.current = id;
    const address = query.trim();
    if (address.length === 0) {
      setView(null);
      setMacro(null);
      setAsOf(null);
      setError("請輸入門牌地址或地號");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = await fetchTransactions(address);
      if (runId.current !== id) return;
      setView(payload.micro);
      setMacro(payload.macro);
      setAsOf(payload.asOf);
    } catch (caught) {
      if (runId.current !== id) return;
      setView(null);
      setMacro(null);
      setAsOf(null);
      setError(messageFrom(caught));
    } finally {
      if (runId.current === id) setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-[1240px] flex-col md:flex-row">
        <Sidebar />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 md:px-10 md:py-8">
          <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-5">
            <div>
              <p className="text-xs tracking-[0.18em] text-brass">行情分析台</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-[1.7rem]">微觀實價比對</h2>
            </div>
            <p className="text-sm text-slate-500">資料日 {asOf ?? "尚未查詢"}</p>
          </header>

          <form onSubmit={onSubmit} className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <label htmlFor="subject" className="text-sm font-medium text-slate-600">
              標的
            </label>
            <div className="mt-3 flex flex-col gap-3 lg:flex-row">
              <input
                id="subject"
                data-testid="query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="請輸入門牌地址或地號..."
                autoComplete="off"
                className="h-16 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 text-lg text-ink outline-none transition placeholder:text-slate-400 focus:border-ink focus:bg-white"
              />
              <button
                type="submit"
                data-testid="submit"
                disabled={busy}
                className="h-16 shrink-0 rounded-xl bg-ink px-6 text-base font-medium text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-500"
              >
                {busy ? "分析中…" : "🚀 啟動行情分析"}
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <span className="text-xs text-slate-500">範例標的</span>
              {SAMPLE_QUERIES.map((sample) => (
                <button
                  key={sample.query}
                  type="button"
                  onClick={() => setQuery(sample.query)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-sm text-slate-700 transition hover:border-slate-400 hover:bg-white"
                >
                  {sample.label}
                  <span className="ml-2 text-xs text-slate-400">{sample.hint}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              請寫上縣市與行政區，例如「臺北市大安區仁愛路四段1號」。系統會下載該縣市這一季的內政部實價登錄，只留下同一個行政區。
            </p>
          </form>

          {error !== null ? (
            <p role="alert" data-testid="error" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {error}
            </p>
          ) : null}

          <section aria-live="polite" className="mt-6">
            {busy ? (
              <LoadingPanel
                detail="正在下載內政部實價登錄並清洗，通常需要數秒，請先不要關閉畫面。"
                testId="searching"
              />
            ) : null}
            {!busy && view === null && error === null ? <Idle /> : null}
            {!busy && view !== null ? <Result view={view} /> : null}
          </section>

          <MacroTrendSection busy={busy} result={macro} error={error} />
        </main>
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="border-b border-slate-800 bg-ink text-slate-100 md:w-[272px] md:shrink-0 md:border-b-0 md:border-r">
      <div className="px-6 py-6 md:py-8">
        <p className="text-xs tracking-[0.16em] text-brass">房仲內部工具</p>
        <h1 className="mt-2 text-[1.65rem] font-semibold tracking-tight">微觀行情</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">把實價登錄收成一個可對客戶說明的均價。</p>
      </div>
      <dl className="grid grid-cols-2 gap-px border-t border-white/10 bg-white/10 text-sm md:grid-cols-1">
        <Fact label="基準窗" value={`${baseline.withinMonths} 個月 / ${baseline.radiusMeters} 公尺`} />
        <Fact label="放寬時間" value={`${widenTime.withinMonths} 個月`} />
        <Fact label="放寬距離" value={`${widenDistance.radiusMeters} 公尺`} />
        <Fact label="計價" value="扣除車位後的加權均價" />
      </dl>
      <p className="hidden px-6 py-5 text-xs leading-5 text-slate-400 md:block">{SCARCITY_WARNING}</p>
    </aside>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink px-6 py-3">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-1 text-slate-100">{value}</dd>
    </div>
  );
}

function Idle() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-10 text-center">
      <p className="text-sm text-slate-500">輸入門牌或地號後啟動。結果會顯示加權均價，以及目前亮起的防呆燈號。</p>
      <div className="mx-auto mt-6 flex max-w-xl justify-center gap-6">
        {LAMPS.map((lamp) => (
          <Lamp key={lamp.id} lamp={lamp} active={false} />
        ))}
      </div>
    </div>
  );
}

function Result({ view }: { view: MicroQuote }) {
  const searched = view.searched;
  const price = view.weightedAverage;

  return (
    <div className="space-y-4" data-testid="result">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs tracking-[0.14em] text-slate-500">加權均價</p>
          <p className="mt-2 truncate text-sm text-slate-600" data-testid="subject">
            {view.subjectLabel}
          </p>
          {price !== null ? (
            <div data-testid="average">
              <p className="mt-4 font-serif text-5xl leading-none tracking-tight text-ink sm:text-6xl">
                {formatWan(price.averageUnitPricePerPing)}
                <span className="ml-2 font-sans text-lg font-medium text-slate-500">萬元/坪</span>
              </p>
              <p className="mt-3 text-sm text-slate-600">
                {formatInteger(price.averageUnitPricePerPing)} 元/坪
              </p>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                {formatInteger(price.netPriceTotal)} 元 ÷ {formatNumber(price.netPingTotal)} 坪
                <span className="mx-2 text-slate-300">·</span>
                {price.dealIds.length} 筆建物
              </p>
            </div>
          ) : (
            <div data-testid="average">
              <p className="mt-4 font-serif text-5xl text-slate-300">—</p>
              <p data-testid="warning" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-800">
                {view.warning ?? "沒有可計算的均價"}
              </p>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-400">{view.note}</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs tracking-[0.14em] text-slate-500">防呆燈號</p>
          <p className="mt-3 text-xl font-semibold text-ink" data-testid="stage">
            {view.stage.title}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{view.stage.detail}</p>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {LAMPS.map((lamp) => (
              <Lamp key={lamp.id} lamp={lamp} active={lamp.id === view.stage.lamp} />
            ))}
          </div>
          <p className="mt-5 text-xs leading-5 text-slate-500">
            搜尋路徑：{view.phases.map((phase) => phaseLabel(phase)).join(" → ")}
            <span className="mx-2 text-slate-300">·</span>
            {view.distanceKnown
              ? `停在 ${searched.radiusMeters} 公尺 / ${searched.withinMonths} 個月`
              : `時間窗 ${searched.withinMonths} 個月 · 同一行政區`}
          </p>
        </article>
      </div>

      <StrategyRoom
        averagePerPing={price?.averageUnitPricePerPing ?? null}
        subjectLabel={view.subjectLabel}
      />

      <div
        data-testid="exclusion"
        className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-950"
      >
        <p className="font-medium">已自動排除純車位與土地</p>
        <p className="mt-1 text-emerald-900/80">
          本窗純車位 {view.excludedParking} 筆、純土地 {view.excludedLand} 筆，沒有進入分子或分母。
          {view.inseparable > 0 ? ` 另有 ${view.inseparable} 筆建物因車位無法拆分，未計入均價。` : ""}
          {view.excludedInvalidUnitPrice > 0 ? ` 單價空白或為 0 的 ${view.excludedInvalidUnitPrice} 筆已剔除。` : ""}
          {view.excludedAbnormal > 0 ? ` 備註含親友、關係人、毛胚或持分的 ${view.excludedAbnormal} 筆已剔除。` : ""}
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-medium text-ink">這一階看得到的成交</h3>
          <p className="text-xs text-slate-500">{view.rows.length} 筆</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">距離</th>
                <th className="px-3 py-3 font-medium">交易日</th>
                <th className="px-3 py-3 font-medium">標的</th>
                <th className="px-3 py-3 font-medium">類型</th>
                <th className="px-3 py-3 font-medium">單價</th>
                <th className="px-5 py-3 font-medium">判定</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-5 py-3 tabular-nums text-slate-700">
                    {view.distanceKnown ? `${row.distanceMeters} m` : "同區"}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-slate-600">{row.tradedOn}</td>
                  <td className="px-3 py-3 text-ink">{row.address}</td>
                  <td className="px-3 py-3 text-slate-600">{row.assetLabel}</td>
                  <td className="px-3 py-3 tabular-nums text-slate-700">
                    {row.unitPriceWanPerPing === null ? "—" : `${formatOneDecimal(row.unitPriceWanPerPing)} 萬`}
                  </td>
                  <td className={`px-5 py-3 ${row.included ? "font-medium text-emerald-800" : "text-slate-500"}`}>
                    {row.verdict}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Lamp({
  lamp,
  active,
}: {
  lamp: (typeof LAMPS)[number];
  active: boolean;
}) {
  const lit: Record<LampTone, string> = {
    green: "bg-emerald-500 shadow-[0_0_14px_rgba(16,185,129,0.85)]",
    yellow: "bg-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.9)]",
    red: "bg-rose-500 shadow-[0_0_14px_rgba(244,63,94,0.8)]",
  };
  return (
    <div className={`text-center ${active ? "" : "opacity-40"}`} data-testid={`lamp-${lamp.id}`} data-active={active ? "true" : "false"}>
      <span
        aria-hidden="true"
        className={`mx-auto block h-3.5 w-3.5 rounded-full ${active ? lit[lamp.tone] : "bg-slate-300"}`}
      />
      <p className="mt-2 text-[11px] text-slate-400">{active ? `${lamp.kicker}・亮起` : lamp.kicker}</p>
      <p className="mt-0.5 text-sm font-medium leading-5 text-ink">{lamp.title}</p>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">{lamp.lines[0]}</p>
      <p className="text-[11px] leading-4 text-slate-500">{lamp.lines[1]}</p>
    </div>
  );
}

function formatWan(perPing: number): string {
  const wan = perPing / 10_000;
  const digits = Number.isInteger(wan) ? 0 : 1;
  return wan.toLocaleString("zh-TW", {
    minimumFractionDigits: digits,
    maximumFractionDigits: 1,
  });
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString("zh-TW");
}

function formatNumber(value: number): string {
  return value.toLocaleString("zh-TW", { maximumFractionDigits: 2 });
}

function formatOneDecimal(value: number): string {
  return value.toLocaleString("zh-TW", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function phaseLabel(phase: string): string {
  switch (phase) {
    case "baseline":
      return "基準窗";
    case "time-widened":
      return "放寬時間";
    case "distance-widened":
      return "放寬距離";
    case "exhausted":
      return "停止擴張";
    default:
      return phase;
  }
}

function messageFrom(caught: unknown): string {
  if (caught instanceof Error && caught.message.trim().length > 0) return caught.message;
  return "分析失敗，請改寫標的後再試。";
}

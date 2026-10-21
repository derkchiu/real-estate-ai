import { useEffect, useState } from "react";
import type { CompetitorCrawlResult, ConstructionProject } from "./services/api.js";

const CHECK_STEPS = [
  { projectId: null, text: "連線公開工程與開幕公告…" },
  { projectId: "hanshin-intercontinental", text: "查核漢神洲際購物廣場開幕進度…" },
  { projectId: "taichung-dome", text: "查核台中巨蛋建設進度…" },
  { projectId: null, text: "本輪校正完成：1 項已驗證，1 項持續追蹤" },
] as const;

const BLIPS: Record<string, { left: string; top: string }> = {
  "hanshin-intercontinental": { left: "68%", top: "30%" },
  "taichung-dome": { left: "34%", top: "63%" },
};

export function LoadingPanel({ detail, testId }: { detail: string; testId: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={testId}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="relative h-1 overflow-hidden bg-slate-100">
        <span className="loading-bar absolute inset-y-0 left-0 w-1/3 bg-brass" />
      </div>
      <div className="flex items-center gap-4 px-6 py-8">
        <span
          aria-hidden="true"
          className="h-11 w-11 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-ink motion-reduce:animate-none"
        />
        <div>
          <p className="text-sm font-medium tracking-wide text-ink">Loading... (讀取中)</p>
          <p className="mt-1 text-sm text-slate-500">{detail}</p>
        </div>
      </div>
    </div>
  );
}

export function MacroTrendSection({
  busy,
  result,
}: {
  busy: boolean;
  result: CompetitorCrawlResult | null;
}) {
  return (
    <section className="mt-8 border-t border-slate-200 pt-8" aria-labelledby="macro-heading" data-testid="macro-trend">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-brass">宏觀趨勢雷達</p>
          <h2 id="macro-heading" className="mt-1 text-2xl font-semibold tracking-tight text-ink">
            宏觀趨勢與建設動態
          </h2>
        </div>
        {result !== null ? <p className="text-sm text-slate-500">觀測範圍 {result.area}</p> : null}
      </div>

      <div className="mt-6">
        {busy || result === null ? (
          <LoadingPanel detail="正在透過線上競品爬蟲查核建設進度" testId="macro-loading" />
        ) : (
          <div className="grid gap-4 min-[1080px]:grid-cols-2">
            <Timeline projects={result.projects} />
            <Grounding result={result} />
          </div>
        )}
      </div>
    </section>
  );
}

function Timeline({ projects }: { projects: readonly ConstructionProject[] }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" data-testid="construction-timeline">
      <p className="text-xs tracking-[0.14em] text-slate-500">重大建設時間軸</p>
      <ol className="mt-6 space-y-8 border-l border-slate-200 pl-6">
        {projects.map((project) => (
          <li key={project.id} className="relative" data-testid={`project-${project.id}`}>
            <span
              aria-hidden="true"
              className={`absolute -left-[1.85rem] top-1.5 h-3 w-3 rounded-full ring-4 ring-white ${
                project.state === "verified" ? "bg-emerald-500" : "animate-pulse bg-amber-400 motion-reduce:animate-none"
              }`}
            />
            <p className={`text-xs font-medium ${project.state === "verified" ? "text-emerald-800" : "text-amber-800"}`}>
              {project.badge}
            </p>
            <p className="mt-1 text-lg font-semibold tracking-tight text-ink">{project.name}</p>
            <p className="mt-2 text-sm text-slate-600">
              {project.milestone !== null ? (
                <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-900">{project.milestone}</span>
              ) : (
                <span className="text-slate-500">進度持續校正中</span>
              )}
            </p>
          </li>
        ))}
      </ol>
    </article>
  );
}

function Grounding({ result }: { result: CompetitorCrawlResult }) {
  const [step, setStep] = useState(0);
  const current = CHECK_STEPS[step] ?? CHECK_STEPS[0];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStep((index) => (index + 1) % CHECK_STEPS.length);
    }, 1700);
    return () => window.clearInterval(timer);
  }, []);

  const checking = current.projectId !== null || step === 0;
  const activeId = current.projectId;

  return (
    <article className="rounded-2xl bg-ink p-6 text-slate-100 shadow-sm" data-testid="grounding">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h3 className="text-base font-semibold leading-6">🔄 Real-Time Grounding (即時動態校正)</h3>
        <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-xs text-slate-200">
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-70 motion-reduce:hidden ${
                checking ? "animate-ping bg-amber-300" : "bg-emerald-300"
              }`}
            />
            <span className={`relative h-2.5 w-2.5 rounded-full ${checking ? "bg-amber-300" : "bg-emerald-400"}`} />
          </span>
          {checking ? "校正中" : "已更新"}
        </span>
      </div>

      <div className="mt-5 grid items-center gap-4 grid-cols-1 min-[420px]:grid-cols-[132px_minmax(0,1fr)]">
        <Radar projects={result.projects} activeId={activeId} />
        <div>
          <p className="text-xs tracking-[0.14em] text-brass">{result.provider}</p>
          <p role="status" aria-live="polite" className="mt-2 min-h-12 text-sm leading-6 text-slate-100" data-testid="grounding-status">
            {current.text}
          </p>
          <p className="text-xs text-slate-400">校正基準 {result.observedOn}</p>
        </div>
      </div>

      <ul className="mt-5 space-y-2 border-t border-white/10 pt-4 text-sm">
        {result.projects.map((project) => {
          const active = project.id === activeId;
          return (
            <li
              key={project.id}
              className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${active ? "bg-white/10" : ""}`}
            >
              <span className="text-slate-100">{project.name}</span>
              <span className={project.state === "verified" ? "text-emerald-300" : "text-amber-200"}>
                {project.state === "verified" ? "已驗證" : "驗證中"}
              </span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function Radar({
  projects,
  activeId,
}: {
  projects: readonly ConstructionProject[];
  activeId: string | null;
}) {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[168px]" aria-hidden="true">
      <div className="absolute inset-0 overflow-hidden rounded-full border border-white/15 bg-white/[0.03]">
        <span className="radar-sweep absolute inset-0" />
        <span className="absolute inset-[18%] rounded-full border border-white/10" />
        <span className="absolute inset-[36%] rounded-full border border-white/10" />
        <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/10" />
        <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/10" />
      </div>
      {projects.map((project) => {
        const spot = BLIPS[project.id];
        if (spot === undefined) return null;
        const live = project.id === activeId || project.state === "verifying";
        return (
          <span key={project.id} className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2" style={spot}>
            {live ? (
              <span
                className={`absolute inset-0 rounded-full motion-reduce:hidden ${
                  project.state === "verified" ? "animate-ping bg-emerald-300/80" : "animate-ping bg-amber-300/80"
                }`}
              />
            ) : null}
            <span
              className={`relative block h-2.5 w-2.5 rounded-full ${
                project.state === "verified" ? "bg-emerald-400" : "bg-amber-300"
              } ${project.id === activeId ? "ring-2 ring-white" : ""}`}
            />
          </span>
        );
      })}
    </div>
  );
}

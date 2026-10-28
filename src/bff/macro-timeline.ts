/**
 * 與前端重大建設時間軸、動態查核雷達圖相同的欄位。
 * `id` 必須維持這兩個值，雷達圖才找得到點位。
 */
export type ConstructionTimelineProject = {
  readonly id: string;
  readonly name: string;
  readonly state: "verified" | "verifying";
  readonly badge: string;
  readonly milestone: string | null;
};

export type MacroTimelinePayload = {
  readonly source: "online-competitor-crawler";
  readonly provider: "線上競品爬蟲";
  readonly area: string;
  readonly observedOn: string;
  readonly projects: readonly ConstructionTimelineProject[];
};

const PROJECTS: readonly ConstructionTimelineProject[] = [
  {
    id: "hanshin-intercontinental",
    name: "漢神洲際購物廣場",
    state: "verified",
    badge: "已驗證：末段補漲",
    milestone: "2026-04 已開幕",
  },
  {
    id: "taichung-dome",
    name: "台中巨蛋",
    state: "verifying",
    badge: "驗證中：中階增值",
    milestone: null,
  },
];

export function macroTimeline(input: { readonly area: string; readonly observedOn: string }): MacroTimelinePayload {
  return {
    source: "online-competitor-crawler",
    provider: "線上競品爬蟲",
    area: input.area,
    observedOn: input.observedOn,
    projects: PROJECTS,
  };
}

export function areaFromQuery(query: string, explicit: string): string {
  const given = explicit.trim();
  if (given.length > 0) return given.replaceAll("臺", "台");
  const county = /^(.+?[縣市])/u.exec(query.trim());
  const name = county?.[1];
  if (name !== undefined && name.length > 0) return name.replaceAll("臺", "台");
  return "台中市";
}

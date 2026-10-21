export const AS_OF = "2026-10-21";

export const SAMPLE_QUERIES = [
  {
    label: "南興一路",
    query: "台中市北屯區南興一路",
    hint: "機捷特區",
  },
  {
    label: "仁愛路四段1號",
    query: "臺北市大安區仁愛路四段1號",
    hint: "第一階",
  },
  {
    label: "通化街1號",
    query: "臺北市大安區通化街1號",
    hint: "無對應成交",
  },
  {
    label: "復興南路1號",
    query: "臺北市大安區復興南路1號",
    hint: "無對應成交",
  },
] as const;

export type DemoCorpus = "baseline" | "widened" | "scarce";

export function corpusNote(corpus: DemoCorpus): string {
  switch (corpus) {
    case "baseline":
      return "行情資料庫已對上這個路段的成交。";
    case "widened":
      return "行情資料庫：近距離沒有可比較建物，已放寬搜尋。";
    case "scarce":
      return "行情資料庫沒有這個地址的成交，已停止擴張。";
  }
}

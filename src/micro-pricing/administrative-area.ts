import { MicroPricingInputError } from "./errors.js";

/**
 * 縣市與行政區綁在同一個聯集上。
 * `臺北市 + 板橋區` 無法通過型別，也無法通過解析。
 * 目錄用內政部用字（臺、區）；邊界會把「台／区」收成同一寫法。
 */
export const DISTRICTS_BY_COUNTY = {
  臺北市: ["中正區", "大同區", "中山區", "松山區", "大安區", "萬華區", "信義區", "士林區", "北投區", "內湖區", "南港區", "文山區"],
  新北市: ["板橋區", "三重區", "中和區", "永和區", "新莊區", "新店區", "樹林區", "鶯歌區", "三峽區", "淡水區", "汐止區", "瑞芳區", "土城區", "蘆洲區", "五股區", "泰山區", "林口區", "深坑區", "石碇區", "坪林區", "三芝區", "石門區", "八里區", "平溪區", "雙溪區", "貢寮區", "金山區", "萬里區", "烏來區"],
  桃園市: ["桃園區", "中壢區", "平鎮區", "八德區", "楊梅區", "蘆竹區", "大溪區", "龍潭區", "龜山區", "大園區", "觀音區", "新屋區", "復興區"],
  臺中市: ["中區", "東區", "南區", "西區", "北區", "北屯區", "西屯區", "南屯區", "太平區", "大里區", "霧峰區", "烏日區", "豐原區", "后里區", "石岡區", "東勢區", "和平區", "新社區", "潭子區", "大雅區", "神岡區", "大肚區", "沙鹿區", "龍井區", "梧棲區", "清水區", "大甲區", "外埔區", "大安區"],
  臺南市: ["中西區", "東區", "南區", "北區", "安平區", "安南區", "永康區", "歸仁區", "新化區", "左鎮區", "玉井區", "楠西區", "南化區", "仁德區", "關廟區", "龍崎區", "官田區", "麻豆區", "佳里區", "西港區", "七股區", "將軍區", "學甲區", "北門區", "新營區", "後壁區", "白河區", "東山區", "六甲區", "下營區", "柳營區", "鹽水區", "善化區", "大內區", "山上區", "新市區", "安定區"],
  高雄市: ["楠梓區", "左營區", "鼓山區", "三民區", "鹽埕區", "前金區", "新興區", "苓雅區", "前鎮區", "旗津區", "小港區", "鳳山區", "林園區", "大寮區", "大樹區", "大社區", "仁武區", "鳥松區", "岡山區", "橋頭區", "燕巢區", "田寮區", "阿蓮區", "路竹區", "湖內區", "茄萣區", "永安區", "彌陀區", "梓官區", "旗山區", "美濃區", "六龜區", "甲仙區", "杉林區", "內門區", "茂林區", "桃源區", "那瑪夏區"],
  基隆市: ["仁愛區", "信義區", "中正區", "中山區", "安樂區", "暖暖區", "七堵區"],
  新竹市: ["東區", "北區", "香山區"],
  嘉義市: ["東區", "西區"],
  新竹縣: ["竹北市", "竹東鎮", "新埔鎮", "關西鎮", "湖口鄉", "新豐鄉", "芎林鄉", "橫山鄉", "北埔鄉", "寶山鄉", "峨眉鄉", "尖石鄉", "五峰鄉"],
  苗栗縣: ["苗栗市", "頭份市", "苑裡鎮", "通霄鎮", "竹南鎮", "後龍鎮", "卓蘭鎮", "大湖鄉", "公館鄉", "銅鑼鄉", "南庄鄉", "頭屋鄉", "三義鄉", "西湖鄉", "造橋鄉", "三灣鄉", "獅潭鄉", "泰安鄉"],
  彰化縣: ["彰化市", "員林市", "鹿港鎮", "和美鎮", "北斗鎮", "溪湖鎮", "田中鎮", "二林鎮", "線西鄉", "伸港鄉", "福興鄉", "秀水鄉", "花壇鄉", "芬園鄉", "大村鄉", "埔鹽鄉", "埔心鄉", "永靖鄉", "社頭鄉", "二水鄉", "田尾鄉", "埤頭鄉", "芳苑鄉", "大城鄉", "竹塘鄉", "溪州鄉"],
  南投縣: ["南投市", "埔里鎮", "草屯鎮", "竹山鎮", "集集鎮", "名間鄉", "鹿谷鄉", "中寮鄉", "魚池鄉", "國姓鄉", "水里鄉", "信義鄉", "仁愛鄉"],
  雲林縣: ["斗六市", "斗南鎮", "虎尾鎮", "西螺鎮", "土庫鎮", "北港鎮", "古坑鄉", "大埤鄉", "莿桐鄉", "林內鄉", "二崙鄉", "崙背鄉", "麥寮鄉", "東勢鄉", "褒忠鄉", "臺西鄉", "元長鄉", "四湖鄉", "口湖鄉", "水林鄉"],
  嘉義縣: ["太保市", "朴子市", "布袋鎮", "大林鎮", "民雄鄉", "溪口鄉", "新港鄉", "六腳鄉", "東石鄉", "義竹鄉", "鹿草鄉", "水上鄉", "中埔鄉", "竹崎鄉", "梅山鄉", "番路鄉", "大埔鄉", "阿里山鄉"],
  屏東縣: ["屏東市", "潮州鎮", "東港鎮", "恆春鎮", "萬丹鄉", "長治鄉", "麟洛鄉", "九如鄉", "里港鄉", "鹽埔鄉", "高樹鄉", "萬巒鄉", "內埔鄉", "竹田鄉", "新埤鄉", "枋寮鄉", "新園鄉", "崁頂鄉", "林邊鄉", "南州鄉", "佳冬鄉", "琉球鄉", "車城鄉", "滿州鄉", "枋山鄉", "三地門鄉", "霧臺鄉", "瑪家鄉", "泰武鄉", "來義鄉", "春日鄉", "獅子鄉", "牡丹鄉"],
  宜蘭縣: ["宜蘭市", "羅東鎮", "蘇澳鎮", "頭城鎮", "礁溪鄉", "壯圍鄉", "員山鄉", "冬山鄉", "五結鄉", "三星鄉", "大同鄉", "南澳鄉"],
  花蓮縣: ["花蓮市", "鳳林鎮", "玉里鎮", "新城鄉", "吉安鄉", "壽豐鄉", "光復鄉", "豐濱鄉", "瑞穗鄉", "富里鄉", "秀林鄉", "萬榮鄉", "卓溪鄉"],
  臺東縣: ["臺東市", "成功鎮", "關山鎮", "卑南鄉", "鹿野鄉", "池上鄉", "東河鄉", "長濱鄉", "太麻里鄉", "大武鄉", "綠島鄉", "海端鄉", "延平鄉", "金峰鄉", "達仁鄉", "蘭嶼鄉"],
  澎湖縣: ["馬公市", "湖西鄉", "白沙鄉", "西嶼鄉", "望安鄉", "七美鄉"],
  金門縣: ["金城鎮", "金湖鎮", "金沙鎮", "金寧鄉", "烈嶼鄉", "烏坵鄉"],
  連江縣: ["南竿鄉", "北竿鄉", "莒光鄉", "東引鄉"],
} as const;

type CountyName = keyof typeof DISTRICTS_BY_COUNTY;

const DISTRICT_COUNT = {
  臺北市: 12,
  新北市: 29,
  桃園市: 13,
  臺中市: 29,
  臺南市: 37,
  高雄市: 38,
  基隆市: 7,
  新竹市: 3,
  嘉義市: 2,
  新竹縣: 13,
  苗栗縣: 18,
  彰化縣: 26,
  南投縣: 13,
  雲林縣: 20,
  嘉義縣: 18,
  屏東縣: 33,
  宜蘭縣: 12,
  花蓮縣: 13,
  臺東縣: 16,
  澎湖縣: 6,
  金門縣: 6,
  連江縣: 4,
} as const satisfies Record<CountyName, number>;

export type County = CountyName;

export type DistrictOf<C extends County> = (typeof DISTRICTS_BY_COUNTY)[C][number];

/** 縣市與所屬行政區是一組，不能拆開各自替換。 */
export type AdministrativeArea = {
  [C in County]: {
    readonly county: C;
    readonly district: DistrictOf<C>;
  };
}[County];

const counties = Object.keys(DISTRICTS_BY_COUNTY) as County[];

for (const county of counties) {
  const districts = DISTRICTS_BY_COUNTY[county];
  if (districts.length !== DISTRICT_COUNT[county]) {
    throw new Error(`${county} 行政區數量應為 ${DISTRICT_COUNT[county]}，實際 ${districts.length}`);
  }
  const seen = new Set<string>();
  for (const district of districts) {
    if (seen.has(district)) {
      throw new Error(`${county} 的行政區「${district}」重複`);
    }
    seen.add(district);
  }
}

/** 目錄裡的寫法。`臺北市` 配 `板橋區` 在這裡就過不了編譯。 */
export function administrativeArea<C extends County>(
  county: C,
  district: DistrictOf<C>,
): Extract<AdministrativeArea, { readonly county: C }> {
  return parseAdministrativeArea(county, district) as Extract<AdministrativeArea, { readonly county: C }>;
}

/** 外部字串的入口，接受「台／区」並收成目錄用字。配對錯誤會被拒絕。 */
export function parseAdministrativeArea(county: string, district: string): AdministrativeArea {
  const canonicalCounty = canonicalizePlaceName(county);
  if (!isCounty(canonicalCounty)) {
    throw new MicroPricingInputError(`不認識的縣市：${county}`);
  }

  const canonicalDistrict = canonicalizePlaceName(district);
  const districts: readonly string[] = DISTRICTS_BY_COUNTY[canonicalCounty];
  if (!districts.includes(canonicalDistrict)) {
    throw new MicroPricingInputError(`${canonicalCounty}沒有行政區「${district}」`);
  }

  return {
    county: canonicalCounty,
    district: canonicalDistrict,
  } as AdministrativeArea;
}

export function canonicalizePlaceName(value: string): string {
  return value.trim().replaceAll("台", "臺").replaceAll("区", "區");
}

function isCounty(value: string): value is County {
  return Object.prototype.hasOwnProperty.call(DISTRICTS_BY_COUNTY, value);
}

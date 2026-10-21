import {
  administrativeArea,
  parseAdministrativeArea,
  type AdministrativeArea,
  type County,
  type DistrictOf,
} from "./administrative-area.js";
import { MicroPricingInputError } from "./errors.js";
import { labeledText } from "./measure.js";

declare const doorplateBrand: unique symbol;
declare const listingUrlBrand: unique symbol;
declare const sectionBrand: unique symbol;
declare const lotCodeBrand: unique symbol;

export type DoorplateAddress = string & { readonly [doorplateBrand]: "DoorplateAddress" };
export type ListingUrl = string & { readonly [listingUrlBrand]: "ListingUrl" };
export type SectionName = string & { readonly [sectionBrand]: "SectionName" };

/** 地號母號或子號，固定 4 碼。 */
export type LotCode = string & { readonly [lotCodeBrand]: "LotCode" };

/** 母號與子號一起存在。只有母號時，子號為 `0000`。 */
export type LotNumber = {
  readonly parent: LotCode;
  readonly child: LotCode;
};

export type DoorplateProperty = {
  readonly kind: "doorplate";
  readonly address: DoorplateAddress;
};

export type ListingUrlProperty = {
  readonly kind: "listing-url";
  readonly url: ListingUrl;
};

/** 縣市、行政區、地段、地號四項缺一不可。 */
export type LandParcelProperty = {
  readonly kind: "land-parcel";
  readonly area: AdministrativeArea;
  readonly section: SectionName;
  readonly lot: LotNumber;
};

/** 一次只有一種定位方式。門牌、網址、地籍不能並存。 */
export type Property = DoorplateProperty | ListingUrlProperty | LandParcelProperty;

const LOT_PATTERN = /^(\d{1,4})(?:-(\d{1,4}))?$/;

export function doorplateProperty(address: string): DoorplateProperty {
  const normalized = labeledText(address, "門牌地址");
  if (isHttpUrl(normalized)) {
    throw new MicroPricingInputError("這是網址，請改走售屋網址，不要放進門牌");
  }
  return Object.freeze({
    kind: "doorplate",
    address: normalized as DoorplateAddress,
  });
}

export function listingUrlProperty(url: string): ListingUrlProperty {
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new MicroPricingInputError("售屋網址必須是有效的 URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new MicroPricingInputError("售屋網址只接受 http 或 https");
  }
  return Object.freeze({
    kind: "listing-url",
    url: parsed.toString() as ListingUrl,
  });
}

export function landParcelProperty<C extends County>(input: {
  readonly county: C;
  readonly district: DistrictOf<C>;
  readonly section: string;
  readonly lot: string;
}): LandParcelProperty {
  return Object.freeze({
    kind: "land-parcel",
    area: administrativeArea(input.county, input.district),
    section: sectionName(input.section),
    lot: lotNumber(input.lot),
  });
}

/** 外部字串的地籍入口。縣市可以寫成「台北市」，行政區仍必須屬於該縣市。 */
export function parseLandParcelProperty(input: {
  readonly county: string;
  readonly district: string;
  readonly section: string;
  readonly lot: string;
}): LandParcelProperty {
  return Object.freeze({
    kind: "land-parcel",
    area: parseAdministrativeArea(input.county, input.district),
    section: sectionName(input.section),
    lot: lotNumber(input.lot),
  });
}

export function sectionName(value: string): SectionName {
  return labeledText(value, "地段").replaceAll("台", "臺") as SectionName;
}

/** 接受 `12`、`12-3`、`0012-0003`，存成 4 碼母號與 4 碼子號。 */
export function lotNumber(value: string): LotNumber {
  const match = LOT_PATTERN.exec(value.trim());
  const parent = match?.[1];
  if (match === null || parent === undefined) {
    throw new MicroPricingInputError("地號格式須為 1 到 4 位母號，或母號-子號");
  }
  const child = match[2] ?? "0";
  return Object.freeze({
    parent: parent.padStart(4, "0") as LotCode,
    child: child.padStart(4, "0") as LotCode,
  });
}

export function formatLotNumber(lot: LotNumber): string {
  return `${lot.parent}-${lot.child}`;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** 模組邊界拒絕輸入時丟出。領域物件一旦建立，就不再帶著這類錯誤狀態。 */
export class MicroPricingInputError extends Error {
  override name = "MicroPricingInputError";

  constructor(message: string) {
    super(message);
  }
}

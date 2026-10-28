/** 政府端點還沒換成可呼叫的 http(s) 網址。 */
export class GovNotConfiguredError extends Error {
  override name = "GovNotConfiguredError";

  constructor(message: string) {
    super(message);
  }
}

/** 連得上，但政府服務沒有回 2xx。 */
export class GovUpstreamError extends Error {
  override name = "GovUpstreamError";
  readonly status: number;

  constructor(status: number) {
    super(`政府 Open Data 回應 ${status}`);
    this.status = status;
  }
}

/** 政府有回應，但內容不能進入行情引擎。 */
export class GovPayloadError extends Error {
  override name = "GovPayloadError";

  constructor(message: string) {
    super(message);
  }
}

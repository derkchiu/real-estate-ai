/**
 * Vercel Serverless Function。這個專案是 Vite，部署根目錄的 /api 就是函式，
 * 不是 Next.js 的 app router。
 *
 * 瀏覽器只打同源的 /api/transactions。政府 Open Data、排除純車位與純土地、
 * 加權均價、三階防呆都在這裡完成，公式仍呼叫已驗證的 src/micro-pricing。
 */
import { handleTransactionsRequest } from "../src/bff/http.js";

export const maxDuration = 30;

export function GET(request: Request): Promise<Response> {
  return handleTransactionsRequest(request);
}

export function POST(request: Request): Promise<Response> {
  return handleTransactionsRequest(request);
}

export function OPTIONS(request: Request): Promise<Response> {
  return handleTransactionsRequest(request);
}

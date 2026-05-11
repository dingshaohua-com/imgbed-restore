import { Context } from "hono";
import { BizError } from "./biz-error";
import result from "../utils/result";

export function globalExceptionHandler(err: Error, c: Context) {
  console.error(err);
  if (err instanceof BizError) {
    return result.error(err.message, c);
  }
  // 兜底服务器错误
  return result.error(`服务器异常: ${err.message}`, c);
}

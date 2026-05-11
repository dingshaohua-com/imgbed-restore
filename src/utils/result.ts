import { Context } from "hono";


// ts重载
function success<T>(data: T, msg?: string): JsonResult<T>;
function success<T>(data: T, c: Context, msg?: string): Response;
function success<T>(
  data: T,
  arg2?: string | Context,
  arg3?: string,
): JsonResult<T> | Response {
  if (arg2 && typeof arg2 !== "string") {
    const c = arg2;
    const msg = arg3 ?? "ok";
    return c.json({
      code: 0,
      data,
      msg,
    });
  }

  const msg = typeof arg2 === "string" ? arg2 : "ok";
  return {
    code: 0,
    data,
    msg,
  };
}

// ts重载
function error(msg: string): JsonResult<null>;
function error(msg: string, c: Context): Response;
function error(msg: string = "error", c?: Context): JsonResult<null> | Response {
  if (c) {
    return c.json({
      code: -1,
      data: null,
      msg,
    });
  }
  return {
    code: -1,
    data: null,
    msg,
  };
}

/**
 * 语义化助手函数
 */
export default {
  // 成功返回
  success,

  // 失败返回
  error,
};

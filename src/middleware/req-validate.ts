import { zValidator } from "@hono/zod-validator";
import { BizError } from "../error-exc/biz-error";
import { getFirstErrMsg } from "../utils/zod-helper";


/**
 * 封装一个通用的 Hono 校验钩子
 * 校验中间件绝对不适合全局注册，它必须是路由级（或路由组级）注册
 * @param source 'json' | 'query' | 'param' | 'form'
 * @param schema ZodSchema
 */
export const reqValidate = (source: any, schema: any) =>
  zValidator(source, schema, (result, c) => {
    if (!result.success) {
      const firstMsg = getFirstErrMsg(result.error);
      throw new BizError(firstMsg);
    }
  });

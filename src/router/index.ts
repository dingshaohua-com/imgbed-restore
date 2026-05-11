import { Hono } from 'hono'
import userRouter from './user'
import rootRouter from './root'
import syncRouter from './sync'

const app = new Hono()

// 使用 .route() 方法实现模块化挂载，相当于 Koa 的 wrappRouter.use()
const routerModules = [userRouter, rootRouter, syncRouter]
routerModules.forEach(router => {
  app.route('/', router)
})

export default app
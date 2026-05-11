import { Hono } from 'hono'
import router from './router'
import { globalExceptionHandler } from './error-exc/global-exc';
import { cors } from 'hono/cors';


// 创建应用
const app = new Hono()

// 路由注册
app.route('/', router)

// 注册cors中间件
app.use(cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Content-Length', 'Content-Type', 'Authorization'],
  maxAge: 600,
}))

// 全局异常处理
app.onError(globalExceptionHandler);

export default app

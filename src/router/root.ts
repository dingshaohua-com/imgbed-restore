import { Hono } from 'hono'

const rootRouter = new Hono()

rootRouter.get('/', (c) => c.redirect("/index.html"))

export default rootRouter
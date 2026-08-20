import { serveStatic } from 'hono/cloudflare-workers'
import { createApp } from './app'

const app = createApp(serveStatic({ root: './public' }))

export default app

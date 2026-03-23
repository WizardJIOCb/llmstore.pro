import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import { env } from './config/env.js';
import { redis } from './config/redis.js';
import { errorHandler } from './middleware/error-handler.js';
import { logger } from './lib/logger.js';
import { authRoutes } from './modules/auth/index.js';
import { catalogRoutes } from './modules/catalog/index.js';
import { adminRoutes } from './modules/admin/index.js';
import { stackBuilderRoutes } from './modules/stack-builder/index.js';
import { agentBuilderRoutes } from './modules/agent-builder/index.js';
import { agentRuntimeRoutes } from './modules/agent-runtime/index.js';

export function createApp() {
  const app = express();

  // Trust reverse proxy (nginx)
  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // Security
  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    }),
  );

  // Body parsing
  app.use(express.json({ limit: '1mb' }));

  // Sessions
  const redisStore = new RedisStore({ client: redis });
  app.use(
    session({
      store: redisStore,
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      name: 'llmstore_session',
      cookie: {
        secure: env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: 'lax',
      },
    }),
  );

  // Request logging
  app.use((req, _res, next) => {
    logger.debug({ method: req.method, url: req.url }, 'request');
    next();
  });

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Module routes
  app.use('/api/auth', authRoutes);
  app.use('/api/catalog', catalogRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/builder/stack', stackBuilderRoutes);
  app.use('/api/agents', agentBuilderRoutes);
  app.use('/api', agentRuntimeRoutes);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { csrfOriginCheck } from './middlewares/csrf-origin';
import { errorHandler } from './middlewares/error-handler';
import { notFoundHandler } from './middlewares/not-found';
import { apiRateLimit } from './middlewares/rate-limit';
import { requestLogger } from './middlewares/request-logger';
import { apiRouter } from './routes';

const BODY_SIZE_LIMIT = '1mb';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  // Number of reverse-proxy hops (Render load balancer = 1) so req.ip reflects the real client.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  // Request IDs are assigned first so every response, including body-parser errors, carries one.
  app.use(requestLogger);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: BODY_SIZE_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: BODY_SIZE_LIMIT }));
  app.use(cookieParser());
  app.use(csrfOriginCheck);
  app.use('/api', apiRateLimit);

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

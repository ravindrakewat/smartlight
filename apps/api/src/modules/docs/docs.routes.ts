import { Router, type RequestHandler } from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiDocument } from '../../lib/openapi';

/**
 * Swagger UI at /api/docs and the raw spec at /api/openapi.json.
 * Mounted only when API_DOCS_ENABLED (default: off in production).
 * The spec is built on first request, after every module has registered its paths.
 */
export function createDocsRouter(): Router {
  const router = Router();
  let document: ReturnType<typeof buildOpenApiDocument> | null = null;
  let setupHandler: RequestHandler | null = null;
  const getDocument = () => (document ??= buildOpenApiDocument());

  router.get('/openapi.json', (_req, res) => {
    res.json(getDocument());
  });

  router.use('/docs', swaggerUi.serve as RequestHandler[]);
  router.get('/docs', (req, res, next) => {
    setupHandler ??= swaggerUi.setup(getDocument(), {
      customSiteTitle: 'Smart Street Light API',
      swaggerOptions: { persistAuthorization: true, withCredentials: true },
    }) as RequestHandler;
    return setupHandler(req, res, next);
  });

  return router;
}

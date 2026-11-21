import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

/** Locale negotiation and redirects only — no business logic (see AGENTS.md §4). */
export default createMiddleware(routing);

export const config = {
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};

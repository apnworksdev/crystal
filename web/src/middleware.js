import { defineMiddleware } from 'astro:middleware';
import { SANITY_PROJECT_ID, SITE_MODE } from 'astro:env/server';

const LOCKED_PAGE = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Preview</title>
<p style="font: 1rem/1.5 system-ui; margin: 3rem auto; max-width: 32rem; padding: 0 1.25rem">
  This preview opens from Sanity Studio. Sign in to the Studio and choose Presentation.
</p>`;

export const onRequest = defineMiddleware(async (context, next) => {
  // The public site never reads cookies, and placeholder content isn't private.
  if (SITE_MODE !== 'preview' || !SANITY_PROJECT_ID) return next();

  const { isValidSession, SESSION_COOKIE } = await import('./preview/session.js');
  const isOpenRoute = context.url.pathname.startsWith('/api/draft-mode/');
  const isLoggedIn = isValidSession(context.cookies.get(SESSION_COOKIE)?.value);

  if (!isOpenRoute && !isLoggedIn) {
    return new Response(LOCKED_PAGE, {
      status: 401,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex',
      },
    });
  }

  const response = await next();
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('X-Robots-Tag', 'noindex');
  return response;
});

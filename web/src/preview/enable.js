import { createClient } from '@sanity/client';
import { validatePreviewUrl } from '@sanity/preview-url-secret';
import { getSecret, SANITY_DATASET, SANITY_PROJECT_ID } from 'astro:env/server';
import { createSessionValue, SESSION_COOKIE } from './session.js';

export const prerender = false;

// Presentation opens this URL with a one-time secret it stored in Sanity.
// A valid secret proves the visitor came from a logged-in Studio.
export async function GET({ request, cookies, redirect }) {
  const token = getSecret('SANITY_READ_TOKEN');
  if (!SANITY_PROJECT_ID || !token) {
    return new Response('Preview is missing SANITY_PROJECT_ID or SANITY_READ_TOKEN.', { status: 500 });
  }

  const client = createClient({
    projectId: SANITY_PROJECT_ID,
    dataset: SANITY_DATASET,
    apiVersion: '2025-02-19',
    useCdn: false,
    token,
  });

  const { isValid, redirectTo = '/' } = await validatePreviewUrl(client, request.url);
  if (!isValid) return new Response('Invalid preview secret.', { status: 401 });

  cookies.set(SESSION_COOKIE, createSessionValue(), {
    path: '/',
    httpOnly: true,
    secure: true,
    // The Studio frames this site from another origin, which needs both of these.
    sameSite: 'none',
    partitioned: true,
    maxAge: 60 * 60 * 8,
  });

  return redirect(redirectTo, 307);
}

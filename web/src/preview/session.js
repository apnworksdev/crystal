import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSecret } from 'astro:env/server';

export const SESSION_COOKIE = 'crystal-preview-session';

// The cookie is derived from the read token, so it can't be forged, and
// replacing the token ends every open preview session.
export function createSessionValue() {
  return createHmac('sha256', getSecret('SANITY_READ_TOKEN')).update('preview-session').digest('hex');
}

export function isValidSession(value) {
  if (!value || !getSecret('SANITY_READ_TOKEN')) return false;
  const expected = Buffer.from(createSessionValue());
  const received = Buffer.from(value);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

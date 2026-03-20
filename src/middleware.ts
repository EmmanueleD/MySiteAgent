import { defineMiddleware } from 'astro:middleware';
import { verifySession } from './lib/session.js';

const PROTECTED_PREFIXES = ['/ai-admin', '/api/agent', '/api/pr-action'];
const LOGIN_PATH = '/ai-admin/login';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Check if this path needs protection
  const isProtected = PROTECTED_PREFIXES.some(prefix =>
    pathname.startsWith(prefix)
  );

  if (!isProtected) {
    return next();
  }

  // Allow access to the login page itself (both GET and POST)
  if (pathname === LOGIN_PATH) {
    return next();
  }

  // Verify session cookie
  const adminPassword = import.meta.env['ADMIN_PASSWORD'] ?? process.env['ADMIN_PASSWORD'];
  if (!adminPassword) {
    // Server misconfiguration
    if (pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ error: 'Configurazione server non valida' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return context.redirect(LOGIN_PATH);
  }

  const sessionCookie = context.cookies.get('session');
  const isValid = verifySession(sessionCookie?.value, adminPassword);

  if (!isValid) {
    // API routes → 401 JSON
    if (pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ error: 'Non autorizzato' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    // Page routes → redirect to login
    return context.redirect(LOGIN_PATH);
  }

  return next();
});

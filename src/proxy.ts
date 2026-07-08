import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import createIntlMiddleware from 'next-intl/middleware';

import { routing } from '@/core/i18n/config';

const intlMiddleware = createIntlMiddleware(routing);
const NEXT_INTL_LOCALE_HEADER = 'X-NEXT-INTL-LOCALE';

export async function proxy(request: NextRequest) {
  const originalPathname = request.nextUrl.pathname;

  // Extract locale from pathname
  const locale = originalPathname.split('/')[1];
  const isValidLocale = routing.locales.includes(locale as any);
  const pathWithoutLocale = isValidLocale
    ? originalPathname.slice(locale.length + 1) || '/'
    : originalPathname;

  // Only check authentication for admin routes
  if (
    pathWithoutLocale.startsWith('/admin') ||
    pathWithoutLocale.startsWith('/settings') ||
    pathWithoutLocale.startsWith('/activity')
  ) {
    // Check if session cookie exists
    const sessionCookie = getSessionCookie(request);

    // If no session token found, redirect to sign-in
    if (!sessionCookie) {
      const signInUrl = new URL(
        isValidLocale ? `/${locale}/sign-in` : '/sign-in',
        request.url
      );
      // Add the current path (including search params) as callback - use relative path for multi-language support
      const callbackPath = pathWithoutLocale + request.nextUrl.search;
      signInUrl.searchParams.set('callbackUrl', callbackPath);
      return NextResponse.redirect(signInUrl);
    }

    // For admin routes, we need to check RBAC permissions
    // Note: Full permission check happens in the page/API route level
    // This is a lightweight session check to prevent unauthorized access
    // The detailed permission check (admin.access and specific permissions)
    // will be done in the layout or individual pages using requirePermission()
  }

  // Next 16 proxy can re-run on same-path rewrites. For already-prefixed
  // locale routes, continue directly and provide the locale header next-intl
  // needs instead of asking next-intl to rewrite `/en/...` to `/en/...`.
  let intlResponse: NextResponse;
  if (isValidLocale) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(NEXT_INTL_LOCALE_HEADER, locale);
    intlResponse = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } else {
    intlResponse = intlMiddleware(request);
  }

  intlResponse.headers.set('x-pathname', originalPathname);
  intlResponse.headers.set('x-url', request.url);

  // Remove Set-Cookie from public pages to allow caching
  // We exclude admin, settings, activity, and auth pages from this behavior
  const isRedirectResponse = intlResponse.headers.has('Location');
  if (
    !isRedirectResponse &&
    !pathWithoutLocale.startsWith('/admin') &&
    !pathWithoutLocale.startsWith('/settings') &&
    !pathWithoutLocale.startsWith('/activity') &&
    !pathWithoutLocale.startsWith('/sign-') &&
    !pathWithoutLocale.startsWith('/auth')
  ) {
    intlResponse.headers.delete('Set-Cookie');

    // Cache-Control header for public pages
    const cacheControl = 'public, s-maxage=3600, stale-while-revalidate=14400';

    intlResponse.headers.set('Cache-Control', cacheControl);
    intlResponse.headers.set('CDN-Cache-Control', cacheControl);
    intlResponse.headers.set('Cloudflare-CDN-Cache-Control', cacheControl);
  }

  // For all other routes (including /, /sign-in, /sign-up, /sign-out), just return the intl response
  return intlResponse;
}

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};

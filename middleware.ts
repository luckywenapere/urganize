import { NextRequest, NextResponse } from 'next/server';

// Protected routes that require subscription
const protectedRoutes = [
  '/dashboard',
  '/releases',
  '/pricing', // Allow pricing page regardless of subscription
  '/auth/callback', // Allow callback
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Check if this is a protected route
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
  
  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  // Allow pricing and auth/callback through
  if (pathname === '/pricing' || pathname === '/auth/callback') {
    return NextResponse.next();
  }

  // For other protected routes, check subscription status from cookies
  // The subscription status will be checked client-side since we can't access Supabase
  // directly in middleware (no service role key available here safely)
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
  ],
};

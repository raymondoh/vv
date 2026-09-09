# VV application foundation

The primary application is Next.js App Router with TypeScript, React 19 and Tailwind CSS 4. The Vite/Express prototype remains a separate runnable reference in this repository.

## Local development

Use Node.js 22 or newer and install dependencies with `npm ci`.
Copy `.env.example` to `.env.local`, then supply your Supabase project URL and **publishable** key:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Both values are public application configuration. Never place service-role or secret keys in public environment variables. No privileged Supabase client is included. The legacy Gemini/APP_URL placeholders are for the prototype only; Next.js does not use them.

`npm run dev` runs Next.js at http://localhost:3001. The public home page builds without credentials; serving requests through Proxy requires the two variables above. Missing configuration fails with an explicit error. Next's font loader downloads Plus Jakarta Sans during the build and serves the font locally afterward, so builds need access to Google Fonts.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next.js development on port 3001 |
| `npm run typecheck` | Generate Next route types and check production TypeScript |
| `npm run lint` | Next.js Core Web Vitals and TypeScript ESLint rules on production files |
| `npm run build` | Next.js production build in `.next` |
| `npm start` | Serve the Next.js production build on port 3001 |
| `npm run prototype:dev` | Original Express/Vite development app on port 3000 |
| `npm run prototype:typecheck` | Original prototype TypeScript check |
| `npm run prototype:build` | Original Vite client and bundled Express server in `dist` |
| `npm run prototype:start` | Serve the built prototype with production mode on port 3000 |
| `npm run prototype:preview` | Vite static preview only; does not run Express API routes |

The two apps can run side by side. Next.js uses `@/*` for `src/*`; the prototype retains its original root alias in Vite and `tsconfig.prototype.json`. Production lint/types intentionally exclude the prototype; its separate typecheck remains available. The Next Tailwind entry currently scans `src/app` and the existing `src/components` tree so prototype components can be progressively reused during the migration; extend its sources if additional production component directories are introduced. The prototype stylesheet and components remain intact.

## Foundation boundaries

- `src/app/layout.tsx`, `globals.css`, `page.tsx`: public application shell using the existing colors and Plus Jakarta Sans.
- `src/lib/supabase/client.ts`: browser client with cookie storage.
- `src/lib/supabase/server.ts`: request-scoped server client using async Next cookies, guarded by `server-only`.
- `src/lib/supabase/env.ts`: explicit public environment contract.
- `src/lib/supabase/proxy.ts` and `src/proxy.ts`: validate/refresh sessions with `getClaims`, propagate cookies to the request and response, and preserve SSR cache-prevention headers.

Proxy currently refreshes sessions without requiring sign-in or redirecting users. It excludes Next static assets and common image/font files. It is not an authorization boundary. Future protected routes must validate identity, apply database RLS, and avoid shared caching of personalized responses. Future Route Handlers that write auth cookies must also send private/no-store responses; the server helper cannot set response headers by itself.

No authentication screens, API routes, in-memory stores, booking flows, dashboards, payments, or AI features have been migrated. Database migrations are unchanged. Database type generation and live authenticated session verification can follow when the target Supabase environment is configured.

References: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

## Validation notes

If a restricted local environment prevents Turbopack's CSS worker from binding a port, `npm run build -- --webpack` uses the supported Next.js webpack backend without changing application architecture. The default build remains Turbopack.

The current dependency audit reports three moderate findings in the retained Express/body-parser/qs prototype chain. Remediation is deferred to a separate prototype dependency review. ESLint 9 is retained because the current Next.js React/accessibility/import plugins declare ESLint 9 peer compatibility; npm reports that ESLint major as deprecated.

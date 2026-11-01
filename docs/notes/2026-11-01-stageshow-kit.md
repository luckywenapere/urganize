# Stageshow kit package (2026-11-01, #979, part of #951)

`packages/stageshow` (`@urganize/stageshow`) is the Stageshow React kit: the faux product UI (windows, phones, a scripted cursor, motion parts) the animated mocks are built with. Homepage hero #952, story steps #953, bento #954, demo loop #956 and tours #971 import it. Still mocks do not: they ship as WebP images.

## Where it came from

A copy of the skill's `kit/` folder (`~/.claude/skills/stageshow/kit/`, MIT, copyright Benji Taylor), with its `LICENSE` and a `NOTICE.md`. The only change is a `'use client'` line at the top of every `.tsx` file and of the three React modules (`looks.ts`, `reduced-motion.ts`, `act.ts`), so Next.js treats them as client code. To update it, copy the kit again and re-add those lines; do not edit the kit by hand, so the next copy stays a clean diff.

Both apps list it in `dependencies` and `transpilePackages`. `sideEffects: ["*.css"]` lets the bundler drop parts a mock does not import, together with their CSS (each component imports its own stylesheet, so nothing else needs importing; `@urganize/stageshow/stageshow.css` loads every style at once if you ever want that). All kit classes start with `ss-`, so they do not clash with Tailwind.

## How to use it in a page

1. **Write the mock as a client component** that imports from `@urganize/stageshow` and renders one `<Stage>` with its `script`. Keep every animated mock in its own file.
2. **Load it with `next/dynamic` and `ssr: false`** from a small client wrapper, so the kit stays out of the page's first load. Below the fold this is required; for the hero, still do it, and let the poster carry the first paint.
3. **The still image is the poster.** Pass the mock's approved WebP as the `loading` fallback, at the stage's exact aspect ratio, so nothing moves when the animation swaps in.
4. **Reduced motion shows the poster.** Check `prefers-reduced-motion` in the wrapper and never import the mock when it is set. (Inside the kit, `<Stage>` also shows its `poster` state under reduced motion, but skipping the import saves the download too.)

```tsx
'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import poster from '@/public/mocks/hero.webp'

const Poster = () => <Image src={poster} alt="A release plan with tasks and owners" />

const HeroDemo = dynamic(() => import('./HeroDemo'), { ssr: false, loading: Poster })

export default function HeroMock() {
  const [motion, setMotion] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setMotion(!mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return motion ? <HeroDemo /> : <Poster />
}
```

`<Stage>` only plays while on screen, so a mock far down the page costs nothing until it is scrolled to, beyond its download.

## What it costs (measured 2026-11-01)

Measured with a throwaway homepage route (not committed): a `<Stage>` with a `<Window>`, a `<Bar>`, a cursor and a looping click script, loaded the way above, in a production `next build` (Next 16.2, Turbopack), served by `next start`.

| | Raw | Over the wire (gzip) |
|---|---|---|
| Kit JS, one lazy chunk | 42.7 KB | 16.3 KB |
| Kit CSS, lazy | 23.7 KB | 5.7 KB |
| Added to the route's first load (the wrapper) | | 1.4 KB |

The kit chunk and its CSS were not in the route's HTML and arrived only after mount; the brand SVGs were not in the bundle. A mock that imports more parts (phone, motion parts, icons) costs more, so measure each mock the same way: grep `.next/static/chunks` for the chunk and check it is absent from `.next/server/app/<route>.html`.

## Traps

- **Do not import it from a server component.** The client markers make the components work as client references, but values like `brandMarks`, `chartPoints` and `cellOf` are then client references too and cannot be called on the server. Import it from client files only.
- `src/brands/` holds third-party logos (banks, payment cards, apps) the kit's `BrandMark` uses. They load only if a mock imports `BrandMark` or `brandMarks`; their sources and licences are in `src/brands/SOURCES.md`. Do not put another company's logo on the site without a reason.
- The kit pinned `lucide-react` 0.468; the package uses `^0.469.0` like `@urganize/ui`. Every icon it imports exists there.
- A smoke test (`apps/web/lib/stageshow/stageshow-kit.test.ts`) server-renders a still and a scripted stage under React 19 and checks the script does not run on the server.

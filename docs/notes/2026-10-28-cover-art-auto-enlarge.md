# Cover art is enlarged to 3000 x 3000 on upload (2026-10-28)

Founder call (Oyin, 2026-10-28), mocks at `docs/mocks/cover-art-upscale/mock.html`.

- Every cover art upload goes through `useCoverArtUpload` (Cover art section, rollout cover tile, the task prompt sheet, the UrgAns upload card). After the DSP grade, a square file from 640 up to 2999 px is redrawn on a canvas at exactly 3000 x 3000 and saved as JPEG (quality 0.92). Logic: `lib/upscale-cover-art.ts`, rule tested in its `.test.ts`.
- **Silent on purpose (founder):** no "enlarging" message and no "we enlarged it" line. The file is graded on its new size, so it reads "Ready for stores". The spinner covers the wait.
- **Only the enlarged file is kept (founder).** The original is not stored.
- Enlarging adds no detail: a 700 px source looks soft in stores. The founder chose that over a warning. The mocks' amber "may look soft" state was dropped.
- Not square, or under 640, is still blocked: resizing cannot fix those.
- Transparent PNGs are flattened onto white (canvas JPEG would paint them black). A WebP under 3000 becomes JPEG; a WebP already at 3000 or more is untouched and still warns.
- If the browser cannot draw or encode, the original uploads and grades as before.
- Client-side only, like `lib/downscale-image.ts`: the server cannot decode images.

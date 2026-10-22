# Design QA: DYNAMIC public landing page

- Date: 22 October 2026 (IST).
- Source visual truth: `C:/Users/jtndr/.codex/generated_images/01a10fb7-5ebb-7623-82b6-972d927a19a5/exec-5a356cbe-4390-468f-931f-eed462b3d142.png`.
- Implementation evidence: `C:/Users/jtndr/AppData/Local/Temp/dynamic-selected-landing-4hReZ9/landing-1586.png`.
- Responsive evidence in the same directory: `landing-1440.png`, `landing-1280.png`, and `landing-390.png`.
- Source and desktop comparison: 1586 x 992 physical/CSS pixels, device scale factor 1, public welcome page. Both images were opened in the same comparison input; no browser chrome or scale normalization was needed.
- Additional browser viewports: 1440 x 900, 1280 x 720, and emulated mobile 390 x 844. Mobile content intentionally scrolls vertically.

## Comparison and history

1. Initial implementation matched the white/teal split composition, brand header, mother-and-baby illustration, navy/teal title, mint footer, and download card. Comparison showed that the primary button and title were smaller than the selected design. A short desktop viewport also pushed the download card below the fold.
2. Increased the desktop title/button size and added compact spacing for short desktop windows. Recaptured and compared the revised 1586 x 992 page against the source in a shared image input, plus desktop and mobile captures.
3. Final full-view comparison has no remaining actionable P0/P1/P2 findings. Focused title, portal button, illustration, and QR regions are readable and unobstructed. The selected illustration was regenerated as an independent optimized WebP; it is not the mockup rendered as a page.

## Checks

- Chrome CDP: real page component, stylesheet and production React, with existing routing exercised in a local fixture.
- Portal button navigates to `/login` at all four viewports.
- QR and download link point to `https://dynamicstudyindia.com/downloads/dynamic-field-app.apk`; HTTP HEAD returned 200. QR SVG was checked against the installed QR generator using that exact URL.
- Every image loaded; heading, primary action and download card stay within the viewport width; no horizontal page overflow.
- Browser JavaScript exception collection was empty.
- Admin typecheck and production build passed.

## Minor differences and limits

- P3: the decorative footer leaf from the generated concept is omitted; footer copy uses the available space.
- P3: generated illustration details differ slightly from the concept while retaining its composition and palette.
- QR was not scanned with a physical phone during this check. No signed-in admin workflow or APK code was changed.

final result: passed

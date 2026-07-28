# Design QA: Native HHQ Compact Android Shell

## Evidence

- Source visual truth: `/var/folders/sn/xw1rcp8d5fxbnqw1hmvmjkd00000gn/T/codex-clipboard-d9607437-c829-4a93-a269-7f2adbc70357.png`
- Rendered implementation: `/tmp/dynamic-native-layout-audit/24-preview-message-cleared.png`
- Collapsed app-header state: `/tmp/dynamic-native-layout-audit/18-header-collapsed.png`
- Section drawer: `/tmp/dynamic-native-layout-audit/20-section-drawer.png`
- Language overlay: `/tmp/dynamic-native-layout-audit/21-language-menu.png`
- Repeat collapsed/edit/add/delete states: `/tmp/dynamic-native-layout-audit/29-repeat-collapsed.png`, `/tmp/dynamic-native-layout-audit/30-repeat-edit.png`, `/tmp/dynamic-native-layout-audit/32-repeat-add.png`, `/tmp/dynamic-native-layout-audit/33-state.png`
- Combined comparison input: `/tmp/dynamic-native-layout-audit/design-qa-side-by-side.png`
- Device and viewport: Android Emulator Pixel 7 API 36, 1080 x 2400 physical pixels, 412 x 915 density-independent viewport, device density approximately 2.625.
- Source pixels: 686 x 1564 including 40 pixels of emulator window chrome. The source device region was cropped to 686 x 1524.
- Implementation pixels: 1080 x 2400, normalized to 686 x 1524 for comparison.
- State: baseline HHQ Section 1 with a restored development draft. The source has Hindi selected and no displayed error; the implementation capture has English selected and a required-field error after interaction. These data-state differences were excluded from layout-fidelity judgments.

## Full-View Comparison

The source and implementation were opened together in the combined comparison input. The implementation intentionally replaces the tall locality/action/language/section-card stack with the requested icon title row, compact progress dots, language overlay, fixed compact bottom actions, and collapsible DYNAMIC header. This materially increases above-the-fold question content while retaining the source palette, question-card treatment, typography hierarchy, and native control affordances.

## Focused Region Comparison

- Header: verified `Sections icon — form title — red Close icon`, one-line title, icon-library assets, and 44-point outer hit areas.
- Progress/navigation: verified four questionnaire/review-step dots, with Preview retained in the five-item detailed drawer instead of appearing as a misleading green compact dot.
- Bottom actions: verified Previous and Next at the outer edges, Preview and Save centered, compact 40-point visible buttons, and six-point hit slop.
- Scroll state: verified the DYNAMIC header collapses after scrolling while the questionnaire title and bottom action row remain available.
- Repeat editor: verified a compact committed-entry row, separate Add and Update modes, delete action, and zero-entry state after deleting the last row.
- Date control: verified the Android platform calendar dialog and `DD-MMM-YYYY` committed display value.
- Preview return: verified the preview-only notice is absent after returning to Edit form.

## Required Fidelity Surfaces

- Fonts and typography: existing React Native/system font stack retained; title, section, question, helper, and error weights remain consistent with the source. The form title fits on one line at the Pixel 7 viewport.
- Spacing and layout rhythm: large fixed vertical regions were removed. Cards retain consistent gaps and radii; compact progress and bottom actions use the reclaimed space without overlap.
- Colors and visual tokens: existing DYNAMIC navy, blue selection/primary, neutral borders/background, yellow progress, green completion, and red error/close tokens are preserved.
- Image quality and assets: no raster product imagery is present. All new visible controls use MaterialCommunityIcons; no emoji, text glyph approximation, handcrafted SVG, or placeholder asset was introduced.
- Copy and content: removed `Native Expo renderer`; retained the questionnaire and section titles; Add, Update, Delete, Preview, Save, and validation labels describe their actual actions.

## Findings

No actionable P0, P1, or P2 visual differences remain against the requested compact mobile direction.

- [P3] Development keyboard toolbar can remain visible after emulator text interaction.
  - Location: left edge in repeat-state captures.
  - Evidence: this is Android emulator/IME chrome, not app content.
  - Impact: none in a clean device state; it can distract during screenshot review.
  - Follow-up: dismiss the emulator keyboard toolbar before future presentation captures.

## Comparison History

1. Initial source showed persistent locality controls, text Preview/Close actions, full-width language switcher, and section cards consuming most of the viewport.
2. First implementation pass compacted the title/actions and section navigation. Device review exposed a synthetic Preview dot appearing green, a persistent preview notice after Edit, centered arrows, and an always-expanded repeat editor.
3. Fixes removed Preview from compact dots while retaining it in the drawer, cleared the notice on Edit, moved arrows outward, reduced visible bottom-button height, collapsed the app header on scroll, added error-directed Next, and rebuilt repeats as collapsed Add/Edit/Delete flows.
4. Post-fix emulator captures listed above show no remaining P0/P1/P2 mismatch.

## Primary Interactions Tested

- Open and close section drawer.
- Open anchored language menu.
- Open Preview and return to Edit without stale preview notice.
- Save/Preview/Previous/Next control accessibility and placement.
- Collapse DYNAMIC header by scrolling and restore it near the top.
- Block Next and scroll to the first visible validation problem.
- Open existing repeat entry, expose Update, start new repeat entry with Add, cancel it, and delete the last committed entry.
- Open the Android calendar picker and commit a formatted date.

## Console And Runtime Errors

Android UI hierarchy was checked after the exercised states. Final logcat and production export checks are recorded during handoff verification; any blocking runtime error changes this result to blocked.

## Implementation Checklist

- [x] Compact icon title row.
- [x] Overlay language menu.
- [x] Detailed section drawer and compact state dots.
- [x] Outer arrows with centered Preview and Save.
- [x] Collapsible DYNAMIC header.
- [x] Error-directed Next.
- [x] Collapsed repeat rows with Add, Update, and Delete.
- [x] Preview notice cleared on Edit.

final result: passed

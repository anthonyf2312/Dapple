# Dapple: design spec

**Concept:** what if Apple designed Discord. The app rebuilt on Apple's rules: a floating functional layer over content, one quiet accent, type that does the work, and motion that behaves like physics.

**Status:** v1.0.0. Built, tested in real Discord, and kept in a private repo. It stays private because the wallpapers are third-party work embedded in every theme file. A public release needs either the creator's permission or an original wallpaper set.

| File | Purpose |
| --- | --- |
| `src/tokens.css` | Every design value, for all versions |
| `src/theme.css` | The theme, written against the live client |
| `build.mjs` | Generates `dist/`, with wallpapers embedded |
| `design/preview.html` | Interactive mock, reads the same tokens |
| `design/screens/` | Renders of the mock, plus `discord.png`, a real capture with placeholder content |
| `design/social.html` | The GitHub social preview, rendered to `.github/social-preview.jpg` |

## Versions

Every version is glass over a wallpaper, so Light and Dark are never flat white, grey or black. All of them share one layout and one component set, and differ only in the weight of the glass.

| | Liquid Glass | Light | Dark |
| --- | --- | --- | --- |
| Idea | Transparent and lightly frosted | Frosted glass, lighter | Smoked glass, darker |
| Wallpaper | Blue pair, follows appearance | Blue Light | Blue Dark |
| Appearance | Follows Discord's setting | Always light | Always dark |

Chat always sits on a thicker material than the navigation, per the HIG: glass belongs to controls and navigation that float above content.

## Flavours

A Flavour is a small add-on theme that swaps the wallpaper, so 3 versions and 8 Flavours need 11 files rather than 24. It's enabled alongside a version and uses `html:root`, so it wins whichever file loads first.

## Legible on any wallpaper

CSS can't sample what's behind a surface, so the glass clamps its backdrop instead. `brightness()` caps how bright it can get on dark, and `contrast()` with `brightness()` lifts the floor on light. Color still shows through, but the luminance range can't reach the text.

**The clamp is measured per wallpaper.** Transparency and legibility pull against each other, so one fixed value would make every wallpaper as dark as the brightest one needs. Instead `build.mjs` blurs each image the way the glass will and reads its peak brightness and darkest band. Each one then gets only the clamp it needs, as `--dp-dim-*` and `--dp-lift-*`. Blue stays open, and a bright Flavour like Skyblue is held back further. It's still pure CSS, because the numbers are worked out ahead of time.

**On thin glass the text does the work, not the tint.** Liquid Glass uses solid labels and stronger link, red and syntax colors, and code sits in a darker well, so the glass can stay transparent.

Text never sits directly on a wallpaper. The title bar, the channel title, the back and forward buttons and server banners all use glass chips.

Role colors are set by each server. A filter deepens names on light glass and lifts them on dark, keeping the hue.

## Apple's language, mapped to Discord

| Discord | Becomes | Treatment |
| --- | --- | --- |
| Server rail | Dock | Floating, icons magnify with neighbors following |
| Channel list | Source list | One solid accent row, blue unread dot |
| Chat header | Unified toolbar | Tools in a floating capsule, content scrolls under |
| Message box | Composer capsule | Real refraction at the rim |
| Member list, Friends panel | Inspector | Floating trailing panel, including anything else that docks beside chat |
| Context menus | Native menus | Compact rows, solid accent highlight, materialize on arrival |
| Modals, settings | Sheets | Glass with a solid accent selection |
| Blurple | System accent | `#0071E3` for fills, everything else stays neutral |
| Window controls | Traffic lights | The real buttons, restyled, in macOS order, grey when unfocused |

**Rules:** people are circles. Server icons and rows are squircles, and glass panels are round (see below). One accent at a time. Corners are concentric. Hairlines, not borders. Default cursor on controls.

## Foundations

**Type.** SF Pro if already installed, otherwise Inter, then Segoe UI Variable. Tracking changes with size.

**Color.** From Apple's current HIG table, changed only where contrast required it:

| Token | HIG value | Used | Why |
| --- | --- | --- | --- |
| Accent fill | `#0088FF`, 3.52:1 with white | `#0071E3`, 4.70:1 | Button text |
| Badge | `#FF383C`, 3.57:1 with white | `#E0252B`, 4.70:1 | Number text |
| Tertiary label | 30% opacity, 1.72:1 | 70 to 84% | HIG tiers only pass on pure white |

**Motion.** Real springs in Apple's terms, sampled into CSS `linear()`, so transitions stay interruptible with no JavaScript.

| Use | Damping / response | Runs |
| --- | --- | --- |
| Hover, selection, reposition | 1.0 / 0.35 | 490ms |
| Press, small state change | 1.0 / 0.22 | 310ms |
| Menus and sheets arriving | 0.85 / 0.34 | 455ms |

**Accessibility.** Reduce Transparency swaps glass for solids, Increase Contrast strengthens labels and hairlines, and Reduce Motion, plus Discord's own setting, replaces springs with short fades.

## How the theme targets Discord

Checked against Discord 1.0.9267 on Chrome 152.

- **Old variables are gone.** `--background-primary`, `--text-normal` and `--accent-hue` have no definitions or uses.
- **`:root` alone loses.** Tokens are declared on the `.theme-*` classes and `.visual-refresh`, and lazy stylesheets can load after a theme, so the build repeats those selectors to outrank them without `!important`.
- **Hashes rotate, stems don't.** In `src/theme.css`, `~panels` is a build macro for one exact stem. A plain `[class*="bar_"]` would also hit `sidebar_` and `toolbar_`.
- **The header is anchored to chat.** CSS anchor positioning lets it follow the member list and side panels without knowing about them.
- **Nitro themes use two systems.** Color amounts and `--background-gradient-*` both need neutralizing.

## Rules learned the hard way

- **Test on real wallpapers.** The first pass only met AA on a soft gradient, and real images caused up to 25 failures each.
- **`backdrop-filter` ignores `corner-shape`.** Chromium clips the blur to a round corner, so a squircle on glass leaves a box of darkened backdrop around the curve. Anything with `backdrop-filter` stays round.
- **Docked panels get no outer shadow.** Discord's `overflow: hidden` containers cut it into a hard straight line. Rim light gives the edge instead, and only free-floating menus and sheets keep a shadow.
- **Overlays need the panel's radius.** The header fade sits on top of the chat panel, so a square fade covers its rounded corners.
- **Sheens wash out labels.** The diagonal highlight lands on the top-left of each panel, right where section headers sit, so keep it subtle.
- **`backdrop-filter` traps fixed children.** It makes the element their containing block, so the chip behind the window buttons is a pseudo-element.
- **Never animate opacity, filter or mask on an ancestor of glass.** It becomes a backdrop root and the blur stops seeing the page.
- **Keep the composer in flow.** A fixed negative margin lets messages scroll under it while a long draft still shrinks the transcript.
- **The lens needs a known height.** The composer grows, so it uses a top-rim-only map.
- **Don't mask a backdrop blur for scroll edges.** It leaves a hard cut, so use an eased gradient.
- **Don't override the sidebar width.** It's the user's saved size.
- **`title` is a shared stem** across nested elements, so use direct-child selectors there.

## Verification

- **Real Discord, loaded through Equicord, in a chat with the Friends panel open:** 26 of 26 interface labels pass in all three versions, with lows of 4.98:1, 4.89:1 and 5.03:1. Role-colored names are excluded, because each server sets them.
- **Liquid Glass on all 9 wallpapers, dark:** 270 interface labels with no failures, lowest 4.81:1.
- **Mock, every version on every wallpaper:** 2,488 text measurements. Before the final sheen fix, 7 failed on Flavours, which the 270-label run re-checked and cleared. Another 7 are mock role names, which stand in for server-set colors. Blue had no interface failures.
- **Before Liquid Glass was thinned:** sheets passed, and 96 menu rows over the brightest wallpapers had a lowest of 5.73:1. Menus and sheets keep their own thicker glass and were not re-measured.

**Not verified:**

- Scrolling performance. The debug session caps at about 13 fps with or without a theme, so it can't measure this.
- Vencord and BetterDiscord.
- Screen share, voice and video call views, threads and forums.
- Windows snap and resize behavior with the traffic lights.
- Reduce Motion, Reduce Transparency and Increase Contrast in the real client.

## Out of scope for v1

- **Replacing Discord's icons.** SF Symbols can't be redistributed in a theme. An open-licensed set could come later.
- **iMessage-style bubbles.** CSS can't reliably tell your messages from everyone else's.
- **Nitro, Shop, Quests and Activities layouts.** They inherit the tokens and sit on the glass plate, without custom layouts.

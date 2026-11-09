# Dapple: design spec

**Concept:** what if Apple designed Discord. The app rebuilt on Apple's rules: a floating functional layer over content, one quiet accent, type that does the work, and motion that behaves like physics.

**Status:** built and tested in real Discord. The version number lives in `build.mjs`.

| File | Purpose |
| --- | --- |
| `src/tokens.css` | Every design value, for all versions |
| `src/theme.css` | The theme, written against the live client |
| `build.mjs` | Generates `dist/`, with wallpapers embedded |
| `check.mjs` | Tests the built themes against today's Discord (`npm run check`) |
| `design/preview.html` | Interactive mock, reads the same tokens |
| `design/screens/` | Renders of the mock, plus `discord.png` and `discord-light.png`, real captures with placeholder content |
| `design/social.html` | The GitHub social preview, rendered to `.github/social-preview.jpg` |

## Versions

Every version is glass over a wallpaper, so Light and Dark are never flat white, grey or black. All of them share one layout and one component set, and differ only in the weight of the glass.

| | Liquid Glass | Light | Dark |
| --- | --- | --- | --- |
| Idea | Transparent and lightly frosted | Frosted glass, lighter | Smoked glass, darker |
| Wallpaper | Arcella Alps pair, follows appearance | Arcella Alps Light | Arcella Alps Dark |
| Appearance | Follows Discord's setting | Always light | Always dark |

Chat always sits on a thicker material than the navigation, per the HIG: glass belongs to controls and navigation that float above content.

## Flavours

A Flavour is a small add-on theme that swaps the wallpaper, so 3 versions and 5 Flavours need 8 files rather than 18. It's enabled alongside a version and uses `html:root`, so it wins whichever file loads first.

## Legible on any wallpaper

CSS can't sample what's behind a surface, so the glass clamps its backdrop instead. `brightness()` caps how bright it can get on dark, and `contrast()` with `brightness()` lifts the floor on light. Color still shows through, but the luminance range can't reach the text.

**The clamp is measured per wallpaper.** Transparency and legibility pull against each other, so one fixed value would make every wallpaper as dark as the brightest one needs. Instead `build.mjs` blurs each image the way the glass will and reads its peak brightness and darkest band. Each one then gets only the clamp it needs, as `--dp-dim-*` and `--dp-lift-*`. Arcella Alps stays open, and the brightest Flavour, Pelomyxa Pass, is held back further. It's still pure CSS, because the numbers are worked out ahead of time.

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
| Warning and success text | Orange `#FF8D28` and green `#34C759`, 2.31:1 and 2.22:1 on white | `#8F4700` and `#0F6B2C` on light, 6.84:1 and 6.65:1 | The fills are too pale to read as text on light glass |

The warning and success figures are calculated, not yet measured in the client. At the limits the glass is clamped to, in light and in dark, both text colors work out slightly stronger than the existing red text.

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
- **`:root` alone loses.** Tokens are declared on the `.theme-*` classes and `.visual-refresh`, and lazy stylesheets can load after a theme, so the theme repeats those selectors to outrank them without `!important`.
- **Hashes rotate, names don't.** In `src/theme.css`, `.panels` means Discord's class with any ending, and the build matches it by the start of the name, whether it's the first class on an element or a later one. Matching any part of the name would also catch longer names that end the same way: `bar` sits inside `sidebar_` and `toolbar_`, and Discord's newer endings can contain an underscore. `npm run check` tests every name against Discord's current class list, for the normal release and the test release.
- **The accent is a hundred shades, not one.** Discord keeps blurple as numbered shades, `--blurple-1` to `--blurple-100`, with `--brand-*` and `--opacity-blurple-*` built on them. Its mentions, reactions, tab lines, hover states and tints all come from those, so replacing only the middle shade leaves the rest blurple. `build.mjs` writes every shade from `--dp-accent`, lighter and darker by the same steps Discord uses, so a custom accent reaches everything.
- **Discord stores colors as bare numbers.** A shade is kept as `234.935 85.556% 64.706%` and wrapped where it's used, as `hsl(var(--blurple-50-hsl)/1)`. A value that starts with `from` turns that wrapper into a relative color, which is how a shade can follow a variable.
- **The header is anchored to chat.** CSS anchor positioning lets it follow the member list and side panels without knowing about them.
- **Nitro themes use two systems.** Color amounts and `--background-gradient-*` both need neutralizing.

## Rules learned the hard way

- **Test on real wallpapers.** The first pass only met AA on a soft gradient, and real images caused up to 25 failures each.
- **`backdrop-filter` ignores `corner-shape`.** Chromium clips the blur to a round corner, so a squircle on glass leaves a box of darkened backdrop around the curve. Anything with `backdrop-filter` stays round.
- **Docked panels get no outer shadow.** Discord's `overflow: hidden` containers cut it into a hard straight line. Rim light gives the edge instead, and only free-floating menus and sheets keep a shadow.
- **Overlays need the panel's radius.** The header fade sits on top of the chat panel, so a square fade covers its rounded corners.
- **The main pane isn't always `main`.** Threads channels have none, so the plate and header anchor sit on the chat area's first child. Test threads channels, not just text channels.
- **Discord pins some bars to the very edges of the transcript.** The jump and new messages bars need moving clear of the composer and the header.
- **Sheens wash out labels.** The diagonal highlight lands on the top-left of each panel, right where section headers sit, so keep it subtle.
- **`backdrop-filter` traps fixed children.** It makes the element their containing block, so the chip behind the window buttons is a pseudo-element.
- **Never animate opacity, filter or mask on an ancestor of glass.** It becomes a backdrop root and the blur stops seeing the page.
- **Keep the composer in flow.** A fixed negative margin lets messages scroll under it while a long draft still shrinks the transcript.
- **The lens needs a known height.** The composer grows, so it uses a top-rim-only map.
- **Don't mask a backdrop blur for scroll edges.** It leaves a hard cut, so use an eased gradient.
- **Don't override the sidebar width.** It's the user's saved size.
- **`title` is a shared name** across nested elements, so use direct-child selectors there.
- **Translucent surfaces need glass behind them.** `--background-surface-*` are translucent here, so a popout with no blur shows the page straight through its text. Popouts get the menu material. Open new ones to check, because nothing else will catch this.
- **Prefer a role to a class name.** `role="tooltip"`, `role="dialog"` and `data-list-id="chat-messages"` each mean one thing, while `tooltip_` alone is six different classes.
- **Check what a name really matches.** `layer_` is eight classes, one of them a backdrop, so the reset only touches `.layers > .layer`. Discord also has classes with no CSS of their own, like `containerDefault_`, so its stylesheets alone can't prove a name is dead. Check the live client too.
- **Base64 can spell things by chance.** The Equicord Theme Library refuses any file containing `PNG`, `JFIF` and similar, even inside an embedded image, so the build re-encodes a wallpaper a notch lower until it's clean.
- **Most of Discord's stylesheets aren't on its page.** The page links about 330, and nearly 1,000 more load as screens open, named only inside its main script. A check against the linked ones alone reported 29 overrides as unused, 11 of them wrongly. `check.mjs` reads all of them.
- **A stylesheet can't prove a variable is unused.** Discord's code can read one too. 17 of Dapple's overrides are read by no stylesheet, and they stay until each has been looked at on screen.
- **Discord ships hot pink debugging colors.** One of its stylesheets sets every raw shade to hot pink and writes each finished color out in full. It only loads with Discord's "CSS debugging" developer option, so leave it out of any test, or every color built from a shade looks broken.

## Verification

- **Real Discord, loaded through Equicord, every version on every wallpaper:** 1,080 interface labels across 24 combinations, with no failures and a lowest of 4.58:1. Each label is judged on the 10th percentile of the pixels behind it, so one straddling a bright band can't pass on its median. Channel names are included. Role-colored names are excluded, because each server sets them.
- **The check can fail.** With the glass removed, the same run drops to 1.05:1 and fails up to 24 labels.
- **Against today's Discord, automatically.** `npm run check` tests every class name against Discord's current list, and every Discord variable and blurple shade against all of its stylesheets. It can fail too: the released 1.2.0 fails it on 152 shades, and it catches each kind of deliberate mistake.
- **The accent, in a browser.** Discord's own stylesheets with Dapple on top, in Chrome 152. Mentions, reactions, tab lines and tints resolve to the accent, for the default blue and for a green and an orange set the way the README says to.

**Not verified:**

- The accent shades, the error, warning and success colors and the mapped shadows in the real client. They resolve correctly against Discord's stylesheets, but nobody has looked at them over a wallpaper yet, and the new text colors haven't been through the contrast run.

- Menus and sheets on these wallpapers. They keep their own thicker glass, which last passed on the previous wallpapers with a lowest of 5.73:1.
- Scrolling performance. The debug session caps at about 13 fps with or without a theme, so it can't measure this.
- Vencord and BetterDiscord.
- Screen share, and voice and video call views.
- Windows snap and resize behavior with the traffic lights.
- Reduce Motion, Reduce Transparency and Increase Contrast in the real client.

## Out of scope for v1

- **Replacing Discord's icons.** SF Symbols can't be redistributed in a theme. An open-licensed set could come later.
- **iMessage-style bubbles.** CSS can't reliably tell your messages from everyone else's.
- **Nitro, Shop, Quests and Activities layouts.** They inherit the tokens and sit on the glass plate, without custom layouts.

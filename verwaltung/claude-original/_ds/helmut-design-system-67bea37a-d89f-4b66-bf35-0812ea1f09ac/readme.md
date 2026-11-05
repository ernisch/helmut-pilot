# Helmut — Design System

**Helmut** is a German-market SaaS product billed as *„Der politische KI-Stabschef"* — the political AI chief of staff. Every morning it reads the political information flow (news, press releases, parliamentary proceedings, regional developments, appointments) and does the one thing the flood doesn't: it **prioritises**. It tells an elected official what matters today, what can be ignored, what must be answered (with a deadline), which opportunities are opening, which risks are forming — and drafts the communication to respond.

Its positioning line captures the whole product: **„Helmut zeigt nicht nur, was passiert ist. Helmut sagt, was jetzt zu tun ist."** (Helmut doesn't just show what happened. Helmut says what to do now.) A second principle is equally load-bearing: **the decision always stays with the human** — Helmut never publishes on its own, every recommendation is a proposal.

## Products / surfaces

1. **Marketing website** — a single-page, editorial dark site (Spectral serif, hairline rules, one blue accent). This is the **definitive, most refined expression of the brand** and the source of truth for the design tokens in this system. Sections: Hero → Problem → What Helmut delivers each morning → Briefing interface sketch → The four areas → A morning with Helmut → For whom → Trust & security → Close.
2. **Helmut app (PWA)** — the product itself, organised into four areas: **Lage** (objective political overview), **Radar** (developments around the mandate — topics, people, region), **Briefing** (concrete priorities & recommendations), **Büro** (prepared work products — statements, argumentation lines, communication drafts). Delivered as an installable dark-mode PWA with push notifications.

The product is currently a single-tenant pilot (built around one member of the Bundestag) evolving toward multi-tenant SaaS aimed at Bundestag & Landtag members, chiefs of staff / research assistants, and parliamentary groups.

## Sources this system was built from

All read-only, provided as a mounted local codebase (`Helmutt/`). No public Figma or repo URLs were given; the paths below are recorded in case the reader has access:

- `Helmutt/dateien/WEBSITE/site-1/` — the marketing website (a Design Component, `index.html`). **Primary token source.** Self-hosted fonts under `fonts/`.
- `Helmutt/styles.css` (10,965 lines), `Helmutt/client.js`, `Helmutt/index.html` — the Helmut PWA app. Source of the product's semantic signal colours (risk / chance / watch) and the four-area IA.
- `Helmutt/assets/` — app icons, favicons, brand mark (`helmut-mark.svg`), placeholder wordmark.
- `Helmutt/docs/`, `Helmutt/dateien/` — product/architecture docs and audits (German). Useful for content & tone; not visual.

### Font substitution note
None required. All three brand fonts are **open-licensed and were shipped with the source** (self-hosted, OFL): **Spectral**, **Hanken Grotesk** (variable), **IBM Plex Mono**. They are copied into `assets/fonts/` with their OFL licenses. No Google Fonts fallback was needed.

### Logo note
The source contains a **brand mark** (`assets/helmut-mark.svg`) and a monogram used across the website & og-image: a light rounded square (`#EDEFF4`) holding a serif **"H"** (Spectral), set beside the **"Helmut"** wordmark in Spectral. `assets/helmut_logo_placeholder.svg` is an Arial text placeholder from the repo and is **not** the real wordmark — use the Spectral wordmark. The white-H-on-navy app icon (`assets/helmut_appicon_512.png`) is the installed-app mark. No logo was invented.

---

## CONTENT FUNDAMENTALS

**Language.** German, throughout. UI, marketing, notifications — all `de-DE`. Formal register: the website addresses the reader as **„Sie"** ("Sehen Sie Helmut in Aktion"). Copy is written *about* Helmut in the third person („Helmut ordnet, gewichtet — und empfiehlt"), never in a chatty first-person AI voice.

**Tone: editorial restraint.** The defining quality is *quiet confidence*. Sentences are short, declarative, often fragments used for rhythm. Parallelism and antithesis do the persuading, not adjectives:
- „Nicht zu wenig Information. Zu wenig Priorisierung." (Not too little information. Too little prioritisation.)
- „Im Zweifel weniger — dafür belastbar." (When in doubt, less — but dependable.)
- „Sechs Minuten, dann ist der Tag sortiert." (Six minutes, and the day is sorted.)

**Casing.** Sentence case for everything readable (headings, body). **Mono eyebrow labels are UPPERCASE** with wide letter-spacing (`Das Problem`, `Jeden Morgen`, `Politischer KI-Stabschef`). Category/state tags are also uppercase mono (`REAKTION`, `CHANCE`, `RISIKO`, `PRIORITÄT`, `RUHE`). German nouns keep their capital regardless.

**Vocabulary.** A small, consistent product lexicon that must be reused verbatim: **Lage, Radar, Briefing, Büro, Morgenbriefing, Handlungsempfehlung, Stabschef, Priorität, Chance, Risiko.** Time is concrete and human („Di · 15. Juli · 07:14", „07:20 Im Büro bereit").

**Honesty markers.** The product constantly signals its own limits — this is brand-critical copy, not legalese: „Keine automatische Veröffentlichung", „Die Entscheidung bleibt bei Ihnen", „Beispielhafte Darstellung. Inhalte sind fiktiv." Uncertainty is always flagged.

**Emoji: never.** No emoji anywhere. No exclamation-mark hype. No growth-marketing clichés. The only ornaments are a single accent dot and hairline rules.

**Vibe.** A calm, senior chief of staff who has already read everything and hands you one page. Serious, discreet, trustworthy, understated. Think a broadsheet leader column, not a startup landing page.

---

## VISUAL FOUNDATIONS

**Overall.** Dark-mode, editorial, near-monochrome. The interface "lives in the dark": deep navy surfaces, ink-white text, and exactly **one** chromatic accent (a soft editorial blue). Objects are separated by *hairlines and depth*, almost never by fills. The feel is a printed political brief rendered at night.

**Colour.**
- Surfaces are four steps of deep navy, near-black: `--bg #070B16` → `--bg-1 #0A0F1B` → `--bg-2 #0C1322` → `--bg-footer #05080F`. Barely-there steps; hierarchy comes from hairlines, not contrast jumps.
- Text is cool off-white ink `--ink #EAEEF6` down through a grey ramp (`--text`, `--text-2`, `--muted`, `--muted-2`) to faint metadata.
- **One accent:** editorial blue `--accent #7FA8E0`. Used for the single hero dot, focus rings, the active-tab underline, small emphases — never as a large fill. Derived tones (`--accent-strong` hover, `--accent-dim` wash, `--accent-line`) come from it.
- **Signal set** (product semantics, used sparingly on data): `--risk #ff5967`, `--chance #39d18f`, `--watch #d6a040`. These mark political weight in the app (Risiko / Chance / Beobachten). The marketing site stays monochrome+blue; the app introduces the signals.
- Solid buttons invert: a light surface `#E9EDF5` with dark ink `#0A0F1C`.

**Type.** Spectral (serif) for all display & headings at weight **500** (regular 400 for the wordmark and pull-quotes) — this serif is the brand's signature and does the "speaking". Hanken Grotesk (variable sans) for all body and UI. IBM Plex Mono for eyebrows, metadata, timestamps, and category tags — always uppercase, wide tracking (`.14–.2em`). Display is tightly tracked (`-.015em`) and set on tight leading (`1.06`).

**Backgrounds.** Flat deep-navy base. The *only* decorative treatment is a large, very soft **radial accent glow** behind the hero and closing sections (`radial-gradient(92% 62% at 50% -8%, var(--accent-dim), transparent 62%)`) — subtle, never a "gradient background". No images behind content, no textures, no patterns, no full-bleed photography. Section changes are marked by a `--bg-1` fill and a top hairline, nothing more.

**Borders & dividers.** Hairlines are the primary structural device: `--line rgba(255,255,255,.08)` and `--line-2 rgba(255,255,255,.13)`. List items are separated by full-width top borders (`border-top:1px solid var(--line)`), giving an editorial ledger look. A recurring motif is a thin **top accent line** on framed panels: `linear-gradient(90deg,transparent,var(--accent-line),transparent)` — a 2px hairline that fades in from both edges.

**Cards & panels.** Cards are `--bg-1`/`--bg-2` fills with a single hairline border and modest radius (`--r-md 8px`). The showcase "briefing" panel adds `--shadow-panel` (a deep, soft, downward shadow: `0 30px 70px -34px rgba(0,0,0,.8)`) and `overflow:hidden` so its top accent line sits flush. **No** colored left-border accent cards, **no** heavy borders, **no** glassy neon. Corner radii are deliberately small: 4 / 8 / 14 / 999px.

**Shadows.** Two only: `--shadow-panel` (elevated panels) and `--shadow-soft`. Both are large-radius, high-negative-spread, near-black — objects float gently on the dark rather than casting hard drops. No inner glows, no neon.

**Spacing & layout.** Generous vertical rhythm driven by `--sy` (88px calm, 62px compact). Three fixed reading widths: `--max 1080px`, `--max-narrow 820px`, `--max-text 640px`. Horizontal inset is fluid `--px clamp(20px,5vw,40px)`. Content is centred and measure-limited; long text respects `max-width` in ch. The header is `position:sticky` with a blurred translucent background.

**Transparency & blur.** Used in exactly two places: the sticky header (`background:rgba(7,11,22,.72); backdrop-filter:blur(12px)`) and translucent hairlines/overlays. Fills are otherwise opaque. Blur is a chrome device, not decoration.

**Motion.** One easing curve `cubic-bezier(.22,1,.36,1)`, three durations (`120 / 200 / 320ms`). Sections fade-up once on scroll-in (`hReveal`: opacity + 16px translateY) via IntersectionObserver — content is never hidden behind async JS (base state is visible). Respects `prefers-reduced-motion`. No bounces, no parallax, no looping animation.

**Hover / press.** Hover is subtle: links shift to `--accent-strong`; ghost buttons brighten their border (`--line-2` → `rgba(255,255,255,.4)`) and text to `--ink`; solid buttons go `#E9EDF5` → `#ffffff`; cards/rows lift `translateY(-1px)` with a slightly stronger border. No scale-up on hover. Focus is a clear 2px accent outline with 3px offset. Press states rely on the fast duration; nothing shrinks dramatically.

**Iconography.** See the ICONOGRAPHY section below.

---

## ICONOGRAPHY

Helmut is **almost icon-free by design** — restraint is the aesthetic, so glyphs are avoided in favour of type and hairlines.

- **No icon font, no icon library** in the source. There is no Lucide/Heroicons/Feather dependency, no SVG sprite, no `<i class="icon">` system.
- **Geometric primitives instead of icons.** Status and rhythm are shown with tiny CSS shapes: a **priority dot** (filled `--accent` circle for "act", hollow ring `1.5px solid rgba(255,255,255,.35)` for "watch", faint filled dot for "can wait"), a small **accent dot** before the eyebrow, and hairline rules. A document "chip" in the briefing footer is a 13×15px bordered rectangle — a suggestion of a page, not a drawn file icon.
- **Category is carried by text, not symbols.** Where another product would use icons, Helmut uses uppercase mono tags: `REAKTION`, `CHANCE`, `RISIKO`, `PRIORITÄT`, `RUHE`, `ENTWURF`.
- **The only real "icon" is the brand mark:** a serif **"H"** in a light rounded square (`assets/helmut-mark.svg`, and the app's `helmut_appicon_*.png`).
- **Emoji: never used.** No Unicode dingbats as icons either.
- **Guidance for new work:** stay glyph-light. If an icon is genuinely required (e.g. inside the app: settings gear, close ×, bell), use a **thin single-stroke line icon** (≈1.5px stroke, round caps) that matches the hairline weight — Lucide is the closest CDN match and is an acceptable substitute. Flag any icon set added this way. Never introduce filled/duotone icon styles or emoji.

*(The app currently renders its close/menu affordances as bare typographic characters — e.g. a light-weight `×` at `font-weight:300` — consistent with the glyph-light approach.)*

---

## Index / manifest

Root files:
- `styles.css` — global entry point (link this). `@import`s the four token files below.
- `tokens/fonts.css` — `@font-face` for Spectral, Hanken Grotesk, IBM Plex Mono.
- `tokens/colors.css` — surfaces, ink ramp, lines, accent, signal set, brand mark; semantic aliases.
- `tokens/typography.css` — families, weights, fluid scale, line-heights, tracking.
- `tokens/spacing.css` — radii, spacing scale, section rhythm, shadows, layout widths, motion.
- `thumbnail.html` — homepage tile.
- `SKILL.md` — Agent-Skills-compatible entry.

Foundations (Design System tab, `guidelines/`): colour, type, spacing, motion, brand specimen cards.

Components (`components/core/`): see the components card. Reusable primitives extracted from the website source — Button, Eyebrow, Tag, PriorityItem, Card, SectionHeading, Wordmark, Panel.

UI kits (`ui_kits/`):
- `ui_kits/website/` — the marketing site recreation.
- `ui_kits/app/` — the Helmut PWA (Lage / Radar / Briefing / Büro).

### Intentional additions
- **Wordmark** and **Eyebrow** are promoted to named components because they recur identically across the site and app and encode brand rules (Spectral H-in-square; uppercase mono tracking). No net-new visual language is introduced.

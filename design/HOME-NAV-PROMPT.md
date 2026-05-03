# Deckd — Home Screen + Global Navigation **ONLY**

**Handoff prompt for UI/image models.** Copy from **START PROMPT** through **END PROMPT**. Product name is **Deckd** only. Use the **logo asset** (`assets/Logo.png` — red, rounded, heart-accent Deckd mark) on the **center nav control** as specified.

---

## Scope guard (for humans + models — read before generating)

| **In scope for this prompt** | **Out of scope — do not design or show full screens** |
|------------------------------|--------------------------------------------------------|
| **One** portrait home screen (scroll allowed: hero + stats + **home-only** preview blocks) | Full **Store**, **Games List**, **Profile**, **Settings**, **auth**, **lobby**, **game table**, **modals** beyond tiny copy hints |
| **Global bottom navigation** on that same home mock: peeking “cards” + **center logo** medallion | **In-game** UI: **felts**, **community cards**, **pot**, **action bar**, **table chrome** |
| Nav **labels/icons only** for five destinations (read as chrome, not separate pages) | **Second frames**, **multi-screen flows**, **app map**, **every tab’s interior** |
| Optional: **annotation layer** on the home mock | **Hamburger / fan menu** on the table (that belongs in a **game / active-play** prompt, not here) |

**If the model drifts into building the whole app, the output is invalid.** One home + one nav strip; scroll stays **on the home concept**.

---

## START PROMPT

### Role

You are designing **high-fidelity mobile UI** (portrait, iPhone-class ~390×844 pt logical) for **Deckd**, a card-game app.

**This deliverable is ONLY:**

1. The **home screen** (single route).
2. The **global bottom navigation** (always visible on that home screen).

**Do not** design Store, Profile, Games List, game table, or any other full screen. **Do not** show multi-panel storyboards into gameplay. **Do not** expand scope to “the whole app.”

The experience must feel **deck-forward**: playing cards, stacks, fans, edges, pips, and paper texture **without** clutter. The home screen is **debloated** and **fast to play**. **No onboarding screens.**

**Brand:** **Deckd** + logo where specified. Primary palette: **deep crimson / brick red** on **white / off-white** (~`#B02020`, `#FAFAFA`–`#FFFFFF`, `#1A1A1A` text). **Premium** shadows, generous radius, **geometric sans** typography.

---

### Global navigation — bottom chrome ONLY (on the home mockup)

These rules describe **the nav strip that appears at the bottom of the home screen** — not separate artboards for each destination.

- **Peek cards:** Nav items read as the **top ~30%** of **playing cards** rising from the bottom (only the **upper portion** visible — cards peeking from a holder). **Five** tap targets for: **Home**, **Store**, **Game**, **Games List**, **Profile**. **Icon or single-letter** on each card; **suit-free or minimal suits** — not chaotic.
- **Center control:** **Not** a fifth peeking card — a **round or squircle medallion** with the **Deckd logo** (use the real `Logo.png` treatment in the mock). This is the **Game** hub control. **Elevated**, **primary red** ring or soft shadow.
- **Do not** illustrate what happens when the user taps Store/Profile/etc. — only show **home** with nav **as chrome**.

**Game** is **center** logo; the other four are **peek cards** (two left, two right, or consistent layout).

| Peek order L→R (conceptual) | Label        | Note |
|----------------------------|--------------|------|
| 1                          | Home         | Active on this screen |
| 2                          | Store        | Label/icon only       |
| 3                          | **Game**     | **Center logo**       |
| 4                          | Games List   | Label/icon only       |
| 5                          | Profile      | Label/icon only       |

---

### Home screen — layout and hierarchy (single screen)

**Above the fold**

- **Primary path to play**
  - **Primary CTA:** **“Deal the deck”** — large pill or card-shaped control (implies navigation to game **later**; **no game UI here**).
  - **Secondary CTA:** **“Deal to friends”** — same family, slightly quieter; optional tiny **lock** or Apple footnote for “account/social” — **no auth screens**.
- **Stats banner:** Subtle strip or narrow card: small avatar, **1–3** stat chips (placeholder numbers OK). **Lower contrast** than hero CTAs.

**Below the fold (scroll, still this ONE screen)**

- **Store preview** — **teaser blocks only** on home (not the full Store):
  - Custom card / backs **tiles** (carousel or horizontal stack).
  - **Deckd+** one card + short line of value prop.
  - **Sale** row (badge + mock price).
- Section headers: **card-edge / stack divider** metaphor — **minimal**.

**Emotional goal:** **Deck vibe**, **low cognitive load**, **one tap to play** feeling — **without** drawing any other app surface.

---

### Account / multiplayer (home copy only)

- **Deal to friends** may hint paid/social; **Deal the deck** stays frictionless. **No** full Sign in with Apple sheet — chip or footnote at most.

---

### Visual and motion notes (optional captions on the mock)

- **Premium:** Soft stack shadows; optional **subtle** paper grain; **no** glossy casino neon.
- **Motion (callouts only):** e.g. logo press, peek-card parallax — **do not** produce a separate motion reel unless asked.
- **Accessibility:** Tap targets **≥ 44 pt**; red on white **WCAG-minded**.

---

### Deliverables — pick ONE primary (state which in the user message)

**Valid outputs for this prompt:**

1. **Required primary:** **One** static high-fidelity mock: **full home** + **bottom global nav** (peek cards + center logo) **in the same frame** (scroll implied or one tall artboard).
2. **Optional add-on:** **Design annotations** — second layer or numbered callouts: spacing, radii, CTA order, scroll sections, nav hit areas.

**Invalid outputs (reject if the model produces these as the “main” deliverable):**

- Full **Store**, **Profile**, **Games List**, or **game table** screens.
- **Storyboard** home → game → table.
- **In-game** hamburger + **fan menu** (different prompt).
- **Onboarding** or **multi-page app flows**.

**Do not** use watermarks, **“Nanobanana”** or unrelated product names, or **lorem** longer than one short line. **Product name: Deckd.**

---

## END PROMPT

---

## Reference assets

- **Logo:** `assets/Logo.png` — **center nav medallion** and optional hero branding.
- **Other surfaces (game table, pass-phone, etc.):** Use a **separate** design prompt — do **not** merge into this file.

---

## Model comparison checklist (home + nav ONLY)

Score each **1–5**:

| Criterion | Notes |
|-----------|--------|
| **Scope discipline** | Single home + bottom nav only; no stray full screens |
| Deck metaphor | Peek nav; not a generic iOS tab bar |
| Debloated home | Hero CTAs dominate; previews secondary |
| **Deal the deck** / **Deal to friends** | Clear hierarchy |
| Center logo / Game | Medallion is the hero of the nav |
| Scroll previews on home | Three teaser types recognizable |
| Stats banner | Visible, not competing |
| Premium / on-brand | Red/white, typography, shadows |

---

*File: `design/HOME-NAV-PROMPT.md` — Home + global nav only. Other screens: separate prompts.*

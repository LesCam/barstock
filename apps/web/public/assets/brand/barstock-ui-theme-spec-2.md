# BARSTOCK UI THEME IMPLEMENTATION SPEC

(Claude Implementation Version)

## Brand Overview

Barstock is a premium hospitality inventory SaaS platform. UI tone:
dark, professional, modern, operational efficiency focused.

------------------------------------------------------------------------

## Core Brand Colors

Primary Gold: #E9B44C

Gold Accent Hover: #C8922E

Main Background: #0B1623

Sidebar / Card Navy: #16283F

Secondary Panels: #1F3554

Primary Text: #EAF0FF

Secondary Text: rgba(234,240,255,0.85)

Disabled Text: rgba(234,240,255,0.55)

Accessibility Note: Increase contrast vs earlier mockups. Sidebar text
should be bright enough for low‑light bar environments.

------------------------------------------------------------------------

## Logo Assets

Use: - barstock-mark.svg (icon) - Full logo PNG/SVG for headers

Rules: - Never stretch logo - Prefer dark backgrounds - Keep gold
consistent

------------------------------------------------------------------------

## Sidebar Theme

Background: #16283F Width: 260px desktop Collapsible icons-only mode
allowed

Text: Bright white primary Muted secondary but readable

Active State: - Gold highlight bar - White text - Slight glow

Hover: - Slight lighter navy - Smooth 150ms transition

Icon Style: - Minimal line icons - Consistent stroke width

Order: 1. Logo top 2. Primary nav 3. Divider 4. Secondary nav 5. User
account bottom

------------------------------------------------------------------------

## Dashboard Styling

Cards: - Background rgba(22,40,63,0.92) - Radius 20px - Border
rgba(255,255,255,0.10) - Shadow 0 10px 30px rgba(0,0,0,0.4)

Charts: Primary accent gold Secondary muted blue Subtle gridlines
Readable axis labels

Avoid bright random colors.

------------------------------------------------------------------------

## Typography

Font: Inter (fallback SF Pro, system-ui)

Weights: Headings 600--700 Body 400--500

Sizes: Dashboard titles 26--34px Card titles 18--22px Body 15--17px

Accessibility: Avoid overly thin fonts. Prioritize legibility in dim
bars.

------------------------------------------------------------------------

## Buttons

Primary: Background #E9B44C Text #0B1623 Hover #C8922E Radius 14px

Secondary: Transparent navy White text Subtle border

------------------------------------------------------------------------

## Forms

Inputs: Background rgba(255,255,255,0.08) Border rgba(255,255,255,0.15)

Focus: Gold glow highlight

------------------------------------------------------------------------

## Mobile Theme

Login: - Dark navy gradient - Logo centered - 4-digit staff PIN keypad -
Gold accent highlights

Dashboard: Scan-first design Minimal navigation

------------------------------------------------------------------------

## Overall UI Direction

Premium hospitality SaaS Dark theme dominant Minimalist modern UI
Readable in low light environments Consistent spacing No playful/cartoon
elements

------------------------------------------------------------------------

## Implementation Goal

Claude should apply this theme consistently across: - Dashboard -
Sidebar - Login screens - Mobile app UI - Web admin interface

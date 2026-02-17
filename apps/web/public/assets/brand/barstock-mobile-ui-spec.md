# BARSTOCK MOBILE UI SPEC (UPDATED --- LIGHTER READABLE VERSION)

## Brand Direction

Barstock mobile UI should prioritize readability, speed, and operational
clarity for hospitality staff. Design should feel like professional SaaS
software --- not nightclub dark.

Tone: - Clean professional hospitality SaaS - Lighter base UI with
navy/gold accents - High readability in dim environments - Minimal
visual clutter - Fast interaction focus

------------------------------------------------------------------------

## Primary Color System

Accent Gold: #E9B44C

Dark Gold Hover: #C8922E

Primary Navy: #1E3A5A

Background Base: #EEF3FA (light cool gray)

Card Background: #FFFFFF or #F6F9FC

Header Gradient (optional): #2C4F7C → #1E3A5A

------------------------------------------------------------------------

## Text Colors

Primary Text: #0B1623

Secondary Text: rgba(11,22,35,0.75)

Muted Text: rgba(11,22,35,0.55)

Accessibility: Avoid low-contrast text. Ensure readability in dim bar
lighting.

------------------------------------------------------------------------

## Typography

Font: Inter or SF Pro

Sizes: Headers: 22--28px Card Titles: 16--18px Body: 14--16px

Weights: Headings 600--700 Body 400--500

Avoid ultra-thin fonts.

------------------------------------------------------------------------

## Layout Structure

### Top Header

-   Barstock logo left
-   Location selector optional
-   Notification icon right
-   Navy gradient background

### Main Dashboard

Card-based layout: - Inventory summary - Alerts - Recent counts - Quick
actions

Cards: - Rounded 16--20px - Light background - Subtle shadow

------------------------------------------------------------------------

## Inventory Count Entry Screen

Primary Actions: - Partial Count (weigh open bottles) - Full Container
Count

Requirements: - Large tap targets - Clear descriptive text - Image or
icon support - Immediate navigation to workflow

------------------------------------------------------------------------

## Task Section

Examples: - Resume Count Session - Manual Adjustments - Export Reports

Display as: - List cards - Clear icons - Simple action buttons

------------------------------------------------------------------------

## Bottom Navigation

Tabs: - Inventory - History - Team - Settings

Active Tab: Gold highlight (#E9B44C)

Background: Light neutral or navy accent.

------------------------------------------------------------------------

## Interaction Principles

Priority: - Speed - Clarity - Low cognitive load

Avoid: - Heavy shadows - Overly dark themes - Decorative effects

Animations: Subtle and fast only.

------------------------------------------------------------------------

## Staff Workflow Priority

Typical usage:

1.  Open app
2.  Enter PIN
3.  Start inventory count
4.  Scan/weigh
5.  Confirm

UI should support this directly.

------------------------------------------------------------------------

## Implementation Goal for Claude

Apply this mobile theme consistently to:

-   Staff login (PIN keypad)
-   Dashboard
-   Inventory counting screens
-   History/reports
-   Settings

Ensure readability first. Maintain Barstock navy/gold brand accents.

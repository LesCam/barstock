# Barstock Bridge Adapter --- Developing Specification (v1.2)

## Commercial BLE Scale Interface Device

------------------------------------------------------------------------

## 1. Purpose

The Barstock Bridge Adapter is a commercial-grade hardware device that
enables any professional scale to integrate with the Barstock inventory
system by normalizing scale communication into a unified BLE protocol.

Goals:

-   Support industry commercial scales
-   Avoid vendor lock‑in
-   Maintain hardware simplicity
-   Keep intelligence in Barstock software
-   Provide enterprise-level reliability in bar environments

------------------------------------------------------------------------

## 2. System Overview

Commercial Scale → Serial/USB Data → Barstock Bridge Adapter → BLE
Transport → Barstock App → Barstock Cloud Parsing

------------------------------------------------------------------------

## 3. Design Principles

1.  Transport first, interpretation later
2.  Hardware must be boring and reliable
3.  Stateless firmware wherever possible
4.  Recoverable from any failure
5.  One‑glance status visibility
6.  Plug‑and‑forget installation

------------------------------------------------------------------------

## 4. Hardware Architecture

### Core Components

-   ESP32 microcontroller (BLE capable)
-   RS232 → TTL converter (MAX3232)
-   USB‑C power input
-   Rechargeable LiPo backup battery
-   RGB status LED
-   Recessed reset/pair button

### Supported Scale Interfaces (v1)

-   RS232 serial (primary)
-   USB serial (future expansion)
-   TTL serial (internal support)

------------------------------------------------------------------------

## 5. Power System

### Primary Power

-   USB‑C 5V external adapter
-   Always-on operation

### Backup Battery (UPS Mode)

-   Internal rechargeable LiPo (300--1000 mAh)
-   NOT intended for standalone battery operation
-   Prevents reboot during unplugging or movement

Behavior: - Runs on USB when available - Automatically switches to
battery - Graceful shutdown when battery critical

------------------------------------------------------------------------

## 6. Firmware Responsibilities (MVP)

### Raw Data Transport

Device reads raw frames from scale and forwards them.

Example frame: ST,GS,+00123.4 g`\r\n`{=tex}

### Message Framing

-   newline detection
-   timeout fallback

No semantic parsing initially.

------------------------------------------------------------------------

## 7. BLE Communication Model

Bridge transmits raw framed data.

Example payload:

``` json
{
  "device_id": "BR-001",
  "port": "rs232",
  "baud": 9600,
  "frame": "ST,GS,+00123.4 g\r\n",
  "ts_ms": 123456789
}
```

BLE Characteristics:

-   Raw Frame Stream (notify)
-   Device Status
-   Configuration Control
-   Firmware Update Channel

------------------------------------------------------------------------

## 8. Scale Protocol Strategy

Protocols vary between manufacturers.

Bridge performs: - transport - framing - metadata reporting

Barstock app/cloud performs: - protocol identification - parsing -
normalization

Profiles define interpretation.

------------------------------------------------------------------------

## 9. Serial Auto‑Detection

Attempt baud rates:

1200, 2400, 4800, 9600, 19200, 38400

Detection rule: Frames must resemble printable ASCII.

------------------------------------------------------------------------

## 10. LED Status System

Single diffused RGB LED.

### Base State Priority

1.  Error (Red)
2.  Firmware Update (Purple pulse)
3.  Stable data streaming (Green pulse)
4.  BLE connected (Blue)
5.  Powered idle (White)

### Overlay Signals

-   Low battery: Amber flash every 10s
-   Very low battery: Amber flash every 3s
-   Data warning: Red flash every 5s

Overlay never replaces base state unless critical.

------------------------------------------------------------------------

## 11. Reset Button Behavior

Recessed pinhole button.

  Action     Result
  ---------- ------------------
  1s press   Reboot
  5s hold    BLE pairing mode
  10s hold   Factory reset
  20s hold   Force DFU mode

------------------------------------------------------------------------

## 12. Firmware Update System (BLE OTA)

### Requirements

-   BLE OTA updates
-   Dual firmware slots (A/B)
-   Automatic rollback
-   Signed firmware images
-   Watchdog monitoring

### Update Flow

1.  Download firmware to inactive slot
2.  Verify integrity
3.  Reboot into new firmware
4.  Self-test
5.  Commit or rollback

Failure → automatic revert.

Bootloader is protected and not overwritten during normal updates.

------------------------------------------------------------------------

## 13. Recovery Strategy

Recovery levels:

1.  Software rollback (automatic)
2.  Factory reset button
3.  Forced DFU mode
4.  Internal programming pads (service only)

Device must never permanently brick.

------------------------------------------------------------------------

## 14. Physical Design

Form factor: - Small rectangular inline utility box - Matte black
enclosure - Slightly weighted feel

Approx size: - 100mm × 60mm × 25mm

Features: - Rubber feet - Same-side cable exit - Recessed ports -
Spill-resistant seams

------------------------------------------------------------------------

## 15. Environmental Requirements

Designed for bar environments:

-   Alcohol splashes
-   Cleaning chemicals
-   Refrigeration areas
-   Electrical noise

------------------------------------------------------------------------

## 16. Security

-   Signed firmware updates
-   Unique device UUID
-   No credentials stored locally
-   Stateless inventory logic

------------------------------------------------------------------------

## 17. MVP Scope (Explicit Non‑Goals)

Do NOT implement yet:

-   Local protocol parsing
-   Wi‑Fi connectivity
-   Multi-scale hub mode
-   On-device UI
-   Complex configuration menus

------------------------------------------------------------------------

## 18. Strategic Advantages

-   Universal scale compatibility
-   Hardware abstraction layer
-   Low manufacturing risk
-   SaaS-first hardware ecosystem
-   Competitive moat via normalization

------------------------------------------------------------------------

## 19. Development Status

This is a **living specification** intended for iterative refinement
with Claude-assisted development.

Version: v1.2 (Developing Spec)

------------------------------------------------------------------------

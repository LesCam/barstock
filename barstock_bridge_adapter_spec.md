# Barstock Bridge Adapter --- Architecture Specification

## (Claude Integration Design Document)

------------------------------------------------------------------------

## 1. Purpose

The **Barstock Bridge Adapter** is a hardware abstraction layer that
allows any commercial scale to communicate with the Barstock application
by converting vendor-specific scale protocols into a unified Barstock
protocol.

Primary goals:

-   Support commercial scales without native Bluetooth
-   Normalize heterogeneous scale protocols
-   Avoid firmware updates when adding new scale brands
-   Keep intelligence in Barstock software, not hardware

------------------------------------------------------------------------

## 2. System Overview

### High-Level Architecture

Commercial Scale\
→ Serial/USB Output\
→ Barstock Bridge Adapter\
→ BLE Transport\
→ Barstock App\
→ Barstock Cloud Parsing

------------------------------------------------------------------------

## 3. Design Philosophy

### Separation of Responsibilities

  Layer             Responsibility
  ----------------- -----------------------------------
  Bridge Hardware   Transport + framing only
  App / Cloud       Protocol interpretation
  Backend           Profile detection + parsing rules

Key principle:

> Transport first, interpretation later.

The Bridge does NOT initially interpret scale meaning.

------------------------------------------------------------------------

## 4. Hardware Architecture

### Core Components

-   ESP32 microcontroller (BLE capable)
-   RS232 → TTL converter (MAX3232)
-   USB power input
-   Optional enclosure (inline adapter)

### Supported Inputs

-   RS232 serial
-   USB serial
-   TTL serial (future)

------------------------------------------------------------------------

## 5. Firmware Responsibilities (MVP)

### 5.1 Raw Data Capture

Bridge reads incoming bytes from scale.

Example raw frame:

ST,GS,+00123.4 g`\r\n`{=tex}

### 5.2 Message Framing

Bridge detects message boundaries using:

-   newline (`\r\n`) detection
-   timeout fallback

No semantic parsing occurs at this stage.

------------------------------------------------------------------------

## 6. BLE Transport Protocol

Bridge streams raw frames to the app.

### Example Payload

``` json
{
  "device_id": "BR-001",
  "port": "rs232",
  "baud": 9600,
  "frame": "ST,GS,+00123.4 g\r\n",
  "ts_ms": 123456789
}
```

### BLE Characteristics

-   Raw Frame Stream (notify)
-   Device Status
-   Configuration Control
-   Firmware Version

------------------------------------------------------------------------

## 7. Serial Auto-Detection

Bridge attempts common configurations:

-   Baud rates: 1200, 2400, 4800, 9600, 19200, 38400
-   Data bits: 8
-   Parity: None
-   Stop bits: 1

Heuristic: Frames must resemble printable ASCII.

------------------------------------------------------------------------

## 8. Protocol Interpretation (App/Cloud)

### Step 1 --- Capture Frames

App records sample frames from unknown scale.

### Step 2 --- Backend Profile Matching

Backend identifies scale using regex/token matching.

### Step 3 --- Profile Assignment

Example profile:

``` json
{
  "profile_id": "AND_SJ",
  "regex": "([+-]\\d+\\.\\d+)",
  "stable_token": "ST",
  "unit": "g"
}
```

### Step 4 --- Parsing Result

``` json
{
  "weight_g": 123.4,
  "stable": true
}
```

------------------------------------------------------------------------

## 9. Profile System (Critical Design)

Profiles are data-driven.

Adding new scale support requires:

-   New profile definition
-   No firmware update

Benefits:

-   Rapid device compatibility
-   Remote updates
-   Reduced hardware maintenance

------------------------------------------------------------------------

## 10. Future Enhancements

-   Local parsing fallback (offline mode)
-   OTA firmware updates
-   Auto profile download
-   Wi-Fi transport option
-   Multi-scale support

------------------------------------------------------------------------

## 11. Security Considerations

-   Stateless device design
-   No inventory logic on hardware
-   Signed firmware updates (future)
-   Device UUID authentication

------------------------------------------------------------------------

## 12. Strategic Advantages

-   Hardware independence
-   Industry-wide scale compatibility
-   Reduced certification burden
-   SaaS-first hardware model
-   Competitive moat via normalization layer

------------------------------------------------------------------------

## 13. MVP Scope (What NOT to Build Yet)

Do NOT include:

-   Complex parsing logic
-   Cloud dependency inside firmware
-   Scale-specific firmware branches
-   Heavy UI on device

------------------------------------------------------------------------

## 14. Summary

The Barstock Bridge Adapter functions as a **universal scale
translator**:

Transport is standardized first; interpretation evolves over time.

This enables Barstock to support virtually all commercial scales while
maintaining simple, stable hardware.

------------------------------------------------------------------------

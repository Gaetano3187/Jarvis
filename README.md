# 🦾 Jarvis-Assistant

> Next 14 • React 18 • Supabase • TeleportHQ • Tailwind • GPT / OCR / Voice

A personal “smart-home” finance & shopping dashboard:

- **Login / Sign-Up** via Supabase (email + password)
- **Video landing**, fully-designed in TeleportHQ
- **Finanze hub**: Casa / Vestiti / Divertimento / Varie
- **Liste Prodotti** (supermercato & spesa online) with
  - manual input • GPT voice entry • OCR scontrini / PDF
- **Stato Scorte** with consumption % and anti-waste alerts
- **Operator AI** to scrape weekly offers for the online list
- 100 % client-side protected routes (redirect if not authenticated)

---

## ✨ Features Overview

| Macro-area | Che cosa fa                                               |
|------------|-----------------------------------------------------------|
| **Auth**   | `SignIn1` (Teleport) → Supabase `signInWithPassword` / `signUp`. Session stored in local storage (Auth v2). |
| **/login** | First screen if _not_ logged in. “Registrati” triggers `signUp` then pushes to `/home`. |
| **Root `/`** | Tiny component that redirects to **/home** if a session exists, otherwise to **/login**. |
| **/home**  | `Home17` (Teleport) video background + 4 tiles.<br>Tiles jump to **/liste-prodotti** • **/finanze** • `/ocr` • `/assistant` • `/dashboard`. |
| **Finanze** | Aggregates every transaction from OCR/voice/manual. 4 sub-pages (Casa, Vestiti, Divertimento, Varie) each with add / voice / ocr buttons. |
| **Liste Prodotti** | Two independent lists (Supermercato & Online). Voice → GPT, OCR → Vision API/Tesseract.<br>Each “conferma” writes into **Stato Scorte** _and_ **Finanze**. |
| **Stato Scorte** | Calculates days-to-expiry and consumption %. Items > 80 % consumed OR < 10 days expiry surface in **Prodotti in Esaurimento / Scadenza**. |
| **Operator** | Button “Collega ad Operator” → copies the online list into Operator AI prompt → writes JSON result to **/report-offerte**. |

---

## 📁 Project Layout

.
├─ components/
│ ├─ teleport/ # 100 % Teleport-generated UI
│ │ ├─ sign-in1.js # login/signup form
│ │ ├─ home17.js # video dashboard
│ │ └─ index.ts # barrel (auto-generated)
│ ├─ chart-hud.js # HUD widgets
│ └─ … # any other bespoke components
├─ pages/
│ ├─ login.tsx # renders <SignIn1/> + auth logic
│ ├─ home.tsx # renders <Home17/> (protected)
│ ├─ liste-prodotti.tsx # lists & OCR/voice logic
│ ├─ finanze/[…].tsx # casa, vestiti, divertimento, varie
│ └─ index.tsx # session redirect (/ → login / home)
├─ global-context.js # intl + theme (from Teleport boilerplate)
├─ public/ # mp4 background, images, icons
├─ scripts/ # helper PowerShell / Bash utilities
├─ .env.local # SUPABASE URL + ANON KEY
└─ tsconfig.json

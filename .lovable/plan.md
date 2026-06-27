
# QR Price Scanner

A personal-use mobile-friendly web app that scans a QR code, extracts whatever it contains (product name, barcode, or URL), and uses AI + web search to estimate the current price.

## User flow

1. Open app → big "Scan QR" button.
2. Camera opens, scans QR via device camera.
3. Decoded text is shown (e.g. URL, barcode, or product name).
4. App sends it to a backend that:
   - If URL: scrapes the product page (Firecrawl) for title + price.
   - If barcode/text: runs a web search to identify the product and current price range.
5. Results card displays: product name, image (if found), estimated price range, sources/links.
6. "Scan another" resets to step 1. No history saved.

## Tech

- **Frontend:** React + TanStack Start (existing stack). Camera scanning via `html5-qrcode` library.
- **Backend:** TanStack server function that:
  - Detects input type (URL vs barcode digits vs free text).
  - Calls Firecrawl (scrape for URLs, search for product lookups).
  - Calls Lovable AI (Gemini) to synthesize a clean price estimate + summary from the search results.
- **No database, no auth** — stateless.
- **Connectors needed:** Firecrawl (will prompt to connect). Lovable AI is built-in.

## Design

- Mobile-first, single-column.
- Dark theme with a single bright accent (electric green `#00FF94`) on near-black `#0A0A0A`.
- Large rounded scan button, camera viewport with animated scanning line.
- Typography: Outfit for headings, Inter for body.
- Result card: product image left, name + price range right, source chips below.

## Out of scope

- Saving history, accounts, multi-currency selection, offline mode.

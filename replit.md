# Aloha Crater Lodge - Static Website

## Overview
A multi-page static website for Aloha Crater Lodge, a rainforest basecamp near Kīlauea volcano in Hawaii. Built with only HTML, CSS, and minimal vanilla JavaScript — no frameworks. Configured as a PWA with manifest.json and service worker.

## Project Structure
### Pages
- `index.html` - Main page with Kīlauea status banner, ember particle effect, hero, room cards, JSON-LD structured data; header nav has 4 ember-glow links (THE ROOMS, E-BIKES, WELLNESS & RECOVERY, THE VOLCANO GUIDE)
- `wellness.html` - 4 wellness cards: Thermal Hydrotherapy, OlyLife P90, Vibration Plate, Galaxy G-one Eye Massager (SEO alt tags)
- `ebikes.html` - E-Bike rental page with ebike-hero.png, specs (750W/40mi/fat-tires), pricing grid, green CTA
- `concierge.html` - AI Concierge clipboard tool: "Lodge Guide" persona prompt, toast notification, aria-label on button
- `guide.html` - Volcano Guide terminal with link to volcano-guide.html article
- `volcano-guide.html` - Standalone article: "The Volcano Insider Guide"
- `family-suites.html` - Tier 1: "The Family-Friendly Basecamps" — Rooms 1 & 2 (4 guests, kitchenette, patio), dark/emerald theme, Magma Modal
- `premium-suites.html` - Tier 3: "Honeymoon & Premium Suites" — Room 4 (whirlpool) & Room 6 (patio/terrarium), fog particle CSS, atmospheric gradient, Magma Modal
- `basecamp.html` - Tier 2: "The Budget-Friendly Basecamp" — Room 3 (3-person, kitchenette, no patio), Magma Modal
- `guest-intel.html` - Internal AI concierge intelligence data (6 sections, NOT publicly linked)
- `404.html` - Custom 404 error page with themed "Off The Trail" messaging

### Assets
- `style.css` - Shared styles for index.html, guide.html, 404.html
- `favicon.ico` - Site favicon (all HTML files)
- `manifest.json` - PWA manifest ("Basecamp Command", standalone, dark bg, emerald theme)
- `sw.js` - Basic service worker (passive fetch listener)
- `hero-volcano.jpg` - Hero background image
- `room-caldera.jpg`, `room-summit.webp`, `room-ridge.jpg` - Room card images
- `ebike-hero.png` - E-bike hero image
- `Hottub.png`, `P90.png`, `Vibration plate.png`, `GALAXY G-one.png` - Wellness card images
- `Digital Concierge.png` - Concierge page hero image
- `apple-touch-icon.png` - PWA apple touch icon

### Navigation
- Header nav (index.html): 4 ember-glow links — no "Book Basecamp" button
- All sub-pages have a green "← Back to Basecamp" link to index.html
- guide.html uses the shared nav bar with Home link
- guest-intel.html is intentionally not linked from public navigation

### Configuration
- `_redirects` - Netlify redirects: legacy 301s for /wellness, /ebikes, /concierge, /guide, /premium-suites, /basecamp, /family-suites, /blog/*; SPA fallback (/* /index.html 200) as last rule

## Design Notes
- Dark theme (#18181b body, #1A1A1A nav, #B22222 status banner), ember accents (rgba(255,69,0)), emerald CTAs (#10b981)
- Header nav links have ember glow CSS: resting orange border + hover flare with box-shadow/text-shadow
- Tone: Warm, professional "Lodge Guide" — no military/clinical jargon
- Inline styles on: wellness, ebikes, concierge, volcano-guide, premium-suites, basecamp, family-suites
- Shared style.css on: index, guide, 404
- Image filenames have spaces/caps — use URL encoding (e.g., `Vibration%20plate.png`)
- SAFETY EMBARGO: No lava tube or cave references anywhere
- All room portal CTAs say "Secure Dates" and trigger Magma Modal (vanilla JS popup with name/email/dates form)

## SEO
- JSON-LD LodgingBusiness schema in index.html
- Descriptive alt tags on all product/service images
- aria-label on concierge copy button

## Running
Served as a static site via Python HTTP server on port 5000.

## External Links
- Booking: Cloudbeds reservation system (https://hotels.cloudbeds.com/en/reservation/ifCVNX)
- SMS contact: (808) 345-4449

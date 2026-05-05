# Aloha Crater Lodge - Static Website

## Overview
A multi-page static website for Aloha Crater Lodge, a rainforest basecamp near Kīlauea volcano in Hawaii. Built with only HTML, CSS, and minimal vanilla JavaScript — no frameworks. Configured as a PWA with manifest.json and service worker.

## Project Structure
### Pages
- `index.html` - Main page with hero, room cards (clickable images/titles → suites.html), Digital Concierge block, ember particle effect, JSON-LD structured data
- `live-feed.html` - USGS Kīlauea summit camera live feed (responsive YouTube iframe embed)
- `suites.html` - "The Basecamp Menu" — rooms index gateway with atmospheric gradient (fog→ember), 3 tier cards (Premium first, Family second, Budget third) linking to room portals
- `family-suites.html` - Tier 1: "The Family-Friendly Basecamps" — Rooms 1 & 2 (4 guests, kitchenette, patio), dark/emerald theme, Magma Modal
- `basecamp.html` - Tier 2: "The Budget-Friendly Basecamp" — Room 3 (3-person, kitchenette, no patio), Magma Modal
- `premium-suites.html` - Tier 3: "Honeymoon & Premium Suites" — Room 4 (whirlpool) & Room 6 (patio/terrarium), fog particle CSS, atmospheric gradient, Magma Modal
- `things-to-do.html` - "Things to Do Near Hawaiʻi Volcanoes National Park" — area itinerary with 5 sections (crater access, restaurants, dark skies, recovery, sample itineraries), atmospheric gradient, Magma Modal CTA
- `wellness.html` - 4 wellness cards: Thermal Hydrotherapy, OlyLife P90, Vibration Plate, Galaxy G-one Eye Massager (SEO alt tags)
- `ebikes.html` - E-Bike rental page with ebike-hero.png, specs (750W/40mi/fat-tires), pricing grid, green CTA
- AI Adventure Guide uses "Local Data Key" architecture — all intelligence embedded directly in clipboard button on index.html (no external directive files)
- `blog.html` - "The Basecamp Dispatch" blog listing page — dark mode, universal nav, "First Dispatch Incoming" placeholder
- `guest-concierge.html` - **Guest Concierge** hub (was "Basecamp Command") — action tiles with clinical terminology, NPS briefing video section, live conditions badges, Fern chatbot
- `admin/index.html` - Dark mode Admin Keychain (noindex) — "WRITE NEW BLOG POST" button, Lodge Keychain links (CloudBeds, Starlink, Netlify, USGS), Decap CMS + Netlify Identity
- `admin/config.yml` - Decap CMS config — git-gateway backend, blog collection (Title, Date, Image, Body fields)
- `blog/` - Content folder for CMS-generated Markdown blog posts
- `concierge.html` - AI Concierge clipboard tool: "Lodge Guide" persona prompt, toast notification, aria-label on button
- `guide.html` - Volcano Guide terminal with link to volcano-guide.html article
- `volcano-guide.html` - Standalone article: "The Volcano Insider Guide" (reserved for future blog posts)
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

### Navigation & Alert Bar
- Red alert bar (#aa0000) on ALL 11 public pages: [ LIVE SUMMIT CAM ] → live-feed.html | [ READ THE LATEST BASECAMP DISPATCH ] → volcano-guide.html#latest
- Universal nav (`.universal-nav`) with flexbox layout: logo (left) | tagline centered | action buttons (right)
- Nav links: BASECAMP (HOME), SUITES, THE VOLCANO GUIDE, RESERVE BASECAMP (Cloudbeds)
- Active page gets highlighted border/glow on its nav link
- Header nav CSS: `.universal-nav` flex layout, `.header-links` with ember border/box-shadow + hover flare
- guide.html uses its own shared nav bar (legacy)
- guest-intel.html is intentionally not linked from public navigation

### Configuration
- `_redirects` - Netlify redirects: 301s for /rooms, /things-to-do, /wellness, /ebikes, /concierge, /guide, /premium-suites, /basecamp, /family-suites, /live-feed, /blog/*; SPA fallback (/* /index.html 200) as last rule

## Design Notes
- Dark theme (#18181b body, #1A1A1A nav, #aa0000 alert bar), ember accents (rgba(255,69,0)), emerald CTAs (#10b981)
- Header nav links: resting orange border + hover flare with box-shadow/text-shadow/translateY
- suites.html cards: Premium first, Family second, Budget third — ember-glow hover borders with emerald CTA that fills on hover
- things-to-do.html: atmospheric gradient, restaurant list with emerald left-border, sample itinerary cards (Family Outing, Agile Explorer, Couple Getaway)
- index.html: room card images + titles wrapped in `<a>` to suites.html; Digital Concierge block with ChatGPT/clipboard prompt
- live-feed.html: responsive 16:9 YouTube iframe (USGS summit camera)
- Tone: Warm, professional "Lodge Guide" — no military/clinical jargon
- Inline styles on: suites, things-to-do, wellness, ebikes, concierge, volcano-guide, premium-suites, basecamp, family-suites, live-feed
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

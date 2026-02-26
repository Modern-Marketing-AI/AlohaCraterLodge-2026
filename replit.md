# Aloha Crater Lodge - Static Website

## Overview
A multi-page static website for Aloha Crater Lodge, a rainforest basecamp near Kīlauea volcano in Hawaii. Built with only HTML, CSS, and minimal vanilla JavaScript — no frameworks.

## Project Structure
### Pages
- `index.html` - Main page with Kīlauea status banner, burning ember particle effect, hero, room cards with SVG feature icons, and footer
- `wellness.html` - 4 recovery protocol cards: Thermal Hydrotherapy, OlyLife P90, Vibration Plate, Galaxy G-one Eye Massager
- `ebikes.html` - E-Bike page with ebike-hero.png, specs (750W/40mi/fat-tires), pricing grid, green CTA
- `concierge.html` - AI Concierge clipboard tool: copies hard-coded Lodge Intel prompt, toast notification
- `guide.html` - Volcano Guide terminal with link to volcano-guide.html article
- `volcano-guide.html` - Standalone article: "The Volcano Insider Guide" (migrated from Medium)
- `guest-intel.html` - Internal AI concierge intelligence data (6 sections, NOT publicly linked)
- `404.html` - Custom 404 error page with themed "Off The Trail" messaging

### Assets
- `style.css` - Shared styles for index.html, guide.html, 404.html
- `favicon.ico` - Site favicon (added to all HTML files)
- `hero-volcano.jpg` - Hero background image
- `room-caldera.jpg`, `room-summit.webp`, `room-ridge.jpg` - Room card images
- `ebike-hero.png` - E-bike hero image
- `Hottub.png`, `P90.png`, `Vibration plate.png`, `GALAXY G-one.png` - Wellness card images
- `Digital Concierge.png` - Concierge page hero image

### Navigation
- All sub-pages (wellness, ebikes, concierge, volcano-guide) have a green "← Back to Basecamp" link to index.html
- guide.html uses the shared nav bar with Home link
- guest-intel.html is intentionally not linked from public navigation

### Configuration
- `_redirects` - SEO redirect rules for blog URLs to guide.html

## Design Notes
- Dark theme (#1A1A1A nav, #B22222 status banner), orange accents (#E65100), green CTAs (#10b981)
- Inline styles on: wellness.html, ebikes.html, concierge.html, volcano-guide.html
- Shared style.css on: index.html, guide.html, 404.html
- Image filenames have spaces/caps — use URL encoding (e.g., `Vibration%20plate.png`)

## Running
Served as a static site via Python HTTP server on port 5000.

## External Links
- Booking: Cloudbeds reservation system (https://hotels.cloudbeds.com/en/reservation/ifCVNX)
- SMS contact: (808) 345-4449

(function () {
    'use strict';

    var fernData = null;
    var pendingResponse = false;
    var expertInsightsOn = (function () {
        try {
            var params = new URLSearchParams(window.location.search);
            var raw = params.get('fern_expert_insights');
            if (raw !== null) {
                if (raw === '0' || raw === 'false') return false;
                if (raw === '1' || raw === 'true') return true;
            }
        } catch (e) {}
        try {
            var cfg = window.FERN_CONFIG;
            if (cfg && typeof cfg.expertInsights === 'boolean') return cfg.expertInsights;
        } catch (e) {}
        return true;
    })();
    var greeted = false;
    var insightCount = 0;
    var triggerFired = false;
    var chipsEl = null;
    var chipsDismissedIndicatorEl = null;
    var currentChipResetFn = null;
    var pendingHintTimeout = null;

    var MAX_INTENTS = (function () {
        try {
            var params = new URLSearchParams(window.location.search);
            var raw = params.get('fern_max_reprompts');
            if (raw !== null) {
                var n = Math.round(parseFloat(raw));
                if (!isNaN(n) && n >= 1 && n <= 10) return n;
            }
        } catch (e) {}
        try {
            var cfg = window.FERN_CONFIG;
            if (cfg && typeof cfg.maxReprompts === 'number') {
                var n = Math.round(cfg.maxReprompts);
                if (n >= 1 && n <= 10) return n;
            }
        } catch (e) {}
        return 4;
    })();

    var inactivityFromUrl = false;
    var inactivityFromConfig = false;
    var INACTIVITY_DELAY_BASE = (function () {
        var DEFAULT_MS = 45000;
        var MIN_MS = 2000;
        var MAX_MS = 600000;
        try {
            var params = new URLSearchParams(window.location.search);
            var raw = params.get('fern_delay');
            if (raw !== null) {
                var secs = parseFloat(raw);
                if (!isNaN(secs) && isFinite(secs)) {
                    var ms = Math.round(secs * 1000);
                    if (ms >= MIN_MS && ms <= MAX_MS) {
                        inactivityFromUrl = true;
                        return ms;
                    }
                }
            }
        } catch (e) {}
        // Host pages can override Fern behavior without editing this file:
        //   <script>window.FERN_CONFIG = {
        //     inactivityDelay:    30000,   // ms before first inactivity chip prompt. 2000–600000. Default 45000.
        //     liveDataCacheTTL:   180000,  // ms to cache live data (AQI, trails). 30000–1800000. Default 120000.
        //     maxReprompts:       4,       // max async fetches per reply (1–10). Default 4.
        //     expertInsights:     true,    // show expert insight blocks on load (true/false). Default true.
        //     repromptMultipliers: [1, 2, 3], // delay multipliers for successive inactivity reprompts. Must be 3 positive numbers.
        //     chipsShowCount:     8,       // number of topic chips to show at once (1–12). Default 8.
        //     greetingBubbleDelay: 8000,  // ms before greeting bubble appears (0–30000). Default 8000.
        //     chipStaggerMs:      70,     // ms delay between each chip entrance (0–200). Default 70.
        //     closerMinLength:    80,     // min response length (chars) to append a closing line (0–500). Default 80.
        //     closerMinLengthByTopic: { 'Air Quality': 0, 'Check-in Time': 500 }, // per-topic overrides; keys are chip labels from CHIP_COVERAGE.
        //     closingLines:       ['\n\nAnything else?'], // override Fern's closing line rotation.
        //     closingLinesMode:   'replace', // 'replace' (default) — custom lines fully replace defaults; 'extend' — custom lines are added to defaults.
        //     chipAdvisoryTemplate: 'Heads up: {condition} — tap a chip below for details.' // advisory wording; use {condition} placeholder.
        //   };</script>
        //
        // URL params (for live preview without editing code):
        //   fern_delay=30          — inactivity delay in seconds (same as inactivityDelay).
        //   fern_max_reprompts=2   — max async fetches per reply, 1–10 (same as maxReprompts).
        //   fern_expert_insights=0 — disable expert insights; 1 to enable (same as expertInsights).
        //   fern_chip_stagger=40   — ms delay between each chip entrance, 0–200 (same as chipStaggerMs).
        //   fern_debug=1           — show the live config overlay panel.
        try {
            var cfg = window.FERN_CONFIG;
            if (cfg && typeof cfg.inactivityDelay === 'number') {
                var cfgMs = Math.round(cfg.inactivityDelay);
                if (cfgMs >= MIN_MS && cfgMs <= MAX_MS) {
                    inactivityFromConfig = true;
                    return cfgMs;
                }
            }
        } catch (e) {}
        return DEFAULT_MS;
    })();

    /* #47 — read additional FERN_CONFIG keys */
    var inactivityTimer = null;
    var inactivityRepromptCount = 0;
    var usedChipLabels = [];

    var CHIP_COVERAGE = [
        { label: 'Circulatory Reset',     test: /circulatory|pemf|terahertz|tera.?p90|olylife.*p90|microcirculation/i },
        { label: 'Optical Recovery',      test: /optical|eye.*recovery|eye.*massage|galaxy.?g|g.?one/i },
        { label: 'Gravity Conditioning',  test: /vibration|vibration.*plate|lymphatic|gravity.*condition/i },
        { label: 'Sensory Grounding',     test: /aroma|diffuser|scent|essential.*oil|oily.*life|sensory.*ground/i },
        { label: 'E-Bike Rentals',    test: /bike|e.?bike|ebike|cycle|cycling/i },
        { label: 'Dark Skies',        test: /star|stargazing|milky way|night sky|dark sky|bortle/i },
        { label: 'Cultural Respect',  test: /pele|deity|goddess|reverence|sacred|cultural|culture|aina/i },
        { label: 'Local Dining',      test: /dining|restaurant|eat out|lunch|dinner|ohelo|volcano house|food/i },
        { label: 'Check-in Time',     test: /check.?in|check.?out|arrival time/i },
        { label: 'Orchid Suite',      test: /room.?6|orchid|goldfish|botanical/i },
        { label: 'Air Quality',       test: /air.*quality|aqi|air.*pollution|pm2\.?5|smoke|particulate/i },
        { label: 'Trail Conditions',  test: /trail.*condition|trail.*status|trail.*open|trail.*close|hike.*condition|trail.*today/i }
    ];

    function markCoveredTopics(input) {
        for (var i = 0; i < CHIP_COVERAGE.length; i++) {
            var entry = CHIP_COVERAGE[i];
            if (entry.test.test(input) && usedChipLabels.indexOf(entry.label) === -1) {
                usedChipLabels.push(entry.label);
            }
        }
    }

    var TOPIC_CHIPS_POOL = [
        { label: 'Circulatory Reset',    question: 'Tell me about the Circulatory Reset — the OlyLife Tera-P90 PEMF and Terahertz device.' },
        { label: 'Optical Recovery',     question: 'Tell me about the Optical Recovery device — the OlyLife Galaxy G-One 3D airbag eye massager.' },
        { label: 'Gravity Conditioning', question: 'Tell me about the Gravity Conditioning vibration plates for lymphatic drainage.' },
        { label: 'Sensory Grounding',    question: 'Tell me about the Sensory Grounding aromatherapy and Oily Life essential oils.' },
        { label: 'E-Bike Rentals',    question: 'Tell me about the e-bike rentals' },
        { label: 'Dark Skies',        question: 'Tell me about stargazing and dark sky conditions near the lodge' },
        { label: 'Cultural Respect',  question: 'Tell me about respecting the \u02bbaina and Hawaiian culture' },
        { label: 'Local Dining',      question: 'What are the best local restaurants near the lodge?' },
        { label: 'Check-in Time',     question: 'What time is check-in and check-out?' },
        { label: 'Orchid Suite',      question: 'Tell me about the Orchid Suite \u2014 Room 6' },
        { label: 'Air Quality',       question: 'What\'s the air quality like today?' },
        { label: 'Trail Conditions',  question: 'Are there any trail closures or conditions I should know about?' }
    ];

    var CHIPS_SESSION_KEY = 'fern_chips_session';
    var CHIP_ADVISORY_SESSION_KEY = 'fern_chip_advisory_seen';
    var CHIPS_SHOW_COUNT = (function () {
        try {
            var cfg = window.FERN_CONFIG;
            if (cfg && typeof cfg.chipsShowCount === 'number') {
                var n = Math.round(cfg.chipsShowCount);
                if (n >= 1 && n <= 12) return n;
            }
        } catch (e) {}
        return 8;
    })();
    var CHIP_STAGGER_MS = (function () {
        try {
            var params = new URLSearchParams(window.location.search);
            var raw = params.get('fern_chip_stagger');
            if (raw !== null) {
                var ms = Math.round(parseFloat(raw));
                if (!isNaN(ms) && ms >= 0 && ms <= 200) return ms;
            }
        } catch (e) {}
        try {
            var cfg = window.FERN_CONFIG;
            if (cfg && typeof cfg.chipStaggerMs === 'number') {
                var ms = Math.round(cfg.chipStaggerMs);
                if (ms >= 0 && ms <= 200) return ms;
            }
        } catch (e) {}
        return 70;
    })();
    var CHIP_ADVISORY_TEMPLATE = (function () {
        try {
            var cfg = window.FERN_CONFIG;
            if (cfg && typeof cfg.chipAdvisoryTemplate === 'string' &&
                    cfg.chipAdvisoryTemplate.trim().length > 0 &&
                    cfg.chipAdvisoryTemplate.indexOf('{condition}') !== -1) {
                return cfg.chipAdvisoryTemplate;
            }
        } catch (e) {}
        return 'Heads up: {condition} \u2014 tap a chip below for details.';
    })();
    var CLOSER_MIN_LENGTH = (function () {
        try {
            var cfg = window.FERN_CONFIG;
            if (cfg && typeof cfg.closerMinLength === 'number') {
                var n = Math.round(cfg.closerMinLength);
                if (n >= 0 && n <= 500) return n;
            }
        } catch (e) {}
        return 80;
    })();
    var CLOSER_MIN_LENGTH_BY_TOPIC = (function () {
        try {
            var cfg = window.FERN_CONFIG;
            if (cfg && cfg.closerMinLengthByTopic && typeof cfg.closerMinLengthByTopic === 'object' &&
                    !Array.isArray(cfg.closerMinLengthByTopic)) {
                var map = {};
                var keys = Object.keys(cfg.closerMinLengthByTopic);
                for (var i = 0; i < keys.length; i++) {
                    var val = cfg.closerMinLengthByTopic[keys[i]];
                    if (typeof val === 'number' && val >= 0 && val <= 9999) {
                        map[keys[i]] = Math.round(val);
                    }
                }
                return map;
            }
        } catch (e) {}
        return {};
    })();
    var DISMISSED_CHIPS_KEY = 'fern_dismissed_chips';
    function getConditionPinnedLabels() {
        var pinned = [];
        var aqiCache = getCached('airQuality');
        if (aqiCache && aqiCache !== GRACEFUL_FAIL) {
            var aqiMatch = /US AQI (\d+)/.exec(aqiCache);
            if (aqiMatch && parseInt(aqiMatch[1], 10) > 50) {
                pinned.push('Air Quality');
            }
        }
        var trailCache = getCached('trailConditions');
        if (trailCache && trailCache !== GRACEFUL_FAIL) {
            if (/Current trail alerts/.test(trailCache)) {
                pinned.push('Trail Conditions');
            }
        }
        return pinned;
    }

    function buildChipAdvisoryText() {
        var parts = [];
        var aqiCache = getCached('airQuality');
        if (aqiCache && aqiCache !== GRACEFUL_FAIL) {
            var aqiMatch = /US AQI (\d+)/.exec(aqiCache);
            if (aqiMatch) {
                var aqi = parseInt(aqiMatch[1], 10);
                if (aqi > 50) {
                    var cat = aqi <= 100 ? 'Moderate' : aqi <= 150 ? 'Unhealthy for Sensitive Groups' : 'Unhealthy';
                    parts.push('air quality is currently ' + cat);
                }
            }
        }
        var trailCache = getCached('trailConditions');
        if (trailCache && trailCache !== GRACEFUL_FAIL) {
            if (/Current trail alerts/.test(trailCache)) {
                parts.push('there are active trail alerts nearby');
            }
        }
        if (parts.length === 0) return '';
        return CHIP_ADVISORY_TEMPLATE.split('{condition}').join(parts.join(' and '));
    }

    function fadeOutRemove(el, cb) {
        if (!el) { if (cb) cb(); return; }
        el.style.transition = 'opacity 0.25s ease';
        el.style.opacity = '0';
        setTimeout(function () {
            if (el.parentNode) el.parentNode.removeChild(el);
            if (cb) cb();
        }, 260);
    }

    function dismissChipAdvisory() {
        var el = document.getElementById('fern-chip-advisory');
        fadeOutRemove(el);
        try { sessionStorage.setItem(CHIP_ADVISORY_SESSION_KEY, '1'); } catch (e) {}
    }

    function maybeShowChipAdvisory() {
        try { if (sessionStorage.getItem(CHIP_ADVISORY_SESSION_KEY)) return; } catch (e) {}
        var text = buildChipAdvisoryText();
        if (!text) return;
        var msgs = document.getElementById('fern-messages');
        if (!msgs) return;
        if (document.getElementById('fern-chip-advisory')) return;
        var advisory = document.createElement('div');
        advisory.id = 'fern-chip-advisory';
        advisory.className = 'fern-chip-advisory fern-hint-fade';
        var textSpan = document.createElement('span');
        textSpan.className = 'fern-chip-advisory-text';
        textSpan.textContent = text;
        advisory.appendChild(textSpan);
        var dismissBtn = document.createElement('button');
        dismissBtn.className = 'fern-chip-advisory-dismiss';
        dismissBtn.setAttribute('aria-label', 'Dismiss safety advisory');
        dismissBtn.textContent = '\u00d7';
        dismissBtn.addEventListener('click', function () {
            fadeOutRemove(advisory);
            try { sessionStorage.setItem(CHIP_ADVISORY_SESSION_KEY, '1'); } catch (e) {}
        });
        advisory.appendChild(dismissBtn);
        var chipRow = document.getElementById('fern-chips');
        if (chipRow && chipRow.parentNode === msgs) {
            msgs.insertBefore(advisory, chipRow);
        } else {
            msgs.appendChild(advisory);
        }
        try { sessionStorage.setItem(CHIP_ADVISORY_SESSION_KEY, '1'); } catch (e) {}
        msgs.scrollTop = msgs.scrollHeight;
    }

    function getDismissedChips() {
        try {
            var stored = localStorage.getItem(DISMISSED_CHIPS_KEY);
            if (stored) {
                var arr = JSON.parse(stored);
                if (Array.isArray(arr)) return arr;
            }
        } catch (e) { }
        return [];
    }

    function dismissChip(label) {
        var dismissed = getDismissedChips();
        if (dismissed.indexOf(label) === -1) {
            dismissed.push(label);
            try {
                localStorage.setItem(DISMISSED_CHIPS_KEY, JSON.stringify(dismissed));
            } catch (e) { }
        }
        try {
            sessionStorage.removeItem(CHIPS_SESSION_KEY);
        } catch (e) { }
    }

    function undismissChip(label) {
        var dismissed = getDismissedChips();
        var idx = dismissed.indexOf(label);
        if (idx !== -1) dismissed.splice(idx, 1);
        try { localStorage.setItem(DISMISSED_CHIPS_KEY, JSON.stringify(dismissed)); } catch (e) {}
        try { sessionStorage.removeItem(CHIPS_SESSION_KEY); } catch (e) {}
    }

    function resetDismissedChips() {
        try { localStorage.removeItem(DISMISSED_CHIPS_KEY); } catch (e) {}
        try { sessionStorage.removeItem(CHIPS_SESSION_KEY); } catch (e) {}
    }

    function getSessionChips() {
        var dismissed = getDismissedChips();
        var conditionPinned = getConditionPinnedLabels();

        try {
            var stored = sessionStorage.getItem(CHIPS_SESSION_KEY);
            if (stored) {
                var indices = JSON.parse(stored);
                if (Array.isArray(indices) && indices.length > 0) {
                    var cached = indices.map(function (i) { return TOPIC_CHIPS_POOL[i]; }).filter(Boolean);
                    var stillValid = cached.filter(function (c) { return dismissed.indexOf(c.label) === -1; });
                    var conditionOk = conditionPinned.every(function (lbl, i) {
                        return dismissed.indexOf(lbl) !== -1 ||
                               (stillValid[i] && stillValid[i].label === lbl);
                    });
                    if (stillValid.length === cached.length && conditionOk) return cached;
                }
            }
        } catch (e) { }

        var pinned = conditionPinned
            .map(function (lbl) {
                return TOPIC_CHIPS_POOL.filter(function (c) { return c.label === lbl; })[0];
            })
            .filter(function (c) { return c && dismissed.indexOf(c.label) === -1; });
        var pinnedLabels = pinned.map(function (c) { return c.label; });
        var pool = TOPIC_CHIPS_POOL.filter(function (c) {
            return dismissed.indexOf(c.label) === -1 && pinnedLabels.indexOf(c.label) === -1;
        });
        var selected = pinned.slice();
        while (selected.length < CHIPS_SHOW_COUNT && pool.length > 0) {
            var ri = Math.floor(Math.random() * pool.length);
            selected.push(pool.splice(ri, 1)[0]);
        }

        var selectedIndices = selected.map(function (chip) {
            return TOPIC_CHIPS_POOL.indexOf(chip);
        });
        try {
            sessionStorage.setItem(CHIPS_SESSION_KEY, JSON.stringify(selectedIndices));
        } catch (e) { }

        return selected;
    }

    function buildSafetyBannerText() {
        var parts = [];
        var aqiCache = getCached('airQuality');
        if (aqiCache && aqiCache !== GRACEFUL_FAIL) {
            var aqiMatch = /US AQI (\d+)/.exec(aqiCache);
            if (aqiMatch) {
                var aqi = parseInt(aqiMatch[1], 10);
                if (aqi > 50) {
                    var cat = aqi <= 100 ? 'Moderate' : aqi <= 150 ? 'Unhealthy for Sensitive Groups' : 'Unhealthy';
                    parts.push('\u26a0 Air Quality: ' + cat + ' (AQI ' + aqi + ')');
                }
            }
        }
        var trailCache = getCached('trailConditions');
        if (trailCache && trailCache !== GRACEFUL_FAIL) {
            if (/Current trail alerts/.test(trailCache)) {
                parts.push('\u26a0 Active trail alerts \u2014 tap Trail Conditions for details');
            }
        }
        return parts.join('\u2002\xb7\u2002');
    }

    function updateSafetyBanner() {
        var banner = document.getElementById('fern-safety-banner');
        if (!banner) return;
        try { if (sessionStorage.getItem('fernSafetyDismissed')) { banner.style.display = 'none'; return; } } catch (e) {}
        var text = buildSafetyBannerText();
        if (text) {
            var span = banner.querySelector('.fern-safety-text');
            if (span) span.textContent = text;
            banner.style.display = '';
        } else {
            banner.style.display = 'none';
        }
    }

    function buildOpeningSafetyMsg() {
        var lines = [];
        var aqiCache = getCached('airQuality');
        if (aqiCache && aqiCache !== GRACEFUL_FAIL) {
            var aqiMatch = /US AQI (\d+)/.exec(aqiCache);
            if (aqiMatch) {
                var aqi = parseInt(aqiMatch[1], 10);
                if (aqi > 50) {
                    var cat = aqi <= 100 ? 'Moderate' : aqi <= 150 ? 'Unhealthy for Sensitive Groups' : 'Unhealthy';
                    lines.push('Air quality near the Lodge is currently ' + cat + ' (AQI ' + aqi + '). If you\u2019re sensitive to vog, you may want to limit time outdoors today.');
                }
            }
        }
        var trailCache = getCached('trailConditions');
        if (trailCache && trailCache !== GRACEFUL_FAIL) {
            if (/Current trail alerts/.test(trailCache)) {
                lines.push('There are active trail alerts in the area \u2014 tap \u201cTrail Conditions\u201d below for the latest details before heading out.');
            }
        }
        if (lines.length === 0) return '';
        return 'Quick heads-up before you explore: ' + lines.join(' ');
    }

    function maybeReprioritizeChips() {
        var conditionPinned = getConditionPinnedLabels();
        if (conditionPinned.length === 0) return;
        var dismissed = getDismissedChips();
        try {
            var stored = sessionStorage.getItem(CHIPS_SESSION_KEY);
            if (stored) {
                var indices = JSON.parse(stored);
                if (Array.isArray(indices) && indices.length > 0) {
                    var chips = indices.map(function (i) { return TOPIC_CHIPS_POOL[i]; }).filter(Boolean);
                    var valid = chips.filter(function (c) { return dismissed.indexOf(c.label) === -1; });
                    var alreadyCorrect = conditionPinned.every(function (lbl, i) {
                        return dismissed.indexOf(lbl) !== -1 ||
                               (valid[i] && valid[i].label === lbl);
                    });
                    if (alreadyCorrect) return;
                }
            }
        } catch (e) { }
        try { sessionStorage.removeItem(CHIPS_SESSION_KEY); } catch (e) {}
        if (chipsEl && chipsEl.parentNode && !chipsEl.classList.contains('fern-chips-inactivity')) {
            chipsEl.parentNode.removeChild(chipsEl);
            chipsEl = null;
            showChips();
        }
    }

    var GREETING = "Hi, I'm Fern, your Lodge Guide. Aloha! I'm here to help you find your way — whether you're picking the perfect suite, checking on the volcano, or looking for the best trails. How can I help you today?";
    var INSIGHT_TRIGGER_MSG = "I hope these local insights are helping you get a feel for the Lodge! You can flip the 'Expert Insights' switch at the top to 'Off' any time if you'd prefer quick facts only. Should I keep the local tips coming?";
    var GRACEFUL_FAIL = "I can't reach the live sensors right now, but the team can give you the latest updates.";

    var PHONETIC_TEST = /\[[^\]]+\]/;

    var WMO_CODES = {
        0: 'Clear skies',
        1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
        45: 'Foggy — very typical for Volcano Village!', 48: 'Freezing fog',
        51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
        61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
        71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
        77: 'Snow grains', 80: 'Rain showers', 81: 'Rain showers', 82: 'Heavy rain showers',
        85: 'Snow showers', 86: 'Heavy snow showers',
        95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Heavy thunderstorm'
    };

    function stripInsights(text) {
        return text
            .replace(/\[[^\]]+\]/g, '')
            .replace(/\. In Hawaiian, it means[^.]+\./g, '.')
            .replace(/,\s*meaning '[^']+'/g, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    function hasPhonetic(text) {
        return PHONETIC_TEST.test(text);
    }

    var FALLBACK_MSG = "That is a great question! I don't have that specific detail right here, but the team will be happy to clarify that for you.";

    function getFallback(data) {
        return (data && data.system_directive) ? data.system_directive : FALLBACK_MSG;
    }

    function loadKnowledge() {
        return fetch('/fern_knowledge.json')
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (data) {
                fernData = data;
                if (!inactivityFromUrl && !inactivityFromConfig && data.config && typeof data.config.inactivity_delay_seconds === 'number') {
                    var cfgMs = Math.round(data.config.inactivity_delay_seconds * 1000);
                    if (cfgMs >= 2000 && cfgMs <= 600000) INACTIVITY_DELAY_BASE = cfgMs;
                }
            })
            .catch(function () {
                fernData = { _fallback: true, system_directive: "That is a great question! I don't have that specific detail right here, but the team will be happy to clarify that for you." };
            });
    }

    var LIVE_DATA_CACHE = {};
    var LIVE_DATA_SHOWN = {};
    var _lastLiveDataKeys = [];

    var LIVE_DATA_TTL = (function () {
        try {
            var cfg = window.FERN_CONFIG;
            if (cfg && typeof cfg.liveDataCacheTTL === 'number') {
                var ms = Math.round(cfg.liveDataCacheTTL);
                if (ms >= 30000 && ms <= 30 * 60 * 1000) return ms;
            }
        } catch (e) {}
        return 3 * 60 * 1000;
    })();

    function getCached(key) {
        var entry = LIVE_DATA_CACHE[key];
        if (entry && (Date.now() - entry.ts) < LIVE_DATA_TTL) {
            return entry.value;
        }
        return null;
    }

    function setCached(key, value) {
        if (value !== GRACEFUL_FAIL) {
            LIVE_DATA_CACHE[key] = { value: value, ts: Date.now() };
        }
    }

    function wasRefreshed(key) {
        var entry = LIVE_DATA_CACHE[key];
        if (!entry) return false;
        var lastShown = LIVE_DATA_SHOWN[key];
        if (!lastShown) return false;
        return entry.ts > lastShown;
    }

    function markShown(key) {
        LIVE_DATA_SHOWN[key] = Date.now();
    }

    function fetchVolcanoStatus() {
        var cached = getCached('volcano');
        if (cached !== null) return Promise.resolve(cached);

        var jsonFetch = fetch('/.netlify/functions/volcano?type=json')
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (data) {
                var level = '';
                if (Array.isArray(data) && data.length > 0) {
                    level = (data[0].alert_level || '').toLowerCase();
                } else if (data && data.alert_level) {
                    level = data.alert_level.toLowerCase();
                }
                return level;
            })
            .catch(function () { return ''; });

        var rssFetch = fetch('/.netlify/functions/volcano?type=rss')
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.text();
            })
            .then(function (text) {
                var m = text.match(/<item>[\s\S]*?<title>(.*?)<\/title>/);
                return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
            })
            .catch(function () { return ''; });

        return Promise.all([jsonFetch, rssFetch])
            .then(function (results) {
                var level = results[0];
                var headline = results[1];
                var map = {
                    'normal': 'Resting / Quiet',
                    'green': 'Resting / Quiet',
                    'advisory': 'Advisory / Watch the Updates',
                    'yellow': 'Advisory / Watch the Updates',
                    'watch': 'Elevated Activity',
                    'orange': 'Elevated Activity',
                    'warning': 'Erupting \u2014 Check with Ranger Station',
                    'red': 'Erupting \u2014 Check with Ranger Station'
                };
                var friendly = level ? (map[level] || level.toUpperCase()) : null;
                var parts = [];
                if (friendly) parts.push('Live K\u012blauea status: ' + friendly + '.');
                if (headline) parts.push('Latest USGS update: \u201c' + headline + '\u201d');
                parts.push('You can watch the summit camera live right now on our Live Volcano Feed page \u2014 scroll to the top of the site to find it. Always verify conditions at the K\u012blauea Visitor Center before heading to the crater rim.');
                var result = parts.length > 1 ? parts.join(' ') : GRACEFUL_FAIL;
                if (result !== GRACEFUL_FAIL) setCached('volcano', result);
                return result;
            })
            .catch(function () {
                return GRACEFUL_FAIL;
            });
    }
    fetchVolcanoStatus._cacheKey = 'volcano';

    function fetchWeather() {
        var cached = getCached('weather');
        if (cached !== null) return Promise.resolve(cached);
        var url = 'https://api.open-meteo.com/v1/forecast' +
            '?latitude=19.4294&longitude=-155.2434' +
            '&current=temperature_2m,weather_code' +
            '&temperature_unit=fahrenheit' +
            '&timezone=Pacific%2FHonolulu';
        return fetch(url)
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (data) {
                var temp = Math.round(data.current.temperature_2m);
                var code = data.current.weather_code;
                var condition = WMO_CODES[code] || 'Mixed cloud and mist';
                var result = 'Right now in Volcano Village: ' + temp + '\u00b0F and ' + condition + '. Remember, Volcano is a high-altitude cloud forest — typically 10\u201315\u00b0F cooler than the coast. Pack layers and a light rain jacket!';
                setCached('weather', result);
                return result;
            })
            .catch(function () {
                return GRACEFUL_FAIL;
            });
    }
    fetchWeather._cacheKey = 'weather';

    function fetchAirQuality() {
        var cached = getCached('airQuality');
        if (cached !== null) return Promise.resolve(cached);
        var url = 'https://air-quality-api.open-meteo.com/v1/air-quality' +
            '?latitude=19.4294&longitude=-155.2434' +
            '&current=us_aqi,pm2_5';
        return fetch(url)
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (data) {
                var aqi = Math.round(data.current.us_aqi);
                var pm25 = data.current.pm2_5 !== undefined ? data.current.pm2_5.toFixed(1) : null;
                var category, advice;
                if (aqi <= 50) {
                    category = 'Good';
                    advice = 'Air is clean — great conditions for outdoor activities!';
                } else if (aqi <= 100) {
                    category = 'Moderate';
                    advice = 'Generally fine outside; unusually sensitive individuals may want to limit prolonged exertion.';
                } else if (aqi <= 150) {
                    category = 'Unhealthy for Sensitive Groups';
                    advice = 'People with respiratory conditions should limit extended outdoor activity. Vog from Kīlauea may be a factor.';
                } else if (aqi <= 200) {
                    category = 'Unhealthy';
                    advice = 'Everyone may begin to experience effects. Consider limiting outdoor exertion and check with Park rangers.';
                } else {
                    category = 'Very Unhealthy / Hazardous';
                    advice = 'Air quality is poor — minimize outdoor time and keep windows closed. Vog or volcanic emissions may be elevated.';
                }
                var msg = 'Current air quality near Volcano Village: US AQI ' + aqi + ' (' + category + ')';
                if (pm25 !== null) msg += ', PM2.5 ' + pm25 + ' \u03bcg/m\u00b3';
                msg += '. ' + advice;
                setCached('airQuality', msg);
                return msg;
            })
            .catch(function () {
                return GRACEFUL_FAIL;
            });
    }
    fetchAirQuality._cacheKey = 'airQuality';

    function fetchTrailConditions() {
        var cached = getCached('trailConditions');
        if (cached !== null) return Promise.resolve(cached);
        var url = 'https://developer.nps.gov/api/v1/alerts' +
            '?parkCode=havo&limit=5&api_key=DEMO_KEY';
        return fetch(url)
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (data) {
                var alerts = data.data || [];
                var trailAlerts = alerts.filter(function (a) {
                    return /trail|road|closure|closed|access|path|hike|footpath/i.test(a.title + ' ' + a.description);
                });
                var result;
                if (trailAlerts.length === 0 && alerts.length === 0) {
                    result = 'No current trail alerts on record for Hawai\u02bbi Volcanoes National Park. Always check the official NPS site or the Kīlauea Visitor Center before heading out.';
                } else if (trailAlerts.length === 0) {
                    result = 'No trail-specific closures listed right now at Hawai\u02bbi Volcanoes National Park. General park alerts exist — check nps.gov/havo or the visitor center for the latest.';
                } else {
                    var summaries = trailAlerts.slice(0, 2).map(function (a) { return a.title; }).join('; ');
                    result = 'Current trail alerts at Hawai\u02bbi Volcanoes National Park: ' + summaries + '. Always verify with a ranger or at nps.gov/havo before your hike.';
                }
                setCached('trailConditions', result);
                return result;
            })
            .catch(function () {
                return GRACEFUL_FAIL;
            });
    }
    fetchTrailConditions._cacheKey = 'trailConditions';

    function getUpsells(input, data) {
        if (!data || data._fallback) return [];
        var q = input.toLowerCase();
        var upsells = [];
        var primaryIsEbike = /^(bike|e.?bike|ebike|cycle|cycling|crater.*mobility)/i.test(q.trim());
        var primaryIsWellness = /^(wellness|massage|pemf|terahertz|bio.?regen|circulatory|optical|recovery|calibration)/i.test(q.trim());
        if (!primaryIsEbike && /trail|explore|exploring|hike|hiking|getting to the park|cruise to|cruise up|park entrance|national park/i.test(q)) {
            upsells.push(data.crater_mobility && data.crater_mobility.units);
        }
        if (!primaryIsWellness && /relax|room.?4|shower|restore|unwind|soak|grounded/i.test(q)) {
            upsells.push(data.bio_regeneration_hardware && data.bio_regeneration_hardware.protocol);
        }
        return upsells.filter(Boolean);
    }

    function collectSyncIntents(input, data, limit, excludeTags) {
        if (!data || data._fallback) return [];
        var q = input.toLowerCase();
        var checks = [
            // Safety restrictions — highest priority
            [/cave|lava tube|tube system|underground/i, function () { return data.safety_and_environment.caves; }],
            [/owner|who.*runs|who.*manage|manager.*name|staff.*name|host.*name|your.*name|team.*name/i, function () { return data.safety_and_environment.staff; }],
            // Sanctuaries
            [/room.?3|lumi|anela|workspace|angel room|high.?efficiency/i, function () { return data.sanctuaries.room_3; }],
            [/room.?4|h[o\u014d][\u02bb']?om[a\u0101]lie|hoomalie|whirlpool|jetted|stone shower|honeymoon|canopy entrance/i, function () { return data.sanctuaries.room_4; }],
            [/room.?6|orchid|goldfish|botanical|tree.?trunk|pond/i, function () { return data.sanctuaries.room_6; }],
            [/room.?[12]|pololina|family suite|4.person|four.person|front.*patio/i, function () { return data.sanctuaries.rooms_1_2; }],
            // Credentials
            [/wifi.*password|gate.*code|access.*code|room.*code|credentials|not received.*code|how.*get.*code|day.*arrival.*code/i, function () { return 'For secure access credentials, text the Host Team directly: ' + (data.logistics.contact || '(808) 345-4449') + '. Your codes are sent on your check-in day.'; }],
            // Logistics
            [/check.?in|arrival time|3pm|self.check|remote check/i, function () { return 'Check-in: ' + data.logistics.check_in; }],
            [/check.?out|departure|11am/i, function () { return 'Check-out: ' + data.logistics.check_out; }],
            [/coffee|kitchen|fridge|refrigerator|kitchenette|kauu|estate/i, function () { return data.logistics.kitchenettes; }],
            [/dining|restaurant|eat out|lunch|dinner|ohelo|volcano house|pizza/i, function () { return data.logistics.local_dining; }],
            // Bio-regeneration hardware — specific protocols first
            [/circulatory|pemf|terahertz|tera.?hertz|olylife.*p90|p90|physical reset/i, function () { return data.bio_regeneration_hardware.circulatory_reset; }],
            [/optical|eye.*massage|galaxy.?g|g.?one|eye reset|air.*bag.*eye/i, function () { return data.bio_regeneration_hardware.optical_recovery; }],
            [/vibration|plate|lymphatic|gravity.*conditioning/i, function () { return data.bio_regeneration_hardware.gravity_conditioning; }],
            [/aroma|diffuser|scent|sensory.*grounding|atmospheric/i, function () { return data.bio_regeneration_hardware.sensory_grounding; }],
            [/wellness|bio.?regen|recovery room|reset.*protocol|recovery.*tool/i, function () { return data.bio_regeneration_hardware.protocol; }],
            // Crater mobility
            [/bike|e.?bike|ebike|cycle|cycling|crater.*mobility|mobility.*unit/i, function () { return data.crater_mobility.units; }],
            [/helmet|lock|kit|orientation.*bike|bike.*gear/i, function () { return data.crater_mobility.kit; }],
            [/complimentary.*bike|free.*bike|direct.*book.*bike|bike.*incentive/i, function () { return data.crater_mobility.incentive; }],
            // Dark skies
            [/star|stargazing|milky way|night sky|astronomy|dark sky|light pollution|bortle/i, function () { return data.safety_and_environment.dark_skies; }],
            // Cultural respect
            [/pele|p[eē]l[eē]|deity|goddess|reverence|sacred|rock|lava rock|take.*rock|remove.*rock|[aā]ina|aina|cultural|culture|hawaiian.*custom|respect.*volcano/i, function () { return data.safety_and_environment.cultural_respect; }]
        ];
        var results = [];
        var seen = [];
        for (var i = 0; i < checks.length && results.length < limit; i++) {
            var tag = checks[i][2];
            if (tag && excludeTags && excludeTags.indexOf(tag) !== -1) continue;
            if (checks[i][0].test(q)) {
                var val = checks[i][1]();
                if (seen.indexOf(val) === -1) {
                    seen.push(val);
                    results.push(val);
                }
            }
        }
        return results;
    }

    function buildSyncResponse(input, data) {
        if (!data || data._fallback) return getFallback(data);
        var results = collectSyncIntents(input, data, 1);
        return results.length > 0 ? results[0] : getFallback(data);
    }

    var BRIDGE_PHRASES = [
        'Also — ',
        'On another note — ',
        'Good question on both fronts! ',
        'And to cover the other part — ',
        'Switching gears a bit — ',
        'Here\'s the other piece — ',
    ];

    function pickBridge() {
        return BRIDGE_PHRASES[Math.floor(Math.random() * BRIDGE_PHRASES.length)];
    }

    var OPENING_LINES = [
        'Here\'s what I found — ',
        'Great question! ',
        'Happy to help with that — ',
        'Good to know you\'re curious about this — ',
        'Here\'s what the Lodge has to share — ',
        'Let me share what I know — ',
        'Here\'s a quick rundown — ',
        'Glad you asked — ',
    ];

    var CLOSING_LINES = (function () {
        var defaults = [
            '\n\nAnything else I can help you plan?',
            '\n\nWhat else can I pull up for you?',
            '\n\nFeel free to ask me anything else about the Lodge or the area.',
            '\n\nLet me know if you want to dig deeper into any of this.',
            '\n\nHappy to answer any follow-up questions.',
            '\n\nIs there anything else on your mind for your stay?',
            '\n\nJust ask if you need more details on any of this.',
            '\n\nWhat else would be helpful to know?',
        ];
        try {
            var cfg = window.FERN_CONFIG;
            if (cfg && Array.isArray(cfg.closingLines) && cfg.closingLines.length >= 1) {
                var valid = cfg.closingLines.filter(function (s) {
                    return typeof s === 'string' && s.trim().length > 0;
                });
                if (valid.length >= 1) {
                    if (cfg.closingLinesMode === 'extend') {
                        return defaults.concat(valid);
                    }
                    return valid;
                }
            }
        } catch (e) {}
        return defaults;
    })();

    var openerQueue = [];
    var lastOpenerIdx = -1;
    var closerQueue = [];
    var lastCloserIdx = -1;

    function shuffledIndices(excludeIdx) {
        var indices = [];
        for (var i = 0; i < OPENING_LINES.length; i++) {
            if (i !== excludeIdx) indices.push(i);
        }
        for (var j = indices.length - 1; j > 0; j--) {
            var k = Math.floor(Math.random() * (j + 1));
            var tmp = indices[j]; indices[j] = indices[k]; indices[k] = tmp;
        }
        if (excludeIdx >= 0 && excludeIdx < OPENING_LINES.length) indices.push(excludeIdx);
        return indices;
    }

    function pickOpener() {
        if (OPENING_LINES.length <= 1) return OPENING_LINES[0];
        if (openerQueue.length === 0) {
            openerQueue = shuffledIndices(lastOpenerIdx);
        }
        var idx = openerQueue.shift();
        lastOpenerIdx = idx;
        return OPENING_LINES[idx];
    }

    function shuffledCloserIndices(excludeIdx) {
        var indices = [];
        for (var i = 0; i < CLOSING_LINES.length; i++) {
            if (i !== excludeIdx) indices.push(i);
        }
        for (var j = indices.length - 1; j > 0; j--) {
            var k = Math.floor(Math.random() * (j + 1));
            var tmp = indices[j]; indices[j] = indices[k]; indices[k] = tmp;
        }
        if (excludeIdx >= 0 && excludeIdx < CLOSING_LINES.length) indices.push(excludeIdx);
        return indices;
    }

    function pickCloser() {
        if (CLOSING_LINES.length <= 1) return CLOSING_LINES[0];
        if (closerQueue.length === 0) {
            closerQueue = shuffledCloserIndices(lastCloserIdx);
        }
        var idx = closerQueue.shift();
        lastCloserIdx = idx;
        return CLOSING_LINES[idx];
    }

    function getTopicTag(input) {
        var q = input || '';
        for (var i = 0; i < CHIP_COVERAGE.length; i++) {
            if (CHIP_COVERAGE[i].test.test(q)) return CHIP_COVERAGE[i].label;
        }
        return null;
    }

    function shouldAddCloser(primary, topic) {
        var clean = (primary || '').replace(/[_*`\[\]()]/g, '').trim();
        var tag = topic || null;
        var threshold = (tag !== null && Object.prototype.hasOwnProperty.call(CLOSER_MIN_LENGTH_BY_TOPIC, tag))
            ? CLOSER_MIN_LENGTH_BY_TOPIC[tag]
            : CLOSER_MIN_LENGTH;
        return clean.length >= threshold;
    }

    function routeAsync(input, data) {
        var q = input.toLowerCase();
        var asyncFetchers = [];
        var excludeTags = [];
        if (/eruption|erupting|alert.?level|vog.?level|lava.?flow|active.*vent|is.*erupting|volcano.*(status|active|erupt|alert|level)/i.test(q)) {
            asyncFetchers.push(fetchVolcanoStatus);
        }
        if (/weather|temperature|how cold|how warm|what.*wear.*outside|forecast|degrees/i.test(q)) {
            asyncFetchers.push(fetchWeather);
            excludeTags.push('climate');
        }
        if (/air.*quality|aqi|air.*pollution|pm2\.?5|smoke|particulate|breathing.*outside|safe.*breathe/i.test(q)) {
            asyncFetchers.push(fetchAirQuality);
        }
        if (/trail.*condition|trail.*status|trail.*open|trail.*close|hike.*condition|path.*open|park.*trail|which.*trail|trail.*today|any.*closure|road.*closure|trail.*access/i.test(q)) {
            asyncFetchers.push(fetchTrailConditions);
        }

        var slotsLeft = MAX_INTENTS - asyncFetchers.length;
        var syncResults = slotsLeft > 0 ? collectSyncIntents(input, data, slotsLeft, excludeTags) : [];

        if (asyncFetchers.length === 0) {
            _lastLiveDataKeys = [];
            if (syncResults.length === 0) return Promise.resolve(getFallback(data));
            if (syncResults.length === 1) return Promise.resolve(syncResults[0]);
            var syncJoined = syncResults[0];
            for (var k = 1; k < syncResults.length; k++) {
                syncJoined += '\n\n' + pickBridge() + syncResults[k];
            }
            return Promise.resolve(syncJoined);
        }

        return Promise.all(asyncFetchers.map(function (fn) { return fn(); })).then(function (asyncResults) {
            _lastLiveDataKeys = asyncFetchers.map(function (fn) { return fn._cacheKey; }).filter(Boolean);
            var dataWasRefreshed = asyncFetchers.some(function (fn) {
                return fn._cacheKey && wasRefreshed(fn._cacheKey);
            });
            asyncFetchers.forEach(function (fn) {
                if (fn._cacheKey) markShown(fn._cacheKey);
            });

            var parts = asyncResults.concat(syncResults);
            var seen = [];
            var unique = [];
            for (var i = 0; i < parts.length && unique.length < MAX_INTENTS; i++) {
                if (seen.indexOf(parts[i]) === -1) {
                    seen.push(parts[i]);
                    unique.push(parts[i]);
                }
            }
            var result;
            if (unique.length === 1) {
                result = unique[0];
            } else {
                result = unique[0];
                for (var j = 1; j < unique.length; j++) {
                    result += '\n\n' + pickBridge() + unique[j];
                }
            }
            if (dataWasRefreshed) {
                result += '\n\n_(Updated just now.)_';
            }
            return result;
        });
    }

    function removeChips() {
        if (chipsEl && chipsEl.parentNode) {
            chipsEl.parentNode.removeChild(chipsEl);
        }
        chipsEl = null;
        if (chipsDismissedIndicatorEl && chipsDismissedIndicatorEl.parentNode) {
            chipsDismissedIndicatorEl.parentNode.removeChild(chipsDismissedIndicatorEl);
        }
        chipsDismissedIndicatorEl = null;
    }

    function clearInactivityTimer() {
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
            inactivityTimer = null;
        }
    }

    var REPROMPT_MULTIPLIERS = (function () {
        var defaults = [1, 2, 3];
        try {
            var cfg = window.FERN_CONFIG;
            if (cfg && Array.isArray(cfg.repromptMultipliers) && cfg.repromptMultipliers.length >= 3) {
                var candidate = [];
                var valid = true;
                for (var i = 0; i < 3; i++) {
                    var m = cfg.repromptMultipliers[i];
                    if (typeof m !== 'number' || !isFinite(m) || m <= 0) { valid = false; break; }
                    candidate.push(m);
                }
                if (valid) return candidate;
            }
        } catch (e) {}
        return defaults;
    })();

    function getNextInactivityDelay() {
        var idx = Math.min(inactivityRepromptCount, 2);
        return INACTIVITY_DELAY_BASE * REPROMPT_MULTIPLIERS[idx];
    }

    function resetInactivityTimer() {
        clearInactivityTimer();
        var win = document.getElementById('fern-window');
        if (!win || !win.classList.contains('fern-open')) return;
        inactivityTimer = setTimeout(function () {
            if (!chipsEl && !pendingResponse) {
                showInactivityChips();
            }
        }, getNextInactivityDelay());
    }

    function getChipAlertColor(label) {
        var pinned = getConditionPinnedLabels();
        if (pinned.indexOf(label) === -1) return null;
        if (label === 'Air Quality') {
            var aqiCache = getCached('airQuality');
            if (aqiCache && aqiCache !== GRACEFUL_FAIL) {
                var m = /US AQI (\d+)/.exec(aqiCache);
                if (m) {
                    var aqi = parseInt(m[1], 10);
                    if (aqi > 150) return '#ef4444';
                    if (aqi > 100) return '#f97316';
                    return '#f59e0b';
                }
            }
        }
        return '#f59e0b';
    }

    function getChipSeverity(label) {
        if (label === 'Air Quality') {
            var aqiCache = getCached('airQuality');
            if (aqiCache && aqiCache !== GRACEFUL_FAIL) {
                var m = /US AQI (\d+)/.exec(aqiCache);
                if (m) {
                    var aqi = parseInt(m[1], 10);
                    if (aqi > 150) return 'hazardous';
                    if (aqi > 100) return 'high';
                    if (aqi > 50)  return 'moderate';
                    return 'low';
                }
            }
        }
        if (label === 'Trail Conditions') {
            var trailCache = getCached('trailConditions');
            if (trailCache && trailCache !== GRACEFUL_FAIL) {
                if (/closed|closure|hazardous/i.test(trailCache)) return 'hazardous';
                if (/restricted|danger|caution|warning/i.test(trailCache)) return 'high';
            }
        }
        return 'moderate';
    }

    function makeChipEl(chip, onSelect) {
        var wrapper = document.createElement('span');
        wrapper.className = 'fern-chip-wrap';

        var alertColor = getChipAlertColor(chip.label);
        if (alertColor) {
            var dot = document.createElement('span');
            dot.className = 'fern-chip-alert-dot';
            dot.style.background = alertColor;
            dot.setAttribute('aria-hidden', 'true');
            wrapper.appendChild(dot);
        }

        var btn = document.createElement('button');
        btn.className = 'fern-chip';
        if (chip.warning) {
            var dot = document.createElement('span');
            dot.className = 'fern-chip-warn-dot';
            var warnColor = getChipAlertColor(chip.label) || '#f59e0b';
            dot.style.background = warnColor;
            dot.setAttribute('aria-hidden', 'true');
            dot.setAttribute('data-severity', getChipSeverity(chip.label));
            btn.appendChild(dot);
            var srLabel = document.createElement('span');
            srLabel.className = 'fern-sr-only';
            srLabel.textContent = 'Warning: ';
            btn.appendChild(srLabel);
        }
        btn.appendChild(document.createTextNode(chip.label));
        btn.addEventListener('click', onSelect);

        var dismiss = document.createElement('button');
        dismiss.className = 'fern-chip-dismiss';
        dismiss.setAttribute('aria-label', 'Dismiss ' + chip.label);
        dismiss.textContent = '×';
        dismiss.addEventListener('click', function (e) {
            e.stopPropagation();
            var parentRow = wrapper.parentNode;
            dismissChip(chip.label);
            if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
            updateDismissedIndicator();
            if (parentRow) {
                var undo = document.createElement('span');
                undo.className = 'fern-chip-undo';
                undo.textContent = '\u201c' + chip.label + '\u201d hidden \u2014 Undo';
                var undoTimer = setTimeout(function () {
                    if (undo.parentNode) undo.parentNode.removeChild(undo);
                }, 5000);
                undo.addEventListener('click', function () {
                    clearTimeout(undoTimer);
                    undismissChip(chip.label);
                    if (undo.parentNode) undo.parentNode.removeChild(undo);
                    parentRow.appendChild(makeChipEl(chip, onSelect));
                    updateDismissedIndicator();
                });
                parentRow.appendChild(undo);
            }
        });

        wrapper.appendChild(btn);
        wrapper.appendChild(dismiss);
        return wrapper;
    }

    function showInactivityChips() {
        var msgs = document.getElementById('fern-messages');
        if (!msgs) return;
        var dismissed = getDismissedChips();
        var available = TOPIC_CHIPS_POOL.filter(function (chip) {
            return usedChipLabels.indexOf(chip.label) === -1 && dismissed.indexOf(chip.label) === -1;
        });
        if (available.length === 0) {
            scheduleHint(msgs, showInactivityChips);
            return;
        }
        var pool = available.slice();
        var selected = [];
        var count = Math.min(CHIPS_SHOW_COUNT, pool.length);
        while (selected.length < count && pool.length > 0) {
            var ri = Math.floor(Math.random() * pool.length);
            selected.push(pool.splice(ri, 1)[0]);
        }
        var warnLabelsInact = getConditionPinnedLabels();
        var row = document.createElement('div');
        row.id = 'fern-chips';
        row.className = 'fern-chips-inactivity';
        row.style.display = 'flex'; row.style.flexWrap = 'wrap'; row.style.alignItems = 'center';
        selected.forEach(function (chip, idx) {
            var annotatedInact = warnLabelsInact.indexOf(chip.label) !== -1
                ? { label: chip.label, question: chip.question, warning: true }
                : chip;
            var el = makeChipEl(annotatedInact, function () {
                var inp = document.getElementById('fern-input');
                if (inp) inp.value = '';
                removeChips();
                if (usedChipLabels.indexOf(chip.label) === -1) usedChipLabels.push(chip.label);
                sendChipQuestion(chip.question);
            });
            el.style.animationDelay = (idx * CHIP_STAGGER_MS / 1000) + 's';
            row.appendChild(el);
        });
        var inacDismissed = getDismissedChips();
        if (inacDismissed.length > 0) {
            var inacBadge = document.createElement('span');
            inacBadge.className = 'fern-row-count-badge';
            inacBadge.textContent = inacDismissed.length + ' hidden';
            row.appendChild(inacBadge);
        }
        msgs.appendChild(row);
        chipsEl = row;
        currentChipResetFn = showInactivityChips;
        updateDismissedIndicator();
        msgs.scrollTop = msgs.scrollHeight;
        if (inactivityRepromptCount < 2) inactivityRepromptCount++;
        resetInactivityTimer();
    }

    function updateDismissedIndicator() {
        var msgs = document.getElementById('fern-messages');
        if (chipsDismissedIndicatorEl && chipsDismissedIndicatorEl.parentNode) {
            chipsDismissedIndicatorEl.parentNode.removeChild(chipsDismissedIndicatorEl);
        }
        chipsDismissedIndicatorEl = null;
        if (!msgs || !chipsEl) return;
        var count = getDismissedChips().length;
        if (count === 0) return;
        var indicator = document.createElement('div');
        indicator.className = 'fern-dismissed-count';
        var label = count === 1 ? '1 topic hidden' : count + ' topics hidden';
        indicator.textContent = label + ' \u2014 ';
        var savedResetFn = currentChipResetFn;
        var lnk = makeResetLink(function () {
            if (indicator.parentNode) indicator.parentNode.removeChild(indicator);
            chipsDismissedIndicatorEl = null;
            if (chipsEl && chipsEl.parentNode) chipsEl.parentNode.removeChild(chipsEl);
            chipsEl = null;
            if (savedResetFn) savedResetFn();
        });
        indicator.appendChild(lnk);
        msgs.appendChild(indicator);
        chipsDismissedIndicatorEl = indicator;
    }

    function scheduleHint(msgs, afterResetFn) {
        msgs.querySelectorAll('.fern-hint-msg').forEach(function (el) { el.parentNode && el.parentNode.removeChild(el); });
        clearTimeout(pendingHintTimeout);
        var dismissedCount = getDismissedChips().length;
        pendingHintTimeout = setTimeout(function () {
            pendingHintTimeout = null;
            var hint = document.createElement('div');
            hint.className = 'fern-msg fern-msg-bot fern-hint-fade fern-hint-msg';
            hint.textContent = 'You\u2019ve hidden ' + dismissedCount + ' of ' + TOPIC_CHIPS_POOL.length + ' topic suggestions. Type anything to ask Fern.';
            hint.appendChild(document.createElement('br'));
            hint.appendChild(makeResetLink(function () {
                if (hint.parentNode) hint.parentNode.removeChild(hint);
                afterResetFn();
            }));
            msgs.appendChild(hint);
            msgs.scrollTop = msgs.scrollHeight;
        }, 0);
    }

    function makeResetLink(afterReset) {
        var link = document.createElement('span');
        link.className = 'fern-reset-link';
        link.textContent = 'Reset topic suggestions';
        link.addEventListener('click', function () {
            resetDismissedChips();
            afterReset();
        });
        return link;
    }

    function showChips() {
        var msgs = document.getElementById('fern-messages');
        if (!msgs) return;
        var chips = getSessionChips();
        if (chips.length === 0) {
            scheduleHint(msgs, showChips);
            return;
        }
        var warnLabels = getConditionPinnedLabels();
        var row = document.createElement('div');
        row.id = 'fern-chips';
        row.className = 'fern-chips-enter';
        row.style.display = 'flex'; row.style.flexWrap = 'wrap'; row.style.alignItems = 'center';
        chips.forEach(function (chip, idx) {
            var annotated = warnLabels.indexOf(chip.label) !== -1
                ? { label: chip.label, question: chip.question, warning: true }
                : chip;
            var el = makeChipEl(annotated, function () {
                var inp = document.getElementById('fern-input');
                if (inp) inp.value = '';
                removeChips();
                if (usedChipLabels.indexOf(chip.label) === -1) usedChipLabels.push(chip.label);
                sendChipQuestion(chip.question);
            });
            el.style.animationDelay = (idx * CHIP_STAGGER_MS / 1000) + 's';
            row.appendChild(el);
        });
        var entDismissed = getDismissedChips();
        if (entDismissed.length > 0) {
            var entBadge = document.createElement('span');
            entBadge.className = 'fern-row-count-badge';
            entBadge.textContent = entDismissed.length + ' hidden';
            row.appendChild(entBadge);
        }
        maybeShowChipAdvisory();
        msgs.appendChild(row);
        chipsEl = row;
        currentChipResetFn = showChips;
        updateDismissedIndicator();
        msgs.scrollTop = msgs.scrollHeight;
    }

    function sendChipQuestion(question) {
        if (pendingResponse) return;
        if (!fernData) {
            appendMessage("One moment — I'm still loading the Lodge intel. Please try again in a second!", 'bot');
            return;
        }
        dismissChipAdvisory();
        inactivityRepromptCount = 0;
        clearInactivityTimer();
        markCoveredTopics(question);
        appendMessage(question, 'user');
        pendingResponse = true;
        setInputBusy(true);
        routeAsync(question, fernData).then(function (primary) {
            var upsells = getUpsells(question, fernData);
            var parts = [pickOpener() + primary];
            upsells.forEach(function (u) {
                if (u && u !== primary) parts.push('\n\nBy the way — ' + u);
            });
            if (shouldAddCloser(primary, getTopicTag(question))) parts.push(pickCloser());
            var full = parts.join('');
            pendingResponse = false;
            setInputBusy(false);
            updateRefreshTimestamp();
            setTimeout(function () {
                processAndSend(full);
                attachLiveFreshnessFootnote();
            }, 320);
        }).catch(function () {
            pendingResponse = false;
            setInputBusy(false);
            appendMessage(getFallback(fernData), 'bot');
            resetInactivityTimer();
        });
    }

    function filterResponse(text) {
        return (text || '')
            .replace(/\bcozy\b/gi, 'grounded')
            .replace(/\bpampering\b/gi, 'calibration');
    }

    function getLiveFreshnessText() {
        if (_lastLiveDataKeys.length === 0) return '';
        var now = Date.now();
        var newestTs = 0;
        for (var i = 0; i < _lastLiveDataKeys.length; i++) {
            var entry = LIVE_DATA_CACHE[_lastLiveDataKeys[i]];
            if (entry && entry.ts > newestTs) newestTs = entry.ts;
        }
        if (!newestTs) return '';
        var diffMin = Math.floor((now - newestTs) / 60000);
        return diffMin < 1 ? 'Data checked just now' : 'Data from ' + diffMin + (diffMin === 1 ? ' min ago' : ' min ago');
    }

    function attachLiveFreshnessFootnote() {
        var text = getLiveFreshnessText();
        if (!text) return;
        var bots = document.querySelectorAll('.fern-msg-bot');
        if (!bots.length) return;
        var last = bots[bots.length - 1];
        var foot = document.createElement('span');
        foot.className = 'fern-live-footnote';
        foot.textContent = text;
        last.appendChild(foot);
    }

    function appendMessage(text, role) {
        var msgs = document.getElementById('fern-messages');
        var div = document.createElement('div');
        div.className = 'fern-msg ' + (role === 'bot' ? 'fern-msg-bot' : 'fern-msg-user');
        if (role === 'bot') {
            div.setAttribute('data-raw', text);
            div.textContent = expertInsightsOn ? filterResponse(text) : filterResponse(stripInsights(text));
        } else {
            div.textContent = text;
        }
        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;
        return div;
    }

    function rerenderBotMessages() {
        var bots = document.querySelectorAll('.fern-msg-bot');
        for (var i = 0; i < bots.length; i++) {
            var footnote = bots[i].querySelector('.fern-live-footnote');
            var raw = bots[i].getAttribute('data-raw') || '';
            bots[i].textContent = expertInsightsOn ? filterResponse(raw) : filterResponse(stripInsights(raw));
            if (footnote) bots[i].appendChild(footnote);
        }
    }

    function processAndSend(rawText) {
        appendMessage(rawText, 'bot');
        if (hasPhonetic(rawText) && !triggerFired) {
            insightCount++;
            if (insightCount >= 3) {
                triggerFired = true;
                setTimeout(function () {
                    appendMessage(INSIGHT_TRIGGER_MSG, 'bot');
                    resetInactivityTimer();
                }, 1000);
                return;
            }
        }
        resetInactivityTimer();
    }

    function setInputBusy(busy) {
        var inp = document.getElementById('fern-input');
        var btn = document.getElementById('fern-send');
        if (!inp || !btn) return;
        inp.disabled = busy;
        btn.disabled = busy;
        btn.style.opacity = busy ? '0.5' : '1';
    }

    function handleSend() {
        if (pendingResponse) return;
        var input = document.getElementById('fern-input');
        var text = input.value.trim();
        if (!text) return;

        if (!fernData) {
            appendMessage("One moment — I'm still loading the Lodge intel. Please try again in a second!", 'bot');
            return;
        }

        dismissChipAdvisory();
        inactivityRepromptCount = 0;
        clearInactivityTimer();
        markCoveredTopics(text);
        removeChips();
        appendMessage(text, 'user');
        input.value = '';
        pendingResponse = true;
        setInputBusy(true);

        routeAsync(text, fernData).then(function (primary) {
            var upsells = getUpsells(text, fernData);
            var parts = [pickOpener() + primary];
            upsells.forEach(function (u) {
                if (u && u !== primary) parts.push('\n\nBy the way — ' + u);
            });
            if (shouldAddCloser(primary, getTopicTag(text))) parts.push(pickCloser());
            var full = parts.join('');
            pendingResponse = false;
            setInputBusy(false);
            updateRefreshTimestamp();
            setTimeout(function () {
                processAndSend(full);
                attachLiveFreshnessFootnote();
            }, 320);
        }).catch(function () {
            pendingResponse = false;
            setInputBusy(false);
            appendMessage(getFallback(fernData), 'bot');
            resetInactivityTimer();
        });
    }

    function injectStyles() {
        var css = [
            '#fern-fab {',
            '  position: fixed; bottom: 28px; right: 28px; width: 60px; height: 60px;',
            '  border-radius: 50%; background: #10b981; border: none; cursor: pointer;',
            '  box-shadow: 0 4px 20px rgba(16,185,129,0.45); z-index: 99998;',
            '  display: flex; align-items: center; justify-content: center;',
            '  transition: transform 0.2s, box-shadow 0.2s; outline: none;',
            '}',
            '#fern-fab:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(16,185,129,0.6); }',
            '#fern-fab svg { pointer-events: none; }',
            '#fern-bubble {',
            '  position: fixed; bottom: 100px; right: 96px;',
            '  background: #111; border: 1px solid rgba(16,185,129,0.55);',
            '  box-shadow: 0 2px 16px rgba(16,185,129,0.18);',
            '  color: #fff; font-size: 0.82rem; line-height: 1.45;',
            '  padding: 0.6rem 0.9rem; border-radius: 10px;',
            '  max-width: 210px; pointer-events: none;',
            '  opacity: 0; transition: opacity 0.4s ease-in-out;',
            '  z-index: 99997;',
            '}',
            '#fern-bubble::after {',
            '  content: ""; position: absolute; bottom: -7px; right: 18px;',
            '  width: 12px; height: 12px; background: #111;',
            '  border-right: 1px solid rgba(16,185,129,0.55);',
            '  border-bottom: 1px solid rgba(16,185,129,0.55);',
            '  transform: rotate(45deg);',
            '}',
            '#fern-bubble.show-fern-bubble { opacity: 1; }',
            '.fern-hint-fade { animation: fernHintFade 0.35s ease both; }',
            '@keyframes fernHintFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }',
            '#fern-window {',
            '  position: fixed; bottom: 100px; right: 28px;',
            '  width: 360px; max-width: calc(100vw - 32px);',
            '  height: 540px; max-height: calc(100vh - 120px);',
            '  background: #18181b; border: 1px solid #2a2a2a;',
            '  border-radius: 12px; display: flex; flex-direction: column;',
            '  box-shadow: 0 16px 48px rgba(0,0,0,0.7); z-index: 99997;',
            '  overflow: hidden; font-family: "Helvetica Neue", Arial, sans-serif;',
            '  transform: translateY(12px); opacity: 0;',
            '  transition: opacity 0.22s ease, transform 0.22s ease;',
            '  pointer-events: none;',
            '}',
            '#fern-window.fern-open { opacity: 1; transform: translateY(0); pointer-events: all; }',
            '#fern-header {',
            '  background: #111; padding: 14px 16px 12px;',
            '  border-bottom: 1px solid #2a2a2a; flex-shrink: 0;',
            '}',
            '#fern-header-top {',
            '  display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;',
            '}',
            '#fern-name {',
            '  font-size: 1rem; font-weight: 700; color: #10b981;',
            '  letter-spacing: 0.04em; display: flex; align-items: center; gap: 8px;',
            '}',
            '#fern-name::before {',
            '  content: ""; width: 8px; height: 8px; border-radius: 50%;',
            '  background: #10b981; display: inline-block;',
            '  box-shadow: 0 0 6px rgba(16,185,129,0.8);',
            '}',
            '#fern-close {',
            '  background: none; border: none; color: #555; cursor: pointer;',
            '  font-size: 1.4rem; line-height: 1; padding: 0 2px; transition: color 0.2s;',
            '}',
            '#fern-close:hover { color: #fff; }',
            '#fern-toggle-row {',
            '  display: flex; align-items: center; justify-content: space-between;',
            '}',
            '#fern-toggle-label {',
            '  font-size: 0.78rem; color: #888; text-transform: uppercase; letter-spacing: 0.06em;',
            '}',
            '#fern-toggle-switch {',
            '  position: relative; width: 42px; height: 22px; cursor: pointer;',
            '}',
            '#fern-toggle-input {',
            '  opacity: 0; width: 0; height: 0; position: absolute;',
            '}',
            '#fern-toggle-slider {',
            '  position: absolute; top: 0; left: 0; right: 0; bottom: 0;',
            '  background: #2a2a2a; border-radius: 22px;',
            '  transition: background 0.2s;',
            '}',
            '#fern-toggle-slider::before {',
            '  content: ""; position: absolute; width: 16px; height: 16px;',
            '  left: 3px; top: 3px; background: #555; border-radius: 50%;',
            '  transition: transform 0.2s, background 0.2s;',
            '}',
            '#fern-toggle-input:checked + #fern-toggle-slider { background: #10b981; }',
            '#fern-toggle-input:checked + #fern-toggle-slider::before {',
            '  transform: translateX(20px); background: #fff;',
            '}',
            '#fern-toggle-value {',
            '  font-size: 0.72rem; color: #10b981; font-weight: 700;',
            '  text-transform: uppercase; min-width: 22px; text-align: right;',
            '}',
            '#fern-messages {',
            '  flex: 1; overflow-y: auto; padding: 14px 14px 10px;',
            '  display: flex; flex-direction: column; gap: 10px;',
            '  scrollbar-width: thin; scrollbar-color: #2a2a2a transparent;',
            '}',
            '#fern-messages::-webkit-scrollbar { width: 4px; }',
            '#fern-messages::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 2px; }',
            '.fern-msg {',
            '  max-width: 88%; padding: 10px 13px; border-radius: 10px;',
            '  font-size: 0.88rem; line-height: 1.6; word-break: break-word; white-space: pre-wrap;',
            '}',
            '.fern-msg-bot {',
            '  align-self: flex-start; background: #1f1f23;',
            '  color: #e0e0e0; border-bottom-left-radius: 2px;',
            '}',
            '.fern-msg-user {',
            '  align-self: flex-end; background: #10b981;',
            '  color: #0a0a0a; font-weight: 500; border-bottom-right-radius: 2px; white-space: normal;',
            '}',
            '#fern-input-row {',
            '  display: flex; gap: 8px; padding: 10px 12px 12px;',
            '  border-top: 1px solid #2a2a2a; flex-shrink: 0;',
            '}',
            '#fern-input {',
            '  flex: 1; background: #111; border: 1px solid #2a2a2a;',
            '  border-radius: 8px; color: #e0e0e0; padding: 9px 12px;',
            '  font-size: 0.88rem; outline: none; transition: border-color 0.2s;',
            '}',
            '#fern-input:focus { border-color: #10b981; }',
            '#fern-input::placeholder { color: #444; }',
            '#fern-input:disabled { opacity: 0.5; }',
            '#fern-send {',
            '  background: #10b981; border: none; border-radius: 8px;',
            '  width: 38px; height: 38px; cursor: pointer; flex-shrink: 0;',
            '  display: flex; align-items: center; justify-content: center;',
            '  transition: background 0.2s, opacity 0.2s; outline: none;',
            '}',
            '#fern-send:hover:not(:disabled) { background: #0ea472; }',
            '#fern-send svg { pointer-events: none; }',
            '#fern-chips {',
            '  display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 0 2px;',
            '  align-self: flex-start; max-width: 100%;',
            '}',
            '.fern-chip-wrap {',
            '  display: inline-flex; align-items: center;',
            '  border: 1px solid #2a2a2a; border-radius: 999px;',
            '  transition: border-color 0.18s;',
            '}',
            '.fern-chip-wrap:hover { border-color: #10b981; }',
            '.fern-chip {',
            '  background: transparent; border: none; border-radius: 999px 0 0 999px;',
            '  color: #999; font-size: 0.76rem; padding: 5px 8px 5px 12px; cursor: pointer;',
            '  transition: color 0.18s, background 0.18s;',
            '  white-space: nowrap; font-family: inherit; outline: none; line-height: 1.4;',
            '}',
            '.fern-chip-wrap:hover .fern-chip { color: #10b981; background: rgba(16,185,129,0.07); }',
            '.fern-chip-wrap:hover .fern-chip:active { background: rgba(16,185,129,0.14); }',
            '.fern-chip-dismiss {',
            '  background: transparent; border: none; border-radius: 0 999px 999px 0;',
            '  color: #555; font-size: 0.85rem; padding: 5px 10px 5px 2px; cursor: pointer;',
            '  line-height: 1; font-family: inherit; outline: none;',
            '  transition: color 0.15s;',
            '}',
            '.fern-chip-dismiss:hover { color: #ef4444; }',
            '@keyframes fernChipsPop {',
            '  from { opacity: 0; transform: translateY(8px); }',
            '  to   { opacity: 1; transform: translateY(0); }',
            '}',
            '.fern-chip-wrap { animation: fernChipsPop 0.28s ease both; }',
            '#fern-safety-banner {',
            '  background: rgba(245,158,11,0.1); border-bottom: 1px solid rgba(245,158,11,0.3);',
            '  color: #f59e0b; font-size: 0.71rem; padding: 6px 10px 6px 12px;',
            '  line-height: 1.45; display: flex; align-items: baseline; gap: 6px;',
            '}',
            '#fern-safety-banner .fern-safety-text { flex: 1; }',
            '#fern-safety-banner .fern-safety-dismiss {',
            '  background: none; border: none; color: #f59e0b; cursor: pointer;',
            '  font-size: 1rem; line-height: 1; padding: 0; opacity: 0.65;',
            '  flex-shrink: 0; font-family: inherit; transition: opacity 0.15s;',
            '}',
            '#fern-safety-banner .fern-safety-dismiss:hover { opacity: 1; }',
            '.fern-chip-undo {',
            '  display: inline-flex; align-items: center; cursor: pointer;',
            '  background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3);',
            '  border-radius: 999px; color: #10b981; font-size: 0.74rem;',
            '  padding: 4px 12px; white-space: nowrap; transition: background 0.2s;',
            '  font-family: inherit;',
            '}',
            '.fern-chip-undo:hover { background: rgba(16,185,129,0.22); }',
            '.fern-reset-link {',
            '  display: inline-block; margin-top: 7px; cursor: pointer;',
            '  color: #10b981; font-size: 0.74rem; text-decoration: underline;',
            '  opacity: 0.75; transition: opacity 0.2s;',
            '}',
            '.fern-reset-link:hover { opacity: 1; }',
            '.fern-dismissed-count {',
            '  font-size: 0.72rem; color: rgba(255,255,255,0.38); padding: 2px 12px 4px;',
            '  animation: fernHintFade 0.4s ease forwards;',
            '}',
            '@keyframes fernAlertPulse {',
            '  0%, 100% { transform: scale(1); opacity: 1; }',
            '  50%       { transform: scale(1.5); opacity: 0.55; }',
            '}',
            '.fern-chip-alert-dot {',
            '  width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;',
            '  display: inline-block; align-self: center;',
            '  margin-left: 8px; margin-right: -2px;',
            '  animation: fernAlertPulse 1.6s ease-in-out infinite;',
            '}',
            '.fern-row-count-badge {',
            '  display: inline-flex; align-items: center; align-self: center;',
            '  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);',
            '  border-radius: 999px; color: rgba(255,255,255,0.35); font-size: 0.67rem;',
            '  padding: 3px 9px; white-space: nowrap; margin-left: 4px; flex-shrink: 0;',
            '}',
            '@keyframes fern-warn-pulse {',
            '  0%, 100% { opacity: 1; box-shadow: 0 0 0 2px rgba(245,158,11,0.2); }',
            '  50% { opacity: 0.55; box-shadow: 0 0 0 5px rgba(245,158,11,0.0); }',
            '}',
            '.fern-chip-warn-dot {',
            '  display: inline-block; width: 6px; height: 6px;',
            '  background: #f59e0b; border-radius: 50%;',
            '  margin-right: 5px; flex-shrink: 0; vertical-align: middle;',
            '  box-shadow: 0 0 0 2px rgba(245,158,11,0.2);',
            '  animation: fern-warn-pulse 2s ease-in-out infinite;',
            '}',
            '.fern-chip:hover .fern-chip-warn-dot,',
            '.fern-chip:focus .fern-chip-warn-dot {',
            '  animation-play-state: paused;',
            '}',
            '.fern-chip-warn-dot[data-severity="low"]      { animation-duration: 3s; }',
            '.fern-chip-warn-dot[data-severity="moderate"] { animation-duration: 2s; }',
            '.fern-chip-warn-dot[data-severity="high"]     { animation-duration: 1.2s; }',
            '.fern-chip-warn-dot[data-severity="hazardous"]{ animation-duration: 0.7s; }',
            '.fern-sr-only {',
            '  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;',
            '  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;',
            '}',
            '.fern-chip-advisory {',
            '  display: flex; align-items: baseline; gap: 6px;',
            '  background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.25);',
            '  border-radius: 8px; padding: 7px 10px 7px 12px;',
            '  margin: 4px 0 2px; font-size: 0.78rem; color: #f59e0b; line-height: 1.45;',
            '}',
            '.fern-chip-advisory-text { flex: 1; }',
            '.fern-chip-advisory-dismiss {',
            '  background: none; border: none; color: #f59e0b; cursor: pointer;',
            '  font-size: 1rem; line-height: 1; padding: 0; opacity: 0.6;',
            '  flex-shrink: 0; font-family: inherit; transition: opacity 0.15s;',
            '}',
            '.fern-chip-advisory-dismiss:hover { opacity: 1; }',
            '#fern-data-ts {',
            '  font-size: 0.64rem; color: #444; text-align: right;',
            '  margin-top: 5px; min-height: 0.85rem; transition: color 0.4s;',
            '}',
            '.fern-live-footnote {',
            '  display: block; margin-top: 5px;',
            '  font-size: 0.68rem; font-style: italic; color: #555;',
            '}',
            '#fern-debug-panel {',
            '  position: fixed; bottom: 170px; right: 28px; width: 320px;',
            '  background: #0d0d0d; border: 1px solid #333; border-radius: 8px;',
            '  padding: 12px 14px; z-index: 99999; font-family: monospace;',
            '  font-size: 0.72rem; color: #888; box-shadow: 0 8px 32px rgba(0,0,0,0.6);',
            '}',
            '#fern-debug-panel h4 {',
            '  color: #10b981; margin: 0 0 8px; font-size: 0.75rem; letter-spacing: 0.05em;',
            '}',
            '#fern-debug-panel pre {',
            '  background: #111; padding: 8px; border-radius: 4px; overflow-x: auto;',
            '  margin: 0; font-size: 0.68rem; color: #aaa; white-space: pre-wrap;',
            '  max-height: 180px; overflow-y: auto;',
            '}',
            '#fern-debug-close {',
            '  position: absolute; top: 8px; right: 10px; background: none; border: none;',
            '  color: #555; cursor: pointer; font-size: 1rem; line-height: 1;',
            '}',
            '#fern-debug-close:hover { color: #fff; }',
            '#fern-debug-copy {',
            '  margin-top: 8px; background: rgba(16,185,129,0.12);',
            '  border: 1px solid rgba(16,185,129,0.35); border-radius: 4px;',
            '  color: #10b981; font-size: 0.68rem; font-family: monospace;',
            '  padding: 4px 10px; cursor: pointer; transition: background 0.2s, color 0.2s;',
            '  width: 100%;',
            '}',
            '#fern-debug-copy:hover { background: rgba(16,185,129,0.22); }',
            '#fern-debug-copy.copied { background: rgba(16,185,129,0.3); color: #6ee7b7; }',
            '.fern-dismissed-count .fern-reset-link {',
            '  display: inline; margin-top: 0;',
            '}',
            '@media (max-width: 400px) {',
            '  #fern-window { right: 8px; width: calc(100vw - 16px); bottom: 96px; }',
            '  #fern-fab { right: 16px; bottom: 20px; }',
            '}'
        ].join('\n');

        var style = document.createElement('style');
        style.id = 'fern-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function buildHTML() {
        var fab = document.createElement('button');
        fab.id = 'fern-fab';
        fab.setAttribute('aria-label', 'Chat with Fern, your Lodge Concierge');
        fab.setAttribute('title', 'Ask Fern');
        fab.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">'
            + '<path d="M12 22 C11.5 17 10 12 9 7.5 C8.5 5 9 3 10.5 2" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none"/>'
            + '<path d="M10.5 18.5 C8.5 17.5 6.5 15.5 5.5 13.5" stroke="#fff" stroke-width="1.3" stroke-linecap="round" fill="none"/>'
            + '<path d="M9.8 14.5 C7.8 13 6 11 5 9" stroke="#fff" stroke-width="1.3" stroke-linecap="round" fill="none"/>'
            + '<path d="M9.3 10.5 C7.5 9 6 7 5.5 5" stroke="#fff" stroke-width="1.3" stroke-linecap="round" fill="none"/>'
            + '<path d="M11 16.5 C13 15.5 14.5 13.5 15.5 11.5" stroke="#fff" stroke-width="1.3" stroke-linecap="round" fill="none"/>'
            + '<path d="M10.2 12.5 C12.2 11 14 9 15 7" stroke="#fff" stroke-width="1.3" stroke-linecap="round" fill="none"/>'
            + '<path d="M9.8 8.5 C11.5 7 13 5 13.5 3" stroke="#fff" stroke-width="1.3" stroke-linecap="round" fill="none"/>'
            + '</svg>';

        var win = document.createElement('div');
        win.id = 'fern-window';
        win.setAttribute('role', 'dialog');
        win.setAttribute('aria-label', 'Fern Concierge Chat');
        win.innerHTML = [
            '<div id="fern-header">',
            '  <div id="fern-header-top">',
            '    <span id="fern-name">Fern &mdash; Lodge Concierge</span>',
            '    <button id="fern-close" aria-label="Close chat">&times;</button>',
            '  </div>',
            '  <div id="fern-toggle-row">',
            '    <span id="fern-toggle-label">Expert Insights</span>',
            '    <label id="fern-toggle-switch" aria-label="Expert Insights toggle">',
            '      <input type="checkbox" id="fern-toggle-input" checked>',
            '      <span id="fern-toggle-slider"></span>',
            '    </label>',
            '    <span id="fern-toggle-value">ON</span>',
            '  </div>',
            '  <div id="fern-data-ts" aria-live="polite"></div>',
            '</div>',
            '<div id="fern-safety-banner" style="display:none" aria-live="polite">',
            '  <span class="fern-safety-text"></span>',
            '  <button class="fern-safety-dismiss" aria-label="Dismiss safety notice">\u00d7</button>',
            '</div>',
            '<div id="fern-messages" aria-live="polite"></div>',
            '<div id="fern-input-row">',
            '  <input id="fern-input" type="text" placeholder="Ask Fern anything..." autocomplete="off" maxlength="300">',
            '  <button id="fern-send" aria-label="Send">',
            '    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>',
            '  </button>',
            '</div>'
        ].join('');

        var bubble = document.createElement('div');
        bubble.id = 'fern-bubble';
        bubble.textContent = 'Aloha! Tap here for live trail conditions or equipment details.';

        document.body.appendChild(fab);
        document.body.appendChild(bubble);
        document.body.appendChild(win);
    }

    function wireEvents() {
        var fab = document.getElementById('fern-fab');
        var win = document.getElementById('fern-window');
        var closeBtn = document.getElementById('fern-close');
        var toggleInput = document.getElementById('fern-toggle-input');
        var toggleValue = document.getElementById('fern-toggle-value');
        var sendBtn = document.getElementById('fern-send');
        var inputEl = document.getElementById('fern-input');

        /* Greeting bubble logic */
        (function () {
            if (sessionStorage.getItem('fernGreetingSeen')) return;
            var bubble = document.getElementById('fern-bubble');
            var showTimer, hideTimer;
            function hideBubble() {
                if (bubble) bubble.classList.remove('show-fern-bubble');
                clearTimeout(showTimer);
                clearTimeout(hideTimer);
                try { sessionStorage.setItem('fernGreetingSeen', '1'); } catch (e) {}
            }
            var bubbleDelay = 8000;
            try {
                var bCfg = window.FERN_CONFIG;
                if (bCfg && typeof bCfg.greetingBubbleDelay === 'number') {
                    var bd = Math.round(bCfg.greetingBubbleDelay);
                    if (bd >= 0 && bd <= 30000) bubbleDelay = bd;
                }
            } catch (e) {}
            showTimer = setTimeout(function () {
                if (bubble) bubble.classList.add('show-fern-bubble');
                hideTimer = setTimeout(hideBubble, 12000);
            }, bubbleDelay);
            fab.addEventListener('click', hideBubble, { once: true });
        })();

        /* Safety banner dismiss */
        (function () {
            var dismissBtn = document.querySelector('.fern-safety-dismiss');
            if (dismissBtn) {
                dismissBtn.addEventListener('click', function () {
                    var banner = document.getElementById('fern-safety-banner');
                    if (banner) banner.style.display = 'none';
                    try { sessionStorage.setItem('fernSafetyDismissed', '1'); } catch (e) {}
                });
            }
        })();

        fab.addEventListener('click', function () {
            var isOpen = win.classList.toggle('fern-open');
            if (isOpen && !greeted) {
                greeted = true;
                setTimeout(function () {
                    appendMessage(GREETING, 'bot');
                    var safetyMsg = buildOpeningSafetyMsg();
                    if (safetyMsg) {
                        setTimeout(function () {
                            appendMessage(safetyMsg, 'bot');
                            setTimeout(showChips, 120);
                        }, 500);
                    } else {
                        setTimeout(showChips, 80);
                    }
                }, 80);
            }
            if (isOpen) {
                setTimeout(function () { inputEl.focus(); }, 80);
                resetInactivityTimer();
            } else {
                clearInactivityTimer();
            }
        });

        closeBtn.addEventListener('click', function () {
            win.classList.remove('fern-open');
            clearInactivityTimer();
        });

        toggleInput.addEventListener('change', function () {
            expertInsightsOn = this.checked;
            toggleValue.textContent = expertInsightsOn ? 'ON' : 'OFF';
            toggleValue.style.color = expertInsightsOn ? '#10b981' : '#666';
            rerenderBotMessages();
        });

        sendBtn.addEventListener('click', handleSend);

        inputEl.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });

        inputEl.addEventListener('input', function () {
            resetInactivityTimer();
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && win.classList.contains('fern-open')) {
                win.classList.remove('fern-open');
                clearInactivityTimer();
            }
        });
    }

    var LIVE_REFRESH_INTERVAL = LIVE_DATA_TTL;

    function getLastRefreshTime() {
        var keys = ['volcano', 'weather', 'airQuality', 'trailConditions'];
        var maxTs = 0;
        for (var i = 0; i < keys.length; i++) {
            var entry = LIVE_DATA_CACHE[keys[i]];
            if (entry && entry.ts > maxTs) maxTs = entry.ts;
        }
        return maxTs;
    }

    function updateRefreshTimestamp() {
        var el = document.getElementById('fern-data-ts');
        if (!el) return;
        var TYPE_LABELS = { volcano: 'Volcano', weather: 'Weather', airQuality: 'AQI', trailConditions: 'Trails' };
        var keys = ['volcano', 'weather', 'airQuality', 'trailConditions'];
        var shown = [];
        for (var i = 0; i < keys.length; i++) {
            if (!LIVE_DATA_SHOWN[keys[i]]) continue;
            var entry = LIVE_DATA_CACHE[keys[i]];
            if (entry && entry.ts) shown.push({ key: keys[i], ts: entry.ts });
        }
        if (shown.length === 0) { el.textContent = ''; return; }
        var now = Date.now();
        function ageLabel(ts) {
            var diffMin = Math.floor((now - ts) / 60000);
            return diffMin < 1 ? 'just now' : diffMin === 1 ? '1 min ago' : diffMin + ' min ago';
        }
        if (shown.length === 1) {
            var diffMin = Math.floor((now - shown[0].ts) / 60000);
            el.textContent = diffMin < 1 ? '\u25cf Live \u00b7 just refreshed'
                : diffMin === 1 ? '\u25cf Live \u00b7 refreshed 1 min ago'
                : '\u25cf Live \u00b7 refreshed ' + diffMin + ' min ago';
        } else {
            shown.sort(function (a, b) { return b.ts - a.ts; });
            var parts = [];
            for (var j = 0; j < shown.length; j++) {
                parts.push(TYPE_LABELS[shown[j].key] + ': ' + ageLabel(shown[j].ts));
            }
            el.textContent = '\u25cf Live \u00b7 ' + parts.join(' \u00b7 ');
        }
    }

    function initDebugPanel() {
        try { if (!/[?&]fern_debug=1/.test(window.location.search)) return; } catch (e) { return; }
        var panel = document.createElement('div');
        panel.id = 'fern-debug-panel';
        var closeBtn = document.createElement('button');
        closeBtn.id = 'fern-debug-close';
        closeBtn.textContent = '\u00d7';
        closeBtn.setAttribute('aria-label', 'Close debug panel');
        closeBtn.addEventListener('click', function () { panel.parentNode && panel.parentNode.removeChild(panel); });
        var h4 = document.createElement('h4');
        h4.textContent = 'FERN DEBUG \u2014 Effective Config';
        var pre = document.createElement('pre');
        function refreshDebug() {
            var effective = {
                inactivityDelay: INACTIVITY_DELAY_BASE,
                maxReprompts: MAX_INTENTS,
                expertInsights: expertInsightsOn,
                liveDataCacheTTL: LIVE_DATA_TTL,
                chipsShowCount: CHIPS_SHOW_COUNT,
                chipStaggerMs: CHIP_STAGGER_MS,
                closerMinLength: CLOSER_MIN_LENGTH,
                closerMinLengthByTopic: CLOSER_MIN_LENGTH_BY_TOPIC,
                chipAdvisoryTemplate: CHIP_ADVISORY_TEMPLATE,
                closingLines: CLOSING_LINES,
                repromptMultipliers: REPROMPT_MULTIPLIERS,
                lastRefreshed: getLastRefreshTime() ? new Date(getLastRefreshTime()).toLocaleTimeString() : 'not yet',
                windowFERN_CONFIG: window.FERN_CONFIG || null
            };
            pre.textContent = JSON.stringify(effective, null, 2);
        }
        refreshDebug();
        setInterval(refreshDebug, 5000);
        var copyBtn = document.createElement('button');
        copyBtn.id = 'fern-debug-copy';
        copyBtn.textContent = 'Copy JSON';
        copyBtn.addEventListener('click', function () {
            refreshDebug();
            function showCopied() {
                copyBtn.textContent = 'Copied!';
                copyBtn.classList.add('copied');
                setTimeout(function () {
                    copyBtn.textContent = 'Copy JSON';
                    copyBtn.classList.remove('copied');
                }, 2000);
            }
            function fallbackCopy() {
                try {
                    var ta = document.createElement('textarea');
                    ta.value = pre.textContent;
                    ta.style.cssText = 'position:fixed;opacity:0';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    showCopied();
                } catch (e2) {}
            }
            try {
                navigator.clipboard.writeText(pre.textContent).then(showCopied).catch(fallbackCopy);
            } catch (e) {
                fallbackCopy();
            }
        });
        panel.appendChild(closeBtn);
        panel.appendChild(h4);
        panel.appendChild(pre);
        panel.appendChild(copyBtn);
        document.body.appendChild(panel);
    }

    function warmLiveCache() {
        return Promise.all([
            fetchVolcanoStatus(),
            fetchWeather(),
            fetchAirQuality(),
            fetchTrailConditions()
        ]).then(function () {
            maybeReprioritizeChips();
            if (document.getElementById('fern-chips')) {
                maybeShowChipAdvisory();
            }
            updateSafetyBanner();
            updateRefreshTimestamp();
        });
    }

    function init() {
        injectStyles();
        buildHTML();
        wireEvents();
        loadKnowledge();
        warmLiveCache();
        setInterval(warmLiveCache, LIVE_REFRESH_INTERVAL);
        setInterval(updateRefreshTimestamp, 30000);
        updateSafetyBanner();
        initDebugPanel();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.fernQuery = function(question) {
        var fab = document.getElementById('fern-fab');
        var win = document.getElementById('fern-window');
        var inp = document.getElementById('fern-input');
        var snd = document.getElementById('fern-send');
        if (!fab || !win) return;
        if (!win.classList.contains('fern-open')) fab.click();
        setTimeout(function() {
            if (inp) inp.value = question;
            if (snd) snd.click();
        }, 150);
    };

    if (Array.isArray(window._fernQueryQueue)) {
        window._fernQueryQueue.forEach(function (q) { window.fernQuery(q); });
        window._fernQueryQueue = null;
    }

})();

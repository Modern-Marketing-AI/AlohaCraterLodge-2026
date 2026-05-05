(function () {
    'use strict';

    var fernData = null;
    var pendingResponse = false;
    var expertInsightsOn = true;
    var greeted = false;
    var insightCount = 0;
    var triggerFired = false;
    var chipsEl = null;

    var MAX_INTENTS = 4;

    var inactivityFromUrl = false;
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
        return DEFAULT_MS;
    })();

    var inactivityTimer = null;
    var inactivityRepromptCount = 0;
    var usedChipLabels = [];

    var CHIP_COVERAGE = [
        { label: 'Circulatory Reset',    test: /circulatory|pemf|terahertz|olylife.*p90|p90|physical reset/i },
        { label: 'Optical Reset',        test: /optical|eye.*massage|galaxy.?g|g.?one|eye reset/i },
        { label: 'Gravity Conditioning', test: /vibration|plate|lymphatic|gravity.*conditioning/i },
        { label: 'Sensory Grounding',    test: /aroma|diffuser|scent|sensory.*grounding/i },
        { label: 'Crater Mobility',      test: /bike|e.?bike|ebike|cycle|cycling|crater.*mobility/i },
        { label: 'Dark Skies',           test: /star|stargazing|milky way|night sky|dark sky|bortle/i },
        { label: 'Cultural Respect',     test: /pele|deity|goddess|reverence|sacred|cultural|culture|aina/i },
        { label: 'Mess Hall',            test: /dining|restaurant|eat out|lunch|dinner|ohelo|volcano house|mess hall/i },
        { label: 'Check-in Time',        test: /check.?in|check.?out|infiltration|extraction|arrival time/i },
        { label: 'Orchid Suite',         test: /room.?6|orchid|goldfish|botanical/i },
        { label: 'Air Quality',          test: /air.*quality|aqi|air.*pollution|pm2\.?5|smoke|particulate/i },
        { label: 'Trail Conditions',     test: /trail.*condition|trail.*status|trail.*open|trail.*close|hike.*condition|trail.*today/i }
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
        { label: 'Circulatory Reset',    question: 'Tell me about the Circulatory Reset — PEMF and Terahertz protocol' },
        { label: 'Optical Reset',        question: 'Tell me about the Optical Reset' },
        { label: 'Gravity Conditioning', question: 'Tell me about the Gravity Conditioning vibration plates' },
        { label: 'Sensory Grounding',    question: 'Tell me about the Sensory Grounding aromatherapy options' },
        { label: 'Crater Mobility',      question: 'Tell me about the Crater Mobility e-bikes' },
        { label: 'Dark Skies',           question: 'Tell me about stargazing and dark sky conditions near the lodge' },
        { label: 'Cultural Respect',     question: 'Tell me about respecting the \u02bbaina and Hawaiian culture' },
        { label: 'Mess Hall',            question: 'What are the best local restaurants and mess hall partners?' },
        { label: 'Check-in Time',        question: 'What time is infiltration (check-in) and extraction (check-out)?' },
        { label: 'Orchid Suite',         question: 'Tell me about the Orchid Suite \u2014 Room 6' },
        { label: 'Air Quality',          question: 'What\'s the air quality like today?' },
        { label: 'Trail Conditions',     question: 'Are there any trail closures or conditions I should know about?' }
    ];

    var CHIPS_SESSION_KEY = 'fern_chips_session';
    var CHIPS_SHOW_COUNT = 8;
    var DISMISSED_CHIPS_KEY = 'fern_dismissed_chips';

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

    function getSessionChips() {
        var dismissed = getDismissedChips();

        try {
            var stored = sessionStorage.getItem(CHIPS_SESSION_KEY);
            if (stored) {
                var indices = JSON.parse(stored);
                if (Array.isArray(indices) && indices.length === CHIPS_SHOW_COUNT) {
                    var cached = indices.map(function (i) { return TOPIC_CHIPS_POOL[i]; }).filter(Boolean);
                    var stillValid = cached.filter(function (c) { return dismissed.indexOf(c.label) === -1; });
                    if (stillValid.length === cached.length) return cached;
                }
            }
        } catch (e) { }

        var pool = TOPIC_CHIPS_POOL.filter(function (c) { return dismissed.indexOf(c.label) === -1; });
        var selected = [];
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
                if (!inactivityFromUrl && data.config && typeof data.config.inactivity_delay_seconds === 'number') {
                    var cfgMs = Math.round(data.config.inactivity_delay_seconds * 1000);
                    if (cfgMs >= 2000 && cfgMs <= 600000) INACTIVITY_DELAY_BASE = cfgMs;
                }
            })
            .catch(function () {
                fernData = { _fallback: true, system_directive: "That is a great question! I don't have that specific detail right here, but the team will be happy to clarify that for you." };
            });
    }

    function fetchVolcanoStatus() {
        return fetch('https://volcanoes.usgs.gov/vsc/api/volcanoApi/summary/HVO', { mode: 'cors' })
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
                var friendly = map[level] || 'Status available at the USGS Volcano Hazards Program page';
                return 'Live Kīlauea status: ' + friendly + '. Always verify current conditions at the USGS Volcano Hazards Program page before heading to the crater rim.';
            })
            .catch(function () {
                return GRACEFUL_FAIL;
            });
    }

    function fetchWeather() {
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
                return 'Right now in Volcano Village: ' + temp + '\u00b0F and ' + condition + '. Remember, Volcano is a high-altitude cloud forest — typically 10\u201315\u00b0F cooler than the coast. Pack layers and a light rain jacket!';
            })
            .catch(function () {
                return GRACEFUL_FAIL;
            });
    }

    function fetchAirQuality() {
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
                return msg;
            })
            .catch(function () {
                return GRACEFUL_FAIL;
            });
    }

    function fetchTrailConditions() {
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
                if (trailAlerts.length === 0 && alerts.length === 0) {
                    return 'No current trail alerts on record for Hawai\u02bbi Volcanoes National Park. Always check the official NPS site or the Kīlauea Visitor Center before heading out.';
                }
                if (trailAlerts.length === 0) {
                    return 'No trail-specific closures listed right now at Hawai\u02bbi Volcanoes National Park. General park alerts exist — check nps.gov/havo or the visitor center for the latest.';
                }
                var summaries = trailAlerts.slice(0, 2).map(function (a) { return a.title; }).join('; ');
                return 'Current trail alerts at Hawai\u02bbi Volcanoes National Park: ' + summaries + '. Always verify with a ranger or at nps.gov/havo before your hike.';
            })
            .catch(function () {
                return GRACEFUL_FAIL;
            });
    }

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
            upsells.push(data.bio_regeneration_stack && data.bio_regeneration_stack.protocol);
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
            [/wifi.*password|gate.*code|access.*code|room.*code|credentials|not received.*code|how.*get.*code|day.*arrival.*code/i, function () { return 'For secure access credentials, text the Host Team directly: ' + (data.logistics.contact || '(808) 345-4449') + '. Credentials are dispatched on your infiltration day.'; }],
            // Logistics
            [/check.?in|infiltration|arrival time|3pm|self.check|remote check/i, function () { return 'Infiltration (Check-in): ' + data.logistics.infiltration; }],
            [/check.?out|extraction|departure|11am/i, function () { return 'Extraction (Check-out): ' + data.logistics.extraction; }],
            [/coffee|ration|kitchen|fridge|refrigerator|provisions|kauu|estate/i, function () { return data.logistics.ration_center; }],
            [/dining|restaurant|eat out|lunch|dinner|ohelo|volcano house|mess hall|pizza/i, function () { return data.logistics.mess_hall_partners; }],
            // Bio-regeneration stack — specific protocols first
            [/circulatory|pemf|terahertz|tera.?hertz|olylife.*p90|p90|physical reset/i, function () { return data.bio_regeneration_stack.circulatory_reset; }],
            [/optical|eye.*massage|galaxy.?g|g.?one|eye reset|air.*bag.*eye/i, function () { return data.bio_regeneration_stack.optical_reset; }],
            [/vibration|plate|lymphatic|gravity.*conditioning|structural calibration/i, function () { return data.bio_regeneration_stack.gravity_conditioning; }],
            [/aroma|diffuser|scent|sensory.*grounding|atmospheric/i, function () { return data.bio_regeneration_stack.sensory_grounding; }],
            [/wellness|bio.?regen|recovery room|calibration|reset.*protocol|recovery.*tool/i, function () { return data.bio_regeneration_stack.protocol; }],
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

    var lastOpenerIdx = -1;

    function pickOpener() {
        if (OPENING_LINES.length <= 1) return OPENING_LINES[0];
        var idx;
        do { idx = Math.floor(Math.random() * OPENING_LINES.length); } while (idx === lastOpenerIdx);
        lastOpenerIdx = idx;
        return OPENING_LINES[idx];
    }

    var liveCache = {};
    var LIVE_CACHE_TTL = 4 * 60 * 1000;

    function cachedFetch(key, fn) {
        var now = Date.now();
        if (liveCache[key] && (now - liveCache[key].ts) < LIVE_CACHE_TTL) {
            return Promise.resolve(liveCache[key].value);
        }
        return fn().then(function (result) {
            liveCache[key] = { ts: now, value: result };
            return result;
        });
    }

    function routeAsync(input, data) {
        var q = input.toLowerCase();
        var asyncFetchers = [];
        var excludeTags = [];
        if (/eruption|erupting|alert.?level|vog.?level|lava.?flow|active.*vent|is.*erupting|volcano.*(status|active|erupt|alert|level)/i.test(q)) {
            asyncFetchers.push(function () { return cachedFetch('volcano', fetchVolcanoStatus); });
        }
        if (/weather|temperature|how cold|how warm|what.*wear.*outside|forecast|degrees/i.test(q)) {
            asyncFetchers.push(function () { return cachedFetch('weather', fetchWeather); });
            excludeTags.push('climate');
        }
        if (/air.*quality|aqi|air.*pollution|pm2\.?5|smoke|particulate|breathing.*outside|safe.*breathe/i.test(q)) {
            asyncFetchers.push(function () { return cachedFetch('airquality', fetchAirQuality); });
        }
        if (/trail.*condition|trail.*status|trail.*open|trail.*close|hike.*condition|path.*open|park.*trail|which.*trail|trail.*today|any.*closure|road.*closure|trail.*access/i.test(q)) {
            asyncFetchers.push(function () { return cachedFetch('trails', fetchTrailConditions); });
        }

        var slotsLeft = MAX_INTENTS - asyncFetchers.length;
        var syncResults = slotsLeft > 0 ? collectSyncIntents(input, data, slotsLeft, excludeTags) : [];

        if (asyncFetchers.length === 0) {
            if (syncResults.length === 0) return Promise.resolve(getFallback(data));
            if (syncResults.length === 1) return Promise.resolve(syncResults[0]);
            var syncJoined = syncResults[0];
            for (var k = 1; k < syncResults.length; k++) {
                syncJoined += '\n\n' + pickBridge() + syncResults[k];
            }
            return Promise.resolve(syncJoined);
        }

        return Promise.all(asyncFetchers.map(function (fn) { return fn(); })).then(function (asyncResults) {
            var parts = asyncResults.concat(syncResults);
            var seen = [];
            var unique = [];
            for (var i = 0; i < parts.length && unique.length < MAX_INTENTS; i++) {
                if (seen.indexOf(parts[i]) === -1) {
                    seen.push(parts[i]);
                    unique.push(parts[i]);
                }
            }
            if (unique.length === 1) return unique[0];
            var joined = unique[0];
            for (var j = 1; j < unique.length; j++) {
                joined += '\n\n' + pickBridge() + unique[j];
            }
            return joined;
        });
    }

    function removeChips() {
        if (chipsEl && chipsEl.parentNode) {
            chipsEl.parentNode.removeChild(chipsEl);
        }
        chipsEl = null;
    }

    function clearInactivityTimer() {
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
            inactivityTimer = null;
        }
    }

    function getNextInactivityDelay() {
        var multiplier = inactivityRepromptCount === 0 ? 1 : (inactivityRepromptCount === 1 ? 2 : 3);
        return INACTIVITY_DELAY_BASE * multiplier;
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

    function makeChipEl(chip, onSelect) {
        var wrapper = document.createElement('span');
        wrapper.className = 'fern-chip-wrap';

        var btn = document.createElement('button');
        btn.className = 'fern-chip';
        btn.textContent = chip.label;
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
            var hint = document.createElement('div');
            hint.className = 'fern-msg fern-msg-bot';
            hint.textContent = 'You\u2019ve explored all my topic suggestions! Type any question below \u2014 I\u2019m here.';
            msgs.appendChild(hint);
            msgs.scrollTop = msgs.scrollHeight;
            return;
        }
        var pool = available.slice();
        var selected = [];
        var count = Math.min(CHIPS_SHOW_COUNT, pool.length);
        while (selected.length < count && pool.length > 0) {
            var ri = Math.floor(Math.random() * pool.length);
            selected.push(pool.splice(ri, 1)[0]);
        }
        var row = document.createElement('div');
        row.id = 'fern-chips';
        row.className = 'fern-chips-inactivity';
        selected.forEach(function (chip) {
            row.appendChild(makeChipEl(chip, function () {
                var inp = document.getElementById('fern-input');
                if (inp) inp.value = '';
                removeChips();
                if (usedChipLabels.indexOf(chip.label) === -1) usedChipLabels.push(chip.label);
                sendChipQuestion(chip.question);
            }));
        });
        msgs.appendChild(row);
        msgs.scrollTop = msgs.scrollHeight;
        chipsEl = row;
        if (inactivityRepromptCount < 2) inactivityRepromptCount++;
        resetInactivityTimer();
    }

    function showChips() {
        var msgs = document.getElementById('fern-messages');
        if (!msgs) return;
        var chips = getSessionChips();
        if (chips.length === 0) {
            var hint = document.createElement('div');
            hint.className = 'fern-msg fern-msg-bot';
            hint.textContent = 'You\u2019ve explored all my topic suggestions! Type any question below \u2014 I\u2019m here.';
            msgs.appendChild(hint);
            msgs.scrollTop = msgs.scrollHeight;
            return;
        }
        var row = document.createElement('div');
        row.id = 'fern-chips';
        row.className = 'fern-chips-enter';
        chips.forEach(function (chip) {
            row.appendChild(makeChipEl(chip, function () {
                var inp = document.getElementById('fern-input');
                if (inp) inp.value = '';
                removeChips();
                if (usedChipLabels.indexOf(chip.label) === -1) usedChipLabels.push(chip.label);
                sendChipQuestion(chip.question);
            }));
        });
        msgs.appendChild(row);
        msgs.scrollTop = msgs.scrollHeight;
        chipsEl = row;
    }

    function sendChipQuestion(question) {
        if (pendingResponse) return;
        if (!fernData) {
            appendMessage("One moment — I'm still loading the Lodge intel. Please try again in a second!", 'bot');
            return;
        }
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
            var full = parts.join('');
            pendingResponse = false;
            setInputBusy(false);
            setTimeout(function () {
                processAndSend(full);
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
            var raw = bots[i].getAttribute('data-raw') || '';
            bots[i].textContent = expertInsightsOn ? filterResponse(raw) : filterResponse(stripInsights(raw));
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
            var full = parts.join('');
            pendingResponse = false;
            setInputBusy(false);
            setTimeout(function () {
                processAndSend(full);
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
            '.fern-chips-inactivity, .fern-chips-enter { animation: fernChipsPop 0.35s ease forwards; }',
            '.fern-chip-undo {',
            '  display: inline-flex; align-items: center; cursor: pointer;',
            '  background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3);',
            '  border-radius: 999px; color: #10b981; font-size: 0.74rem;',
            '  padding: 4px 12px; white-space: nowrap; transition: background 0.2s;',
            '  font-family: inherit;',
            '}',
            '.fern-chip-undo:hover { background: rgba(16,185,129,0.22); }',
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
            '</div>',
            '<div id="fern-messages" aria-live="polite"></div>',
            '<div id="fern-input-row">',
            '  <input id="fern-input" type="text" placeholder="Ask Fern anything..." autocomplete="off" maxlength="300">',
            '  <button id="fern-send" aria-label="Send">',
            '    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>',
            '  </button>',
            '</div>'
        ].join('');

        document.body.appendChild(fab);
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

        fab.addEventListener('click', function () {
            var isOpen = win.classList.toggle('fern-open');
            if (isOpen && !greeted) {
                greeted = true;
                setTimeout(function () {
                    appendMessage(GREETING, 'bot');
                    setTimeout(showChips, 80);
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

    function init() {
        injectStyles();
        buildHTML();
        wireEvents();
        loadKnowledge();
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

(function () {
    'use strict';

    var fernData = null;
    var pendingResponse = false;
    var expertInsightsOn = true;
    var greeted = false;
    var insightCount = 0;
    var triggerFired = false;

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

    function loadKnowledge() {
        return fetch('/fern_knowledge.json')
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (data) {
                fernData = data;
            })
            .catch(function () {
                fernData = { _fallback: true, system_directive: "That is a great question! I don't have that detail right here, but the team will be happy to clarify that for you." };
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
                    'advisory': 'Advisory — Watch the Updates',
                    'yellow': 'Advisory — Watch the Updates',
                    'watch': 'Elevated Activity',
                    'orange': 'Elevated Activity',
                    'warning': 'Erupting — Check with Ranger Station',
                    'red': 'Erupting — Check with Ranger Station'
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

    function getUpsells(input, data) {
        if (!data || data._fallback) return [];
        var q = input.toLowerCase();
        var upsells = [];
        var primaryIsEbike = /^(bike|e.?bike|ebike|cycle|cycling)/i.test(q.trim());
        var primaryIsWellness = /^(wellness|massage|yoga|aromatherapy|diffuser|recovery|bio.?regen)/i.test(q.trim());
        if (!primaryIsEbike && /trail|explore|exploring|hike|hiking|getting to the park|cruise to|cruise up|park entrance|national park/i.test(q)) {
            upsells.push(data.add_on_services.e_bikes);
        }
        if (!primaryIsWellness && /relax|relaxing|room.?4|shower|restore|unwind|recovery|soak/i.test(q)) {
            upsells.push(data.add_on_services.wellness_tools);
        }
        return upsells;
    }

    function buildSyncResponse(input, data) {
        var q = input.toLowerCase();
        if (!data || data._fallback) return data.system_directive;

        if (/cave|lava tube|tube system|underground/i.test(q)) {
            return data.safety_and_rules.caves;
        }
        if (/room.?3|lumi|anela|workspace|angel room/i.test(q)) {
            return data.rooms.room_3;
        }
        if (/room.?4|h[o\u014d][\u02bb']?om[a\u0101]lie|hoomalie|whirlpool|jetted|stone shower|forest edge/i.test(q)) {
            return data.rooms.room_4;
        }
        if (/room|suite|linen|fiber|360|virtual tour/i.test(q)) {
            return data.rooms.general;
        }
        if (/check.?in|check.?out|arrival time|3pm|11am|access code|self.check|remote check/i.test(q)) {
            return 'Check-in: ' + data.logistics.check_in + ' Check-out: ' + data.logistics.check_out;
        }
        if (/breakfast|food|eat|coffee|continental|meal|amenities|tea/i.test(q)) {
            return data.logistics.amenities;
        }
        if (/park|distance|drive|location|where.*lodge|far|how long|miles|minutes/i.test(q)) {
            return data.logistics.location;
        }
        if (/dining|restaurant|eat out|lunch|dinner|ohelo|thai thai|the rim|pizza/i.test(q)) {
            return data.local_guide.dining;
        }
        if (/climate|layers|pack|what.*wear|bring.*clothes/i.test(q)) {
            return data.local_guide.climate;
        }
        if (/bike|e.?bike|ebike|cycle|cycling/i.test(q)) {
            return data.add_on_services.e_bikes;
        }
        if (/wellness|massage|yoga|aromatherapy|diffuser|bio.?regen/i.test(q)) {
            return data.add_on_services.wellness_tools;
        }
        return data.system_directive;
    }

    function routeAsync(input, data) {
        var q = input.toLowerCase();
        if (/volcano|eruption|erupting|alert level|kīlauea|kilauea|lava flow|active.*vent|vog level/i.test(q)) {
            return fetchVolcanoStatus();
        }
        if (/weather|temperature|how cold|how warm|what.*wear.*outside|forecast|degrees/i.test(q)) {
            return fetchWeather();
        }
        return Promise.resolve(buildSyncResponse(input, data));
    }

    function appendMessage(text, role) {
        var msgs = document.getElementById('fern-messages');
        var div = document.createElement('div');
        div.className = 'fern-msg ' + (role === 'bot' ? 'fern-msg-bot' : 'fern-msg-user');
        if (role === 'bot') {
            div.setAttribute('data-raw', text);
            div.textContent = expertInsightsOn ? text : stripInsights(text);
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
            bots[i].textContent = expertInsightsOn ? raw : stripInsights(raw);
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
                }, 1000);
            }
        }
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

        appendMessage(text, 'user');
        input.value = '';
        pendingResponse = true;
        setInputBusy(true);

        routeAsync(text, fernData).then(function (primary) {
            var upsells = getUpsells(text, fernData);
            var parts = [primary];
            upsells.forEach(function (u) {
                if (u && u !== primary) parts.push('\n\nBy the way — ' + u);
            });
            var full = parts.join('');
            pendingResponse = false;
            setInputBusy(false);
            setTimeout(function () {
                processAndSend(full);
            }, 320);
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
                }, 80);
            }
            if (isOpen) {
                setTimeout(function () { inputEl.focus(); }, 80);
            }
        });

        closeBtn.addEventListener('click', function () {
            win.classList.remove('fern-open');
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

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && win.classList.contains('fern-open')) {
                win.classList.remove('fern-open');
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

})();

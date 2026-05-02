(function () {
    'use strict';

    var FERN_DATA = {
        bot_name: "Fern",
        faqs: {
            late_arrival: "No worries! We offer a seamless self-check-in process. Management will send your specific access codes on the day of your arrival.",
            check_in: "Check-in is between 3:00 PM and 5:00 PM. Check-out is at 11:00 AM.",
            breakfast: "A continental selection is provided by the team for you to enjoy at your leisure.",
            wifi: "We have free high-speed Wi-Fi throughout the lodge so you can stay connected.",
            park_distance: "We are just about a 3-minute drive from the entrance of Hawaii Volcanoes National Park.",
            weather: "Volcano is cooler than the coast! I recommend a light jacket for the evening lānais.",
            room3: "Room 3 is the Lumi Anela [loo-mee ah-neh-lah]. In Hawaiian, it means 'Angel Room'. It features a high-efficiency workspace and incredible natural light.",
            room4: "Room 4 is the Hōʻomālie [hoh-oh-mah-lee-eh] suite, meaning 'to cause peace'. It is secluded on the forest edge and has a beautiful custom stone shower."
        },
        fallback: "That's a great question! I want to make sure I give you the most accurate information. Let me check with the team, and we'll make sure you have everything you need for a perfect stay."
    };

    var GREETING = "Hi, I'm Fern, your Lodge Guide. Aloha! I'm here to help you find your way—whether you're picking the perfect suite or looking for the best hidden views at the crater. How can I help you today?";

    var INSIGHT_TRIGGER_MSG = "I hope these local insights are helping you get a feel for the Lodge! I'll keep sharing them, but if you're in a hurry and want to stick strictly to the facts, you can always flip the 'Expert Insights' switch at the top of this window to 'Off' at any time. Should I keep the local tips coming for now?";

    var insightCount = 0;
    var triggerFired = false;
    var expertInsightsOn = true;
    var greeted = false;

    var PHONETIC_TEST = /\[[^\]]+\]/;

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

    function route(input) {
        var q = input.toLowerCase();
        if (/late|after.hours|arrival|self.check|access code/i.test(q)) return FERN_DATA.faqs.late_arrival;
        if (/check.?in|check.?out|checkout|checkin|3pm|11am|check in|check out|arrival time|what time.*check|when.*check/i.test(q)) return FERN_DATA.faqs.check_in;
        if (/breakfast|food|eat|coffee|continental|meal/i.test(q)) return FERN_DATA.faqs.breakfast;
        if (/wi.?fi|wifi|internet|connect|starlink|network/i.test(q)) return FERN_DATA.faqs.wifi;
        if (/park|distance|drive|national|far|close|how long/i.test(q)) return FERN_DATA.faqs.park_distance;
        if (/weather|cold|jacket|temperature|cool|warm|rain|fog|vog/i.test(q)) return FERN_DATA.faqs.weather;
        if (/room.?3|lumi|anela|workspace|angel room|efficient/i.test(q)) return FERN_DATA.faqs.room3;
        if (/room.?4|h[oō][ʻ']?om[aā]lie|hoomalie|whirlpool|jetted|stone shower|forest edge|peace/i.test(q)) return FERN_DATA.faqs.room4;
        return FERN_DATA.fallback;
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
            '  height: 520px; max-height: calc(100vh - 120px);',
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
            '  font-size: 0.88rem; line-height: 1.55; word-break: break-word;',
            '}',
            '.fern-msg-bot {',
            '  align-self: flex-start; background: #1f1f23;',
            '  color: #e0e0e0; border-bottom-left-radius: 2px;',
            '}',
            '.fern-msg-user {',
            '  align-self: flex-end; background: #10b981;',
            '  color: #0a0a0a; font-weight: 500; border-bottom-right-radius: 2px;',
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
            '#fern-send {',
            '  background: #10b981; border: none; border-radius: 8px;',
            '  width: 38px; height: 38px; cursor: pointer; flex-shrink: 0;',
            '  display: flex; align-items: center; justify-content: center;',
            '  transition: background 0.2s; outline: none;',
            '}',
            '#fern-send:hover { background: #0ea472; }',
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
        fab.setAttribute('aria-label', 'Chat with Fern, your Lodge Guide');
        fab.setAttribute('title', 'Chat with Fern');
        fab.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';

        var win = document.createElement('div');
        win.id = 'fern-window';
        win.setAttribute('role', 'dialog');
        win.setAttribute('aria-label', 'Fern Lodge Guide Chat');
        win.innerHTML = [
            '<div id="fern-header">',
            '  <div id="fern-header-top">',
            '    <span id="fern-name">Fern &mdash; Lodge Guide</span>',
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

    function handleSend() {
        var input = document.getElementById('fern-input');
        var text = input.value.trim();
        if (!text) return;
        appendMessage(text, 'user');
        input.value = '';
        var response = route(text);
        setTimeout(function () {
            processAndSend(response);
        }, 320);
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
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

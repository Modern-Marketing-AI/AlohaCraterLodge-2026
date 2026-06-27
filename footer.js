(function () {
    var css = [
        'footer{background:#0d0d0d;color:#ccc;padding:50px 5% 30px;border-top:1px solid #2a2a2a;}',
        '.footer-content{display:flex;justify-content:space-between;max-width:1200px;margin:0 auto 1.5rem;flex-wrap:wrap;gap:2rem;}',
        '.footer-col{margin-bottom:20px;min-width:160px;}',
        '.footer-col h4{color:#E65100;margin:0 0 15px;font-size:0.9rem;letter-spacing:0.06em;text-transform:uppercase;}',
        '.footer-col p{color:#888;font-size:0.9rem;margin:0 0 4px;}',
        '.footer-col a{color:#888;text-decoration:none;display:block;margin-bottom:6px;font-size:0.9rem;transition:color 0.2s;}',
        '.footer-col a:hover{color:#10b981;}',
        '.footer-reveal-btn{display:inline-block !important;margin:4px 0 6px !important;color:#10b981 !important;border:1px solid #10b981;padding:6px 14px;border-radius:4px;text-decoration:none !important;font-size:0.82rem;font-weight:bold;letter-spacing:0.03em;transition:all 0.2s;}',
        '.footer-reveal-btn:hover{background:#10b981 !important;color:#000 !important;}',
        '.footer-map{margin:0.75rem 0 0.5rem;border-radius:6px;overflow:hidden;border:1px solid #1e1e1e;}',
        '.footer-map iframe{border:0;display:block;width:100%;height:160px;}',
        '.footer-admin-link{color:#555 !important;font-size:0.78rem !important;}',
        '.footer-admin-link:hover{color:#888 !important;}',
        '.footer-legal{text-align:center;border-top:1px solid #2a2a2a;margin-top:1.5rem;padding-top:1rem;color:#555;font-size:0.78rem;line-height:1.7;}',
        '.footer-legal p{margin:0;}'
    ].join('');

    var styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    var html = '<footer>' +
        '<div class="footer-content">' +
            '<div class="footer-col">' +
                '<h4>Aloha Crater Lodge</h4>' +
                '<p>11-3966 Lanihuli Road</p>' +
                '<p>Volcano, HI 96785</p>' +
                '<div class="footer-map">' +
                    '<iframe src="https://maps.google.com/maps?q=19.434694,-155.223806&amp;z=17&amp;output=embed"' +
                    ' allowfullscreen="" loading="lazy"' +
                    ' referrerpolicy="no-referrer-when-downgrade"' +
                    ' title="Aloha Crater Lodge location map"></iframe>' +
                '</div>' +
                '<a href="#" class="footer-reveal-btn">Text Concierge</a>' +
                '<a href="#" class="footer-admin-link" id="admin-trigger">[ Admin Login ]</a>' +
            '</div>' +
            '<div class="footer-col">' +
                '<h4>Intel Feeds</h4>' +
                '<a href="https://www.instagram.com/alohacraterlodge" target="_blank">Instagram: @alohacraterlodge</a>' +
                '<a href="https://www.youtube.com/@volcanosider" target="_blank">YouTube: Volcano Insider</a>' +
                '<a href="https://www.tiktok.com/@alohacraterlodge" target="_blank">TikTok: @AlohaCraterLodge</a>' +
            '</div>' +
            '<div class="footer-col">' +
                '<h4>Quick Links</h4>' +
                '<a href="suites.html">Suites</a>' +
                '<a href="wellness.html">Wellness</a>' +
                '<a href="faq.html">FAQ</a>' +
                '<a href="volcano-guide.html">Volcano Guide</a>' +
                '<a href="itinerary.html">Plan Your Trip</a>' +
                '<a href="privacy-policy.html">Privacy Policy</a>' +
                '<a href="terms.html">Terms of Service</a>' +
                '<a href="disclaimer.html">Disclaimer</a>' +
            '</div>' +
        '</div>' +
        '<div class="footer-legal">' +
            '<p>Located exactly 2.0 miles from the Hawaii Volcanoes National Park main entrance.</p>' +
            '<p>&copy; 2026 Aloha Crater Lodge LLC. All Rights Reserved.</p>' +
        '</div>' +
    '</footer>';

    var placeholder = document.getElementById('site-footer');
    if (placeholder) {
        placeholder.outerHTML = html;
    }

    document.querySelectorAll('.footer-reveal-btn, .reveal-phone-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            if (this.dataset.revealed !== 'true') {
                e.preventDefault();
                this.textContent = 'Text or Call (808) 345-4449';
                this.href = 'tel:+18083454449';
                this.dataset.revealed = 'true';
                this.style.background = '#10b981';
                this.style.color = '#000';
            }
        });
    });
})();

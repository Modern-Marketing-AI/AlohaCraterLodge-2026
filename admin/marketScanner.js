/**
 * MarketScanner — Browser-compatible yield intelligence module.
 * Cache layer uses localStorage instead of fs (static-site compatible).
 * Drop in a real Travel API by replacing fetchExternalRoomStatus().
 */
class MarketScanner {
  constructor() {
    this.CACHE_KEY = 'acl_advanced_pace';
    this.defaultCompSet = [
      { id: 'prop_vvl', name: 'Volcano Village Lodge' },
      { id: 'prop_klr', name: 'Kilauea Lodge & Restaurant' },
      { id: 'prop_vrr', name: 'Volcano Rainforest Retreat' },
      { id: 'prop_ace', name: "At The Crater's Edge" }
    ];
  }

  getUpcomingWeekends() {
    const weekends = [];
    const today = new Date();
    let current = new Date(today);
    const dayOfWeek = current.getDay();
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
    current.setDate(today.getDate() + daysUntilFriday);
    const maxDate = new Date();
    maxDate.setDate(today.getDate() + 90);
    while (current <= maxDate) {
      weekends.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 7);
    }
    return weekends;
  }

  /**
   * Mock availability probe.
   * PRODUCTION: replace this with a real Travel API fetch (RapidAPI / Booking.com / etc.)
   * Expected return shape: { available: boolean, rate: number|null }
   */
  async fetchExternalRoomStatus(propertyId, checkInDate, lengthOfStay = 1) {
    await new Promise(r => setTimeout(r, 20 + Math.random() * 30));
    if (propertyId === 'prop_klr' && lengthOfStay === 1) {
      return { available: false, rate: null };
    }
    const seed = propertyId.charCodeAt(propertyId.length - 1) + checkInDate.charCodeAt(8);
    const available = (seed + Math.random() * 10) > 3;
    return { available, rate: available ? 220 + Math.floor(Math.random() * 180) : null };
  }

  async executionPass(compSet) {
    const set = compSet || this.defaultCompSet;
    const datesToScan = this.getUpcomingWeekends();
    const finalReport = {
      lastUpdated: new Date().toISOString(),
      compSet: set,
      timeline: []
    };

    for (const date of datesToScan) {
      const compSetResults = [];
      let soldOutCount = 0;
      let previousRates = this._getPreviousRates(date);

      for (const competitor of set) {
        let probe = await this.fetchExternalRoomStatus(competitor.id, date, 1);
        let status = 'Available';
        let rate = probe.rate;

        if (!probe.available) {
          const losProbe = await this.fetchExternalRoomStatus(competitor.id, date, 2);
          if (losProbe.available) {
            status = '1-Night Blocked (2-Night Minimum Enforced)';
            rate = losProbe.rate;
          } else {
            status = 'Sold Out';
            soldOutCount++;
          }
        }

        const prevRate = previousRates[competitor.id] || null;
        const rateDropPct = (prevRate && rate)
          ? Math.round(((prevRate - rate) / prevRate) * 100)
          : null;

        compSetResults.push({
          id: competitor.id,
          name: competitor.name,
          status,
          currentRate: rate,
          previousRate: prevRate,
          rateDropPct
        });
      }

      const mockRegionalOccupancy = 62 + Math.floor(Math.random() * 34);

      finalReport.timeline.push({
        date,
        layer1_core_summary: `${soldOutCount}/${set.length} Sold Out`,
        layer1_available: set.length - soldOutCount,
        layer1_total: set.length,
        layer2_regional_compression: mockRegionalOccupancy,
        competitors: compSetResults
      });
    }

    localStorage.setItem(this.CACHE_KEY, JSON.stringify(finalReport));
    return finalReport;
  }

  getDashboardData() {
    const raw = localStorage.getItem(this.CACHE_KEY);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) { return null; }
    }
    return null;
  }

  _getPreviousRates(date) {
    const cached = this.getDashboardData();
    if (!cached) return {};
    const block = cached.timeline.find(t => t.date === date);
    if (!block) return {};
    const map = {};
    block.competitors.forEach(c => { if (c.currentRate) map[c.id] = c.currentRate; });
    return map;
  }

  isCacheStale() {
    const data = this.getDashboardData();
    if (!data) return true;
    const age = Date.now() - new Date(data.lastUpdated).getTime();
    return age > 24 * 60 * 60 * 1000;
  }

  saveCompSet(compSet) {
    localStorage.setItem('acl_compset', JSON.stringify(compSet));
  }

  loadCompSet() {
    const raw = localStorage.getItem('acl_compset');
    if (raw) { try { return JSON.parse(raw); } catch (e) {} }
    return this.defaultCompSet;
  }

  saveSettings(settings) {
    localStorage.setItem('acl_scanner_settings', JSON.stringify(settings));
  }

  loadSettings() {
    const raw = localStorage.getItem('acl_scanner_settings');
    if (raw) { try { return JSON.parse(raw); } catch (e) {} }
    return { rateDropThreshold: 15, squeezeThreshold: 80, cloudbedsUrl: '' };
  }
}

window.MarketScanner = MarketScanner;

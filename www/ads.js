// Navigation fixes for the native app (run everywhere, harmless in a browser).
(function () {
  var back = document.getElementById('back');
  // Call back() directly; history.back() is unreliable here because iframe loads add history entries.
  if (back && typeof window.back === 'function') back.onclick = function () { window.back(); };
  var cap = window.Capacitor;
  var App = cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.App;
  if (App) {
    // Android back button: leave the open game, otherwise exit the app.
    App.addListener('backButton', function () {
      var fr = document.getElementById('fr');
      if (fr && !fr.hidden && typeof window.back === 'function') window.back();
      else App.exitApp();
    });
  }
})();

// AdMob integration: bottom banner + occasional interstitial at natural breaks.
// Only runs inside the native Android app; does nothing in a normal browser.
(function () {
  var cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;
  var AdMob = cap.Plugins && cap.Plugins.AdMob;
  if (!AdMob) return;

  fetch('admob.config.json').then(function (r) { return r.json(); }).then(start).catch(function (e) {
    console.warn('Ads disabled:', e);
  });

  async function start(cfg) {
    var testing = !!cfg.testMode;

    // 1) Consent (GDPR/UK/US-state rules) via Google's UMP form, when required.
    try {
      var info = await AdMob.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === 'REQUIRED') await AdMob.showConsentForm();
    } catch (e) { console.warn('Consent step skipped:', e); }

    // 2) Initialise SDK.
    try { await AdMob.initialize({ initializeForTesting: testing }); } catch (e) { return; }

    // 3) Banner pinned to the bottom; push page content up so nothing is hidden.
    AdMob.addListener('bannerAdSizeChanged', function (size) {
      document.documentElement.style.setProperty('--ad-h', (size && size.height ? size.height : 0) + 'px');
      document.body.classList.toggle('has-ad', !!(size && size.height));
    });
    try {
      await AdMob.showBanner({
        adId: cfg.bannerId, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER', margin: 0, isTesting: testing
      });
    } catch (e) { console.warn('Banner failed:', e); }

    // 4) Interstitial: only at natural breaks, with a cooldown, never at launch.
    var ready = false, lastShown = Date.now(), cooldown = (cfg.interstitialCooldownSeconds || 180) * 1000;
    async function prepare() {
      try { await AdMob.prepareInterstitial({ adId: cfg.interstitialId, isTesting: testing }); ready = true; }
      catch (e) { ready = false; setTimeout(prepare, 60000); }
    }
    AdMob.addListener('interstitialAdDismissed', function () { ready = false; lastShown = Date.now(); prepare(); });
    AdMob.addListener('interstitialAdFailedToLoad', function () { ready = false; setTimeout(prepare, 60000); });
    prepare();

    // Natural breaks in War Room: leaving a game (Main page button / Android back) and
    // "Play again" inside any game. index.html calls window.wrBreak() for each of these.
    window.wrBreak = function () {
      if (ready && Date.now() - lastShown > cooldown) {
        setTimeout(function () { AdMob.showInterstitial().catch(function () {}); }, 400);
      }
    };
  }
})();

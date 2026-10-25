// Works out which browser and OS this is, so the install help can show the right steps.
// Opera GX identifies itself in the newer "client hints" brand list; older builds only say "OPR/".

export function detectBrowser(ua = navigator.userAgent || '', uaData = navigator.userAgentData) {
  const brands = (uaData && Array.isArray(uaData.brands) ? uaData.brands : []).map((b) => b.brand);
  const touchMac = /Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1;
  let os = 'other';
  if (/Android/i.test(ua)) os = 'android';
  else if (/iPhone|iPad|iPod/i.test(ua) || touchMac) os = 'ios';
  else if (/Windows/i.test(ua)) os = 'windows';
  else if (/CrOS/.test(ua)) os = 'chromeos';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'mac';
  else if (/Linux/i.test(ua)) os = 'linux';

  let name = 'other';
  if (brands.includes('Opera GX') || /\bOPX\/|Opera GX/i.test(ua)) name = 'opera-gx';
  else if (brands.includes('Opera') || /\bOPR\/|\bOPiOS\/|\bOpera\b/.test(ua)) name = 'opera';
  else if (brands.includes('Microsoft Edge') || /\bEdg(A|iOS)?\//.test(ua)) name = 'edge';
  else if (/SamsungBrowser\//.test(ua)) name = 'samsung';
  else if (/Firefox\/|FxiOS\//.test(ua)) name = 'firefox';
  else if (brands.includes('Brave')) name = 'brave';
  else if (brands.includes('Google Chrome') || /\bCriOS\//.test(ua)) name = 'chrome';
  else if (/Chrome\//.test(ua) && !/Chromium\//.test(ua) && !brands.includes('Chromium')) name = 'chrome';
  else if (/Safari\//.test(ua) && /Version\//.test(ua) && !/Chrome\//.test(ua)) name = 'safari';
  else if (/Chrome\/|Chromium\//.test(ua) || brands.includes('Chromium')) name = 'chromium';

  const NAMES = {
    'opera-gx': 'Opera GX', opera: 'Opera (or Opera GX)', edge: 'Microsoft Edge', samsung: 'Samsung Internet',
    firefox: 'Firefox', brave: 'Brave', chrome: 'Google Chrome', safari: 'Safari', chromium: 'a Chromium-based browser', other: 'an unknown browser',
  };
  const OS = { android: 'Android', ios: 'iPhone/iPad', windows: 'Windows', mac: 'macOS', chromeos: 'ChromeOS', linux: 'Linux', other: 'an unknown system' };
  return { name, os, mobile: os === 'android' || os === 'ios', label: `${NAMES[name]} on ${OS[os]}` };
}

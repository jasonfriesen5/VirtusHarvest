/**
 * Turns a raw user-agent string into something a farmer recognises as one of
 * their own devices. Deliberately coarse: UA strings are unreliable and
 * spoofable, so this aims for "which of my devices is that" rather than
 * precise version reporting.
 */
export function describeDevice(ua: string | null): { device: string; browser: string } {
  if (!ua) return { device: 'Unknown device', browser: '' };

  const device = /iPhone/i.test(ua)
    ? 'iPhone'
    : /iPad/i.test(ua)
      ? 'iPad'
      : /Android/i.test(ua)
        ? 'Android'
        : /Macintosh|Mac OS X/i.test(ua)
          ? 'Mac'
          : /Windows/i.test(ua)
            ? 'Windows PC'
            : /Linux/i.test(ua)
              ? 'Linux'
              : 'Unknown device';

  // Order matters: Edge and Chrome both claim "Safari", and Chrome on iOS
  // calls itself CriOS. Checking the most specific marker first avoids
  // labelling every browser Safari.
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /CriOS|Chrome\//i.test(ua)
      ? 'Chrome'
      : /FxiOS|Firefox\//i.test(ua)
        ? 'Firefox'
        : /Safari\//i.test(ua)
          ? 'Safari'
          : '';

  return { device, browser };
}

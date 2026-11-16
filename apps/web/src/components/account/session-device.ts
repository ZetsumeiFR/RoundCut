// Order matters: Edge and Opera user agents also contain "Chrome", and
// Chrome's contains "Safari".
const BROWSERS = [
  { name: "Edge", pattern: /Edg(e|A|iOS)?\//u },
  { name: "Opera", pattern: /OPR\//u },
  { name: "Firefox", pattern: /(Firefox|FxiOS)\//u },
  { name: "Chrome", pattern: /(Chrome|CriOS)\//u },
  { name: "Safari", pattern: /Safari\//u },
] as const;

const OPERATING_SYSTEMS = [
  { name: "iOS", pattern: /iPhone|iPad|iPod/u },
  { name: "Android", pattern: /Android/u },
  { name: "Windows", pattern: /Windows/u },
  { name: "macOS", pattern: /Mac OS X|Macintosh/u },
  { name: "ChromeOS", pattern: /CrOS/u },
  { name: "Linux", pattern: /Linux/u },
] as const;

const MOBILE_PATTERN = /Mobi|iPhone|iPod|Android/u;

export interface SessionDevice {
  browser: string | null;
  mobile: boolean;
  os: string | null;
}

export function parseSessionDevice(
  userAgent: string | null | undefined
): SessionDevice {
  if (!userAgent) {
    return { browser: null, mobile: false, os: null };
  }
  return {
    browser:
      BROWSERS.find(({ pattern }) => pattern.test(userAgent))?.name ?? null,
    mobile: MOBILE_PATTERN.test(userAgent),
    os:
      OPERATING_SYSTEMS.find(({ pattern }) => pattern.test(userAgent))?.name ??
      null,
  };
}

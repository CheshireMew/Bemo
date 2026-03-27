type WebDavProviderProfile = {
  id: string;
  matchHostnames: string[];
  placeholderUrl: string;
  hint: string;
  normalizeRootUrl?: (url: URL) => string;
};

const GENERIC_WEBDAV_PLACEHOLDER = 'https://your-webdav.example.com/dav';
const GENERIC_WEBDAV_HINT = '请填写可直接访问的 WebDAV 根地址；如果服务商要求固定子路径，请填写完整地址。';

const PROVIDER_PROFILES: WebDavProviderProfile[] = [
  {
    id: 'jianguoyun',
    matchHostnames: ['dav.jianguoyun.com'],
    placeholderUrl: 'https://dav.jianguoyun.com/dav',
    hint: '如使用坚果云，请填写 https://dav.jianguoyun.com/dav，不要只填域名根路径。',
    normalizeRootUrl(url) {
      if (url.pathname === '' || url.pathname === '/') {
        url.pathname = '/dav';
      }
      return url.toString().replace(/\/$/, '');
    },
  },
];

function matchProviderByHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return null;
  return PROVIDER_PROFILES.find((profile) => profile.matchHostnames.includes(normalized)) || null;
}

function matchProviderByUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    return matchProviderByHostname(parsed.hostname);
  } catch {
    return null;
  }
}

export function normalizeWebDavProviderRoot(url: string) {
  try {
    const parsed = new URL(url);
    const profile = matchProviderByHostname(parsed.hostname);
    if (!profile?.normalizeRootUrl) {
      return url;
    }
    return profile.normalizeRootUrl(parsed);
  } catch {
    return url;
  }
}

export function getWebDavUrlPlaceholder(url = '') {
  return matchProviderByUrl(url)?.placeholderUrl || GENERIC_WEBDAV_PLACEHOLDER;
}

export function getWebDavProviderHint(url = '') {
  return matchProviderByUrl(url)?.hint || GENERIC_WEBDAV_HINT;
}

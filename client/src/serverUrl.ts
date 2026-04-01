function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function getServerBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL?.trim();
  if (fromEnv) {
    return trimTrailingSlash(fromEnv);
  }

  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const host = window.location.hostname || 'localhost';
    return `${protocol}//${host}:3001`;
  }

  return 'http://localhost:3001';
}

export function buildServerApiUrl(pathname: string): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${getServerBaseUrl()}${normalizedPath}`;
}

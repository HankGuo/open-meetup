function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function getServerBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL?.trim();
  if (fromEnv) {
    return trimTrailingSlash(fromEnv);
  }

  if (typeof window !== 'undefined') {
    // 开发模式经 Vite 代理转发到服务端，保持与生产同源行为一致；
    // 需要直连时可用 VITE_SERVER_URL 覆盖
    return trimTrailingSlash(window.location.origin);
  }

  return 'http://localhost:3001';
}

export function buildServerApiUrl(pathname: string): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${getServerBaseUrl()}${normalizedPath}`;
}

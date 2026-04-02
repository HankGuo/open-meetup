import { MeetingPageKind, MeetingPageTheme } from './types';

export interface MeetingPageKindConfig {
  kind: MeetingPageKind;
  theme: MeetingPageTheme;
}

const PAGE_KIND_CONFIG_MAP: Record<MeetingPageKind, MeetingPageKindConfig> = {
  canvas: {
    kind: 'canvas',
    theme: 1,
  },
  showcase: {
    kind: 'showcase',
    theme: 3,
  },
};

export function getPageKindConfig(kind: unknown): MeetingPageKindConfig | null {
  if (kind === 'canvas' || kind === 'showcase') {
    return PAGE_KIND_CONFIG_MAP[kind];
  }
  return null;
}

export function isThemeAllowedForPageKind(kind: MeetingPageKind, theme: MeetingPageTheme): boolean {
  const config = PAGE_KIND_CONFIG_MAP[kind];
  return config.theme === theme;
}

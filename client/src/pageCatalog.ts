import { MeetingPageDefinition, MeetingPageKind, MeetingPageTheme, PageSubmissionMode } from './types';

export interface MeetingPageKindConfig {
  kind: MeetingPageKind;
  theme: MeetingPageTheme;
  defaultTitle: string;
}

const PAGE_KIND_CONFIG_MAP: Record<MeetingPageKind, MeetingPageKindConfig> = {
  canvas: {
    kind: 'canvas',
    theme: 1,
    defaultTitle: '自由画布',
  },
  showcase: {
    kind: 'showcase',
    theme: 3,
    defaultTitle: '互动页',
  },
};

export function getPageKindConfig(kind: MeetingPageKind): MeetingPageKindConfig {
  return PAGE_KIND_CONFIG_MAP[kind];
}

export function getDefaultPageTitle(kind: MeetingPageKind): string {
  return PAGE_KIND_CONFIG_MAP[kind].defaultTitle;
}

export function resolveShowcaseSubmissionMode(value: unknown): PageSubmissionMode {
  return value === 'image' ? 'image' : 'url';
}

export function resolveShowcaseRankingEnabled(value: unknown): boolean {
  return value !== false;
}

export function normalizePageTitle(
  rawTitle: string | undefined,
  kind: MeetingPageKind,
  orderNumber: number,
): string {
  const trimmed = rawTitle?.trim().slice(0, 64) ?? '';
  if (trimmed) {
    return trimmed;
  }
  return `${getDefaultPageTitle(kind)} ${orderNumber}`;
}

export function isShowcasePage(page: MeetingPageDefinition): page is MeetingPageDefinition & {
  kind: 'showcase';
  submissionMode?: PageSubmissionMode;
  rankingEnabled?: boolean;
} {
  return page.kind === 'showcase';
}

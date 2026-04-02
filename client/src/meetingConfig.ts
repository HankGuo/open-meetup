import { MeetingPageDefinition, MeetingPageKind, PageSubmissionMode } from './types';
import {
  getPageKindConfig,
  normalizePageTitle,
  resolveShowcaseRankingEnabled,
  resolveShowcaseSubmissionMode,
} from './pageCatalog';

export function createDefaultMeetingPages(): MeetingPageDefinition[] {
  return [];
}

interface PageCreateOptions {
  submissionMode?: PageSubmissionMode;
  rankingEnabled?: boolean;
  title?: string;
}

export function createNewPage(
  kind: MeetingPageKind,
  orderNumber: number,
  options?: PageCreateOptions,
): MeetingPageDefinition {
  const baseConfig = getPageKindConfig(kind);
  const title = normalizePageTitle(options?.title, kind, orderNumber);

  if (kind === 'showcase') {
    const submissionMode = resolveShowcaseSubmissionMode(options?.submissionMode);
    const rankingEnabled = resolveShowcaseRankingEnabled(options?.rankingEnabled);
    return {
      id: createPageId(),
      kind: 'showcase',
      theme: baseConfig.theme,
      title,
      submissionMode,
      rankingEnabled,
    };
  }
  return {
    id: createPageId(),
    kind: 'canvas',
    theme: baseConfig.theme,
    title,
  };
}

function createPageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `page-${crypto.randomUUID()}`;
  }
  return `page-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

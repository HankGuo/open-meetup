import { MeetingPageDefinition, MeetingPageKind, PageSubmissionMode } from './types';

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
  if (kind === 'showcase') {
    const submissionMode = options?.submissionMode ?? 'url';
    const rankingEnabled = options?.rankingEnabled ?? true;
    const customTitle = options?.title?.trim().slice(0, 64);
    return {
      id: createPageId(),
      kind: 'showcase',
      theme: 3,
      title: customTitle || `互动页 ${orderNumber}`,
      submissionMode,
      rankingEnabled,
    };
  }
  return {
    id: createPageId(),
    kind: 'canvas',
    theme: 1,
    title: options?.title?.trim().slice(0, 64) || `自由画布 ${orderNumber}`,
  };
}

function createPageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `page-${crypto.randomUUID()}`;
  }
  return `page-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

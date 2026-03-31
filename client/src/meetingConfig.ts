import { MeetingPageDefinition, MeetingPageKind } from './types';

export function createDefaultMeetingPages(): MeetingPageDefinition[] {
  return [];
}

export function createNewPage(kind: MeetingPageKind, orderNumber: number): MeetingPageDefinition {
  if (kind === 'selfIntro') {
    return {
      id: createPageId(),
      kind: 'selfIntro',
      theme: 2,
      title: `自我介绍名牌广场 ${orderNumber}`,
    };
  }
  if (kind === 'showcase') {
    return {
      id: createPageId(),
      kind: 'showcase',
      theme: 3,
      title: `作品展示陈列区 ${orderNumber}`,
    };
  }
  return {
    id: createPageId(),
    kind: 'canvas',
    theme: 1,
    title: `自由画布 ${orderNumber}`,
  };
}

function createPageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `page-${crypto.randomUUID()}`;
  }
  return `page-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

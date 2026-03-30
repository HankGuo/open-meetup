import { randomUUID } from 'crypto';
import { MeetingPageDefinition, MeetingPageKind, MeetingPageTheme } from './types';

const DEFAULT_PAGE_BLUEPRINTS: Array<{
  theme: MeetingPageTheme;
  kind: MeetingPageKind;
  title: string;
}> = [
  { theme: 1, kind: 'canvas', title: '自由画布 A' },
  { theme: 2, kind: 'selfIntro', title: '自我介绍名牌广场' },
  { theme: 1, kind: 'canvas', title: '自由画布 B' },
  { theme: 1, kind: 'canvas', title: '自由画布 C' },
  { theme: 3, kind: 'showcase', title: '作品展示陈列区' },
  { theme: 1, kind: 'canvas', title: '自由画布 D' },
];

export const MAX_MEETING_PAGES = 30;

export function createDefaultMeetingPages(): MeetingPageDefinition[] {
  return DEFAULT_PAGE_BLUEPRINTS.map((page) => ({
    ...page,
    id: `page-${randomUUID()}`,
  }));
}

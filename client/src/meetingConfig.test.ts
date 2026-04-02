import { describe, expect, it } from 'vitest';
import { createNewPage } from './meetingConfig';

describe('createNewPage', () => {
  it('应创建自由画布页并应用默认标题', () => {
    const page = createNewPage('canvas', 1);

    expect(page.kind).toBe('canvas');
    expect(page.theme).toBe(1);
    expect(page.title).toBe('自由画布 1');
    expect(page.id.startsWith('page-')).toBe(true);
  });

  it('应创建互动页并应用提交模式与排名配置', () => {
    const page = createNewPage('showcase', 3, {
      submissionMode: 'image',
      rankingEnabled: false,
      title: '  互动展示  ',
    });

    expect(page.kind).toBe('showcase');
    expect(page.theme).toBe(3);
    expect(page.title).toBe('互动展示');
    expect(page.submissionMode).toBe('image');
    expect(page.rankingEnabled).toBe(false);
  });

  it('互动页未传配置时应使用默认值', () => {
    const page = createNewPage('showcase', 2);

    expect(page.title).toBe('互动页 2');
    expect(page.submissionMode).toBe('url');
    expect(page.rankingEnabled).toBe(true);
  });
});

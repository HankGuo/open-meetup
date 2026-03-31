import { useEffect, useState } from 'react';
import {
  GripVertical,
  Image as ImageIcon,
  LayoutGrid,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { useMeeting } from '../context/MeetingContext';
import { createNewPage } from '../meetingConfig';
import { MeetingPageDefinition, MeetingPageKind } from '../types';
import { PageEditor } from './PageEditor';

interface HostSetupBoardProps {
  defaultSelectedPageId?: string | null;
}

export function HostSetupBoard({ defaultSelectedPageId }: HostSetupBoardProps) {
  const { pages, updatePages, startLive, isConnected } = useMeeting();
  const [draftPages, setDraftPages] = useState<MeetingPageDefinition[]>(pages);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [draggingPageId, setDraggingPageId] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);

  useEffect(() => {
    setDraftPages(pages);
  }, [pages]);

  useEffect(() => {
    if (defaultSelectedPageId && pages.some((page) => page.id === defaultSelectedPageId)) {
      setSelectedPageId(defaultSelectedPageId);
      return;
    }
    if (!selectedPageId || !pages.some((page) => page.id === selectedPageId)) {
      setSelectedPageId(pages[0]?.id ?? null);
    }
  }, [defaultSelectedPageId, pages, selectedPageId]);

  const editingIndex = editingPageId ? draftPages.findIndex((page) => page.id === editingPageId) : -1;
  const editingPage = editingIndex >= 0 ? draftPages[editingIndex] : null;

  async function commitPages(nextPages: MeetingPageDefinition[]) {
    setDraftPages(nextPages);
    setSaving(true);
    const success = await updatePages(nextPages);
    setSaving(false);
    if (!success) {
      setDraftPages(pages);
    }
  }

  function reorderPages(list: MeetingPageDefinition[], fromId: string, toId: string): MeetingPageDefinition[] {
    if (fromId === toId) {
      return list;
    }

    const fromIndex = list.findIndex((page) => page.id === fromId);
    const toIndex = list.findIndex((page) => page.id === toId);
    if (fromIndex < 0 || toIndex < 0) {
      return list;
    }

    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  }

  async function handleDrop(targetPageId: string) {
    const sourcePageId = draggingPageId;
    setDraggingPageId(null);
    if (!sourcePageId) {
      return;
    }
    const reordered = reorderPages(draftPages, sourcePageId, targetPageId);
    if (reordered === draftPages) {
      return;
    }
    await commitPages(reordered);
  }

  async function handleAddPage(kind: MeetingPageKind) {
    const sameKindCount = draftPages.filter((page) => page.kind === kind).length;
    const newPage = createNewPage(kind, sameKindCount + 1);
    await commitPages([...draftPages, newPage]);
    setSelectedPageId(newPage.id);
  }

  async function handleRemovePage(pageId: string) {
    const nextPages = draftPages.filter((page) => page.id !== pageId);
    setEditingPageId((current) => (current === pageId ? null : current));
    setSelectedPageId((current) => {
      if (current !== pageId) {
        return current;
      }
      return nextPages[0]?.id ?? null;
    });
    await commitPages(nextPages);
  }

  async function handleStartLive() {
    if (!confirm('确认进入播放环节？进入后将禁止继续编辑页面。')) {
      return;
    }
    setStarting(true);
    await startLive();
    setStarting(false);
  }

  return (
    <div className="page-enter h-full w-full overflow-hidden text-[var(--text)]">
      <div className="mx-auto flex h-full w-full max-w-[1480px] flex-col px-3 pb-4 pt-4 md:px-5">
        <div className="glass-panel flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-[var(--primary)]">
              <Sparkles className="h-3.5 w-3.5" />
              SETUP STAGE
            </div>
            <h2 className="mt-2 text-xl font-semibold">页面编排台</h2>
            <p className="mt-1 text-sm text-[var(--text-soft)]">
              当前不预置任何页面，请按需新增。拖拽可调顺序，点击卡片可进入编辑。
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="status-pill">{saving ? '同步中...' : `共 ${draftPages.length} 页`}</span>
            <button
              type="button"
              onClick={handleStartLive}
              disabled={starting || saving || !isConnected || draftPages.length === 0}
              className="btn-base btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {starting ? '进入中...' : '确认并开始播放'}
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
          <button
            type="button"
            onClick={() => void handleAddPage('canvas')}
            disabled={saving}
            className="btn-base tone-btn tone-btn--canvas h-11 disabled:opacity-55"
          >
            <Plus className="h-4 w-4" />
            新增轻量自由画布
          </button>
          <button
            type="button"
            onClick={() => void handleAddPage('selfIntro')}
            disabled={saving}
            className="btn-base tone-btn tone-btn--selfintro h-11 disabled:opacity-55"
          >
            <Plus className="h-4 w-4" />
            新增名牌广场页
          </button>
          <button
            type="button"
            onClick={() => void handleAddPage('showcase')}
            disabled={saving}
            className="btn-base tone-btn tone-btn--showcase h-11 disabled:opacity-55"
          >
            <Plus className="h-4 w-4" />
            新增作品陈列页
          </button>
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 md:p-4">
          {draftPages.length === 0 ? (
            <div className="flex h-full min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--panel-soft)] px-6 text-center">
              <div className="max-w-md">
                <p className="text-sm font-semibold text-[var(--text)]">编排台为空</p>
                <p className="mt-2 text-sm text-[var(--text-soft)]">
                  当前没有任何预置页面。点击上方按钮开始搭建你的会议流程。
                </p>
              </div>
            </div>
          ) : (
            <div className="grid max-h-full grid-cols-1 gap-3 overflow-auto pr-1 sm:grid-cols-2 2xl:grid-cols-3">
              {draftPages.map((page, index) => {
                const selected = selectedPageId === page.id;
                const kindMeta = getPageKindMeta(page.kind);
                const isDragging = draggingPageId === page.id;
                return (
                  <div
                    key={page.id}
                    draggable
                    onDragStart={() => setDraggingPageId(page.id)}
                    onDragEnd={() => setDraggingPageId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => void handleDrop(page.id)}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedPageId(page.id);
                      if (page.kind === 'canvas') {
                        setEditingPageId(page.id);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') {
                        return;
                      }
                      event.preventDefault();
                      setSelectedPageId(page.id);
                      if (page.kind === 'canvas') {
                        setEditingPageId(page.id);
                      }
                    }}
                    className={`group relative w-full rounded-2xl border p-4 text-left transition ${
                      selected
                        ? `${kindMeta.selectedClass}`
                        : `${kindMeta.cardClass} hover:-translate-y-0.5 hover:brightness-105`
                    } ${isDragging ? 'opacity-45' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div
                          className={`inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${kindMeta.badgeClass}`}
                        >
                          {kindMeta.icon}
                          {kindMeta.label}
                        </div>
                        <p className="mt-2 text-xs font-medium text-[var(--text-soft)]">第 {index + 1} 页</p>
                      </div>

                      <div className="flex items-center gap-1">
                        <GripVertical className="h-4 w-4 shrink-0 text-[var(--text-soft)]" />
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleRemovePage(page.id);
                          }}
                          aria-label="删除页面"
                          className="btn-base btn-compact h-7 w-7 rounded-md border border-[var(--border)] bg-[var(--panel-light)] p-0 text-[var(--text-soft)] hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="mt-3 text-sm text-[var(--text-soft)]">{kindMeta.description}</p>

                    <div className={`mt-4 inline-flex items-center gap-1 text-xs font-medium ${kindMeta.hintClass}`}>
                      <LayoutGrid className="h-3.5 w-3.5" />
                      {page.kind === 'canvas' ? '点击进入编辑' : '固定业务页（播放态自动渲染）'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {editingPage && editingIndex >= 0 && (
        <PageEditor
          pageId={editingPage.id}
          pageIndex={editingIndex}
          onClose={() => {
            setEditingPageId(null);
          }}
        />
      )}
    </div>
  );
}

function getPageKindMeta(kind: MeetingPageKind): {
  label: string;
  description: string;
  icon: JSX.Element;
  cardClass: string;
  selectedClass: string;
  badgeClass: string;
  hintClass: string;
} {
  if (kind === 'selfIntro') {
    return {
      label: '名牌广场',
      description: '参与者信息名牌按宫格陈列，可点开查看详情。',
      icon: <Users className="h-3.5 w-3.5" />,
      cardClass: 'kind-card kind-card--selfintro',
      selectedClass: 'kind-card kind-card--selfintro-active',
      badgeClass: 'kind-badge kind-badge--selfintro',
      hintClass: 'kind-hint--selfintro',
    };
  }
  if (kind === 'showcase') {
    return {
      label: '作品陈列',
      description: '展示参与者提交的 URL 作品与一句话描述，支持全屏查看。',
      icon: <ImageIcon className="h-3.5 w-3.5" />,
      cardClass: 'kind-card kind-card--showcase',
      selectedClass: 'kind-card kind-card--showcase-active',
      badgeClass: 'kind-badge kind-badge--showcase',
      hintClass: 'kind-hint--showcase',
    };
  }
  return {
    label: '自由画布',
    description: '用于放置网页、图片、HTML 或 Markdown 内容块。',
    icon: <Pencil className="h-3.5 w-3.5" />,
    cardClass: 'kind-card kind-card--canvas',
    selectedClass: 'kind-card kind-card--canvas-active',
    badgeClass: 'kind-badge kind-badge--canvas',
    hintClass: 'kind-hint--canvas',
  };
}

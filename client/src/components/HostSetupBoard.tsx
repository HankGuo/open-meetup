import { useEffect, useState } from 'react';
import { GripVertical, LayoutGrid, Plus, Play } from 'lucide-react';
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
    <div className="h-full w-full overflow-hidden bg-slate-950 text-white">
      <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-6 pb-6 pt-6">
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Setup Stage</p>
            <h2 className="truncate text-xl font-semibold">页面编排台</h2>
            <p className="mt-1 text-sm text-slate-300">
              拖拽调整顺序，点击卡片编辑画布页。确认无误后开始播放，播放阶段将锁定编辑能力。
            </p>
          </div>
          <button
            type="button"
            onClick={handleStartLive}
            disabled={starting || saving || !isConnected || draftPages.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            {starting ? '进入中...' : '确认并开始播放'}
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
          <button
            type="button"
            onClick={() => void handleAddPage('canvas')}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-500/90 px-3 py-1.5 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            新增自由画布
          </button>
          <button
            type="button"
            onClick={() => void handleAddPage('selfIntro')}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-lg bg-teal-500/90 px-3 py-1.5 font-medium text-white hover:bg-teal-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            新增名牌广场
          </button>
          <button
            type="button"
            onClick={() => void handleAddPage('showcase')}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-lg bg-orange-500/90 px-3 py-1.5 font-medium text-white hover:bg-orange-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            新增作品陈列区
          </button>
          <span className="ml-auto text-xs text-slate-300">{saving ? '保存中...' : `共 ${draftPages.length} 页`}</span>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {draftPages.map((page, index) => {
              const cardTone =
                page.kind === 'selfIntro'
                  ? 'from-teal-500/20 to-cyan-500/10'
                  : page.kind === 'showcase'
                    ? 'from-orange-500/20 to-amber-500/10'
                    : 'from-indigo-500/20 to-blue-500/10';
              return (
                <button
                  key={page.id}
                  type="button"
                  draggable
                  onDragStart={() => setDraggingPageId(page.id)}
                  onDragEnd={() => setDraggingPageId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => void handleDrop(page.id)}
                  onClick={() => {
                    setSelectedPageId(page.id);
                    if (page.kind === 'canvas') {
                      setEditingPageId(page.id);
                    }
                  }}
                  className={`group w-full rounded-xl border bg-gradient-to-br ${cardTone} p-4 text-left transition hover:border-emerald-300/60 ${
                    selectedPageId === page.id ? 'border-emerald-300 ring-2 ring-emerald-300/50' : 'border-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-300">第 {index + 1} 页</p>
                      <p className="truncate text-base font-semibold text-white">{page.title}</p>
                      <p className="mt-1 text-xs text-slate-300">{describePageKind(page.kind)}</p>
                    </div>
                    <GripVertical className="h-4 w-4 shrink-0 text-slate-300/80" />
                  </div>
                  <div className="mt-3 inline-flex items-center gap-1 text-xs text-emerald-200">
                    <LayoutGrid className="h-3.5 w-3.5" />
                    {page.kind === 'canvas' ? '点击进入编辑' : '该页使用固定业务组件'}
                  </div>
                </button>
              );
            })}
          </div>
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

function describePageKind(kind: MeetingPageKind): string {
  if (kind === 'selfIntro') {
    return '自我介绍名牌广场';
  }
  if (kind === 'showcase') {
    return '作品展示陈列区';
  }
  return '轻量自由画布';
}

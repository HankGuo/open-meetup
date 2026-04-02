import { ChangeEvent, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  GripVertical,
  Image as ImageIcon,
  LayoutGrid,
  LogOut,
  Pencil,
  Play,
  Plus,
  Power,
  RadioTower,
  Share2,
  Sparkles,
  Ticket,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useMeeting } from '../context/MeetingContext';
import { createNewPage } from '../meetingConfig';
import { getDefaultPageTitle as getDefaultPageTitleByKind } from '../pageCatalog';
import { LayoutTemplate, MeetingPageDefinition, PageSubmissionMode } from '../types';
import { PageEditor } from './PageEditor';

interface HostSetupBoardProps {
  defaultSelectedPageId?: string | null;
  roomTitle?: string;
  shareAddress?: string;
  copiedShareAddress?: boolean;
  onCopyShareAddress?: () => void;
  ticketCode?: string;
  copiedTicket?: boolean;
  onCopyTicket?: () => void;
  onLeaveRoom?: () => void;
  onEndRoom?: () => void;
}

export function HostSetupBoard({
  defaultSelectedPageId,
  roomTitle,
  shareAddress,
  copiedShareAddress = false,
  onCopyShareAddress,
  ticketCode,
  copiedTicket = false,
  onCopyTicket,
  onLeaveRoom,
  onEndRoom,
}: HostSetupBoardProps) {
  const { pages, pageContents, updatePages, importLayoutTemplate, startLive, isConnected } = useMeeting();
  const [draftPages, setDraftPages] = useState<MeetingPageDefinition[]>(pages);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [importingTemplate, setImportingTemplate] = useState(false);
  const [draggingPageId, setDraggingPageId] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const appliedDefaultSelectionRef = useRef<string | null>(null);
  const templateFileInputRef = useRef<HTMLInputElement | null>(null);

  const [showCreateShowcaseDialog, setShowCreateShowcaseDialog] = useState(false);
  const [newShowcaseMode, setNewShowcaseMode] = useState<PageSubmissionMode>('url');
  const [newShowcaseRankingEnabled, setNewShowcaseRankingEnabled] = useState(true);
  const [newShowcaseTitle, setNewShowcaseTitle] = useState('');

  useEffect(() => {
    setDraftPages(pages);
  }, [pages]);

  useEffect(() => {
    if (
      defaultSelectedPageId &&
      defaultSelectedPageId !== appliedDefaultSelectionRef.current &&
      pages.some((page) => page.id === defaultSelectedPageId)
    ) {
      setSelectedPageId(defaultSelectedPageId);
      appliedDefaultSelectionRef.current = defaultSelectedPageId;
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

  function reorderPages(
    list: MeetingPageDefinition[],
    fromId: string,
    toId: string,
  ): MeetingPageDefinition[] {
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

  async function handleAddCanvasPage() {
    const sameKindCount = draftPages.filter((page) => page.kind === 'canvas').length;
    const newPage = createNewPage('canvas', sameKindCount + 1);
    await commitPages([...draftPages, newPage]);
    setSelectedPageId(newPage.id);
  }

  function openCreateShowcaseDialog() {
    setNewShowcaseMode('url');
    setNewShowcaseRankingEnabled(true);
    setNewShowcaseTitle('');
    setShowCreateShowcaseDialog(true);
  }

  async function handleCreateShowcasePage() {
    const sameKindCount = draftPages.filter((page) => page.kind === 'showcase').length;
    const newPage = createNewPage('showcase', sameKindCount + 1, {
      submissionMode: newShowcaseMode,
      rankingEnabled: newShowcaseRankingEnabled,
      title: newShowcaseTitle,
    });

    await commitPages([...draftPages, newPage]);
    setSelectedPageId(newPage.id);
    setShowCreateShowcaseDialog(false);
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

  async function handleRenamePageTitle(targetPage: MeetingPageDefinition, rawTitle: string) {
    const trimmed = rawTitle.trim().slice(0, 64);
    const fallbackTitle = targetPage.title.trim() || getDefaultPageTitle(targetPage);
    const nextTitle = trimmed || fallbackTitle;
    if (nextTitle === targetPage.title) {
      return;
    }

    const nextPages = draftPages.map((pageItem) => {
      if (pageItem.id !== targetPage.id) {
        return pageItem;
      }
      return {
        ...pageItem,
        title: nextTitle,
      };
    });
    await commitPages(nextPages);
  }

  async function handleStartLive() {
    setStarting(true);
    await startLive();
    setStarting(false);
  }

  function buildTemplateData(): LayoutTemplate {
    const validPageIds = new Set(draftPages.map((page) => page.id));
    const filteredContents = Array.from(pageContents.entries()).filter(([pageId]) =>
      validPageIds.has(pageId),
    );
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      pages: draftPages,
      pageContents: filteredContents,
    };
  }

  function handleExportTemplate() {
    try {
      const templateData = buildTemplateData();
      const serialized = JSON.stringify(templateData, null, 2);
      const fileBlob = new Blob([serialized], { type: 'application/json' });
      const objectUrl = URL.createObjectURL(fileBlob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.href = objectUrl;
      link.download = `open-meetup-layout-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      alert('导出编排模板失败，请重试。');
    }
  }

  function handleTriggerImportTemplate() {
    if (saving || importingTemplate) {
      return;
    }
    templateFileInputRef.current?.click();
  }

  async function handleImportTemplateFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      alert('模板文件不是有效的 JSON。');
      return;
    }

    if (!confirm('导入模板会覆盖当前编排（页面流程与页面内容），是否继续？')) {
      return;
    }

    setImportingTemplate(true);
    const success = await importLayoutTemplate(parsed as LayoutTemplate);
    setImportingTemplate(false);
    if (!success) {
      alert('导入失败：请确认模板格式正确，并且当前处于编排阶段。');
    }
  }

  const pageCountLabel = saving ? '同步中...' : `已编排 ${draftPages.length} 页`;
  const connectionLabel = isConnected ? '连接正常' : '连接中断';
  const displayTitle = roomTitle?.trim() || '未命名房间';

  return (
    <div className="page-enter h-full w-full overflow-hidden text-[var(--text)]">
      <div className="mx-auto flex h-full w-full max-w-[1480px] flex-col px-3 pb-4 pt-4 md:px-5">
        <div className="light-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-5">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-[var(--primary)]">
              <Sparkles className="h-3.5 w-3.5" />
              SETUP
            </div>
            <h2 className="mt-1.5 text-lg font-semibold text-[var(--text)]">房间编排控制台</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="status-pill max-w-[260px]">
              <span className="truncate">房间：{displayTitle}</span>
            </span>
            <span className="status-pill">{pageCountLabel}</span>
            <span className={`status-pill ${isConnected ? 'status-pill--online' : 'status-pill--offline'}`}>
              <RadioTower className="h-3.5 w-3.5" />
              {connectionLabel}
            </span>
          </div>
        </div>

        <div className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="app-card min-h-0 overflow-hidden">
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 md:px-5">
                <div>
                  <h3 className="text-base font-semibold text-[var(--text)]">页面流程</h3>
                  <p className="mt-1 text-xs text-[var(--text-soft)]">
                    核心编排区域：点击卡片编辑，拖拽调整播放顺序。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTriggerImportTemplate}
                    disabled={saving || importingTemplate}
                    className="btn-base btn-compact btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {importingTemplate ? '导入中...' : '导入模板'}
                  </button>
                  <button
                    type="button"
                    onClick={handleExportTemplate}
                    disabled={saving || importingTemplate}
                    className="btn-base btn-compact btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    导出模板
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAddCanvasPage()}
                    disabled={saving}
                    className="btn-base btn-compact btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    新增自由画布
                  </button>
                  <button
                    type="button"
                    onClick={openCreateShowcaseDialog}
                    disabled={saving}
                    className="btn-base btn-compact btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    新增互动页
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-3 md:p-4">
                {draftPages.length === 0 ? (
                  <div className="flex h-full min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--panel-soft)] px-6 text-center">
                    <div className="max-w-md">
                      <p className="text-sm font-semibold text-[var(--text)]">编排台为空</p>
                      <p className="mt-2 text-sm text-[var(--text-soft)]">
                        当前没有页面。先新增自由画布或互动页，再开始你的房间流程编排。
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 pr-1 sm:grid-cols-2 2xl:grid-cols-3">
                    {draftPages.map((page, index) => {
                      const selected = selectedPageId === page.id;
                      const pageMeta = getPageMeta(page);
                      const isDragging = draggingPageId === page.id;
                      const isShowcase = page.kind === 'showcase';
                      const modeLabel = page.submissionMode === 'image' ? '图片' : 'URL';
                      const rankingLabel = page.rankingEnabled === false ? '关闭排名' : '开启排名';
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
                          className={`group relative w-full cursor-pointer rounded-2xl border p-4 text-left transition ${
                            selected
                              ? `${pageMeta.selectedClass} shadow-[0_14px_28px_oklch(0.45_0.03_206_/_0.18)]`
                              : `${pageMeta.cardClass} hover:-translate-y-0.5 hover:shadow-[0_12px_24px_oklch(0.42_0.02_206_/_0.16)]`
                          } ${isDragging ? 'opacity-45' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--panel-light)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-soft)]">
                                  第 {index + 1} 页
                                </span>
                                <div
                                  className={`inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${pageMeta.badgeClass}`}
                                >
                                  {pageMeta.icon}
                                  {pageMeta.label}
                                </div>
                              </div>
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

                          <label className="mt-3 block">
                            <span className="mb-1 block text-[11px] font-semibold tracking-[0.08em] text-[var(--text-soft)]">
                              {isShowcase ? '互动页标题' : '自由画布标题'}
                            </span>
                            <input
                              type="text"
                              key={`${page.id}:${page.title}`}
                              defaultValue={page.title || ''}
                              autoComplete="off"
                              autoCorrect="off"
                              spellCheck={false}
                              placeholder={getDefaultPageTitle(page)}
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => event.stopPropagation()}
                              onBlur={(event) => void handleRenamePageTitle(page, event.target.value)}
                              className="app-input app-input-light h-9 px-3 text-sm"
                            />
                          </label>
                          <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">
                            {pageMeta.description}
                          </p>

                          <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            {isShowcase ? (
                              <>
                                <span className="rounded-full border border-[var(--border)] bg-[var(--panel-light)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-soft)]">
                                  上传类型：{modeLabel}
                                </span>
                                <span className="rounded-full border border-[var(--border)] bg-[var(--panel-light)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-soft)]">
                                  {rankingLabel}
                                </span>
                              </>
                            ) : (
                              <span className="rounded-full border border-[var(--border)] bg-[var(--panel-light)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-soft)]">
                                支持网页/图片/HTML/Markdown
                              </span>
                            )}
                          </div>

                          <div
                            className={`mt-4 inline-flex items-center gap-1 text-xs font-medium ${pageMeta.hintClass}`}
                          >
                            <LayoutGrid className="h-3.5 w-3.5" />
                            {page.kind === 'canvas' ? '点击进入编辑' : '播放态自动渲染（可折叠操作端）'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside className="flex min-h-0 flex-col gap-3">
            {shareAddress ? (
              <div className="app-card p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="section-title">参与者访问地址</p>
                  <Share2 className="h-4 w-4 text-[var(--accent)]" />
                </div>
                <p className="mono mt-1 break-all text-sm font-semibold text-[var(--text)]">{shareAddress}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-soft)]">
                  将这个地址发给同一局域网内的参与者即可进入房间。
                </p>
                <button
                  type="button"
                  onClick={() => onCopyShareAddress?.()}
                  disabled={!onCopyShareAddress}
                  className="btn-base btn-secondary mt-2.5 h-9 w-full rounded-lg px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {copiedShareAddress ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copiedShareAddress ? '已复制地址' : '复制访问地址'}
                </button>
              </div>
            ) : null}

            {ticketCode ? (
              <div className="app-card p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="section-title">Host Ticket</p>
                  <Ticket className="h-4 w-4 text-[var(--accent)]" />
                </div>
                <p className="mono mt-1 truncate text-sm font-semibold text-[var(--text)]">{ticketCode}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-soft)]">
                  更换浏览器或使用隐私模式时用于恢复主持人身份。
                </p>
                <button
                  type="button"
                  onClick={() => onCopyTicket?.()}
                  disabled={!onCopyTicket}
                  className="btn-base btn-secondary mt-2.5 h-9 w-full rounded-lg px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {copiedTicket ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copiedTicket ? '已复制 Ticket' : '复制 Ticket'}
                </button>
              </div>
            ) : null}

            <div className="app-card p-3.5">
              <p className="section-title">播放控制</p>
              <button
                type="button"
                onClick={handleStartLive}
                disabled={starting || saving || !isConnected || draftPages.length === 0}
                className="btn-base btn-primary mt-2 h-11 w-full disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                {starting ? '进入播放中...' : '开始播放'}
              </button>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onLeaveRoom?.()}
                  disabled={!onLeaveRoom}
                  className="btn-base btn-secondary h-10 rounded-lg px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" />
                  退出房间
                </button>
                <button
                  type="button"
                  onClick={() => onEndRoom?.()}
                  disabled={!onEndRoom}
                  className="btn-base btn-danger-soft h-10 rounded-lg px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Power className="h-4 w-4" />
                  结束房间
                </button>
              </div>

              <p className="mt-2 text-xs text-[var(--text-soft)]">
                进入播放后会锁定页面结构，仅保留翻页与互动控制。
              </p>
            </div>
          </aside>
        </div>
      </div>

      <input
        ref={templateFileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          void handleImportTemplateFile(event);
        }}
      />

      {editingPage && editingIndex >= 0 && (
        <PageEditor
          pageId={editingPage.id}
          pageIndex={editingIndex}
          onClose={() => {
            setEditingPageId(null);
          }}
        />
      )}

      {showCreateShowcaseDialog ? (
        <div
          className="dialog-overlay fixed inset-0 z-[70] flex items-center justify-center p-4"
          onClick={() => setShowCreateShowcaseDialog(false)}
        >
          <div
            className="dialog-panel w-full max-w-lg overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.08em] text-[var(--accent)]">互动页配置</p>
                <h3 className="mt-1 text-lg font-semibold text-[var(--text)]">设置上传类型与排名规则</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateShowcaseDialog(false)}
                className="btn-base btn-secondary h-9 w-9 rounded-md p-0"
                aria-label="关闭"
                title="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                  互动页标题（可自定义）
                </span>
                <input
                  type="text"
                  value={newShowcaseTitle}
                  onChange={(event) => setNewShowcaseTitle(event.target.value)}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="默认：互动页 N"
                  className="app-input app-input-light"
                />
              </label>

              <p className="mt-4 text-sm font-medium text-[var(--text)]">上传内容类型</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewShowcaseMode('url')}
                  className={`btn-base h-10 rounded-md text-sm ${newShowcaseMode === 'url' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  URL 链接
                </button>
                <button
                  type="button"
                  onClick={() => setNewShowcaseMode('image')}
                  className={`btn-base h-10 rounded-md text-sm ${newShowcaseMode === 'image' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  图片上传
                </button>
              </div>

              <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={newShowcaseRankingEnabled}
                  onChange={(event) => setNewShowcaseRankingEnabled(event.target.checked)}
                />
                开启排名（前三名显示金银铜皇冠）
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
              <button
                type="button"
                onClick={() => setShowCreateShowcaseDialog(false)}
                className="btn-base btn-secondary h-9 rounded-md px-3 text-sm"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleCreateShowcasePage()}
                disabled={saving}
                className="btn-base btn-primary h-9 rounded-md px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                确认新增
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getPageMeta(page: MeetingPageDefinition): {
  label: string;
  description: string;
  icon: JSX.Element;
  cardClass: string;
  selectedClass: string;
  badgeClass: string;
  hintClass: string;
} {
  if (page.kind === 'showcase') {
    const modeLabel = page.submissionMode === 'image' ? '图片' : 'URL';
    const rankingLabel = page.rankingEnabled === false ? '不启用排名' : '启用排名';
    return {
      label: '互动页',
      description: `参与者提交 ${modeLabel} 内容统一展示，当前${rankingLabel}。`,
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

function getDefaultPageTitle(page: MeetingPageDefinition): string {
  return getDefaultPageTitleByKind(page.kind);
}

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Trash2, Upload, X } from 'lucide-react';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useMeeting } from '../context/MeetingContext';
import { getInitialExcalidrawData } from '../excalidrawScene';
import {
  constrainElementsToViewport,
  isSupportedEmbeddableUrl,
  lockViewportAppState,
  type SceneAppState,
  type SceneElements,
} from '../utils/excalidrawHelpers';

interface PageEditorProps {
  pageId: string;
  pageIndex: number;
  onClose?: () => void;
}

type SceneFiles = ReturnType<ExcalidrawImperativeAPI['getFiles']>;

interface LatestSceneSnapshot {
  elements: SceneElements;
  appState: SceneAppState;
  files: SceneFiles;
}

const ExcalidrawCanvas = lazy(() =>
  import('@excalidraw/excalidraw').then((module) => ({ default: module.Excalidraw })),
);

export function PageEditor({ pageId, pageIndex, onClose }: PageEditorProps) {
  const { pageContents, updatePageContent, myRole } = useMeeting();
  const isHost = myRole === 'host';
  const content = pageContents.get(pageId);
  const initialData = useMemo(() => getInitialExcalidrawData(content), [content]);

  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [sceneNonce, setSceneNonce] = useState(0);

  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const latestSnapshotRef = useRef<LatestSceneSnapshot | null>(null);
  const lockingViewportRef = useRef(false);
  const enforcingBoundsRef = useRef(false);

  useEffect(() => {
    latestSnapshotRef.current = null;
    setSceneNonce((prev) => prev + 1);
  }, [pageId, pageIndex, content]);

  if (!isHost) {
    return null;
  }

  async function handleSave() {
    setEditorError(null);
    setSaving(true);

    const api = excalidrawApiRef.current;
    if (!api) {
      setSaving(false);
      setEditorError('画布尚未初始化完成，请稍后再试');
      return;
    }

    const snapshot = latestSnapshotRef.current || {
      elements: api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles(),
    };

    const normalizedAppState = lockViewportAppState(snapshot.appState);
    const normalizedElements = constrainElementsToViewport(snapshot.elements, normalizedAppState);
    const { serializeAsJSON } = await import('@excalidraw/excalidraw');
    const serializedScene = serializeAsJSON(normalizedElements, normalizedAppState, snapshot.files, 'local');

    const success = await updatePageContent(pageId, {
      type: 'canvas',
      content: serializedScene,
    });

    setSaving(false);
    if (success) {
      onClose?.();
      return;
    }
    setEditorError('保存失败，请稍后重试');
  }

  async function handleClear() {
    setSaving(true);
    const success = await updatePageContent(pageId, null);
    setSaving(false);

    if (!success) {
      setEditorError('清空失败，请稍后重试');
      return;
    }
    onClose?.();
  }

  return (
    <div className="dialog-overlay fixed inset-0 z-50 p-3 md:p-5">
      <div className="dialog-panel mx-auto flex h-full w-full max-w-[1500px] flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-4 py-3 md:px-5">
          <div>
            <p className="section-title">Canvas Editor</p>
            <h3 className="text-base font-bold text-[var(--text)] md:text-lg">
              Excalidraw 编辑器 · 第 {pageIndex + 1} 页
            </h3>
            <p className="mt-1 text-xs text-[var(--text-soft)]">
              编辑态显示网格；保存后在播放态将自动隐藏网格。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭编辑器"
            className="btn-base h-10 w-10 rounded-full border border-[var(--border)] bg-[var(--panel-light)] p-0 text-[var(--text)]"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 bg-[var(--panel-light)]">
          <Suspense
            fallback={
              <div className="flex h-full w-full items-center justify-center text-sm text-[var(--text-soft)]">
                画布加载中...
              </div>
            }
          >
            <ExcalidrawCanvas
              key={sceneNonce}
              initialData={initialData}
              gridModeEnabled={true}
              zenModeEnabled={false}
              viewModeEnabled={false}
              validateEmbeddable={isSupportedEmbeddableUrl}
              UIOptions={{
                canvasActions: {
                  changeViewBackgroundColor: true,
                  clearCanvas: false,
                  export: {},
                  loadScene: true,
                  saveToActiveFile: false,
                  saveAsImage: true,
                  toggleTheme: true,
                },
                tools: {
                  image: true,
                },
              }}
              excalidrawAPI={(api) => {
                excalidrawApiRef.current = api;
                lockEditorViewport(api, lockingViewportRef);
                const constrainedElements = enforceElementsWithinViewport(
                  api,
                  enforcingBoundsRef,
                  api.getSceneElements(),
                  api.getAppState(),
                );
                latestSnapshotRef.current = {
                  elements: [...constrainedElements],
                  appState: lockViewportAppState(api.getAppState()),
                  files: api.getFiles(),
                };
              }}
              onChange={(elements, appState, files) => {
                const normalizedAppState = lockViewportAppState(appState);
                lockEditorViewport(excalidrawApiRef.current, lockingViewportRef, appState);
                const constrainedElements = enforceElementsWithinViewport(
                  excalidrawApiRef.current,
                  enforcingBoundsRef,
                  elements,
                  normalizedAppState,
                );
                latestSnapshotRef.current = {
                  elements: [...constrainedElements],
                  appState: normalizedAppState,
                  files,
                };
              }}
            />
          </Suspense>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] bg-[var(--panel)] px-4 py-3 md:px-5">
          <button
            type="button"
            onClick={handleClear}
            disabled={saving}
            className="btn-base btn-danger-soft h-10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            清空页面
          </button>
          <div className="flex-1" />
          {editorError && <p className="text-xs text-rose-600">{editorError}</p>}
          <button type="button" onClick={onClose} className="btn-base btn-secondary h-10">
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-base btn-primary h-10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload className="h-4 w-4" />
            {saving ? '保存中...' : '保存画布'}
          </button>
        </div>
      </div>
    </div>
  );
}

function enforceElementsWithinViewport(
  api: ExcalidrawImperativeAPI | null,
  lockingRef: MutableRefObject<boolean>,
  elements: SceneElements,
  appState: SceneAppState,
): SceneElements {
  if (!api || lockingRef.current) {
    return elements;
  }

  const constrainedElements = constrainElementsToViewport(elements, appState);
  if (constrainedElements === elements) {
    return elements;
  }

  lockingRef.current = true;
  api.updateScene({
    elements: constrainedElements,
  });
  requestAnimationFrame(() => {
    lockingRef.current = false;
  });

  return constrainedElements;
}

function lockEditorViewport(
  api: ExcalidrawImperativeAPI | null,
  lockingRef: MutableRefObject<boolean>,
  currentAppState?: SceneAppState,
) {
  if (!api || lockingRef.current) {
    return;
  }

  const appState = currentAppState || api.getAppState();
  const normalized = lockViewportAppState(appState);
  if (!normalized || normalized === appState) {
    return;
  }

  lockingRef.current = true;
  api.updateScene({
    appState: normalized,
  });
  requestAnimationFrame(() => {
    lockingRef.current = false;
  });
}

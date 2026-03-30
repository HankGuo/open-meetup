import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Trash2, Upload, X } from 'lucide-react';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useMeeting } from '../context/MeetingContext';
import { getInitialExcalidrawData } from '../excalidrawScene';

interface PageEditorProps {
  pageId: string;
  pageIndex: number;
  onClose?: () => void;
}

type SceneElements = ReturnType<ExcalidrawImperativeAPI['getSceneElements']>;
type SceneAppState = ReturnType<ExcalidrawImperativeAPI['getAppState']>;
type SceneFiles = ReturnType<ExcalidrawImperativeAPI['getFiles']>;

interface LatestSceneSnapshot {
  elements: SceneElements;
  appState: SceneAppState;
  files: SceneFiles;
}

const ExcalidrawCanvas = lazy(() =>
  import('@excalidraw/excalidraw').then((module) => ({ default: module.Excalidraw })),
);

const LOCKED_SCROLL_EPSILON = 0.5;
const LOCKED_ZOOM_VALUE = 1;
const MIN_VIEWPORT_SIZE = 1;

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

    const snapshot =
      latestSnapshotRef.current || {
        elements: api.getSceneElements(),
        appState: api.getAppState(),
        files: api.getFiles(),
      };

    const normalizedAppState = lockViewportAppState(snapshot.appState);
    const normalizedElements = constrainElementsToViewport(snapshot.elements, normalizedAppState);
    const { serializeAsJSON } = await import('@excalidraw/excalidraw');
    const serializedScene = serializeAsJSON(
      normalizedElements,
      normalizedAppState,
      snapshot.files,
      'local',
    );

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
    <div className="fixed inset-0 z-50 bg-black/50 p-4">
      <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="text-base font-bold text-slate-900">Excalidraw 画布编辑器 · 第 {pageIndex + 1} 页</h3>
          <button onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 bg-slate-100">
          <Suspense
            fallback={
              <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">画布加载中...</div>
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

        <div className="flex items-center gap-3 border-t bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={handleClear}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            清空页面
          </button>
          <div className="flex-1" />
          {editorError && <p className="text-xs text-rose-600">{editorError}</p>}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-200"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload className="h-4 w-4" />
            {saving ? '保存中...' : '保存画布'}
          </button>
        </div>
      </div>
    </div>
  );
}

function lockViewportAppState<T extends { scrollX: number; scrollY: number; zoom: { value: number } }>(appState: T): T;
function lockViewportAppState(appState: null | undefined): undefined;
function lockViewportAppState<T extends { scrollX: number; scrollY: number; zoom: { value: number } }>(
  appState: T | null | undefined,
): T | undefined {
  if (!appState) {
    return undefined;
  }

  const shouldLock =
    Math.abs(appState.scrollX) > LOCKED_SCROLL_EPSILON ||
    Math.abs(appState.scrollY) > LOCKED_SCROLL_EPSILON ||
    Math.abs(appState.zoom.value - LOCKED_ZOOM_VALUE) > 0.001;

  if (!shouldLock) {
    return appState;
  }

  return {
    ...appState,
    scrollX: 0,
    scrollY: 0,
    zoom: { value: LOCKED_ZOOM_VALUE as T['zoom']['value'] },
  };
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

function constrainElementsToViewport(elements: SceneElements, appState: SceneAppState): SceneElements {
  const viewportWidth = Math.floor(appState.width);
  const viewportHeight = Math.floor(appState.height);
  if (
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight) ||
    viewportWidth < MIN_VIEWPORT_SIZE ||
    viewportHeight < MIN_VIEWPORT_SIZE
  ) {
    return elements;
  }

  let changed = false;
  const constrained = elements.map((element) => {
    if (element.isDeleted) {
      return element;
    }

    const elementWidth = Math.max(0, Math.abs(element.width ?? 0));
    const elementHeight = Math.max(0, Math.abs(element.height ?? 0));
    const maxX = Math.max(0, viewportWidth - elementWidth);
    const maxY = Math.max(0, viewportHeight - elementHeight);

    const clampedX = clampNumber(element.x, 0, maxX);
    const clampedY = clampNumber(element.y, 0, maxY);
    if (clampedX === element.x && clampedY === element.y) {
      return element;
    }

    changed = true;
    return {
      ...element,
      x: clampedX,
      y: clampedY,
    };
  }) as SceneElements;

  return changed ? constrained : elements;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function isSupportedEmbeddableUrl(link: string): boolean {
  try {
    const parsed = new URL(link);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
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

import { useState } from 'react';
import { FileArchive, Layers, Link2, Pencil, PlusSquare, Replace } from 'lucide-react';
import { TemplatePreview } from '../utils/templateIO';

export type TemplateImportMode = 'merge' | 'replace';

interface TemplateImportDialogProps {
  fileName: string;
  preview: TemplatePreview;
  currentPageCount: number;
  /** 非空表示正在上传素材 */
  progress: { done: number; total: number } | null;
  error: string | null;
  onConfirm: (mode: TemplateImportMode) => void;
  onCancel: () => void;
}

export function TemplateImportDialog({
  fileName,
  preview,
  currentPageCount,
  progress,
  error,
  onConfirm,
  onCancel,
}: TemplateImportDialogProps) {
  const [mode, setMode] = useState<TemplateImportMode>(currentPageCount === 0 ? 'replace' : 'merge');
  const busy = progress !== null;
  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;

  return (
    <div
      className="dialog-overlay fixed inset-0 z-[71] flex items-center justify-center p-4"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="dialog-panel flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--border)] px-5 py-4">
          <p className="text-xs font-semibold tracking-[0.08em] text-[var(--accent)]">导入模板</p>
          <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
            <FileArchive className="h-5 w-5 text-[var(--text-soft)]" />
            <span className="truncate">{preview.name || fileName}</span>
          </h3>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <StatChip label="总页数" value={preview.pageCount} />
            <StatChip
              label="自由画布"
              value={preview.canvasCount}
              icon={<Pencil className="h-3.5 w-3.5" />}
            />
            <StatChip label="互动页" value={preview.showcaseCount} icon={<Link2 className="h-3.5 w-3.5" />} />
            <StatChip label="素材文件" value={preview.assetCount} icon={<Layers className="h-3.5 w-3.5" />} />
          </div>

          {preview.exportedAt ? (
            <p className="mt-2 text-xs text-[var(--text-soft)]">
              导出时间：{new Date(preview.exportedAt).toLocaleString()}
            </p>
          ) : null}

          <p className="mt-5 text-sm font-semibold text-[var(--text)]">选择导入方式</p>
          <div className="mt-2 grid gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setMode('merge')}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed ${
                mode === 'merge'
                  ? 'border-[var(--primary)] bg-[var(--panel-soft)] ring-1 ring-[var(--primary)]/40'
                  : 'border-[var(--border)] hover:border-[var(--primary)]/45'
              }`}
            >
              <PlusSquare className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
              <span>
                <span className="block text-sm font-semibold text-[var(--text)]">合并到当前编排（推荐）</span>
                <span className="mt-0.5 block text-xs leading-5 text-[var(--text-soft)]">
                  模板页面追加到现有 {currentPageCount} 页之后，已有页面与内容保持不变。
                </span>
              </span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setMode('replace')}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed ${
                mode === 'replace'
                  ? 'border-rose-400 bg-rose-50/70 ring-1 ring-rose-300/50'
                  : 'border-[var(--border)] hover:border-rose-300'
              }`}
            >
              <Replace className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <span>
                <span className="block text-sm font-semibold text-[var(--text)]">替换当前编排</span>
                <span className="mt-0.5 block text-xs leading-5 text-[var(--text-soft)]">
                  清空当前 {currentPageCount} 页后重新开始，现有页面内容会被移除。建议先导出备份。
                </span>
              </span>
            </button>
          </div>

          {busy ? (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-[var(--text-soft)]">
                <span>{progress.total > 0 ? '正在上传模板素材...' : '正在解析模板...'}</span>
                {progress.total > 0 ? (
                  <span>
                    {progress.done}/{progress.total}
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--panel-soft)]">
                <div
                  className="h-full rounded-full bg-[var(--primary)] transition-all"
                  style={{ width: `${percent ?? 8}%` }}
                />
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="btn-base btn-secondary h-9 rounded-md px-3 text-sm"
            disabled={busy}
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm(mode)}
            className={`btn-base h-9 rounded-md px-4 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
              mode === 'replace' ? 'btn-danger-soft' : 'btn-primary'
            }`}
            disabled={busy}
          >
            {busy ? '导入中...' : mode === 'merge' ? '确认合并' : '确认替换'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatChip({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2">
      <p className="flex items-center gap-1 text-[11px] text-[var(--text-soft)]">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 text-lg font-bold text-[var(--text)]">{value}</p>
    </div>
  );
}

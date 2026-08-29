import { Download, FileArchive, Trash2 } from 'lucide-react';
import { StoredTemplate } from '../utils/templateLibrary';
import { formatBytes } from '../utils/templateIO';

interface TemplateLibraryDialogProps {
  templates: StoredTemplate[];
  loading: boolean;
  onApply: (template: StoredTemplate) => void;
  onDownload: (template: StoredTemplate) => void;
  onDelete: (template: StoredTemplate) => void;
  onClose: () => void;
}

export function TemplateLibraryDialog({
  templates,
  loading,
  onApply,
  onDownload,
  onDelete,
  onClose,
}: TemplateLibraryDialogProps) {
  return (
    <div
      className="dialog-overlay fixed inset-0 z-[71] flex items-start justify-center p-4 pt-[8vh]"
      onClick={onClose}
    >
      <div
        className="dialog-panel flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.08em] text-[var(--accent)]">模板库</p>
            <h3 className="mt-1 text-lg font-semibold text-[var(--text)]">最近保存的编排模板</h3>
            <p className="mt-1 text-xs text-[var(--text-soft)]">
              导出的模板会自动保存在本机浏览器中（最多 12 份），换房间、换活动可直接复用。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-base btn-secondary h-9 w-9 rounded-md p-0"
            aria-label="关闭模板库"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-[var(--text-soft)]">读取中...</p>
          ) : templates.length === 0 ? (
            <div className="py-10 text-center">
              <FileArchive className="mx-auto h-10 w-10 text-[var(--text-soft)]" />
              <p className="mt-3 text-sm font-semibold text-[var(--text)]">模板库还是空的</p>
              <p className="mt-1 text-sm text-[var(--text-soft)]">
                编排完成后点击「导出模板」，模板会自动存到这里。
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5 transition hover:border-[var(--primary)]/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--text)]">{template.name}</p>
                    <p className="mt-0.5 text-xs text-[var(--text-soft)]">
                      {template.pageCount} 页 · {template.assetCount} 素材 · {formatBytes(template.sizeBytes)}{' '}
                      · {new Date(template.savedAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onApply(template)}
                    className="btn-base btn-primary h-8 shrink-0 rounded-md px-3 text-xs"
                  >
                    应用
                  </button>
                  <button
                    type="button"
                    onClick={() => onDownload(template)}
                    className="btn-base btn-secondary h-8 w-8 shrink-0 rounded-md p-0"
                    aria-label={`下载 ${template.name}`}
                    title="导出为 ZIP 文件"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(template)}
                    className="btn-base btn-secondary h-8 w-8 shrink-0 rounded-md p-0 text-rose-600 hover:border-rose-300 hover:bg-rose-50"
                    aria-label={`删除 ${template.name}`}
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

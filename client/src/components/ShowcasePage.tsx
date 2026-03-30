import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { useMeeting } from '../context/MeetingContext';
import { User } from '../types';

export function ShowcasePage() {
  const { participants, myRole, myUserId, submitMyWork, isConnected } = useMeeting();
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedWork, setSelectedWork] = useState<User | null>(null);

  const participantWorks = useMemo(
    () =>
      participants
        .filter((participant) => participant.role === 'participant')
        .sort((a, b) => a.joinedAt - b.joinedAt),
    [participants],
  );

  const me = participantWorks.find((participant) => participant.userId === myUserId) ?? null;

  useEffect(() => {
    if (!me) {
      return;
    }
    setUrl(me.workUrl ?? '');
    setDescription(me.workDescription ?? '');
  }, [me?.userId, me?.workUrl, me?.workDescription]);

  async function handleSubmit() {
    const normalizedUrl = normalizeHttpUrl(url);
    if (!normalizedUrl) {
      setSubmitError('请输入有效的 http/https 作品链接');
      return;
    }

    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      setSubmitError('请填写一句话作品描述');
      return;
    }
    if (trimmedDescription.length > 120) {
      setSubmitError('作品描述最多 120 字');
      return;
    }

    setSubmitError(null);
    setSubmitting(true);
    const success = await submitMyWork(normalizedUrl, trimmedDescription);
    setSubmitting(false);
    if (!success) {
      setSubmitError('提交失败，请稍后重试');
    }
  }

  return (
    <div className="h-full overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="mb-6 text-center">
          <h2 className="text-3xl font-bold">作品展示</h2>
          <p className="mt-2 text-sm text-blue-100">参与者提交作品链接与一句话描述，主持人可点击作品全屏查看。</p>
        </div>

        {myRole === 'participant' && (
          <div className="mb-8 rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur">
            <h3 className="text-lg font-semibold">我的作品</h3>
            <p className="mt-1 text-xs text-blue-100">提交内容：作品 URL + 一句话描述。可反复提交覆盖更新。</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <input
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/my-project"
                className="md:col-span-2 rounded-lg border border-white/30 bg-white/90 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !isConnected}
                className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-gray-900 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-cyan-200"
              >
                {submitting ? '提交中...' : '提交作品'}
              </button>
            </div>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="一句话描述你的作品亮点"
              maxLength={120}
              className="mt-3 h-20 w-full resize-none rounded-lg border border-white/30 bg-white/90 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-blue-100">
              <span>{description.trim().length}/120</span>
              {me?.workUpdatedAt ? <span>上次提交：{new Date(me.workUpdatedAt).toLocaleString()}</span> : <span>尚未提交</span>}
            </div>
            {submitError && <p className="mt-2 text-xs text-rose-200">{submitError}</p>}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {participantWorks.map((participant) => {
            const hasWork = Boolean(participant.workUrl && participant.workDescription);
            return (
              <button
                type="button"
                key={participant.userId}
                disabled={!hasWork}
                onClick={() => hasWork && setSelectedWork(participant)}
                className={`group overflow-hidden rounded-2xl border text-left transition ${
                  hasWork
                    ? 'border-white/25 bg-white/10 hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-white/15'
                    : 'border-white/10 bg-black/20 opacity-80'
                }`}
              >
                <div className="relative h-44 bg-black/40">
                  {hasWork ? (
                    isImageUrl(participant.workUrl!) ? (
                      <img src={participant.workUrl} alt={participant.userName} className="h-full w-full object-cover" />
                    ) : (
                      <iframe
                        src={participant.workUrl}
                        title={`${participant.userName}-work-thumb`}
                        className="h-full w-full border-0 pointer-events-none"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                      />
                    )
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-blue-100/80">暂未提交作品</div>
                  )}
                  {hasWork && (
                    <div className="absolute inset-0 hidden items-end bg-gradient-to-t from-black/60 to-transparent p-3 text-xs text-white group-hover:flex">
                      点击全屏查看
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="mb-2 flex items-center gap-2">
                    {participant.avatar ? (
                      <img src={participant.avatar} alt={participant.userName} className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold">
                        {participant.userName?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{participant.userName}</p>
                      <p className="text-xs text-blue-100/80">{participant.online ? '在线' : '离线'}</p>
                    </div>
                  </div>
                  <p className="line-clamp-2 text-xs text-blue-100/90">
                    {participant.workDescription || '这位参与者还没有提交作品描述。'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedWork && selectedWork.workUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 p-4 md:p-8" onClick={() => setSelectedWork(null)}>
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col rounded-xl bg-slate-950" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4 text-white">
              <div>
                <p className="text-lg font-semibold">{selectedWork.userName} 的作品</p>
                <p className="mt-1 text-sm text-blue-100">{selectedWork.workDescription}</p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={selectedWork.workUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
                >
                  打开链接
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => setSelectedWork(null)}
                  className="rounded-md bg-white/10 p-2 hover:bg-white/20"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-black">
              {isImageUrl(selectedWork.workUrl) ? (
                <img src={selectedWork.workUrl} alt={selectedWork.userName} className="h-full w-full object-contain" />
              ) : (
                <iframe
                  src={selectedWork.workUrl}
                  title={`${selectedWork.userName}-work-fullscreen`}
                  className="h-full w-full border-0"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function normalizeHttpUrl(input: string): string | null {
  try {
    const parsed = new URL(input.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i.test(url);
}

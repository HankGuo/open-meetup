import { useMemo, useState } from 'react';
import { Crown, ExternalLink, Link2, Send, Sparkles, X } from 'lucide-react';
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

  const submittedCount = participantWorks.filter((participant) => participant.workUrl && participant.workDescription).length;
  const me = participantWorks.find((participant) => participant.userId === myUserId) ?? null;
  const meHasWork = Boolean(me?.workUrl && me?.workDescription);

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
    <div className="h-full w-full p-3 md:p-4">
      <section className="relative flex h-full w-full flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[linear-gradient(170deg,var(--panel-light),var(--panel-soft))] shadow-[var(--shadow-1)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 md:px-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-1 text-xs font-semibold text-[var(--text-soft)]">
            <Sparkles className="h-3.5 w-3.5" />
            作品陈列区
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--text-soft)]">
            <span className="status-pill">参与者 {participantWorks.length}</span>
            <span className="status-pill">已提交 {submittedCount}</span>
          </div>
        </header>

        <div className={`min-h-0 flex-1 gap-3 p-3 md:gap-4 md:p-4 ${myRole === 'participant' ? 'grid lg:grid-cols-[320px_minmax(0,1fr)]' : 'flex'}`}>
          {myRole === 'participant' && (
            <aside className="flex min-h-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text)]">我的作品</h3>
                <p className="mt-1 text-xs text-[var(--text-soft)]">提交 URL + 一句话描述，可重复更新，后一次会覆盖前一次。</p>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <label className="text-xs font-medium text-[var(--text-soft)]" htmlFor="work-url-input">
                  作品链接
                </label>
                <input
                  id="work-url-input"
                  type="url"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/my-project"
                  className="app-input app-input-light"
                />
              </div>

              <div className="mt-3 flex flex-col gap-2">
                <label className="text-xs font-medium text-[var(--text-soft)]" htmlFor="work-desc-input">
                  一句话描述
                </label>
                <textarea
                  id="work-desc-input"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="一句话描述你的作品亮点"
                  maxLength={120}
                  className="app-input app-input-light h-24 resize-none"
                />
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-soft)]">
                <span>{description.trim().length}/120</span>
                {me?.workUpdatedAt ? <span>上次：{new Date(me.workUpdatedAt).toLocaleString()}</span> : <span>尚未提交</span>}
              </div>

              {submitError ? <p className="mt-2 text-xs text-[var(--danger)]">{submitError}</p> : null}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !isConnected}
                className="btn-base btn-primary mt-4 h-10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {submitting ? '提交中...' : '提交作品'}
              </button>
            </aside>
          )}

          {myRole === 'participant' ? (
            <div className="min-h-0 flex-1 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 md:p-4">
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {meHasWork ? '我的作品（全屏预览）' : '提交后这里会全屏展示你的作品'}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-soft)]">你可以反复提交，系统始终以最后一次提交为准。</p>
                  </div>
                  {meHasWork && me?.workUrl ? (
                    <a
                      href={me.workUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-base btn-secondary h-9 rounded-md px-3 text-xs"
                    >
                      打开链接
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>

                {meHasWork && me?.workUrl ? (
                  <>
                    <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel-soft)]">
                      {isImageUrl(me.workUrl) ? (
                        <img src={me.workUrl} alt="我的作品" className="h-full w-full object-contain" />
                      ) : (
                        <iframe
                          src={me.workUrl}
                          title="my-work-preview"
                          className="h-full w-full border-0"
                          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                        />
                      )}
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm text-[var(--text-soft)]">{me.workDescription}</p>
                  </>
                ) : (
                  <div className="mt-3 flex min-h-[240px] flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--panel-soft)] px-6 text-center">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">还没有作品展示</p>
                      <p className="mt-1 text-sm text-[var(--text-soft)]">在左侧填写链接和描述后提交，右侧将自动展示最新作品。</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 md:p-4">
              {participantWorks.length === 0 ? (
                <div className="flex h-full min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--panel-soft)] px-6 text-center">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">暂无参与者作品</p>
                    <p className="mt-1 text-sm text-[var(--text-soft)]">成员提交作品后会自动出现在陈列区中。</p>
                  </div>
                </div>
              ) : (
                <div className="grid max-h-full grid-cols-1 gap-3 overflow-auto pr-1 sm:grid-cols-2 2xl:grid-cols-3">
                  {participantWorks.map((participant, index) => {
                    const hasWork = Boolean(participant.workUrl && participant.workDescription);
                    const rank = index + 1;
                    return (
                      <button
                        type="button"
                        key={participant.userId}
                        disabled={!hasWork}
                        onClick={() => hasWork && setSelectedWork(participant)}
                        className={`showcase-work-card group overflow-hidden rounded-2xl border text-left transition ${
                          hasWork ? 'showcase-work-card--submitted hover:-translate-y-0.5' : 'showcase-work-card--pending'
                        }`}
                      >
                        {rank <= 3 ? <RankCrown rank={rank as 1 | 2 | 3} /> : null}
                        <div className="showcase-work-thumb relative h-36">
                          {hasWork ? (
                            isImageUrl(participant.workUrl!) ? (
                              <img src={participant.workUrl} alt={participant.userName} className="h-full w-full object-cover" />
                            ) : (
                              <iframe
                                src={participant.workUrl}
                                title={`${participant.userName}-work-thumb`}
                                className="pointer-events-none h-full w-full border-0"
                                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                              />
                            )
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-[var(--text-soft)]">暂未提交作品</div>
                          )}

                          {hasWork ? (
                            <div className="absolute inset-x-0 bottom-0 hidden items-center gap-1 bg-gradient-to-t from-[oklch(1_0_0_/0.95)] to-transparent px-3 py-2 text-[11px] text-[var(--text)] group-hover:flex">
                              <Link2 className="h-3.5 w-3.5" />
                              点击全屏查看
                            </div>
                          ) : null}
                        </div>

                        <div className="p-3">
                          <div className="mb-2 flex items-center gap-2">
                            <Avatar participant={participant} />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[var(--text)]">{participant.userName}</p>
                              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--text-soft)]">
                                <span>{participant.online ? '在线' : '离线'}</span>
                                <span className={`showcase-work-state ${hasWork ? 'showcase-work-state--submitted' : 'showcase-work-state--pending'}`}>
                                  {hasWork ? '已提交' : '未提交'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <p className="line-clamp-2 text-xs text-[var(--text-soft)]">
                            {participant.workDescription || '这位参与者还没有提交作品描述。'}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {selectedWork && selectedWork.workUrl && (
        <div className="fixed inset-0 z-50 bg-[oklch(0.42_0.015_255_/0.28)] p-4 backdrop-blur-sm md:p-8" onClick={() => setSelectedWork(null)}>
          <div
            className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel-light)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] p-4 text-[var(--text)]">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{selectedWork.userName} 的作品</p>
                <p className="mt-1 line-clamp-2 text-sm text-[var(--text-soft)]">{selectedWork.workDescription}</p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={selectedWork.workUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-base btn-secondary h-9 rounded-md px-3 text-xs"
                >
                  打开链接
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => setSelectedWork(null)}
                  className="btn-base btn-secondary h-9 w-9 rounded-md p-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-[var(--panel-soft)]">
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

function Avatar({ participant }: { participant: User }) {
  const fallback = participant.userName?.trim()?.charAt(0)?.toUpperCase() || '?';

  if (participant.avatar) {
    return <img src={participant.avatar} alt={participant.userName} className="h-9 w-9 rounded-full border border-[var(--border)] object-cover" />;
  }

  return (
    <div className="avatar-fallback h-9 w-9 text-xs font-semibold">
      {fallback}
    </div>
  );
}

function RankCrown({ rank }: { rank: 1 | 2 | 3 }) {
  const label = rank === 1 ? '金' : rank === 2 ? '银' : '铜';
  const style =
    rank === 1
      ? 'border-amber-300 bg-amber-100/95 text-amber-700'
      : rank === 2
        ? 'border-slate-300 bg-slate-100/95 text-slate-700'
        : 'border-orange-300 bg-orange-100/95 text-orange-700';

  return (
    <span
      className={`pointer-events-none absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold shadow-sm ${style}`}
      title={`第 ${rank} 位加入`}
    >
      <Crown className="h-3 w-3" />
      {label}
    </span>
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

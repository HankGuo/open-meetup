import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  ExternalLink,
  Image as ImageIcon,
  Link2,
  Send,
  Upload,
  X,
} from 'lucide-react';
import { useMeeting } from '../context/MeetingContext';
import { ParticipantWorkSubmission, User } from '../types';
import { buildServerApiUrl } from '../serverUrl';

const MAX_IMAGE_FILE_SIZE_BYTES = 4_000_000;

export function ShowcasePage() {
  const {
    participants,
    myRole,
    myUserId,
    myTicket,
    submitMyWork,
    revertUploadedImage,
    isConnected,
    pages,
    currentStep,
  } = useMeeting();
  const [submissionValue, setSubmissionValue] = useState('');
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [localImagePreview, setLocalImagePreview] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [operationPanelCollapsed, setOperationPanelCollapsed] = useState(false);
  const localImagePreviewRef = useRef<string | null>(null);

  const currentPage = pages[currentStep];
  const currentPageId = currentPage?.id ?? '';
  const submissionMode = currentPage?.kind === 'showcase' ? (currentPage.submissionMode ?? 'url') : 'url';
  const rankingEnabled = currentPage?.kind === 'showcase' ? currentPage.rankingEnabled !== false : true;
  const pageTitle = resolveShowcasePageTitle(currentPage?.title);

  useEffect(() => {
    localImagePreviewRef.current = localImagePreview;
  }, [localImagePreview]);

  useEffect(() => {
    return () => {
      if (localImagePreviewRef.current) {
        URL.revokeObjectURL(localImagePreviewRef.current);
        localImagePreviewRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (localImagePreviewRef.current) {
      URL.revokeObjectURL(localImagePreviewRef.current);
      localImagePreviewRef.current = null;
    }
    setSubmissionValue('');
    setSelectedImageFile(null);
    setLocalImagePreview(null);
    setDescription('');
    setSubmitError(null);
    setSelectedParticipantId(null);
  }, [submissionMode, currentPage?.id]);

  const participantWorks = useMemo(
    () =>
      participants
        .filter((participant) => participant.role === 'participant')
        .sort((a, b) => a.joinedAt - b.joinedAt),
    [participants],
  );
  const submittedWorks = useMemo(
    () =>
      participantWorks
        .map((participant) => {
          const submission = participant.works?.[currentPageId];
          if (!submission?.url || !submission?.description) {
            return null;
          }
          return { participant, submission };
        })
        .filter((item): item is { participant: User; submission: ParticipantWorkSubmission } => item != null),
    [currentPageId, participantWorks],
  );

  const submittedCount = submittedWorks.length;
  const me = participantWorks.find((participant) => participant.userId === myUserId) ?? null;
  const meSubmission = me?.works?.[currentPageId];
  const canSubmit = myRole === 'participant';
  const selectedWork = useMemo(() => {
    if (!selectedParticipantId || !currentPageId) {
      return null;
    }
    const participant = participantWorks.find((item) => item.userId === selectedParticipantId);
    if (!participant) {
      return null;
    }
    const submission = participant.works?.[currentPageId];
    if (!submission?.url || !submission?.description) {
      return null;
    }
    return { participant, submission };
  }, [currentPageId, participantWorks, selectedParticipantId]);

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
      setSubmitError(`图片体积不能超过 4MB，当前 ${(file.size / 1024 / 1024).toFixed(1)}MB，请压缩后重试`);
      return;
    }

    const mimeType = file.type.trim().toLowerCase();
    if (!mimeType.startsWith('image/')) {
      setSubmitError('仅支持图片文件');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    if (localImagePreview) {
      URL.revokeObjectURL(localImagePreview);
    }

    setSubmitError(null);
    setSelectedImageFile(file);
    setLocalImagePreview(previewUrl);
  }

  async function handleSubmit() {
    if (!currentPageId || currentPage?.kind !== 'showcase') {
      setSubmitError('当前页面不支持提交');
      return;
    }

    const normalizedDescription = description.trim();
    if (!normalizedDescription) {
      setSubmitError('请填写一句话描述');
      return;
    }
    if (normalizedDescription.length > 120) {
      setSubmitError('作品描述最多 120 字');
      return;
    }

    let normalizedContent = '';
    if (submissionMode === 'url') {
      normalizedContent = normalizeHttpUrl(submissionValue) || '';
      if (!normalizedContent) {
        setSubmitError('请输入有效的 http/https 链接');
        return;
      }
    } else {
      if (!selectedImageFile) {
        setSubmitError('请先上传图片后再提交');
        return;
      }
      if (!myTicket) {
        setSubmitError('Ticket 缺失，请重新加入房间');
        return;
      }
      const uploadedUrl = await uploadImageFile(selectedImageFile, myTicket, currentPageId);
      if (!uploadedUrl) {
        setSubmitError('图片上传失败，请稍后重试');
        return;
      }
      normalizedContent = uploadedUrl;
    }

    setSubmitError(null);
    setSubmitting(true);
    const success = await submitMyWork(currentPageId, normalizedContent, normalizedDescription);
    setSubmitting(false);
    if (!success) {
      if (submissionMode === 'image' && normalizedContent) {
        await revertUploadedImage(normalizedContent);
      }
      setSubmitError('提交失败，请稍后重试');
    }
  }

  function handleWorkCardClick(participantUserId: string, submission: ParticipantWorkSubmission) {
    if (submissionMode === 'url') {
      const normalizedUrl = normalizeHttpUrl(submission.url);
      if (!normalizedUrl) {
        return;
      }
      window.open(normalizedUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    setSelectedParticipantId(participantUserId);
  }

  const modeLabel = submissionMode === 'image' ? '图片' : 'URL';

  return (
    <div className="h-full w-full p-3 md:p-4">
      <section className="relative flex h-full w-full flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[linear-gradient(170deg,var(--panel-light),var(--panel-soft))] shadow-[var(--shadow-2)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 md:px-5">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-[var(--text)] md:text-lg">{pageTitle}</h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--text-soft)]">
            <span className="status-pill">参与者 {participantWorks.length}</span>
            <span className="status-pill">已提交 {submittedCount}</span>
            <span className="status-pill">{rankingEnabled ? '已启用排名' : '未启用排名'}</span>
          </div>
        </header>

        <div
          className={`min-h-0 flex-1 gap-3 p-3 md:gap-4 md:p-4 ${operationPanelCollapsed ? 'flex' : 'grid lg:grid-cols-[320px_minmax(0,1fr)]'}`}
        >
          {!operationPanelCollapsed ? (
            <aside className="flex min-h-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text)]">操作端</h3>
                  <p className="mt-1 text-xs text-[var(--text-soft)]">
                    {canSubmit
                      ? submissionMode === 'image'
                        ? '上传图片并补充一句话描述，可反复更新，后一次覆盖前一次。'
                        : '提交 URL 与一句话描述，可反复更新，后一次覆盖前一次。'
                      : '主持人端与参与者端一致展示；主持人不参与提交。'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOperationPanelCollapsed(true)}
                  className="btn-base btn-secondary h-8 rounded-md px-2 text-xs"
                  aria-label="折叠操作端"
                  title="折叠操作端"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  收起
                </button>
              </div>

              {submissionMode === 'url' ? (
                <div className="mt-4 flex flex-col gap-2">
                  <label className="text-xs font-medium text-[var(--text-soft)]" htmlFor="work-url-input">
                    链接地址
                  </label>
                  <input
                    id="work-url-input"
                    type="url"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={submissionValue}
                    onChange={(event) => setSubmissionValue(event.target.value)}
                    placeholder="https://example.com/my-project"
                    disabled={!canSubmit}
                    className="app-input app-input-light"
                  />
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-xs font-medium text-[var(--text-soft)]">图片上传</p>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-[var(--border)] bg-[var(--panel-soft)]">
                      {localImagePreview ? (
                        <img src={localImagePreview} alt="preview" className="h-full w-full object-contain" />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-[var(--text-soft)]" />
                      )}
                    </div>
                    <label className="min-w-0 flex-1">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="hidden"
                        disabled={!canSubmit}
                      />
                      <span
                        className={`btn-base btn-secondary w-full cursor-pointer ${!canSubmit ? 'pointer-events-none opacity-50' : ''}`}
                      >
                        <Upload className="h-4 w-4" />
                        {localImagePreview ? '重新上传图片' : '上传图片'}
                      </span>
                    </label>
                  </div>
                </div>
              )}

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
                  placeholder="一句话描述你提交内容的亮点"
                  maxLength={120}
                  disabled={!canSubmit}
                  className="app-input app-input-light h-24 resize-none"
                />
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-soft)]">
                <span>{description.trim().length}/120</span>
                {meSubmission?.updatedAt ? (
                  <span>上次：{new Date(meSubmission.updatedAt).toLocaleString()}</span>
                ) : (
                  <span>尚未提交</span>
                )}
              </div>

              {submitError ? <p className="mt-2 text-xs text-[var(--danger)]">{submitError}</p> : null}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || submitting || !isConnected}
                className="btn-base btn-primary mt-4 h-10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {!canSubmit ? '仅参与者可提交' : submitting ? '提交中...' : '提交内容'}
              </button>
            </aside>
          ) : null}

          <div className="min-h-0 flex-1 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 md:p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">上传广场</p>
                <p className="mt-1 text-xs text-[var(--text-soft)]">
                  当前类型：{modeLabel}；{rankingEnabled ? '前三名显示金银铜皇冠' : '不展示排名皇冠'}。
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canSubmit && submissionMode === 'url' && meSubmission?.url && isHttpUrl(meSubmission.url) ? (
                  <a
                    href={meSubmission.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-base btn-secondary h-8 rounded-md px-2 text-xs"
                  >
                    打开我的链接
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
                {operationPanelCollapsed ? (
                  <button
                    type="button"
                    onClick={() => setOperationPanelCollapsed(false)}
                    className="btn-base btn-secondary h-8 rounded-md px-2 text-xs"
                    aria-label="展开操作端"
                    title="展开操作端"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                    展开操作端
                  </button>
                ) : null}
              </div>
            </div>

            {submittedWorks.length === 0 ? (
              <div className="flex h-full min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--panel-soft)] px-6 text-center">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">暂时没人上传</p>
                  <p className="mt-1 text-sm text-[var(--text-soft)]">有人提交后会自动出现在这里。</p>
                </div>
              </div>
            ) : (
              <div className="grid max-h-full grid-cols-1 gap-3 overflow-auto pr-1 sm:grid-cols-2 2xl:grid-cols-3">
                {submittedWorks.map(({ participant, submission }, index) => {
                  const rank = index + 1;
                  return (
                    <button
                      type="button"
                      key={participant.userId}
                      onClick={() => handleWorkCardClick(participant.userId, submission)}
                      className="showcase-work-card showcase-work-card--submitted group relative overflow-hidden rounded-2xl border text-left transition hover:-translate-y-0.5"
                    >
                      {rankingEnabled && rank <= 3 ? <RankCrown rank={rank as 1 | 2 | 3} /> : null}
                      <div className="showcase-work-thumb relative flex h-36 items-center justify-center bg-[var(--panel-soft)]">
                        {isImageUrl(submission.url) ? (
                          <img
                            src={submission.url}
                            alt={participant.userName}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <iframe
                            src={submission.url}
                            title={`${participant.userName}-work-thumb`}
                            className="pointer-events-none h-full w-full border-0"
                            sandbox="allow-scripts allow-forms allow-popups"
                          />
                        )}

                        <div className="absolute inset-x-0 bottom-0 hidden items-center gap-1 bg-gradient-to-t from-[oklch(1_0_0_/0.95)] to-transparent px-3 py-2 text-[11px] text-[var(--text)] group-hover:flex">
                          <Link2 className="h-3.5 w-3.5" />
                          {submissionMode === 'image' ? '点击放大查看' : '点击打开链接'}
                        </div>
                      </div>

                      <div className="p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <Avatar participant={participant} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--text)]">
                              {participant.userName}
                            </p>
                            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--text-soft)]">
                              <span className="showcase-work-state showcase-work-state--submitted">
                                已提交
                              </span>
                            </div>
                          </div>
                        </div>
                        <p className="line-clamp-2 text-xs text-[var(--text-soft)]">
                          {submission.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {selectedWork ? (
        <div
          className="fixed inset-0 z-50 bg-[oklch(0.42_0.015_206_/0.28)] p-4 backdrop-blur-sm md:p-8"
          onClick={() => setSelectedParticipantId(null)}
        >
          <div
            className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel-light)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] p-4 text-[var(--text)]">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">
                  {selectedWork.participant.userName} 的提交内容
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-[var(--text-soft)]">
                  {selectedWork.submission.description}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isHttpUrl(selectedWork.submission.url) ? (
                  <a
                    href={selectedWork.submission.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-base btn-secondary h-9 rounded-md px-3 text-xs"
                  >
                    打开链接
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSelectedParticipantId(null)}
                  className="btn-base btn-secondary h-9 w-9 rounded-md p-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-[var(--panel-soft)]">
              {isImageUrl(selectedWork.submission.url) ? (
                <img
                  src={selectedWork.submission.url}
                  alt={selectedWork.participant.userName}
                  className="h-full w-full object-contain"
                />
              ) : isHttpUrl(selectedWork.submission.url) ? (
                <iframe
                  src={selectedWork.submission.url}
                  title={`${selectedWork.participant.userName}-work-fullscreen`}
                  className="h-full w-full border-0"
                  sandbox="allow-scripts allow-forms allow-popups"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-[var(--text-soft)]">
                  该内容无法预览，请联系提交者重新上传。
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Avatar({ participant }: { participant: User }) {
  const fallback = participant.userName?.trim()?.charAt(0)?.toUpperCase() || '?';

  return <div className="avatar-fallback h-9 w-9 text-xs font-semibold">{fallback}</div>;
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
      className={`pointer-events-none absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold shadow-sm ${style}`}
      title={`第 ${rank} 名`}
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

function isHttpUrl(value: string): boolean {
  return normalizeHttpUrl(value) != null;
}

function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?.*)?$/i.test(url);
}

function resolveShowcasePageTitle(rawTitle: string | undefined): string {
  const title = rawTitle?.trim();
  if (!title) {
    return '互动页';
  }
  if (/^互动页（(?:图片|URL)）$/i.test(title) || /^(?:图片互动页|链接互动页)(?:\s+\d+)?$/.test(title)) {
    return '互动页';
  }
  return title;
}

async function uploadImageFile(file: File, ticket: string, pageId: string): Promise<string | null> {
  const mimeType = file.type?.trim().toLowerCase() || '';
  if (!mimeType.startsWith('image/')) {
    return null;
  }
  if (!pageId.trim()) {
    return null;
  }

  try {
    const response = await fetch(buildServerApiUrl('/api/uploads/image'), {
      method: 'POST',
      headers: {
        'Content-Type': mimeType,
        'X-Open-Meetup-Ticket': ticket,
        'X-Open-Meetup-Page-Id': pageId,
      },
      body: file,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { url?: string };
    if (typeof data.url !== 'string' || !data.url.startsWith('/uploads/')) {
      return null;
    }
    return data.url;
  } catch {
    return null;
  }
}

import { useEffect, useState } from 'react';
import { useMeeting } from '../context/MeetingContext';
import { MeetingStage } from '../components/MeetingStage';
import { CheckCircle2, Copy, LogOut, Ticket } from 'lucide-react';
import { STORAGE_KEYS } from '../context/storage';

export function ParticipantPage() {
  const { leaveRoom, phase, title, myTicket } = useMeeting();
  const [ticketConfirmed, setTicketConfirmed] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);

    if (!myTicket) {
      setTicketConfirmed(true);
      return;
    }

    try {
      const acknowledgedTicket = localStorage.getItem(STORAGE_KEYS.ticketAcknowledged);
      setTicketConfirmed(acknowledgedTicket === myTicket);
    } catch {
      setTicketConfirmed(false);
    }
  }, [myTicket]);

  async function handleCopyTicket() {
    if (!myTicket) {
      return;
    }

    try {
      await navigator.clipboard.writeText(myTicket);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch {
      setCopied(false);
    }
  }

  function handleConfirmTicket() {
    if (!myTicket) {
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEYS.ticketAcknowledged, myTicket);
    } catch {
      // 忽略存储失败，避免阻塞用户流程
    }
    setTicketConfirmed(true);
  }

  const showTicketReminder = Boolean(myTicket) && !ticketConfirmed;
  const compactTicket = myTicket && ticketConfirmed ? (
    <div
      className="inline-flex h-7 max-w-[46vw] items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--panel-light)] px-2 text-[11px] font-semibold text-[var(--text)] md:max-w-[220px]"
      title={`我的 Ticket：${myTicket}`}
    >
      <Ticket className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
      <span className="truncate font-mono">{myTicket}</span>
    </div>
  ) : null;

  const liveTopActions = (
    <>
      {compactTicket}

      <button
        type="button"
        onClick={() => void leaveRoom()}
        aria-label="退出"
        title="退出"
        className="stage-action-btn"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </>
  );

  return (
    <div className="page-enter relative flex h-full w-full flex-col overflow-hidden">
      {phase === 'setup' && compactTicket ? (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-30 px-3 md:px-4">
          <div className="pointer-events-auto mx-auto flex w-full justify-end">
            <div className="stage-topbar-surface flex h-10 items-center gap-2 px-1.5">
              {compactTicket}
              <button
                type="button"
                onClick={() => void leaveRoom()}
                aria-label="退出"
                title="退出"
                className="stage-action-btn"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {phase === 'setup' ? (
        <div className="flex h-full w-full items-center justify-center px-6">
          <div className="glass-panel max-w-lg p-8 text-center">
            <p className="status-pill mx-auto w-max border-[var(--border-light)] bg-[var(--panel-light)] text-[var(--accent)]">准备中</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">{title || '房间'}</h2>
            <p className="mt-3 text-sm text-[var(--text-soft)]">主持人正在编排页面，确认后会自动进入播放环节。</p>
          </div>
        </div>
      ) : (
        <MeetingStage topActions={liveTopActions} />
      )}

      {showTicketReminder ? (
        <div className="dialog-overlay fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="dialog-panel w-full max-w-xl overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <div className="border-b border-[var(--border)] px-6 py-4">
              <p className="text-xs font-semibold tracking-[0.08em] text-[var(--accent)]">重要提醒</p>
              <h2 className="mt-1 text-2xl font-bold text-[var(--text)]">请务必牢记你的 Ticket</h2>
              <p className="mt-2 text-sm text-[var(--text-soft)]">更换浏览器或使用隐私模式时，需要凭 Ticket 重新进入，建议先复制或截图保存。</p>
            </div>

            <div className="px-6 py-5">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-soft)] p-5 text-center">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-soft)]">Your Ticket</p>
                <p className="mt-2 break-all font-mono text-2xl font-bold tracking-[0.08em] text-[var(--text)]">{myTicket}</p>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={handleCopyTicket} className="btn-base btn-secondary">
                  <Copy className="h-4 w-4" />
                  {copied ? '已复制到剪贴板' : '复制 Ticket'}
                </button>
                <button type="button" onClick={handleConfirmTicket} className="btn-base btn-primary">
                  <CheckCircle2 className="h-4 w-4" />
                  我已牢记，继续进入
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useMeeting } from '../context/MeetingContext';
import { MeetingStage } from '../components/MeetingStage';
import { HostControls } from '../components/HostControls';
import { HostSetupBoard } from '../components/HostSetupBoard';
import { ArrowLeftCircle, CheckCircle2, Copy, LogOut, Ticket, XCircle } from 'lucide-react';
import { STORAGE_KEYS } from '../context/storage';

export function HostPage() {
  const { leaveRoom, endRoom, phase, returnToSetup, pages, currentStep, myTicket, title } = useMeeting();
  const [setupFocusPageId, setSetupFocusPageId] = useState<string | null>(null);
  const [ticketConfirmed, setTicketConfirmed] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedShareAddress, setCopiedShareAddress] = useState(false);
  const shareAddress = typeof window !== 'undefined' ? window.location.origin : '';

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

  async function handleEndRoom() {
    if (!confirm('确定要结束房间吗？结束后所有用户都将被退出。')) {
      return;
    }
    await endRoom();
  }

  async function handleReturnToSetup() {
    const focusedPageId = pages[currentStep]?.id || null;
    setSetupFocusPageId(focusedPageId);
    await returnToSetup();
  }

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

  async function handleCopyShareAddress() {
    if (!shareAddress) {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareAddress);
      setCopiedShareAddress(true);
      window.setTimeout(() => {
        setCopiedShareAddress(false);
      }, 1800);
    } catch {
      setCopiedShareAddress(false);
    }
  }

  function handleConfirmTicket() {
    if (!myTicket) {
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEYS.ticketAcknowledged, myTicket);
    } catch {}
    setTicketConfirmed(true);
  }

  const showTicketReminder = Boolean(myTicket) && !ticketConfirmed;
  const liveTicket =
    myTicket && ticketConfirmed ? (
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
      {liveTicket}

      <button
        type="button"
        onClick={() => void leaveRoom()}
        aria-label="退出"
        title="退出"
        className="stage-action-btn"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={handleReturnToSetup}
        aria-label="返回编辑页"
        title="返回编辑页"
        className="stage-action-btn stage-action-btn--accent"
      >
        <ArrowLeftCircle className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={handleEndRoom}
        aria-label="结束房间"
        title="结束房间"
        className="stage-action-btn stage-action-btn--danger"
      >
        <XCircle className="h-3.5 w-3.5" />
      </button>
    </>
  );

  return (
    <div className="page-enter relative flex h-full w-full flex-col overflow-hidden">
      {phase === 'setup' ? (
        <HostSetupBoard
          defaultSelectedPageId={setupFocusPageId}
          roomTitle={title}
          shareAddress={shareAddress}
          copiedShareAddress={copiedShareAddress}
          onCopyShareAddress={() => void handleCopyShareAddress()}
          ticketCode={myTicket}
          copiedTicket={copied}
          onCopyTicket={() => void handleCopyTicket()}
          onLeaveRoom={() => void leaveRoom()}
          onEndRoom={() => void handleEndRoom()}
        />
      ) : (
        <MeetingStage topActions={liveTopActions} />
      )}

      {phase === 'live' ? <HostControls /> : null}

      {showTicketReminder ? (
        <div className="dialog-overlay fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="dialog-panel w-full max-w-xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[var(--border)] px-6 py-4">
              <p className="text-xs font-semibold tracking-[0.08em] text-[var(--accent)]">重要提醒</p>
              <h2 className="mt-1 text-2xl font-bold text-[var(--text)]">请务必牢记你的 Ticket</h2>
              <p className="mt-2 text-sm text-[var(--text-soft)]">
                更换浏览器或使用隐私模式时，需要凭 Ticket 重新进入主持台，建议先复制或截图保存。
              </p>
            </div>

            <div className="px-6 py-5">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-soft)] p-5 text-center">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-soft)]">Host Ticket</p>
                <p className="mt-2 break-all font-mono text-2xl font-bold tracking-[0.08em] text-[var(--text)]">
                  {myTicket}
                </p>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={handleCopyTicket} className="btn-base btn-secondary">
                  <Copy className="h-4 w-4" />
                  {copied ? '已复制到剪贴板' : '复制 Ticket'}
                </button>
                <button type="button" onClick={handleConfirmTicket} className="btn-base btn-primary">
                  <CheckCircle2 className="h-4 w-4" />
                  我已牢记，继续主持
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useMeeting } from '../context/MeetingContext';
import { CheckCircle2, Ticket, User, Wifi, WifiOff } from 'lucide-react';
import { STORAGE_KEYS } from '../context/storage';
import { buildServerApiUrl } from '../serverUrl';

interface TicketCheckResult {
  valid: boolean;
  error?: string;
}

export function JoinPage() {
  const { joinRoom, isConnected, isReconnecting, error, clearError } = useMeeting();
  const [mode, setMode] = useState<'ticket' | 'form'>('form');
  const [userName, setUserName] = useState('');
  const [ticket, setTicket] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [autoJoinTicket, setAutoJoinTicket] = useState('');

  useEffect(() => {
    try {
      const storedTicket = localStorage.getItem(STORAGE_KEYS.ticket)?.trim().toUpperCase() || '';
      if (!storedTicket) {
        return;
      }
      setMode('ticket');
      setTicket(storedTicket);
      setAutoJoinTicket(storedTicket);
    } catch {
      // 忽略存储失败
    }
  }, []);

  async function verifyTicket(ticketToVerify: string): Promise<TicketCheckResult> {
    try {
      const response = await fetch(`${buildServerApiUrl('/api/room/ticket-check')}?ticket=${encodeURIComponent(ticketToVerify)}`);
      if (!response.ok) {
        const failed = (await response.json()) as TicketCheckResult;
        return {
          valid: false,
          error: failed.error || '验证失败，请稍后重试',
        };
      }
      const data = (await response.json()) as TicketCheckResult;
      return data;
    } catch {
      return { valid: false, error: '验证失败，请稍后重试' };
    }
  }

  async function joinWithTicket(ticketInput: string) {
    const normalizedTicket = ticketInput.trim().toUpperCase();
    if (!normalizedTicket) {
      setTicketError('请输入您的Ticket');
      return false;
    }

    clearError();
    setTicketError(null);
    setVerifying(true);
    const verifyResult = await verifyTicket(normalizedTicket);
    setVerifying(false);

    if (!verifyResult.valid) {
      setTicketError(verifyResult.error || 'Ticket无效');
      try {
        const storedTicket = localStorage.getItem(STORAGE_KEYS.ticket)?.trim().toUpperCase() || '';
        if (storedTicket === normalizedTicket) {
          localStorage.removeItem(STORAGE_KEYS.ticket);
        }
      } catch {
        // 忽略存储失败
      }
      return false;
    }

    setLoading(true);
    const success = await joinRoom('', normalizedTicket);
    setLoading(false);
    return success;
  }

  useEffect(() => {
    if (!autoJoinTicket || !isConnected || isReconnecting) {
      return;
    }

    const ticketToJoin = autoJoinTicket;
    setAutoJoinTicket('');
    void (async () => {
      const success = await joinWithTicket(ticketToJoin);
      if (!success) {
        setMode('ticket');
        setTicket(ticketToJoin);
      }
    })();
  }, [autoJoinTicket, isConnected, isReconnecting]);

  async function handleJoin() {
    if (mode === 'ticket') {
      await joinWithTicket(ticket);
      return;
    }

    clearError();
    setTicketError(null);

    if (!userName.trim()) {
      alert('请输入您的昵称');
      return;
    }
    setLoading(true);
    await joinRoom(userName.trim());
    setLoading(false);
  }

  return (
    <main className="page-enter flex h-full w-full items-center justify-center overflow-hidden px-4 py-6">
      <section className="glass-panel w-full max-w-4xl p-4 md:p-7">
        <div className="grid gap-6 md:grid-cols-[1.05fr_1fr]">
          <div className="app-card p-5 md:p-6">
            <h1 className="text-3xl font-bold text-[var(--text)]">加入房间</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">
              支持首次加入与 Ticket 两种模式；Ticket 与身份绑定，更换浏览器或使用隐私模式时可继续使用。
            </p>

            <div className="mt-5 grid gap-3">
              <div className="app-card p-3">
                <p className="text-xs text-[var(--text-soft)]">连接状态</p>
                <div className="mt-1">
                  {isConnected ? (
                    <span className="status-pill status-pill--online">
                      <Wifi className="h-3.5 w-3.5" /> 网络正常
                    </span>
                  ) : (
                    <span className="status-pill status-pill--offline">
                      <WifiOff className="h-3.5 w-3.5" /> 网络中断
                    </span>
                  )}
                </div>
              </div>
              <div className="app-card p-3">
                <p className="text-xs text-[var(--text-soft)]">交互提示</p>
                <p className="mt-1 text-sm text-[var(--text)]">输入或读取本地 Ticket 时都会先向服务端校验有效性和绑定身份，再执行加入。</p>
              </div>
            </div>
          </div>

          <div className="light-panel p-5 text-[var(--text-inverse)] md:p-6">
            <div className="segmented-control mb-4">
              <button
                type="button"
                className={`btn-base segmented-item text-sm ${
                  mode === 'form' ? 'segmented-item--active' : ''
                }`}
                onClick={() => setMode('form')}
              >
                <User className="h-4 w-4" />
                首次加入
              </button>
              <button
                type="button"
                className={`btn-base segmented-item text-sm ${
                  mode === 'ticket' ? 'segmented-item--active' : ''
                }`}
                onClick={() => setMode('ticket')}
              >
                <Ticket className="h-4 w-4" />
                有 Ticket
              </button>
            </div>

            {error && (
              <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
            )}

            {mode === 'ticket' ? (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-[var(--text-inverse)]">Ticket 编号</span>
                  <input
                    type="text"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className={`app-input app-input-light mono ${ticketError ? '!border-rose-400' : ''}`}
                    placeholder="例如: TKT-ABC12345 / HOST-ABC12345"
                    value={ticket}
                    onChange={(e) => {
                      setTicket(e.target.value.toUpperCase());
                      setTicketError(null);
                    }}
                  />
                </label>
                {ticketError ? <p className="text-sm text-rose-600">{ticketError}</p> : null}
              </div>
            ) : (
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-[var(--text-inverse)]">昵称</span>
                  <input
                    type="text"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="app-input app-input-light"
                    placeholder="请输入您的昵称"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                  />
                </label>
              </div>
            )}

            <button
              className="btn-base btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleJoin}
              disabled={loading || !isConnected || isReconnecting || verifying}
            >
              {loading || verifying ? (
                <>
                  <svg className="h-5 w-5 animate-spin text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4zm2 5.3A8 8 0 014 12H0c0 3.1 1.1 5.9 3 8l3-2.7z"></path>
                  </svg>
                  {verifying ? '验证中...' : '加入中...'}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  加入房间
                </>
              )}
            </button>

            {mode === 'form' ? <p className="mt-3 text-center text-xs text-[var(--text-soft)]">首次加入将自动分配 Ticket，更换浏览器或使用隐私模式时会用到</p> : null}
          </div>
        </div>
      </section>
    </main>
  );
}

import { useState } from 'react';
import { useMeeting } from '../context/MeetingContext';
import { Layers, Sparkles, Wifi, WifiOff } from 'lucide-react';

const DEFAULT_PARTICIPANT_LIMIT = 50;
const MIN_PARTICIPANT_LIMIT = 1;
const MAX_PARTICIPANT_LIMIT = 500;

export function Lobby() {
  const { createRoom, isConnected, error, clearError } = useMeeting();
  const [userName, setUserName] = useState('');
  const [title, setTitle] = useState('');
  const [password, setPassword] = useState('');
  const [participantLimit, setParticipantLimit] = useState(String(DEFAULT_PARTICIPANT_LIMIT));
  const [loading, setLoading] = useState(false);

  async function handleCreateRoom() {
    if (!userName.trim()) {
      alert('请输入您的姓名');
      return;
    }
    if (!title.trim()) {
      alert('请输入房间标题');
      return;
    }
    if (!password.trim()) {
      alert('请输入授权口令');
      return;
    }
    const parsedLimit = Number(participantLimit);
    if (!Number.isFinite(parsedLimit)) {
      alert(`请输入 ${MIN_PARTICIPANT_LIMIT}-${MAX_PARTICIPANT_LIMIT} 之间的人数上限`);
      return;
    }
    const normalizedParticipantLimit = Math.floor(parsedLimit);
    if (normalizedParticipantLimit < MIN_PARTICIPANT_LIMIT || normalizedParticipantLimit > MAX_PARTICIPANT_LIMIT) {
      alert(`人数上限需在 ${MIN_PARTICIPANT_LIMIT}-${MAX_PARTICIPANT_LIMIT} 之间`);
      return;
    }
    clearError();
    setLoading(true);
    const success = await createRoom(userName.trim(), title.trim(), password.trim(), normalizedParticipantLimit);
    setLoading(false);
    if (!success) {
      setPassword('');
    }
  }

  return (
    <main className="page-enter flex h-full w-full items-center justify-center overflow-hidden px-4 py-6 md:px-8">
      <section className="glass-panel w-full max-w-6xl p-4 md:p-7">
        <div className="grid gap-6 md:grid-cols-[1.08fr_1fr] md:gap-8">
          <div className="flex flex-col justify-between gap-6 rounded-2xl border border-[var(--border)] bg-[linear-gradient(145deg,var(--panel),var(--panel-soft))] p-5 md:p-6">
            <div>
              <div className="status-pill mb-3 w-max border-[var(--border-light)] bg-[var(--panel-light)] text-[var(--primary)]">
                <Sparkles className="h-3.5 w-3.5" />
                生产级主持台
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-[var(--text)] md:text-4xl">Open Meetup</h1>
              <p className="mt-3 text-sm leading-6 text-[var(--text-soft)] md:text-[0.95rem]">
                一键创建你的实时协作房间，先编排页面再开始播放，让房间控制和参与体验都更稳定。
              </p>
            </div>

            <div className="grid gap-3">
              <div className="app-card p-3.5">
                <p className="text-xs text-[var(--text-soft)]">房间模式</p>
                <p className="mt-1 text-sm font-semibold text-[var(--text)]">Setup 先编排 / Live 再播放</p>
              </div>
              <div className="app-card p-3.5">
                <p className="text-xs text-[var(--text-soft)]">核心能力</p>
                <p className="mt-1 text-sm font-semibold text-[var(--text)]">自由画布 · 互动页（图片/URL，可选排名）</p>
              </div>
            </div>
          </div>

          <div className="light-panel p-5 text-[var(--text-inverse)] md:p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-[var(--text-inverse)]">
                <Layers className="h-5 w-5" />
                创建房间
              </h2>
              {isConnected ? (
                <span className="status-pill status-pill--online">
                  <Wifi className="h-3.5 w-3.5" /> Online
                </span>
              ) : (
                <span className="status-pill status-pill--offline">
                  <WifiOff className="h-3.5 w-3.5" /> Offline
                </span>
              )}
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-[var(--text-inverse)]">您的姓名</span>
                <input
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="app-input app-input-light"
                  placeholder="请输入姓名"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-[var(--text-inverse)]">房间标题</span>
                <input
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="app-input app-input-light"
                  placeholder="请输入房间标题"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-[var(--text-inverse)]">授权口令</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  autoCorrect="off"
                  spellCheck={false}
                  className="app-input app-input-light mono"
                  placeholder="请输入授权口令"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-[var(--text-inverse)]">参与者人数上限（不含主持人）</span>
                <input
                  type="number"
                  min={MIN_PARTICIPANT_LIMIT}
                  max={MAX_PARTICIPANT_LIMIT}
                  step={1}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="app-input app-input-light mono"
                  placeholder={`默认 ${DEFAULT_PARTICIPANT_LIMIT}`}
                  value={participantLimit}
                  onChange={(e) => setParticipantLimit(e.target.value)}
                />
                <p className="mt-1 text-xs text-[var(--text-soft)]">
                  可设置范围：{MIN_PARTICIPANT_LIMIT}-{MAX_PARTICIPANT_LIMIT}
                </p>
              </label>

              <button
                className="btn-base btn-primary mt-2 w-full disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleCreateRoom}
                disabled={loading || !isConnected}
              >
                {loading ? '创建中...' : '创建房间'}
              </button>
            </div>

            <p className="mt-5 text-center text-xs text-[var(--text-soft)]">实时协作房间 · Powered by Socket.IO</p>
          </div>
        </div>
      </section>
    </main>
  );
}

import { useState, useEffect } from 'react';
import { MeetingProvider, useMeeting } from './context/MeetingContext';
import { Lobby } from './components/Lobby';
import { JoinPage } from './components/JoinPage';
import { HostPage } from './pages/HostPage';
import { ParticipantPage } from './pages/ParticipantPage';
import { STORAGE_KEYS, clearRoomEntryStorage } from './context/storage';
import { ArrowRight, LayoutDashboard, Loader2 } from 'lucide-react';

interface CurrentRoomInfo {
  title: string;
  status: string;
  phase: 'setup' | 'live';
  currentStep: number;
  totalPages: number;
  hostId: string;
}

type AppView = 'checking' | 'lobby' | 'host-pending' | 'join' | 'room';

function AppContent() {
  const { myRole, myUserId } = useMeeting();
  const [view, setView] = useState<AppView>('checking');
  const [currentRoom, setCurrentRoom] = useState<CurrentRoomInfo | null>(null);

  useEffect(() => {
    checkServerState();
  }, []);

  // 当已经成功创建/加入房间后，自动进入房间视图
  useEffect(() => {
    if (myUserId && (myRole === 'host' || myRole === 'participant')) {
      setView('room');
    }
  }, [myUserId, myRole]);

  async function checkServerState() {
    try {
      const response = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/api/room/current`);
      const data = await response.json();

      if (!data.exists) {
        clearRoomEntryStorage();
        setCurrentRoom(null);
        setView('lobby');
      } else {
        setCurrentRoom({
          title: data.title,
          status: data.status,
          phase: data.phase || 'setup',
          currentStep: data.currentStep,
          totalPages: typeof data.totalPages === 'number' ? data.totalPages : 0,
          hostId: data.hostId,
        });

        const isHost = localStorage.getItem(STORAGE_KEYS.isHost) === 'true';

        if (isHost) {
          setView('host-pending');
        } else {
          setView('join');
        }
      }
    } catch {
      clearRoomEntryStorage();
      setCurrentRoom(null);
      setView('lobby');
    }
  }

  function handleEnterRoom() {
    setView('room');
  }

  function handleBackToLobby() {
    clearRoomEntryStorage();
    setCurrentRoom(null);
    setView('lobby');
  }

  if (view === 'checking') {
    return (
      <div className="page-enter flex h-full w-full items-center justify-center overflow-hidden px-4">
        <div className="glass-panel w-full max-w-md p-7 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel-soft)]">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
          </div>
          <p className="text-base font-semibold text-[var(--text)]">正在检查房间状态</p>
          <p className="mt-2 text-sm text-[var(--text-soft)]">请稍候，正在连接会议服务</p>
        </div>
      </div>
    );
  }

  if (view === 'room' && myRole === 'host') {
    return <HostPage />;
  }

  if (view === 'room' && myRole === 'participant') {
    return <ParticipantPage />;
  }

  if (view === 'host-pending' && currentRoom) {
    return (
      <div className="page-enter flex h-full w-full items-center justify-center overflow-hidden px-4 py-6">
        <div className="glass-panel w-full max-w-md p-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--panel-soft)]">
            <LayoutDashboard className="h-7 w-7 text-[var(--accent)]" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--text)]">欢迎回来，主持人</h1>
          <p className="mb-6 mt-2 text-sm text-[var(--text-soft)]">系统已有房间正在进行</p>

          <div className="app-card mb-6 p-5">
            <p className="mb-1 text-sm text-[var(--text-soft)]">当前进度</p>
            {currentRoom.phase === 'setup' ? (
              <p className="text-2xl font-bold text-[var(--accent)]">编排阶段</p>
            ) : (
              <p className="text-2xl font-bold text-[var(--accent)]">
                第 {currentRoom.currentStep + 1} / {Math.max(1, currentRoom.totalPages)} 页
              </p>
            )}
          </div>

          <button
            onClick={handleEnterRoom}
            className="btn-base btn-primary w-full"
          >
            <ArrowRight className="h-4 w-4" />
            进入房间
          </button>

          <button
            onClick={handleBackToLobby}
            className="btn-base btn-secondary mt-3 w-full"
          >
            重新创建房间
          </button>
        </div>
      </div>
    );
  }

  if (view === 'join' && currentRoom) {
    return <JoinPage />;
  }

  return <Lobby />;
}

export default function App() {
  return (
    <MeetingProvider>
      <AppContent />
    </MeetingProvider>
  );
}

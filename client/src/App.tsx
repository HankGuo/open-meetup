import { useState, useEffect } from 'react';
import { MeetingProvider, useMeeting } from './context/MeetingContext';
import { Lobby } from './components/Lobby';
import { JoinPage } from './components/JoinPage';
import { HostPage } from './pages/HostPage';
import { ParticipantPage } from './pages/ParticipantPage';
import { clearRoomEntryStorage } from './context/storage';
import { Loader2 } from 'lucide-react';
import { buildServerApiUrl } from './serverUrl';

type AppView = 'checking' | 'lobby' | 'join' | 'room';

function AppContent() {
  const { myRole, myUserId, clearError } = useMeeting();
  const [view, setView] = useState<AppView>('checking');

  useEffect(() => {
    void checkServerState();
  }, []);

  // 当已经成功创建/加入房间后，自动进入房间视图
  useEffect(() => {
    if (myUserId && (myRole === 'host' || myRole === 'participant')) {
      setView('room');
    }
  }, [myUserId, myRole]);

  async function checkServerState() {
    try {
      const response = await fetch(buildServerApiUrl('/api/room/current'));
      const data = await response.json();

      if (!data.exists) {
        clearRoomEntryStorage();
        clearError();
        setView('lobby');
      } else {
        setView('join');
      }
    } catch {
      clearRoomEntryStorage();
      clearError();
      setView('lobby');
    }
  }

  if (view === 'checking') {
    return (
      <div className="page-enter flex h-full w-full items-center justify-center overflow-hidden px-4">
        <div className="glass-panel w-full max-w-md p-7 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel-soft)]">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
          </div>
          <p className="text-base font-semibold text-[var(--text)]">正在检查房间状态</p>
          <p className="mt-2 text-sm text-[var(--text-soft)]">请稍候，正在连接房间服务</p>
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

  if (view === 'join') {
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

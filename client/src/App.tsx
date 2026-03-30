import { useState, useEffect } from 'react';
import { MeetingProvider, useMeeting } from './context/MeetingContext';
import { Lobby } from './components/Lobby';
import { JoinPage } from './components/JoinPage';
import { HostPage } from './pages/HostPage';
import { ParticipantPage } from './pages/ParticipantPage';
import { STORAGE_KEYS, clearRoomEntryStorage } from './context/storage';

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
      <div className="h-full w-full overflow-hidden bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <p className="text-gray-700 font-medium">正在检查房间状态...</p>
          <p className="text-sm text-gray-500 mt-2">请稍候</p>
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
      <div className="h-full w-full overflow-hidden bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-indigo-100 rounded-full flex items-center justify-center">
            <span className="text-3xl">🎤</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">欢迎回来，主持人</h1>
          <p className="text-gray-600 mb-6">系统已有房间进行中</p>

          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6 mb-6">
            <p className="text-sm text-gray-500 mb-1">当前进度</p>
            {currentRoom.phase === 'setup' ? (
              <p className="text-2xl font-bold text-indigo-600">编排阶段</p>
            ) : (
              <p className="text-2xl font-bold text-indigo-600">
                第 {currentRoom.currentStep + 1} / {Math.max(1, currentRoom.totalPages)} 页
              </p>
            )}
          </div>

          <button
            onClick={handleEnterRoom}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
          >
            进入房间
          </button>

          <button
            onClick={handleBackToLobby}
            className="w-full mt-3 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
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

import { useMeeting } from '../context/MeetingContext';
import { MeetingStage } from '../components/MeetingStage';
import { HostControls } from '../components/HostControls';
import { LogOut, QrCode, XCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';

export function HostPage() {
  const { roomId, leaveRoom, endRoom, myTicket } = useMeeting();
  const [showQR, setShowQR] = useState(false);

  const joinUrl = `${window.location.origin}?room=${roomId}`;

  async function handleEndRoom() {
    if (!confirm('确定要结束房间吗？结束后所有用户都将被退出。')) {
      return;
    }
    await endRoom();
  }

  return (
    <div className="min-h-screen bg-gray-900 relative">
      <MeetingStage />

      <HostControls />

      <button
        onClick={() => setShowQR(true)}
        className="absolute top-4 left-4 flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-md transition-colors"
      >
        <QrCode className="w-4 h-4" />
        扫码加入
      </button>

      <button
        onClick={handleEndRoom}
        className="absolute top-4 right-4 flex items-center gap-2 px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-md transition-colors"
      >
        <XCircle className="w-4 h-4" />
        结束房间
      </button>

      <button
        onClick={() => void leaveRoom()}
        className="absolute top-4 right-36 flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-md transition-colors"
      >
        <LogOut className="w-4 h-4" />
        退出
      </button>

      <div className="absolute bottom-4 left-4 text-white/50 text-sm">
        {myTicket && <span>您的Ticket: {myTicket}</span>}
      </div>

      {showQR && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setShowQR(false)}
        >
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">扫码加入会议</h3>
              <button
                onClick={() => setShowQR(false)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col items-center">
              <div className="p-4 bg-white rounded-xl shadow-inner mb-4">
                <QRCodeSVG value={joinUrl} size={200} level="H" />
              </div>

              <p className="text-2xl font-bold text-indigo-600 tracking-wider mb-2">{roomId}</p>
              <p className="text-sm text-gray-500 mb-4">房间ID</p>

              <p className="text-xs text-gray-400 text-center">
                使用微信或其他扫码工具<br />或访问以下链接
              </p>
              <p className="text-sm text-indigo-600 break-all mt-2 font-mono">
                {joinUrl}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
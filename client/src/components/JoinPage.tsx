import { useState, useEffect } from 'react';
import { useMeeting } from '../context/MeetingContext';
import { Wifi, WifiOff, Upload, Ticket, User } from 'lucide-react';
import { STORAGE_KEYS } from '../context/storage';

export function JoinPage() {
  const { joinRoom, isConnected, isReconnecting, error, clearError } = useMeeting();
  const [mode, setMode] = useState<'ticket' | 'form'>('form');
  const [userName, setUserName] = useState('');
  const [ticket, setTicket] = useState('');
  const [avatar, setAvatar] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);

  useEffect(() => {
    const storedAvatar = localStorage.getItem(STORAGE_KEYS.avatar);
    if (storedAvatar) {
      setAvatar(storedAvatar);
      setPreviewUrl(storedAvatar);
    }
    const storedTicket = localStorage.getItem(STORAGE_KEYS.ticket);
    if (storedTicket) {
      setTicket(storedTicket);
      setMode('ticket');
    }
  }, []);

  async function verifyTicket(ticketToVerify: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/api/room/ticket-check?ticket=${encodeURIComponent(ticketToVerify)}`
      );
      const data = await response.json();
      return data;
    } catch {
      return { valid: false, error: '验证失败，请稍后重试' };
    }
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setAvatar(dataUrl);
        setPreviewUrl(dataUrl);
        localStorage.setItem(STORAGE_KEYS.avatar, dataUrl);
      };
      reader.readAsDataURL(file);
    }
  }

  async function handleJoin() {
    clearError();
    setTicketError(null);

    if (mode === 'ticket') {
      if (!ticket.trim()) {
        alert('请输入您的Ticket');
        return;
      }
      setVerifying(true);
      const verifyResult = await verifyTicket(ticket.trim());
      setVerifying(false);
      if (!verifyResult.valid) {
        setTicketError(verifyResult.error || 'Ticket无效');
        return;
      }
      setLoading(true);
      const success = await joinRoom('', ticket.trim(), undefined);
      setLoading(false);
      if (!success) {
        // Error is already set in context
      }
    } else {
      if (!userName.trim()) {
        alert('请输入您的昵称');
        return;
      }
      if (!previewUrl) {
        alert('请上传您的电子名片');
        return;
      }
      setLoading(true);
      const success = await joinRoom(userName.trim(), undefined, avatar);
      setLoading(false);
      if (!success) {
        // Error is already set in context
      }
    }
  }

  return (
    <div className="h-full w-full overflow-hidden bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">加入会议</h1>
          {isConnected ? (
            <span className="flex items-center text-green-600 text-sm">
              <Wifi className="w-4 h-4 mr-1" /> Connected
            </span>
          ) : (
            <span className="flex items-center text-red-600 text-sm">
              <WifiOff className="w-4 h-4 mr-1" /> Disconnected
            </span>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="flex mb-6 border rounded-lg overflow-hidden">
          <button
            className={`flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2 ${
              mode === 'form'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
            onClick={() => setMode('form')}
          >
            <User className="w-4 h-4" />
            首次加入
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2 ${
              mode === 'ticket'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
            onClick={() => setMode('ticket')}
          >
            <Ticket className="w-4 h-4" />
            有Ticket
          </button>
        </div>

        <div className="space-y-4">
          {mode === 'ticket' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ticket编号 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono ${
                    ticketError ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="例如: TKT-ABC12345"
                  value={ticket}
                  onChange={(e) => {
                    setTicket(e.target.value.toUpperCase());
                    setTicketError(null);
                  }}
                />
                {ticketError && (
                  <p className="mt-1 text-sm text-red-600">{ticketError}</p>
                )}
              </div>
            </>
          )}

          {mode === 'form' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  昵称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="请输入您的昵称"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  电子名片 <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50">
                    {previewUrl ? (
                      <img src={previewUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <Upload className="w-8 h-8 text-gray-400" />
                    )}
                  </div>
                  <label className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="hidden"
                    />
                    <span className="inline-block w-full py-2 px-4 text-center text-sm text-indigo-600 border border-indigo-600 rounded-lg cursor-pointer hover:bg-indigo-50">
                      上传头像
                    </span>
                  </label>
                </div>
              </div>
            </>
          )}

          <button
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            onClick={handleJoin}
            disabled={loading || !isConnected || isReconnecting || verifying}
          >
            {loading || verifying ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {verifying ? '验证中...' : '加入中...'}
              </>
            ) : (
              '加入会议'
            )}
          </button>

          {mode === 'form' && (
            <p className="text-center text-xs text-gray-500">
              首次加入将自动分配Ticket，请妥善保管
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

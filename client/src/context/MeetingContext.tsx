import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { emitWithAck, initSocket } from '../socket';
import { MeetingContextType, MeetingStatus, SessionCredentials, User, UserRole } from '../types';

const SESSION_STORAGE_KEY = 'open-meetup:session:v2';

const MeetingContext = createContext<MeetingContextType | null>(null);

interface MeetingProviderProps {
  children: ReactNode;
}

interface SocketError {
  message: string;
  code: string;
}

type SocketResponse<T> = { success: true; data: T } | { success: false; error: SocketError };

interface RoomSyncData {
  roomId: string;
  participants: User[];
  hostId: string;
  status: MeetingStatus;
  currentStep: number;
  userId: string;
  userRole: UserRole;
  userName: string;
  sessionId: string;
  avatar?: string;
  ticket?: string;
}

interface LeaveRoomData {
  roomClosed: boolean;
  reason?: string;
}

interface StateSyncEvent {
  roomId: string;
  participants: User[];
  status: MeetingStatus;
  currentStep: number;
  hostId: string;
}

export function MeetingProvider({ children }: MeetingProviderProps) {
  const storedSessionRef = useRef<SessionCredentials | null>(loadStoredSession());
  const sessionRef = useRef<SessionCredentials | null>(storedSessionRef.current);
  const reconnectingRef = useRef(false);

  const socket = useMemo(() => initSocket(), []);

  const [myUserId, setMyUserId] = useState(storedSessionRef.current?.userId ?? '');
  const [myRole, setMyRole] = useState<UserRole>('participant');
  const [myName, setMyName] = useState('');
  const [myTicket, setMyTicket] = useState('');
  const [sessionId, setSessionId] = useState(storedSessionRef.current?.sessionId ?? '');
  const [roomId, setRoomId] = useState('');
  const [participants, setParticipants] = useState<User[]>([]);
  const [hostId, setHostId] = useState('');
  const [status, setStatus] = useState<MeetingStatus>('active');
  const [currentStep, setCurrentStep] = useState(0);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [isReconnecting, setIsReconnecting] = useState(Boolean(storedSessionRef.current));
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const resetRoomState = useCallback(() => {
    setRoomId('');
    setParticipants([]);
    setHostId('');
    setStatus('ended');
    setCurrentStep(0);
    setMyRole('participant');
    setMyName('');
  }, []);

  const clearSession = useCallback(() => {
    sessionRef.current = null;
    clearStoredSession();
    setMyUserId('');
    setSessionId('');
    localStorage.removeItem('open-meetup:isHost');
    localStorage.removeItem('open-meetup:hostRoomId');
  }, []);

  const persistSession = useCallback((credentials: SessionCredentials) => {
    sessionRef.current = credentials;
    saveStoredSession(credentials);
    setMyUserId(credentials.userId);
    setSessionId(credentials.sessionId);
  }, []);

  const applySyncData = useCallback(
    (data: RoomSyncData) => {
      setRoomId(data.roomId);
      setParticipants(data.participants);
      setHostId(data.hostId);
      setStatus(data.status);
      setCurrentStep(data.currentStep);
      setMyUserId(data.userId);
      setMyRole(data.userRole);
      setMyName(data.userName);
      setSessionId(data.sessionId);
      setMyTicket(data.ticket || '');
      persistSession({
        roomId: data.roomId,
        userId: data.userId,
        sessionId: data.sessionId,
      });
      setError(null);
    },
    [persistSession],
  );

  const handleSocketFailure = useCallback((errorData: SocketError | undefined, fallback: string) => {
    setError(errorData?.message || fallback);
  }, []);

  const handleReconnectFailure = useCallback(
    (errorData?: SocketError) => {
      const code = errorData?.code;
      if (code === 'ROOM_NOT_FOUND' || code === 'SESSION_EXPIRED' || code === 'USER_NOT_FOUND' || code === 'ROOM_CLOSED' || code === 'BAD_REQUEST') {
        clearSession();
        resetRoomState();
      }
      setError(errorData?.message || 'Reconnection failed');
    },
    [clearSession, resetRoomState],
  );

  const safeEmit = useCallback(
    async (event: string, payload?: unknown): Promise<SocketResponse<unknown> | null> => {
      try {
        const response = await emitWithAck<SocketResponse<unknown>>(event, payload);
        return response;
      } catch (emitError) {
        const message =
          emitError instanceof Error && emitError.message.includes('timeout')
            ? '请求超时，请检查网络连接后重试'
            : '网络连接异常，请稍后重试';
        setError(message);
        return null;
      }
    },
    [],
  );

  const reconnectWithSession = useCallback(async () => {
    if (reconnectingRef.current) {
      return;
    }

    const currentSession = sessionRef.current;
    if (!currentSession) {
      setIsReconnecting(false);
      return;
    }

    reconnectingRef.current = true;
    setIsReconnecting(true);

    const response = (await safeEmit('room:reconnect', currentSession)) as SocketResponse<RoomSyncData> | null;
    if (!response) {
      reconnectingRef.current = false;
      setIsReconnecting(false);
      return;
    }

    if (response.success) {
      applySyncData(response.data);
    } else {
      handleReconnectFailure(response.error);
    }

    reconnectingRef.current = false;
    setIsReconnecting(false);
  }, [applySyncData, handleReconnectFailure, safeEmit]);

  const createRoom = useCallback(
    async (userName: string, roomId: string, password: string): Promise<boolean> => {
      if (!isConnected) {
        setError('未连接到服务器，请稍后再试');
        return false;
      }

      const response = (await safeEmit('room:create', { userName, roomId, password })) as SocketResponse<RoomSyncData> | null;
      if (!response) {
        return false;
      }
      if (!response.success) {
        handleSocketFailure(response.error, '创建会议失败');
        return false;
      }

      applySyncData(response.data);
      localStorage.setItem('open-meetup:isHost', 'true');
      localStorage.setItem('open-meetup:hostRoomId', response.data.roomId);
      return true;
    },
    [applySyncData, handleSocketFailure, isConnected, safeEmit],
  );

  const joinRoom = useCallback(
    async (roomIdToJoin: string, userName: string, ticket?: string, avatar?: string): Promise<boolean> => {
      if (!isConnected) {
        setError('未连接到服务器，请稍后再试');
        return false;
      }

      const response = (await safeEmit('room:join', {
        roomId: roomIdToJoin,
        userName,
        ticket,
        avatar,
      })) as SocketResponse<RoomSyncData> | null;
      if (!response) {
        return false;
      }
      if (!response.success) {
        handleSocketFailure(response.error, '加入会议失败');
        return false;
      }

      applySyncData(response.data);
      if (response.data.ticket) {
        localStorage.setItem('open-meetup:ticket', response.data.ticket);
      }
      return true;
    },
    [applySyncData, handleSocketFailure, isConnected, safeEmit],
  );

  const leaveRoom = useCallback(async (): Promise<boolean> => {
    const session = sessionRef.current;
    if (!session) {
      resetRoomState();
      clearSession();
      return true;
    }

    if (!isConnected) {
      resetRoomState();
      clearSession();
      return true;
    }

    const response = (await safeEmit('room:leave', {})) as SocketResponse<LeaveRoomData> | null;
    if (!response) {
      return false;
    }
    if (!response.success) {
      handleSocketFailure(response.error, '离开会议失败');
      return false;
    }

    if (response.data.roomClosed && response.data.reason) {
      setError(mapRoomClosedReason(response.data.reason));
    } else {
      setError(null);
    }

    resetRoomState();
    clearSession();
    return true;
  }, [clearSession, handleSocketFailure, isConnected, resetRoomState, safeEmit]);

  const endRoom = useCallback(async (): Promise<boolean> => {
    const session = sessionRef.current;
    if (!session) {
      resetRoomState();
      clearSession();
      return true;
    }

    if (!isConnected) {
      resetRoomState();
      clearSession();
      return true;
    }

    const response = (await safeEmit('room:end', {})) as SocketResponse<{ closed: boolean }> | null;
    if (!response) {
      return false;
    }
    if (!response.success) {
      handleSocketFailure(response.error, '结束房间失败');
      return false;
    }

    resetRoomState();
    clearSession();
    return true;
  }, [clearSession, handleSocketFailure, isConnected, resetRoomState, safeEmit]);

  const nextStep = useCallback(async (): Promise<boolean> => {
    const response = (await safeEmit('control:next', {})) as SocketResponse<null> | null;
    if (!response) {
      return false;
    }
    if (!response.success) {
      handleSocketFailure(response.error, '切换步骤失败');
      return false;
    }
    return true;
  }, [handleSocketFailure, safeEmit]);

  const prevStep = useCallback(async (): Promise<boolean> => {
    const response = (await safeEmit('control:prev', {})) as SocketResponse<null> | null;
    if (!response) {
      return false;
    }
    if (!response.success) {
      handleSocketFailure(response.error, '切换步骤失败');
      return false;
    }
    return true;
  }, [handleSocketFailure, safeEmit]);

  const endMeeting = useCallback(async (): Promise<boolean> => {
    const response = (await safeEmit('control:end', {})) as SocketResponse<null> | null;
    if (!response) {
      return false;
    }
    if (!response.success) {
      handleSocketFailure(response.error, '结束会议失败');
      return false;
    }
    return true;
  }, [handleSocketFailure, safeEmit]);

  useEffect(() => {
    const onConnect = () => {
      setIsConnected(true);
      if (sessionRef.current) {
        void reconnectWithSession();
      }
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    const onUserJoined = (data: { user: User }) => {
      setParticipants((prev) => {
        const exists = prev.some((participant) => participant.userId === data.user.userId);
        if (exists) {
          return prev.map((participant) => (participant.userId === data.user.userId ? data.user : participant));
        }
        return [...prev, data.user];
      });
    };

    const onUserLeft = (data: { user: User }) => {
      setParticipants((prev) => prev.filter((participant) => participant.userId !== data.user.userId));
    };

    const onUserOnline = (data: { user: User }) => {
      setParticipants((prev) => {
        const exists = prev.some((participant) => participant.userId === data.user.userId);
        if (!exists) {
          return [...prev, data.user];
        }
        return prev.map((participant) => (participant.userId === data.user.userId ? data.user : participant));
      });
    };

    const onUserOffline = (data: { user: User }) => {
      setParticipants((prev) =>
        prev.map((participant) => (participant.userId === data.user.userId ? data.user : participant)),
      );
    };

    const onStateSync = (data: StateSyncEvent) => {
      setRoomId(data.roomId);
      setParticipants(data.participants);
      setHostId(data.hostId);
      setStatus(data.status);
      setCurrentStep(data.currentStep);
    };

    const onMeetingStarted = (data: { status: MeetingStatus; currentStep: number }) => {
      setStatus(data.status);
      setCurrentStep(data.currentStep);
    };

    const onMeetingNext = (data: { currentStep: number }) => {
      setCurrentStep(data.currentStep);
    };

    const onMeetingEnded = (data: { status: MeetingStatus }) => {
      setStatus(data.status);
    };

    const onRoomClosed = (data: { reason: string }) => {
      resetRoomState();
      clearSession();
      setError(mapRoomClosedReason(data.reason));
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:user-joined', onUserJoined);
    socket.on('room:user-left', onUserLeft);
    socket.on('room:user-online', onUserOnline);
    socket.on('room:user-offline', onUserOffline);
    socket.on('state:sync', onStateSync);
    socket.on('control:started', onMeetingStarted);
    socket.on('control:next', onMeetingNext);
    socket.on('control:ended', onMeetingEnded);
    socket.on('room:closed', onRoomClosed);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:user-joined', onUserJoined);
      socket.off('room:user-left', onUserLeft);
      socket.off('room:user-online', onUserOnline);
      socket.off('room:user-offline', onUserOffline);
      socket.off('state:sync', onStateSync);
      socket.off('control:started', onMeetingStarted);
      socket.off('control:next', onMeetingNext);
      socket.off('control:ended', onMeetingEnded);
      socket.off('room:closed', onRoomClosed);
    };
  }, [clearSession, reconnectWithSession, resetRoomState, socket]);

  useEffect(() => {
    if (socket.connected && sessionRef.current) {
      void reconnectWithSession();
    } else if (!sessionRef.current) {
      setIsReconnecting(false);
    }
  }, [reconnectWithSession, socket.connected]);

  const value: MeetingContextType = {
    roomId,
    participants,
    hostId,
    status,
    currentStep,
    myUserId,
    myRole,
    myName,
    myTicket,
    sessionId,
    isConnected,
    isReconnecting,
    error,
    createRoom,
    joinRoom,
    leaveRoom,
    endRoom,
    prevStep,
    nextStep,
    endMeeting,
    clearError,
  };

  return <MeetingContext.Provider value={value}>{children}</MeetingContext.Provider>;
}

export function useMeeting(): MeetingContextType {
  const context = useContext(MeetingContext);
  if (!context) {
    throw new Error('useMeeting must be used within a MeetingProvider');
  }
  return context;
}

function saveStoredSession(session: SessionCredentials) {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore storage failure
  }
}

function clearStoredSession() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore storage failure
  }
}

function loadStoredSession(): SessionCredentials | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<SessionCredentials>;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    if (!parsed.roomId || !parsed.userId || !parsed.sessionId) {
      return null;
    }
    return {
      roomId: parsed.roomId,
      userId: parsed.userId,
      sessionId: parsed.sessionId,
    };
  } catch {
    return null;
  }
}

function mapRoomClosedReason(reason: string): string {
  if (reason === 'HOST_LEFT') {
    return '主持人已离开，会议已关闭';
  }
  if (reason === 'HOST_TIMEOUT') {
    return '主持人离线超时，会议已关闭';
  }
  if (reason === 'ROOM_EXPIRED') {
    return '会议已过期，请重新创建';
  }
  return '会议已关闭';
}

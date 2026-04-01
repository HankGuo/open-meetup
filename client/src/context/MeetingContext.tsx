import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { emitWithAck, initSocket } from '../socket';
import {
  MeetingContextType,
  MeetingPageDefinition,
  MeetingPhase,
  PageContent,
  SessionCredentials,
  User,
  UserRole,
} from '../types';
import { STORAGE_KEYS, clearAllLocalStorage } from './storage';
import { createDefaultMeetingPages } from '../meetingConfig';

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
  title: string;
  participants: User[];
  hostId: string;
  phase: MeetingPhase;
  currentStep: number;
  pages: MeetingPageDefinition[];
  userId: string;
  userRole: UserRole;
  sessionId: string;
  ticket?: string;
  pageContents?: Array<[string, { type: 'canvas' | 'image' | 'url' | 'html' | 'markdown'; content: string }]>;
}

interface LeaveRoomData {
  roomClosed: boolean;
  reason?: string;
}

interface StateSyncEvent {
  participants: User[];
  phase: MeetingPhase;
  currentStep: number;
  hostId: string;
  pages: MeetingPageDefinition[];
  pageContents?: Array<[string, { type: 'canvas' | 'image' | 'url' | 'html' | 'markdown'; content: string }]>;
}

export function MeetingProvider({ children }: MeetingProviderProps) {
  const sessionRef = useRef<SessionCredentials | null>(null);
  const reconnectingRef = useRef(false);

  const socket = useMemo(() => initSocket(), []);

  const [myUserId, setMyUserId] = useState('');
  const [myRole, setMyRole] = useState<UserRole>('participant');
  const [myTicket, setMyTicket] = useState('');
  const [title, setTitle] = useState('');
  const [participants, setParticipants] = useState<User[]>([]);
  const [hostId, setHostId] = useState('');
  const [phase, setPhase] = useState<MeetingPhase>('setup');
  const [currentStep, setCurrentStep] = useState(0);
  const [pages, setPages] = useState<MeetingPageDefinition[]>(createDefaultMeetingPages);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageContents, setPageContents] = useState<Map<string, PageContent>>(new Map());

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const resetRoomState = useCallback(() => {
    setParticipants([]);
    setHostId('');
    setPhase('setup');
    setCurrentStep(0);
    setPages(createDefaultMeetingPages());
    setMyRole('participant');
    setPageContents(new Map());
  }, []);

  const clearSession = useCallback(() => {
    sessionRef.current = null;
    setMyUserId('');
    setMyTicket('');
    setIsReconnecting(false);
  }, []);

  const persistSession = useCallback((credentials: SessionCredentials) => {
    sessionRef.current = credentials;
    setMyUserId(credentials.userId);
  }, []);

  const applySyncData = useCallback(
    (data: RoomSyncData) => {
      setTitle(data.title);
      setParticipants(data.participants);
      setHostId(data.hostId);
      setPhase(data.phase);
      setCurrentStep(data.currentStep);
      setPages(data.pages);
      setMyUserId(data.userId);
      setMyRole(data.userRole);
      setMyTicket(data.ticket || '');
      setPageContents(new Map(data.pageContents ?? []));
      persistSession({
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
      if (code === 'ROOM_NOT_FOUND') {
        setError(null);
        return;
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
    async (userName: string, title: string, password: string, participantLimit: number): Promise<boolean> => {
      if (!isConnected) {
        setError('未连接到服务器，请稍后再试');
        return false;
      }

      const response = (await safeEmit('room:create', { userName, title, password, participantLimit })) as SocketResponse<RoomSyncData> | null;
      if (!response) {
        return false;
      }
      if (!response.success) {
        handleSocketFailure(response.error, '创建房间失败');
        return false;
      }

      applySyncData(response.data);
      if (response.data.ticket) {
        localStorage.setItem(STORAGE_KEYS.ticket, response.data.ticket);
      }
      return true;
    },
    [applySyncData, handleSocketFailure, isConnected, safeEmit],
  );

  const joinRoom = useCallback(
    async (userName: string, ticket?: string): Promise<boolean> => {
      if (!isConnected) {
        setError('未连接到服务器，请稍后再试');
        return false;
      }

      const response = (await safeEmit('room:join', {
        userName,
        ticket,
      })) as SocketResponse<RoomSyncData> | null;
      if (!response) {
        return false;
      }
      if (!response.success) {
        handleSocketFailure(response.error, '加入房间失败');
        return false;
      }

      applySyncData(response.data);
      if (response.data.ticket) {
        localStorage.setItem(STORAGE_KEYS.ticket, response.data.ticket);
      }
      return true;
    },
    [applySyncData, handleSocketFailure, isConnected, safeEmit],
  );

  const leaveRoom = useCallback(async (): Promise<boolean> => {
    const session = sessionRef.current;
    if (!session) {
      clearAllLocalStorage();
      resetRoomState();
      clearSession();
      return true;
    }

    if (!isConnected) {
      clearAllLocalStorage();
      resetRoomState();
      clearSession();
      return true;
    }

    const response = (await safeEmit('room:leave', {})) as SocketResponse<LeaveRoomData> | null;
    if (!response) {
      return false;
    }
    if (!response.success) {
      handleSocketFailure(response.error, '离开房间失败');
      return false;
    }

    if (response.data.roomClosed && response.data.reason) {
      setError(mapRoomClosedReason(response.data.reason));
    } else {
      setError(null);
    }

    clearAllLocalStorage();
    resetRoomState();
    clearSession();
    return true;
  }, [clearSession, handleSocketFailure, isConnected, resetRoomState, safeEmit]);

  const endRoom = useCallback(async (): Promise<boolean> => {
    const session = sessionRef.current;
    if (!session) {
      clearAllLocalStorage();
      resetRoomState();
      clearSession();
      return true;
    }

    if (!isConnected) {
      clearAllLocalStorage();
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

    clearAllLocalStorage();
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

  const startLive = useCallback(async (): Promise<boolean> => {
    const response = (await safeEmit('control:start-live', {})) as SocketResponse<null> | null;
    if (!response) {
      return false;
    }
    if (!response.success) {
      handleSocketFailure(response.error, '开始播放失败');
      return false;
    }
    return true;
  }, [handleSocketFailure, safeEmit]);

  const returnToSetup = useCallback(async (): Promise<boolean> => {
    const response = (await safeEmit('control:return-setup', {})) as SocketResponse<null> | null;
    if (!response) {
      return false;
    }
    if (!response.success) {
      handleSocketFailure(response.error, '返回编辑页失败');
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

  const updatePageContent = useCallback(
    async (pageId: string, content: PageContent | null): Promise<boolean> => {
      const response = (await safeEmit('page:update', { pageId, content })) as SocketResponse<RoomSyncData> | null;
      if (!response) {
        return false;
      }
      if (!response.success) {
        handleSocketFailure(response.error, '更新页面内容失败');
        return false;
      }
      return true;
    },
    [handleSocketFailure, safeEmit],
  );

  const updatePages = useCallback(
    async (nextPages: MeetingPageDefinition[]): Promise<boolean> => {
      const response = (await safeEmit('pages:update', { pages: nextPages })) as SocketResponse<RoomSyncData> | null;
      if (!response) {
        return false;
      }
      if (!response.success) {
        handleSocketFailure(response.error, '更新页面顺序失败');
        return false;
      }
      return true;
    },
    [handleSocketFailure, safeEmit],
  );

  const submitMyWork = useCallback(
    async (pageId: string, url: string, description: string): Promise<boolean> => {
      const response = (await safeEmit('work:submit', { pageId, url, description })) as SocketResponse<RoomSyncData> | null;
      if (!response) {
        return false;
      }
      if (!response.success) {
        handleSocketFailure(response.error, '提交作品失败');
        return false;
      }
      return true;
    },
    [handleSocketFailure, safeEmit],
  );

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
      setParticipants(data.participants);
      setHostId(data.hostId);
      setPhase(data.phase);
      setCurrentStep(data.currentStep);
      setPages(data.pages);
      setPageContents(new Map(data.pageContents ?? []));
    };

    const onMeetingNext = (data: { currentStep: number }) => {
      setCurrentStep(data.currentStep);
    };

    const onRoomClosed = (data: { reason: string }) => {
      clearAllLocalStorage();
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
    socket.on('control:next', onMeetingNext);
    socket.on('room:closed', onRoomClosed);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:user-joined', onUserJoined);
      socket.off('room:user-left', onUserLeft);
      socket.off('room:user-online', onUserOnline);
      socket.off('room:user-offline', onUserOffline);
      socket.off('state:sync', onStateSync);
      socket.off('control:next', onMeetingNext);
      socket.off('room:closed', onRoomClosed);
    };
  }, [clearSession, reconnectWithSession, resetRoomState, socket]);

  useEffect(() => {
    if (isConnected && sessionRef.current) {
      void reconnectWithSession();
    } else if (!sessionRef.current) {
      setIsReconnecting(false);
    }
  }, [isConnected, reconnectWithSession]);

  const value: MeetingContextType = {
    title,
    participants,
    hostId,
    phase,
    currentStep,
    pages,
    pageContents,
    myUserId,
    myRole,
    myTicket,
    isConnected,
    isReconnecting,
    error,
    createRoom,
    joinRoom,
    leaveRoom,
    endRoom,
    startLive,
    returnToSetup,
    prevStep,
    nextStep,
    updatePageContent,
    updatePages,
    submitMyWork,
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

function mapRoomClosedReason(reason: string): string {
  if (reason === 'HOST_ENDED') {
    return '主持人已结束房间';
  }
  if (reason === 'HOST_LEFT') {
    return '主持人已离开，房间已关闭';
  }
  if (reason === 'HOST_TIMEOUT') {
    return '主持人离线超时，房间已关闭';
  }
  if (reason === 'ROOM_EXPIRED') {
    return '房间已过期，请重新创建';
  }
  return '房间已关闭';
}

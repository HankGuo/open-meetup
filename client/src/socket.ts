import { io, Socket } from 'socket.io-client';
import { SessionCredentials } from './types';
import { getServerBaseUrl } from './serverUrl';

const SERVER_URL = getServerBaseUrl();
const ACK_TIMEOUT_MS = Number(import.meta.env.VITE_SOCKET_ACK_TIMEOUT_MS || 6000);

let socket: Socket | null = null;

export function initSocket(initialAuth?: Partial<SessionCredentials>): Socket {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      auth: initialAuth ?? {},
    });
  } else if (initialAuth) {
    socket.auth = initialAuth;
  }
  return socket;
}

export function getSocket(): Socket {
  if (!socket) {
    return initSocket();
  }
  return socket;
}

export function emitWithAck<T>(
  event: string,
  payload?: unknown,
  timeoutMs: number = ACK_TIMEOUT_MS,
): Promise<T> {
  const currentSocket = getSocket();
  return new Promise((resolve, reject) => {
    currentSocket.timeout(timeoutMs).emit(event, payload ?? {}, (err: Error | null, response: T) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(response);
    });
  });
}

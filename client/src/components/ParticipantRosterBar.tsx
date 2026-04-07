import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Crown, Users, X } from 'lucide-react';
import { useMeeting } from '../context/MeetingContext';
import { User } from '../types';

const INLINE_PREVIEW_LIMIT = 4;
const MENU_LIMIT = 10;

interface ParticipantRosterBarProps {
  topActions?: ReactNode;
}

export function ParticipantRosterBar({ topActions }: ParticipantRosterBarProps) {
  const { participants, hostId, myUserId } = useMeeting();
  const [showMenu, setShowMenu] = useState(false);
  const [showFullList, setShowFullList] = useState(false);
  const menuRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showMenu) {
      return;
    }

    function handleOutsideClick(event: MouseEvent) {
      if (!menuRootRef.current?.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }

    function handleEsc(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowMenu(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [showMenu]);

  const sortedParticipants = useMemo(
    () => [...participants].sort((a, b) => a.joinedAt - b.joinedAt),
    [participants],
  );

  const host = sortedParticipants.find((participant) => participant.userId === hostId) ?? null;
  const me = sortedParticipants.find((participant) => participant.userId === myUserId) ?? null;
  const others = sortedParticipants.filter(
    (participant) => participant.userId !== hostId && participant.userId !== myUserId,
  );
  const hostAndMeAreSame = host && me && host.userId === me.userId;
  const menuMembers = sortedParticipants.slice(0, MENU_LIMIT);
  const hiddenMenuCount = Math.max(0, sortedParticipants.length - MENU_LIMIT);

  const previewParticipants = useMemo(() => {
    const preview: User[] = [];
    if (host) {
      preview.push(host);
    }
    if (me && (!host || me.userId !== host.userId)) {
      preview.push(me);
    }
    for (const participant of others) {
      if (preview.length >= INLINE_PREVIEW_LIMIT) {
        break;
      }
      preview.push(participant);
    }
    return preview.slice(0, INLINE_PREVIEW_LIMIT);
  }, [host, me, others]);

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-2 z-30 px-3 md:px-4">
        <div className="pointer-events-auto mx-auto w-full">
          <div className="stage-topbar-surface flex h-10 items-center justify-between gap-2 px-1.5">
            <div ref={menuRootRef} className="relative min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setShowMenu((prev) => !prev)}
                className="stage-topbar-trigger flex h-8 w-full min-w-0 items-center gap-2 px-2"
                aria-haspopup="menu"
                aria-expanded={showMenu}
              >
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--panel-soft)]">
                  <Users className="h-3.5 w-3.5 text-[var(--text-soft)]" />
                </span>

                <span className="shrink-0 text-xs font-semibold">成员 {sortedParticipants.length}</span>

                <div className="hidden min-w-0 flex-1 items-center -space-x-1.5 sm:flex">
                  {previewParticipants.map((participant, index) => {
                    const tone =
                      index === 0
                        ? 'border-amber-300'
                        : index === 1 && !hostAndMeAreSame
                          ? 'border-indigo-300'
                          : 'border-[var(--border)]';
                    return (
                      <AvatarCircle
                        key={participant.userId}
                        participant={participant}
                        sizeClassName={`h-5 w-5 border ${tone}`}
                      />
                    );
                  })}
                </div>

                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 text-[var(--text-soft)] transition ${showMenu ? 'rotate-180' : ''}`}
                />
              </button>

              {showMenu ? (
                <div className="stage-topbar-popover absolute left-0 top-[calc(100%+8px)] w-[min(92vw,360px)] overflow-hidden p-2 text-[var(--text)]">
                  <div className="mb-1 flex items-center justify-between px-2 py-1">
                    <p className="text-xs font-semibold text-[var(--text-soft)]">已加入人员（按时间）</p>
                    <button
                      type="button"
                      onClick={() => setShowMenu(false)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-soft)] hover:bg-[var(--panel-soft)]"
                      aria-label="关闭名单菜单"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="max-h-[50vh] overflow-auto pr-1">
                    {menuMembers.map((participant, index) => {
                      const isHost = participant.userId === hostId;
                      const isMe = participant.userId === myUserId;
                      return (
                        <div
                          key={participant.userId}
                          className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-[var(--panel-soft)]"
                        >
                          <span className="w-5 text-center text-[11px] text-[var(--text-soft)]">
                            {index + 1}
                          </span>
                          <AvatarCircle
                            participant={participant}
                            sizeClassName="h-7 w-7 border border-[var(--border)]"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-[var(--text)]">
                              {participant.userName}
                            </p>
                            <div className="mt-0.5 flex items-center gap-1 text-[10px] text-[var(--text-soft)]">
                              {isHost ? <Crown className="h-3 w-3 text-amber-500" /> : null}
                              <span>{isHost ? '主持人' : isMe ? '我' : '参与者'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {hiddenMenuCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        setShowFullList(true);
                      }}
                      className="mt-2 w-full rounded-xl border border-dashed border-[var(--border)] px-2 py-1.5 text-xs text-[var(--text-soft)] hover:border-[var(--primary)]/45 hover:text-[var(--text)]"
                    >
                      查看完整名单（{sortedParticipants.length} 人）
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {topActions ? <div className="flex shrink-0 items-center gap-1 px-0.5">{topActions}</div> : null}
          </div>
        </div>
      </div>

      {showFullList ? (
        <div
          className="dialog-overlay fixed inset-0 z-50 flex items-start justify-center p-4 pt-20"
          onClick={() => setShowFullList(false)}
        >
          <div
            className="dialog-panel w-full max-w-2xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <h3 className="text-base font-semibold text-[var(--text)]">完整人员名单（按加入时间）</h3>
              <button
                type="button"
                onClick={() => setShowFullList(false)}
                className="btn-base h-9 w-9 rounded-full border border-[var(--border)] bg-[var(--panel-light)] p-0 text-[var(--text)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto">
              {sortedParticipants.map((participant, index) => {
                const isHost = participant.userId === hostId;
                const isMe = participant.userId === myUserId;

                return (
                  <div
                    key={participant.userId}
                    className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-3 last:border-b-0"
                  >
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--panel-soft)] text-xs font-semibold text-[var(--text-soft)]">
                      {index + 1}
                    </div>
                    <AvatarCircle participant={participant} sizeClassName="h-10 w-10" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text)]">
                        {participant.userName}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        {isHost ? (
                          <span className="rounded-full border border-amber-300 bg-amber-100/80 px-2 py-0.5 text-xs font-medium text-amber-700">
                            主持人
                          </span>
                        ) : null}
                        {!isHost && isMe ? (
                          <span className="rounded-full border border-indigo-300 bg-indigo-100/80 px-2 py-0.5 text-xs font-medium text-indigo-700">
                            我
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function AvatarCircle({ participant, sizeClassName }: { participant: User | null; sizeClassName: string }) {
  const fallbackText = getFallbackAvatarText(participant);

  return <div className={`${sizeClassName} avatar-fallback text-[11px] font-semibold`}>{fallbackText}</div>;
}

function getFallbackAvatarText(participant: User | null): string {
  if (!participant?.userName?.trim()) {
    return '?';
  }
  return participant.userName.trim().charAt(0).toUpperCase();
}

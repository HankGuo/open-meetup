import { useMeeting } from '../context/MeetingContext';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function HostControls() {
  const { currentStep, prevStep, nextStep, isConnected, pages } = useMeeting();
  const totalPages = pages.length;

  const canGoPrev = currentStep > 0;
  const canGoNext = currentStep < totalPages - 1;

  return (
    <div className="control-surface fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 px-1.5 py-1">
      <button
        type="button"
        onClick={() => prevStep()}
        disabled={!canGoPrev || !isConnected}
        aria-label="上一页"
        title="上一页"
        className="btn-base btn-compact control-btn h-8 w-8 rounded-md p-0 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>

      <div className="control-counter px-2 py-1 text-[11px]">
        <span className="font-semibold text-[var(--text)]">{currentStep + 1}</span>
        <span className="px-1 text-[var(--text-soft)]">/</span>
        <span>{totalPages}</span>
      </div>

      <button
        type="button"
        onClick={() => nextStep()}
        disabled={!canGoNext || !isConnected}
        aria-label="下一页"
        title="下一页"
        className="btn-base btn-compact control-btn control-btn--primary h-8 w-8 rounded-md p-0 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

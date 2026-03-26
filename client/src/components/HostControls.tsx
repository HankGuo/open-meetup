import { useMeeting } from '../context/MeetingContext';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function HostControls() {
  const { currentStep, prevStep, nextStep, isConnected } = useMeeting();

  const canGoPrev = currentStep > 0;
  const canGoNext = currentStep < 4;

  return (
    <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-4 bg-white/90 backdrop-blur-sm rounded-full shadow-lg px-6 py-3">
      <button
        onClick={() => prevStep()}
        disabled={!canGoPrev || !isConnected}
        className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 rounded-full text-gray-700 font-medium transition-colors"
      >
        <ChevronLeft className="w-5 h-5" />
        上一页
      </button>

      <div className="flex items-center gap-2">
        <span className="text-lg font-bold text-gray-800">{currentStep + 1}</span>
        <span className="text-gray-400">/</span>
        <span className="text-lg text-gray-500">5</span>
      </div>

      <button
        onClick={() => nextStep()}
        disabled={!canGoNext || !isConnected}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-50 disabled:text-gray-400 text-white rounded-full font-medium transition-colors"
      >
        下一页
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}
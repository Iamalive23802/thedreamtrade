import Modal from './Modal';

export type FreeTrialAlert = {
  id: string;
  fullName: string;
  rmName: string;
  markedAt: string;
};

interface FreeTrialAlertModalProps {
  alert: FreeTrialAlert | null;
  queueTotal: number;
  onCheckNow: () => void;
  onDismiss: () => void;
}

function FreeTrialAlertModal({
  alert,
  queueTotal,
  onCheckNow,
  onDismiss,
}: FreeTrialAlertModalProps) {
  if (!alert) return null;

  return (
    <Modal
      isOpen={!!alert}
      onClose={onDismiss}
      title="Free Trial Lead"
      size="md"
    >
      <div className="space-y-4 text-gray-200">
        <div className="rounded-lg bg-indigo-900/30 border border-indigo-700/50 p-4 space-y-3">
          <p className="text-sm text-indigo-200">
            A lead has been marked as <strong className="text-white">Free Trial</strong>.
            {queueTotal > 1 && (
              <span className="block mt-1 text-indigo-300/80">
                {queueTotal} alert{queueTotal > 1 ? 's' : ''} in queue
              </span>
            )}
          </p>
          <div className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex justify-between gap-4 border-b border-indigo-700/40 pb-2">
              <span className="text-gray-400">Lead Name</span>
              <span className="font-medium text-white text-right">{alert.fullName}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">RM Name</span>
              <span className="font-medium text-white text-right">{alert.rmName}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-white transition-colors"
            onClick={onDismiss}
          >
            Later
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            onClick={onCheckNow}
          >
            Check Now
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default FreeTrialAlertModal;

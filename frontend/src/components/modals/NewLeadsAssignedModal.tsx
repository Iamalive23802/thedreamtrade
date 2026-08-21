import Modal from './Modal';

interface NewLeadsAssignedModalProps {
  isOpen: boolean;
  count: number;
  onClose: () => void;
  onViewLeads: () => void;
}

function NewLeadsAssignedModal({
  isOpen,
  count,
  onClose,
  onViewLeads,
}: NewLeadsAssignedModalProps) {
  if (!isOpen || count <= 0) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Leads Assigned" size="md">
      <div className="space-y-4 text-gray-200">
        <div className="flex items-start gap-3 rounded-lg bg-blue-900/30 border border-blue-700/50 p-4">
          <span className="text-2xl" aria-hidden>
            🔔
          </span>
          <div>
            <p className="font-medium text-white">
              You have been assigned {count} new lead{count > 1 ? 's' : ''}!
            </p>
            <p className="text-sm text-gray-400 mt-1">
              New leads were assigned to you. Please review and follow up from the Leads page.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-white transition-colors"
            onClick={onClose}
          >
            OK
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            onClick={onViewLeads}
          >
            View Leads
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default NewLeadsAssignedModal;

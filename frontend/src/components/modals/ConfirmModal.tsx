import Modal from './Modal';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  message: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({ isOpen, onClose, onConfirm, message }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Confirm Action">
      <p className="mb-6">{message}</p>
      <div className="flex justify-end space-x-3">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button
  className="btn btn-primary"
  onClick={() => {
    console.log("✅ Confirm button clicked inside ConfirmModal"); // ← THIS
    onConfirm(); // Call the function passed from LeadModal
  }}
>
  Confirm
</button>
      </div>
    </Modal>
  );
};

export default ConfirmModal;

import { useToastStore } from '../stores/toastStore';

const ToastContainer = () => {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed top-4 right-4 space-y-2 z-50">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast border-l-4 bg-surface text-white ${
            toast.type === 'success'
              ? 'border-emerald-500'
              : toast.type === 'error'
              ? 'border-danger'
              : 'border-primary'
          }`}
        >
          <span className="flex-1">{toast.message}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => removeToast(toast.id)} className="ml-3 text-gray-400 hover:text-white">×</button>
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;

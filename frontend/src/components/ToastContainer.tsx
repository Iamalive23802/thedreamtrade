import { useToastStore } from '../stores/toastStore';

const ToastContainer = () => {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed top-4 right-4 space-y-2 z-50">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast flex items-center border-l-4 shadow px-4 py-2 rounded bg-gray-800 text-white ${
            toast.type === 'success'
              ? 'border-green-500'
              : toast.type === 'error'
              ? 'border-red-500'
              : 'border-blue-500'
          }`}
        >
          <span className="flex-1">{toast.message}</span>
          <button onClick={() => removeToast(toast.id)} className="ml-3 text-gray-400 hover:text-white">×</button>
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;

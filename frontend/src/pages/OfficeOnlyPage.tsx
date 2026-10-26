import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { checkNetworkAccess } from '../utils/networkAccess';
import { homePathForRole } from '../utils/homePath';

function OfficeOnlyPage() {
  const [checking, setChecking] = useState(false);
  const navigate = useNavigate();

  const handleRetry = async () => {
    setChecking(true);
    try {
      const { allowed } = await checkNetworkAccess();
      if (allowed) {
        const isAuthenticated = sessionStorage.getItem('isAuthenticated') === 'true';
        navigate(isAuthenticated ? homePathForRole(sessionStorage.getItem('role')) : '/login', { replace: true });
        window.location.reload();
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-8 text-center shadow-xl">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15">
          <svg
            className="h-8 w-8 text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01M3 12a9 9 0 1118 0 9 9 0 01-18 0zm9-3h.01"
            />
          </svg>
        </div>

        <h1 className="mb-3 text-2xl font-semibold tracking-tight text-white">Office Connection Required</h1>
        <p className="text-gray-300 mb-2">
          Login is allowed only from authorized office connections.
        </p>
        <p className="text-gray-400 text-sm mb-8">
          Please connect to your office WiFi or approved network, then try again.
        </p>

        <button
          type="button"
          onClick={handleRetry}
          disabled={checking}
          className="btn btn-primary w-full"
        >
          {checking ? 'Checking connection...' : 'Check again'}
        </button>
      </div>
    </div>
  );
}

export default OfficeOnlyPage;

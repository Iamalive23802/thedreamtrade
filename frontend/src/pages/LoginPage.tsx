import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';
import { useToastStore } from '../stores/toastStore';
import { homePathForRole } from '../utils/homePath';

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const { login, loading, error, isAuthenticated } = useAuthStore();
  const addToast = useToastStore((state) => state.addToast);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    try {
      await login(email, password);
      // newLeadsCount will be handled in useEffect
    } catch (err) {
      // Error handled in useEffect
    }
  };

  useEffect(() => {
    if (error) {
      setErrorMsg(error);
      addToast(error, 'error');
      return; 
    }

    if (isAuthenticated) {
      const role = sessionStorage.getItem('role');
      const newLeadsCountStr = sessionStorage.getItem('newLeadsCount');
      const newLeadsCount = newLeadsCountStr ? parseInt(newLeadsCountStr, 10) : 0;

      if (role === 'relationship_mgr' && newLeadsCount > 0) {
        sessionStorage.setItem('showNewLeadsPopup', 'true');
      } else {
        sessionStorage.removeItem('newLeadsCount');
        addToast('Logged in successfully', 'success');
      }

      navigate(homePathForRole(role));
    }
  }, [error, isAuthenticated, addToast, navigate]);


  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-8 shadow-xl">
        <p className="text-center text-xs uppercase tracking-[0.18em] text-gray-500">Dream Trade</p>
        <h1 className="mb-6 mt-2 text-center text-2xl font-semibold tracking-tight text-white">Login</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="form-label">Email</label>
            <input
              id="email"
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="form-label">Password</label>
            <input
              id="password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {errorMsg && (
            <div className="text-sm text-red-400" role="alert">{errorMsg}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;

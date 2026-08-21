import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';
import { useToastStore } from '../stores/toastStore';

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

      navigate('/');
    }
  }, [error, isAuthenticated, addToast, navigate]);


  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-6">
      <div className="bg-gray-800 p-8 rounded-lg shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold text-center text-white mb-6">Login</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-gray-300 block mb-1">Email</label>
            <input
              type="email"
              className="form-input w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="text-gray-300 block mb-1">Password</label>
            <input
              type="password"
              className="form-input w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {errorMsg && (
            <div className="text-red-400 text-sm">{errorMsg}</div>
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

// Dynamic API base URL configuration
const getApiBase = () => {
  // For development, always use the proxy path
  if (import.meta.env.DEV) {
    return '/api';
  }
  
  // For production, use the full URL from environment variable
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Fallback for production without env var
  return window.location.origin + '/api';
};

const API_BASE = getApiBase();
console.log("✅ Using API_BASE:", API_BASE);
export default API_BASE;

import axios from 'axios';
import API_BASE from './apiBase';
import { isNetworkRestrictedError } from './networkAccess';
import { decryptResponseData } from './responseCrypto';

async function unwrap(data: unknown, responseType?: string) {
  if (responseType === 'blob' || responseType === 'arraybuffer') return data;
  return decryptResponseData(data);
}

const axiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
});

axiosInstance.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    } else if (!config.headers['Content-Type'] && config.method !== 'get') {
      config.headers['Content-Type'] = 'application/json';
    }
    return config;
  },
  (error) => Promise.reject(error)
);

axiosInstance.interceptors.response.use(
  async (response) => {
    response.data = await unwrap(response.data, response.config.responseType);
    return response;
  },
  async (error) => {
    if (error.response) {
      try {
        error.response.data = await unwrap(error.response.data, error.config?.responseType);
      } catch {
        // Keep the original body if it is not an encrypted payload.
      }
    }
    if (error.response?.status === 403 && isNetworkRestrictedError(error)) {
      if (!window.location.pathname.startsWith('/office-only')) {
        window.location.href = '/office-only';
      }
      return Promise.reject(error);
    }
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      sessionStorage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;

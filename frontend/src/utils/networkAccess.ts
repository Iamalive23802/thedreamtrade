import axios from 'axios';
import API_BASE from './apiBase';
import { decryptResponseData } from './responseCrypto';

export interface NetworkAccessResponse {
  restrictionEnabled: boolean;
  allowed: boolean;
}

export async function checkNetworkAccess(): Promise<NetworkAccessResponse> {
  const token = sessionStorage.getItem('token');
  const response = await axios.get<NetworkAccessResponse>(`${API_BASE}/auth/network-check`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
  return decryptResponseData(response.data);
}

export function isNetworkRestrictedError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  return error.response?.data?.code === 'NETWORK_RESTRICTED';
}

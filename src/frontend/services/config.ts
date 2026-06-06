// Trung tâm cấu hình API URL
// Localhost khi dev, Railway URL khi production (set qua window.__ENV__ hoặc process.env)

const getApiBase = (): string => {
  // Ưu tiên: biến window được inject ở index.html (runtime)
  const envUrl = (window as any).__ENV__?.REACT_APP_API_URL;
  if (envUrl) return envUrl;

  // Fallback: biến build-time của UmiJS
  const buildUrl = (process as any).env?.REACT_APP_API_URL;
  if (buildUrl) return buildUrl;

  // Local dev
  return 'http://localhost:5000';
};

export const API_BASE = getApiBase();
export const API_URL_AUTH = `${API_BASE}/api/auth`;
export const API_URL_ADMIN = `${API_BASE}/api/admin`;
export const API_URL_ADMISSION = `${API_BASE}/api/admission`;
export const API_URL_CUTOFF = `${API_BASE}/api/cutoff`;
export const API_URL_AI = `${API_BASE}/api/ai`;
export const SOCKET_URL = API_BASE;

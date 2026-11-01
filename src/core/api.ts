/** 与本地服务的 HTTP 通信层 */

export interface DocResponse<T> {
  schema: number;
  rev: number;
  updatedAt: string | null;
  items: T[];
}

export interface ServerConfig {
  dataDir: string;
  port: number;
  appDir: string;
  backupDir: string;
}

export interface BackupFile {
  file: string;
  size: number;
  mtime: string;
}

export interface ApiError extends Error {
  status: number;
  conflict: boolean;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    const err = new Error('无法连接本地服务，请确认「启动工作台.bat」窗口还开着') as ApiError;
    err.status = 0;
    err.conflict = false;
    throw err;
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const payload = (data ?? {}) as { error?: string; message?: string };
    const err = new Error(payload.message || payload.error || `请求失败（HTTP ${res.status}）`) as ApiError;
    err.status = res.status;
    err.conflict = res.status === 409;
    throw err;
  }
  return data as T;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const api = {
  getConfig: (): Promise<ServerConfig> => request<ServerConfig>('/api/config'),

  setDataDir: (dataDir: string): Promise<{ ok: boolean; dataDir: string }> =>
    request('/api/config', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ dataDir }),
    }),

  openFolder: (target: 'data' | 'app' = 'data'): Promise<{ ok: boolean; dir: string }> =>
    request('/api/open-folder', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ target }),
    }),

  getDoc: <T>(name: string): Promise<DocResponse<T>> => request<DocResponse<T>>(`/api/doc/${name}`),

  putDoc: <T>(name: string, baseRev: number, items: T[]): Promise<DocResponse<T>> =>
    request<DocResponse<T>>(`/api/doc/${name}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ baseRev, items }),
    }),

  backupAll: (): Promise<{ ok: boolean; file: string }> =>
    request('/api/backup/all', { method: 'POST' }),

  listBackups: (): Promise<{ dir: string; files: BackupFile[] }> =>
    request('/api/backups'),

  health: (): Promise<{ ok: boolean; dataDir: string; port: number }> =>
    request('/api/health'),
};

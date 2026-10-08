import { useAuth } from "@/store/auth";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
export const WS_URL = (process.env.NEXT_PUBLIC_WS_URL ?? API_URL.replace(/^http/, "ws")).replace(/\/$/, "");

if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_API_URL) {
  // NEXT_PUBLIC_* values are fixed at build time; without this the app
  // would silently talk to localhost.
  console.error("NEXT_PUBLIC_API_URL is not set; the app cannot reach its backend.");
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** FastAPI sends `detail` as a string for our own errors and as a list for
 * validation errors; either way the user gets one readable sentence. */
function readDetail(payload: unknown): string {
  const detail = (payload as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && typeof detail[0]?.msg === "string") {
    return detail[0].msg.replace(/^Value error, /, "");
  }
  return "Something went wrong";
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = useAuth.getState().token;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }

  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    // An expired or revoked session: drop it so the app returns to login.
    if (response.status === 401 && token) useAuth.getState().clear();
    throw new ApiError(response.status, readDetail(payload));
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
  upload: <T>(path: string, file: Blob) => {
    const form = new FormData();
    form.append("file", file, "avatar");
    return request<T>("PUT", path, form);
  },
};

/** Image paths come back relative to the API ("/api/users/3/avatar?v=2"). */
export function assetUrl(path: string | null): string | null {
  return path ? `${API_URL}${path}` : null;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

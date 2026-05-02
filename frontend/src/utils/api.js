const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5000";

export async function apiFetch(path, { method = "GET", body, token, headers = {} } = {}) {
  const finalHeaders = {
    "Content-Type": "application/json",
    ...headers,
  };

  const jwt = token || localStorage.getItem("token");
  if (jwt) finalHeaders.Authorization = `Bearer ${jwt}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data?.detail || data?.error || "Request failed";
    throw new Error(msg);
  }

  return data;
}

export { BASE_URL };

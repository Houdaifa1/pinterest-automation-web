let csrf = "";
export function setCSRF(value: string) {
  csrf = value;
}
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(method === "GET" ? {} : { "X-CSRF-Token": csrf }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: any = await response
    .json()
    .catch(() => ({
      error: "unavailable",
      message: "This action could not finish. Please try again.",
    }));
  if (!response.ok)
    throw new ApiError(data.error, data.message, response.status);
  return data;
}
export async function upload(path: string, blob: Blob) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "image/jpeg", "X-CSRF-Token": csrf },
    body: blob,
  });
  const data: any = await response.json();
  if (!response.ok)
    throw new ApiError(data.error, data.message, response.status);
  return data;
}

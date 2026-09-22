export function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "Something went wrong. Please try again.";
}

export function apiError(error: unknown, status = 500): Response {
  const message = errorMessage(error);
  console.error(error);
  return Response.json({ error: message }, { status });
}

export function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function readHalfHour(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value * 2) ? value : null;
}

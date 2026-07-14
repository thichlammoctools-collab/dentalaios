/** Headers for safely proxying private R2 objects through the Worker. */

const INLINE_RASTER_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function safeFilename(filename: string): string {
  // Prevent header injection and preserve a usable attachment filename.
  return filename.replace(/[\r\n"\\]/g, "_") || "download";
}

export function buildPrivateFileHeaders(
  filename: string,
  contentType: string,
  size: number,
  etag?: string,
): Record<string, string> {
  const inline = INLINE_RASTER_TYPES.has(contentType.toLowerCase());
  const headers: Record<string, string> = {
    "Content-Type": inline ? contentType : "application/octet-stream",
    "Content-Length": String(size),
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeFilename(filename)}"`,
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
  };
  if (etag) headers.ETag = etag;
  return headers;
}

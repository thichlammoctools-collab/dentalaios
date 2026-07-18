import { describe, expect, it } from "vitest";
import { buildPrivateFileHeaders } from "../../src/lib/file-response";

describe("buildPrivateFileHeaders", () => {
  it("allows safe raster images inline and prevents MIME sniffing", () => {
    const headers = buildPrivateFileHeaders("xray.png", "image/png", 42, "etag-1");
    expect(headers["Content-Type"]).toBe("image/png");
    expect(headers["Content-Disposition"]).toBe('inline; filename="xray.png"');
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers.ETag).toBe("etag-1");
  });

  it("forces all other content types to download instead of rendering inline", () => {
    const headers = buildPrivateFileHeaders('unsafe"\r\n.svg', "image/svg+xml", 42);
    expect(headers["Content-Type"]).toBe("application/octet-stream");
    expect(headers["Content-Disposition"]).toBe('attachment; filename="unsafe___.svg"');
    expect(headers["Content-Length"]).toBe("42");
  });
});

/**
 * PatientImageGallery — displays patient images in a grid, with upload dialog.
 *
 * Props:
 *   patientId  — required (all images belong to a patient)
 *   visitId    — optional; if set, images can be scoped to this visit
 *   compact    — hide the "Hình ảnh" header (for embedding inside another section)
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiBlob, apiDelete, apiGet, apiPost, apiUpload, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { PatientImage, PatientImageType, AnalyzeImageResult } from "@shared/types";
import { PATIENT_IMAGE_TYPE_LABELS } from "@shared/types";

interface PatientImageGalleryProps {
  patientId: string;
  visitId?: string;
  compact?: boolean;
  onImagesChanged?: () => void;
}

interface ImageResponse {
  items: PatientImage[];
  total: number;
}

export function PatientImageGallery({
  patientId,
  visitId,
  compact,
  onImagesChanged,
}: PatientImageGalleryProps) {
  const [images, setImages] = useState<PatientImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [selected, setSelected] = useState<PatientImage | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeImageResult | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await apiGet<ImageResponse>(
        visitId
          ? `/api/patient-images/visit/${visitId}`
          : `/api/patient-images?patient_id=${patientId}`,
      );
      setImages(res.items);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tải hình ảnh");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [patientId, visitId]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    if (!selected) {
      setViewUrl(null);
      setViewError(null);
      setViewLoading(false);
      return;
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30_000);

    setViewUrl(null);
    setViewError(null);
    setViewLoading(true);
    apiBlob(`/api/patient-images/${selected.id}/file`, { signal: controller.signal })
      .then((image) => {
        objectUrl = URL.createObjectURL(image);
        if (!cancelled) setViewUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch((err) => {
        if (!cancelled) {
          setViewError(
            timedOut
              ? "Tải hình ảnh quá thời gian. Vui lòng thử lại."
              : err instanceof ApiError ? err.message : "Không thể tải hình ảnh",
          );
        }
      })
      .finally(() => {
        clearTimeout(timeoutId);
        if (!cancelled) setViewLoading(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selected?.id]);

  const filtered = filterType === "all"
    ? images
    : images.filter((i) => i.image_type === filterType);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      // Compress image client-side
      const { blob, originalSize } = await compressImage(file);

      const params = new URLSearchParams({
        patient_id: patientId,
        image_type: detectImageType(file.name, file.type),
        original_size: String(originalSize),
      });
      if (visitId) params.set("visit_id", visitId);
      await apiUpload(`/api/patient-images/file?${params}`, blob, {
        "Content-Type": blob.type || "image/jpeg",
        // HTTP headers only accept Latin-1 characters; preserve Unicode names safely.
        "X-Image-Filename": encodeURIComponent(file.name),
      }, setUploadProgress);

      toast.success("Đã tải lên hình ảnh");
      load();
      onImagesChanged?.();
    } catch (err) {
      console.error("Upload error:", err);
      const message = err instanceof ApiError
        ? err.message
        : err instanceof Error
        ? err.message
        : "Lỗi tải lên hình ảnh";
      toast.error(message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      e.target.value = "";
    }
  }

  async function handleDelete(img: PatientImage) {
    if (!confirm("Xóa hình ảnh này?")) return;
    try {
      await apiDelete(`/api/patient-images/${img.id}`);
      toast.success("Đã xóa");
      setSelected(null);
      setViewUrl(null);
      load();
      onImagesChanged?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi xóa hình ảnh");
    }
  }

  async function handleAnalyze(img: PatientImage) {
    setAnalyzing(true);
    setAnalysisResult(null);
    try {
      const result = await apiPost<AnalyzeImageResult & { visit_id?: string }>(
        "/api/ai/analyze-image",
        {
          file_id: img.file_id,
          visit_id: img.visit_id,
          image_type: img.image_type,
        },
      );
      setAnalysisResult(result);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi phân tích hình ảnh");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSaveFindings(result: AnalyzeImageResult) {
    if (!visitId || result.findings.length === 0) return;
    try {
      await Promise.all(result.findings.map((f) =>
        apiPost(`/api/visits/${visitId}/findings`, {
          tooth_number: f.tooth_number,
          category: f.category,
          scope: f.scope,
          anatomical_site: f.anatomical_site,
          condition: f.condition,
          notes: `${f.description}\nĐề xuất: ${f.recommendation}`,
        }),
      ));
      toast.success(`Đã lưu ${result.findings.length} clinical finding(s)`);
      setAnalysisResult(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi lưu findings");
    }
  }

  const imageTypes = Object.entries(PATIENT_IMAGE_TYPE_LABELS) as [PatientImageType, string][];

  return (
    <div>
      {!compact && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Hình ảnh</h2>
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*,.dcm"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
            <Button size="sm" disabled={uploading} asChild>
              <span>{uploading ? "Đang tải…" : "+ Tải ảnh lên"}</span>
            </Button>
          </label>
        </div>
      )}

      {uploading && (
        <div className="mb-4" role="status" aria-live="polite">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Đang tải hình ảnh</span>
            <span>{uploadProgress}%</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={uploadProgress}
            aria-label="Tiến trình tải hình ảnh"
          >
            <div
              className="h-full rounded-full bg-teal-600 transition-[width] duration-150"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap mb-3">
        <button
          onClick={() => setFilterType("all")}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
            filterType === "all"
              ? "bg-teal-600 text-white border-teal-600"
              : "border-border text-muted-foreground hover:border-teal-400"
          }`}
        >
          Tất cả ({images.length})
        </button>
        {imageTypes.map(([type, label]) => {
          const count = images.filter((i) => i.image_type === type).length;
          if (count === 0) return null;
          return (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                filterType === type
                  ? "bg-teal-600 text-white border-teal-600"
                  : "border-border text-muted-foreground hover:border-teal-400"
              }`}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-10 text-center">
          <svg className="w-10 h-10 text-muted-foreground/40 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2 1.879-1.879a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm text-muted-foreground">Chưa có hình ảnh</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Tải lên phim CBCT, scan 3D, hình trước/sau điều trị
          </p>
          {!compact && (
            <label className="mt-3 cursor-pointer">
              <input
                type="file"
                accept="image/*,.dcm"
                onChange={handleUpload}
                disabled={uploading}
                className="hidden"
              />
              <Button size="sm" variant="outline" disabled={uploading} asChild>
                <span>+ Tải ảnh đầu tiên</span>
              </Button>
            </label>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map((img) => (
            <button
              key={img.id}
              onClick={() => setSelected(img)}
              className="group relative aspect-square rounded-xl overflow-hidden border border-border bg-muted/30 hover:border-teal-400 transition-all hover:shadow-md"
            >
              {/* Thumbnail image */}
              <ImageThumbnail img={img} />

              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
                <p className="text-white text-[10px] font-medium truncate">
                  {PATIENT_IMAGE_TYPE_LABELS[img.image_type]}
                </p>
                <p className="text-white/70 text-[9px]">
                  {img.original_size ? `${(img.original_size / 1024).toFixed(0)}KB` : ""}
                </p>
              </div>
              <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="bg-black/50 text-white text-[9px] px-1.5 py-0.5 rounded">
                  {img.image_type === "cbct" ? "CBCT" : img.image_type === "scan_3d" ? "3D" : img.image_type === "photo_before" ? "TR" : img.image_type === "photo_after" ? "SAU" : ""}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Upload FAB for compact mode */}
      {compact && (
        <label className="mt-3 inline-block cursor-pointer">
          <input
            type="file"
            accept="image/*,.dcm"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
          <Button size="sm" variant="outline" disabled={uploading} asChild>
            <span>{uploading ? "Đang tải…" : "+ Tải thêm ảnh"}</span>
          </Button>
        </label>
      )}

      {/* Image Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setViewUrl(null); setAnalysisResult(null); } }}>
        <DialogHeader>
          <DialogTitle>{selected ? PATIENT_IMAGE_TYPE_LABELS[selected.image_type] : ""}</DialogTitle>
          {selected && (
            <p className="text-xs text-muted-foreground">
              {selected.uploader_name} · {formatDate(selected.created_at)}
              {selected.description && ` · ${selected.description}`}
            </p>
          )}
        </DialogHeader>
        <DialogBody className="px-5 py-5">
          {/* Image */}
          <div className="relative rounded-xl overflow-hidden bg-black/5 mb-4">
            {viewUrl ? (
              <img
                src={viewUrl}
                alt={selected?.original_name || "Medical image"}
                className="w-full max-h-[60vh] object-contain"
                onError={() => {
                  setViewUrl(null);
                  setViewError("Định dạng hình ảnh này không thể xem trước trong trình duyệt");
                }}
              />
            ) : viewError ? (
              <div className="w-full min-h-48 flex items-center justify-center px-6 py-10 text-center text-sm text-destructive">
                {viewError}
              </div>
            ) : (
              <div className="w-full h-48 flex items-center justify-center">
                {viewLoading && <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-500 border-t-transparent" />}
              </div>
            )}
          </div>

          {/* AI Analysis Result */}
          {analysisResult && (
            <div className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/30 p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-teal-700 dark:text-teal-300">
                  Kết quả phân tích AI
                </p>
                <Badge variant="outline" className="text-[10px]">{analysisResult.ai_model}</Badge>
              </div>
              <p className="text-sm mb-3">{analysisResult.analysis}</p>
              {analysisResult.findings.length > 0 ? (
                <div className="space-y-2 mb-3">
                  {analysisResult.findings.map((f, i) => (
                    <div key={i} className="text-sm bg-white/50 dark:bg-black/20 rounded-lg p-2">
                      {f.tooth_number && <span className="font-bold mr-2">Răng #{f.tooth_number}</span>}
                      <span className="font-medium">{f.condition}</span>
                       {f.anatomical_site && <span className="text-muted-foreground ml-1">({f.anatomical_site})</span>}
                      <p className="text-xs mt-0.5">{f.description}</p>
                      {f.recommendation && (
                        <p className="text-xs text-teal-600 dark:text-teal-400 mt-0.5">
                          → {f.recommendation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Không phát hiện bất thường</p>
              )}
              {visitId && analysisResult.findings.length > 0 && (
                <Button
                  size="sm"
                  onClick={() => handleSaveFindings(analysisResult)}
                  className="bg-teal-600 hover:bg-teal-700 text-white mt-1"
                >
                  Lưu {analysisResult.findings.length} finding(s) vào lượt khám
                </Button>
              )}
            </div>
          )}

          {analyzing && (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
              AI đang phân tích hình ảnh…
            </div>
          )}
        </DialogBody>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { setSelected(null); setViewUrl(null); setAnalysisResult(null); }}>
            Đóng
          </Button>
          {selected && (
            <>
              <Button
                variant="outline"
                onClick={() => handleAnalyze(selected)}
                disabled={analyzing}
                className="gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Phân tích bằng AI
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(selected)}
              >
                Xóa
              </Button>
            </>
          )}
        </DialogFooter>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────

function ImageThumbnail({ img }: { img: PatientImage }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    setSrc(null);
    setLoading(true);
    setFailed(false);
    apiBlob(`/api/patient-images/${img.id}/file`, { signal: controller.signal })
      .then((image) => {
        objectUrl = URL.createObjectURL(image);
        if (!cancelled) {
          setSrc(objectUrl);
          setLoading(false);
        } else {
          URL.revokeObjectURL(objectUrl);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(`Failed to load thumbnail for image ${img.id}:`, err);
          setFailed(true);
          setLoading(false);
        }
      })
      .finally(() => {
        clearTimeout(timeoutId);
      });
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [img.id]);

  if (loading) {
    return (
      <div className="w-full h-full bg-muted/40 animate-pulse flex items-center justify-center">
        <svg className="w-6 h-6 text-muted-foreground/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2 1.879-1.879a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  if (failed || !src) {
    return (
      <div className="w-full h-full bg-muted/40 flex items-center justify-center">
        <svg className="w-6 h-6 text-muted-foreground/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2 1.879-1.879a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={img.original_name || img.image_type}
      className="w-full h-full object-cover"
      onError={() => {
        console.error(`Image render error for ${img.id}`);
        setFailed(true);
      }}
    />
  );
}

// ─── Utilities ───────────────────────────────────────────────────

function Badge({ children, variant }: { children: React.ReactNode; variant: "outline" | "destructive" | "success" | "warning" }) {
  const cls = {
    outline: "border border-border bg-transparent",
    destructive: "bg-red-500 text-white",
    success: "bg-green-500 text-white",
    warning: "bg-yellow-500 text-white",
  }[variant];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

async function compressImage(
  file: Blob,
  maxDim = 2000,
  quality = 0.8,
): Promise<{ blob: Blob; originalSize: number }> {
  const originalSize = file.size;
  if (file.type === "image/dicom" || file.name.endsWith(".dcm")) {
    // Skip compression for DICOM — upload as-is
    return { blob: file, originalSize };
  }

  // Check if browser supports required APIs
  if (typeof createImageBitmap === "undefined" || typeof OffscreenCanvas === "undefined") {
    console.warn("Browser doesn't support createImageBitmap/OffscreenCanvas, uploading original");
    return { blob: file, originalSize };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(
      Math.round(bitmap.width * scale),
      Math.round(bitmap.height * scale),
    );
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.warn("Failed to get canvas context, uploading original");
      return { blob: file, originalSize };
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    return { blob, originalSize };
  } catch (err) {
    console.error("Image compression failed, uploading original:", err);
    return { blob: file, originalSize };
  }
}

function detectImageType(filename: string, mimeType: string): PatientImageType {
  const name = filename.toLowerCase();
  if (name.includes("dicom") || mimeType.includes("dicom") || name.endsWith(".dcm")) return "dicom";
  if (name.includes("cbct")) return "cbct";
  if (name.includes("scan") || name.includes("3d") || name.includes("stl") || name.includes("obj")) return "scan_3d";
  if (name.includes("before") || name.includes("truoc") || name.includes("trước")) return "photo_before";
  if (name.includes("after") || name.includes("sau") || name.includes("sau")) return "photo_after";
  if (name.includes("xray") || name.includes("x-ray") || name.includes("quang")) return "xray";
  if (name.includes("intraoral") || name.includes("intra")) return "intraoral";
  return "other";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

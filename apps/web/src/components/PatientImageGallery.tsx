/**
 * PatientImageGallery — displays patient images in a grid, with upload dialog.
 *
 * Props:
 *   patientId  — required (all images belong to a patient)
 *   visitId    — optional; if set, images can be scoped to this visit
 *   compact    — hide the "Hình ảnh" header (for embedding inside another section)
 */

import { useEffect, useRef, useState } from "react";
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
import type { ClinicalDiagnosis, ClinicalDiagnosisImageEvidence, ImageAnnotation, ImageAnnotationGeometry, ImageAnnotationShapeType, PatientImage, PatientImageType, AnalyzeImageResult } from "@shared/types";
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
  const [annotations, setAnnotations] = useState<ImageAnnotation[]>([]);
  const [imageEvidence, setImageEvidence] = useState<ClinicalDiagnosisImageEvidence[]>([]);
  const [diagnosisOptions, setDiagnosisOptions] = useState<Array<ClinicalDiagnosis & { visit_date: string }>>([]);
  const [annotationShape, setAnnotationShape] = useState<ImageAnnotationShapeType>("pin");
  const [annotationGeometry, setAnnotationGeometry] = useState<ImageAnnotationGeometry | null>(null);
  const [annotationNote, setAnnotationNote] = useState("");
  const [rectangleStart, setRectangleStart] = useState<{ x: number; y: number } | null>(null);
  const [savingAnnotation, setSavingAnnotation] = useState(false);
  const [selectedDiagnosisId, setSelectedDiagnosisId] = useState("");
  const [selectedAnnotationVersionId, setSelectedAnnotationVersionId] = useState("");
  const [evidenceRelation, setEvidenceRelation] = useState<"supports" | "contradicts" | "incidental">("supports");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [linkingEvidence, setLinkingEvidence] = useState(false);
  const imageContainerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!selected) {
      setAnnotations([]);
      setImageEvidence([]);
      setDiagnosisOptions([]);
      return;
    }
    void Promise.all([
      apiGet<{ items: ImageAnnotation[] }>(`/api/patient-images/${selected.id}/annotations`),
      apiGet<{ items: ClinicalDiagnosisImageEvidence[] }>(`/api/patient-images/${selected.id}/evidence`),
      apiGet<{ items: Array<ClinicalDiagnosis & { visit_date: string }> }>(`/api/patient-images/${selected.id}/diagnosis-options`),
    ]).then(([annotationResponse, evidenceResponse, diagnosisResponse]) => {
      setAnnotations(annotationResponse.items);
      setImageEvidence(evidenceResponse.items);
      setDiagnosisOptions(diagnosisResponse.items);
    }).catch((error) => toast.error(error instanceof ApiError ? error.message : "Không thể tải ghi chú trên ảnh"));
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

  function coordinateFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = imageContainerRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    };
  }

  function handleAnnotationPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!viewUrl) return;
    const point = coordinateFromPointer(event);
    if (!point) return;
    if (annotationShape === "pin") setAnnotationGeometry(point);
    else setRectangleStart(point);
  }

  function handleAnnotationPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (annotationShape !== "rectangle" || !rectangleStart) return;
    const end = coordinateFromPointer(event);
    if (!end) return;
    const x = Math.min(rectangleStart.x, end.x);
    const y = Math.min(rectangleStart.y, end.y);
    setAnnotationGeometry({ x, y, width: Math.abs(end.x - rectangleStart.x), height: Math.abs(end.y - rectangleStart.y) });
    setRectangleStart(null);
  }

  async function saveAnnotation() {
    if (!selected || !annotationGeometry || !annotationNote.trim()) {
      toast.error("Đặt ghim hoặc khung trên ảnh và nhập ghi chú");
      return;
    }
    setSavingAnnotation(true);
    try {
      const annotation = await apiPost<ImageAnnotation>(`/api/patient-images/${selected.id}/annotations`, {
        shape_type: annotationShape,
        geometry: annotationGeometry,
        note: annotationNote,
      });
      setAnnotations((current) => [...current, annotation]);
      setAnnotationGeometry(null);
      setAnnotationNote("");
      setSelectedAnnotationVersionId(annotation.current_version.id);
      toast.success("Đã lưu ghi chú trên ảnh");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể lưu ghi chú trên ảnh");
    } finally {
      setSavingAnnotation(false);
    }
  }

  async function linkEvidence() {
    if (!selected || !selectedDiagnosisId) {
      toast.error("Chọn chẩn đoán để liên kết");
      return;
    }
    const diagnosis = diagnosisOptions.find((item) => item.id === selectedDiagnosisId);
    if (!diagnosis) return;
    if (evidenceRelation === "contradicts" && !evidenceNote.trim()) {
      toast.error("Bằng chứng mâu thuẫn cần ghi chú giải thích");
      return;
    }
    setLinkingEvidence(true);
    try {
      const evidence = await apiPost<ClinicalDiagnosisImageEvidence>(`/api/visits/${diagnosis.visit_id}/diagnoses/${diagnosis.id}/image-evidence`, {
        patient_image_id: selected.id,
        annotation_version_id: selectedAnnotationVersionId || null,
        relation: evidenceRelation,
        note: evidenceNote || undefined,
      });
      setImageEvidence((current) => [evidence, ...current]);
      setEvidenceNote("");
      toast.success("Đã liên kết bằng chứng hình ảnh");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể liên kết bằng chứng hình ảnh");
    } finally {
      setLinkingEvidence(false);
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
          location_details: f.location_details,
          measurements: f.measurements,
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
          <div className="rounded-xl overflow-hidden bg-black/5 mb-4">
            {viewUrl ? (
              <div ref={imageContainerRef} className="relative mx-auto w-fit max-w-full touch-none" onPointerDown={handleAnnotationPointerDown} onPointerUp={handleAnnotationPointerUp}>
                <img
                  src={viewUrl}
                  alt={selected?.original_name || "Medical image"}
                  className="block max-h-[60vh] max-w-full object-contain"
                  onError={() => {
                    setViewUrl(null);
                    setViewError("Định dạng hình ảnh này không thể xem trước trong trình duyệt");
                  }}
                />
                <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-label="Ghi chú trên ảnh">
                  {annotations.map((annotation) => <AnnotationOverlay key={annotation.id} shape={annotation.current_version.shape_type} geometry={annotation.current_version.geometry} active={selectedAnnotationVersionId === annotation.current_version.id} />)}
                  {annotationGeometry && <AnnotationOverlay shape={annotationShape} geometry={annotationGeometry} draft />}
                </svg>
              </div>
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

          {viewUrl && selected && <section className="mb-4 rounded-xl border border-border p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">Ghi chú trên ảnh</p><p className="text-xs text-muted-foreground">Chọn ghim hoặc khung, sau đó bấm/chạm trực tiếp lên ảnh.</p></div><div className="flex gap-1"><Button size="sm" variant={annotationShape === "pin" ? "default" : "outline"} onClick={() => { setAnnotationShape("pin"); setAnnotationGeometry(null); }}>Ghim</Button><Button size="sm" variant={annotationShape === "rectangle" ? "default" : "outline"} onClick={() => { setAnnotationShape("rectangle"); setAnnotationGeometry(null); }}>Khung</Button></div></div>
            <textarea value={annotationNote} onChange={(event) => setAnnotationNote(event.target.value)} rows={2} placeholder="Mô tả dấu hiệu quan sát được trên ảnh" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <div className="mt-2 flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{annotationGeometry ? "Đã đặt vùng đánh dấu, nhập ghi chú để lưu." : "Chưa đặt vùng đánh dấu."}</p><Button size="sm" onClick={() => void saveAnnotation()} disabled={!annotationGeometry || !annotationNote.trim() || savingAnnotation}>{savingAnnotation ? "Đang lưu..." : "Lưu ghi chú"}</Button></div>
            {annotations.length > 0 && <div className="mt-3 space-y-1 border-t pt-3">{annotations.map((annotation) => <button type="button" key={annotation.id} onClick={() => setSelectedAnnotationVersionId(annotation.current_version.id)} className={`block w-full rounded-md px-2 py-1.5 text-left text-xs ${selectedAnnotationVersionId === annotation.current_version.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}><span className="font-medium">V{annotation.current_version.version_no}</span> · {annotation.current_version.note}</button>)}</div>}
          </section>}

          {selected && <section className="mb-4 rounded-xl border border-border p-3">
            <p className="text-sm font-semibold">Liên kết làm bằng chứng chẩn đoán</p><p className="mt-0.5 text-xs text-muted-foreground">Có thể liên kết ảnh hoặc ghi chú đã chọn với chẩn đoán ở bất kỳ lượt khám nào của bệnh nhân.</p>
            <div className="mt-3 grid gap-2"><select value={selectedDiagnosisId} onChange={(event) => setSelectedDiagnosisId(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="">Chọn chẩn đoán</option>{diagnosisOptions.map((diagnosis) => <option key={diagnosis.id} value={diagnosis.id}>{formatDate(diagnosis.visit_date)} · {diagnosis.concept_display_vi_snapshot} · {statusLabel(diagnosis.status)}</option>)}</select>
              <select value={selectedAnnotationVersionId} onChange={(event) => setSelectedAnnotationVersionId(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="">Toàn bộ ảnh (không có ghim/khung)</option>{annotations.map((annotation) => <option key={annotation.current_version.id} value={annotation.current_version.id}>Ghi chú V{annotation.current_version.version_no} · {annotation.current_version.note}</option>)}</select>
              <select value={evidenceRelation} onChange={(event) => setEvidenceRelation(event.target.value as "supports" | "contradicts" | "incidental")} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="supports">Ủng hộ chẩn đoán</option><option value="contradicts">Mâu thuẫn với chẩn đoán</option><option value="incidental">Phát hiện kèm theo</option></select>
              <textarea value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} rows={2} placeholder={evidenceRelation === "contradicts" ? "Giải thích bằng chứng mâu thuẫn" : "Ghi chú liên kết (tùy chọn)"} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              <Button size="sm" onClick={() => void linkEvidence()} disabled={!selectedDiagnosisId || linkingEvidence}>{linkingEvidence ? "Đang liên kết..." : "Liên kết bằng chứng"}</Button>
            </div>
            {imageEvidence.length > 0 && <div className="mt-3 border-t pt-3"><p className="text-xs font-medium text-muted-foreground">Đang được dùng làm bằng chứng ({imageEvidence.length})</p>{imageEvidence.map((evidence) => <p key={evidence.id} className="mt-1 text-xs">{evidence.relation === "supports" ? "Ủng hộ" : evidence.relation === "contradicts" ? "Mâu thuẫn" : "Kèm theo"} · {evidence.diagnosis_id}</p>)}</div>}
          </section>}

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

function AnnotationOverlay({ shape, geometry, active, draft }: { shape: ImageAnnotationShapeType; geometry: ImageAnnotationGeometry; active?: boolean; draft?: boolean }) {
  const color = draft ? "#f59e0b" : active ? "#2563eb" : "#ef4444";
  if (shape === "pin") return <circle cx={geometry.x} cy={geometry.y} r="0.018" fill={color} stroke="white" strokeWidth="0.006" />;
  if (!("width" in geometry) || !("height" in geometry)) return null;
  return <rect x={geometry.x} y={geometry.y} width={geometry.width} height={geometry.height} fill="none" stroke={color} strokeWidth="0.008" vectorEffect="non-scaling-stroke" />;
}

function statusLabel(status: ClinicalDiagnosis["status"]): string {
  return { suspected: "Nghi ngờ", confirmed: "Đã xác nhận", ruled_out: "Đã loại trừ", resolved: "Đã giải quyết" }[status];
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

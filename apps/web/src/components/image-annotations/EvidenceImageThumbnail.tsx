import { useEffect, useState } from "react";
import { apiBlob } from "@/lib/api";
import type { ImageAnnotationGeometry, ImageAnnotationShapeType, ImageAnnotationVersion, PatientImage } from "@shared/types";

interface Props {
  image: PatientImage;
  annotationVersion?: ImageAnnotationVersion;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export function EvidenceImageThumbnail({ image, annotationVersion, selected = false, onClick, className = "" }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const controller = new AbortController();

    setSrc(null);
    setLoading(true);
    apiBlob(`/api/patient-images/${image.id}/file`, { signal: controller.signal })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setSrc(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => { if (!cancelled) setSrc(null); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image.id]);

  const content = <div className={`relative aspect-square overflow-hidden rounded-md bg-muted/50 ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""} ${className}`}>
    {src ? <img src={src} alt={image.original_name ?? image.image_type} className="h-full w-full object-fill" /> : <FileTile image={image} loading={loading} />}
    {src && annotationVersion && <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"><defs><marker id={`evidence-arrow-${image.id}-${annotationVersion.id}`} markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#2563eb" /></marker></defs><AnnotationOverlay shape={annotationVersion.shape_type} geometry={annotationVersion.geometry} markerId={`evidence-arrow-${image.id}-${annotationVersion.id}`} /></svg>}
  </div>;

  return onClick ? <button type="button" className="block w-full text-left focus:outline-none" onClick={onClick} aria-pressed={selected}>{content}</button> : content;
}

function FileTile({ image, loading }: { image: PatientImage; loading: boolean }) {
  if (loading) return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Đang tải...</div>;
  const type = image.image_type === "dicom" || image.image_type === "cbct" ? image.image_type.toUpperCase() : "Tệp ảnh";
  return <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center text-xs text-muted-foreground"><span className="font-semibold">{type}</span><span>Không có xem trước</span></div>;
}

export function AnnotationOverlay({ shape, geometry, markerId }: { shape: ImageAnnotationShapeType; geometry: ImageAnnotationGeometry; markerId: string }) {
  if (shape === "pin" && "x" in geometry && "y" in geometry) {
    const x = geometry.x * 1000;
    const y = geometry.y * 1000;
    return <line x1={Math.max(30, x - 45)} y1={Math.max(30, y - 45)} x2={x} y2={y} stroke="#2563eb" strokeWidth="16" strokeLinecap="round" markerEnd={`url(#${markerId})`} vectorEffect="non-scaling-stroke" />;
  }
  if (shape === "freehand" && "points" in geometry) return <polyline points={geometry.points.map((point) => `${point.x * 1000},${point.y * 1000}`).join(" ")} fill="none" stroke="#2563eb" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
  if (!("width" in geometry) || !("height" in geometry)) return null;
  return <rect x={geometry.x * 1000} y={geometry.y * 1000} width={geometry.width * 1000} height={geometry.height * 1000} fill="rgba(37, 99, 235, 0.1)" stroke="#2563eb" strokeWidth="16" vectorEffect="non-scaling-stroke" />;
}

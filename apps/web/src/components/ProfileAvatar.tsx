import { useEffect, useId, useState } from "react";
import { api, apiBlob, apiDelete, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";

type AvatarSubject = "users" | "patients";

interface ProfileAvatarProps {
  subject: AvatarSubject;
  entityId?: string;
  name: string;
  avatarFileId?: string;
  size?: "sm" | "md" | "lg" | "xl";
  editable?: boolean;
  onChanged?: () => void;
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-xl",
  xl: "h-24 w-24 text-3xl",
};

export function ProfileAvatar({
  subject,
  entityId,
  name,
  avatarFileId,
  size = "md",
  editable = false,
  onChanged,
}: ProfileAvatarProps) {
  const inputId = useId();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setUrl(null);
    if (!entityId || !avatarFileId) return;

    apiBlob(`/api/avatars/${subject}/${entityId}/file`)
      .then((image) => {
        objectUrl = URL.createObjectURL(image);
        if (!cancelled) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [avatarFileId, entityId, subject]);

  async function upload(file: File) {
    if (!entityId) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP");
      return;
    }
    setLoading(true);
    try {
      const image = await resizeAvatar(file);
      await api(`/api/avatars/${subject}/${entityId}/file`, {
        method: "PUT",
        body: image,
        headers: {
          "Content-Type": "image/jpeg",
          "X-Avatar-Filename": file.name,
        },
      });
      setUrl(URL.createObjectURL(image));
      toast.success("Đã cập nhật ảnh đại diện");
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể tải ảnh đại diện");
    } finally {
      setLoading(false);
    }
  }

  async function remove() {
    if (!entityId || !avatarFileId) return;
    setLoading(true);
    try {
      await apiDelete(`/api/avatars/${subject}/${entityId}`);
      setUrl(null);
      toast.success("Đã xóa ảnh đại diện");
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể xóa ảnh đại diện");
    } finally {
      setLoading(false);
    }
  }

  const initials = getInitials(name);
  const canEdit = editable && !!entityId;

  return (
    <div className="group relative shrink-0">
      <div className={`overflow-hidden rounded-full bg-primary/10 text-primary ${sizeClasses[size]}`}>
        {url ? (
          <img src={url} alt={`Ảnh đại diện ${name}`} className="h-full w-full object-cover" onError={() => setUrl(null)} />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-semibold">{initials}</span>
        )}
      </div>
      {canEdit && (
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <label htmlFor={inputId} className="cursor-pointer p-1.5 text-white" title="Đổi ảnh đại diện">
            <input
              id={inputId}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={loading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = "";
              }}
            />
            {loading ? <Spinner /> : <CameraIcon />}
          </label>
          {avatarFileId && !loading && (
            <button type="button" onClick={() => void remove()} className="p-1.5 text-white" title="Xóa ảnh đại diện">
              <TrashIcon />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

async function resizeAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const maxDimension = 512;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(bitmap.width * scale)),
    Math.max(1, Math.round(bitmap.height * scale)),
  );
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0]?.slice(0, 2) || "?").toUpperCase();
}

function Spinner() {
  return <span className="block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />;
}

function CameraIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h3l2-3h6l2 3h3v12H4z" /><circle cx="12" cy="13" r="3" /></svg>;
}

function TrashIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2m-1 0-1 14H10L9 6" /></svg>;
}

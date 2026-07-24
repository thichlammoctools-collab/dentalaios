import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { buildReferrerQrPayload } from "@/lib/referral-qr";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";

interface ReferrerQrCodeProps {
  referrerId: string;
  label: string;
}

export function ReferrerQrCode({ referrerId, label }: ReferrerQrCodeProps) {
  const [dataUrl, setDataUrl] = useState("");
  const payload = buildReferrerQrPayload(referrerId);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(buildReferrerQrPayload(referrerId), { margin: 1, width: 144 })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl("");
      });
    return () => { active = false; };
  }, [referrerId]);

  async function copyPayload() {
    try {
      await navigator.clipboard.writeText(payload);
      toast.success("Đã sao chép nội dung mã QR");
    } catch {
      toast.error("Không thể sao chép nội dung mã QR");
    }
  }

  return (
    <div className="grid justify-items-center gap-4 text-center">
      {dataUrl ? <img src={dataUrl} alt={`QR Người giới thiệu ${label}`} className="h-56 w-56 rounded-lg border border-border bg-white p-2" /> : <div className="h-56 w-56 animate-pulse rounded-lg bg-muted" />}
      <div className="min-w-0">
        <p className="max-w-72 truncate font-medium">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">Quét để chọn người giới thiệu khi tạo hồ sơ.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" variant="outline" onClick={() => void copyPayload()}>Copy</Button>
        {dataUrl && <Button type="button" asChild><a href={dataUrl} download={`referrer-${label}.png`}>Tải PNG</a></Button>}
      </div>
    </div>
  );
}

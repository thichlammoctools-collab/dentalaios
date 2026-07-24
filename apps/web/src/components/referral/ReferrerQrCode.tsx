import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { buildReferrerQrPayload } from "@/lib/referral-qr";

interface ReferrerQrCodeProps {
  referrerId: string;
  label: string;
}

export function ReferrerQrCode({ referrerId, label }: ReferrerQrCodeProps) {
  const [dataUrl, setDataUrl] = useState("");

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

  return (
    <div className="grid justify-items-center gap-2 rounded-lg border border-border bg-background p-3 text-center">
      {dataUrl ? <img src={dataUrl} alt={`QR Người giới thiệu ${label}`} className="h-24 w-24" /> : <div className="h-24 w-24 animate-pulse rounded bg-muted" />}
      <p className="max-w-32 truncate text-xs font-medium">{label}</p>
      {dataUrl && <a href={dataUrl} download={`referrer-${label}.png`} className="text-xs font-medium text-primary hover:underline">Tải PNG</a>}
    </div>
  );
}

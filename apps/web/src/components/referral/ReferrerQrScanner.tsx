import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { parseReferrerQrPayload } from "@/lib/referral-qr";
import { toast } from "@/lib/toast";

interface ReferrerQrScannerProps {
  disabled?: boolean;
  onDetected: (referrerId: string) => void;
}

export function ReferrerQrScanner({ disabled = false, onDetected }: ReferrerQrScannerProps) {
  const id = useId().replace(/:/g, "");
  const elementId = `referrer-qr-${id}`;
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!scanning) return;
    let scanner: { start: (...args: unknown[]) => Promise<unknown>; stop: () => Promise<unknown>; clear: () => Promise<unknown> } | null = null;
    let active = true;

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (!active) return;
        scanner = new Html5Qrcode(elementId) as typeof scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText: string) => {
            const referrerId = parseReferrerQrPayload(decodedText);
            if (!referrerId) {
              toast.error("QR không đúng định dạng Người giới thiệu");
              return;
            }
            onDetected(referrerId);
            setScanning(false);
          },
          () => undefined,
        );
      } catch {
        toast.error("Không thể mở camera để quét QR");
        setScanning(false);
      }
    }

    void startScanner();
    return () => {
      active = false;
      void scanner?.stop().catch(() => undefined).finally(() => { void scanner?.clear().catch(() => undefined); });
    };
  }, [elementId, onDetected, scanning]);

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" disabled={disabled} onClick={() => setScanning((current) => !current)}>
        {scanning ? "Dừng quét" : "Scan QR"}
      </Button>
      {scanning && <div id={elementId} className="max-w-xs overflow-hidden rounded-lg border border-border bg-background p-2" />}
    </div>
  );
}

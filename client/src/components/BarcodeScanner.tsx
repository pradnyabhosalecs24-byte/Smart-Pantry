import { useEffect, useRef, useState } from "react";
import { Modal } from "./ui";

/**
 * Camera barcode scanner. The scanning library is loaded only when needed.
 * Cameras need HTTPS (or localhost) and permission; if anything fails we explain
 * and the user can type the barcode instead.
 */
export function BarcodeScanner({ open, onClose, onDetected }: { open: boolean; onClose: () => void; onDetected: (code: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const regionId = "sp-barcode-region";
  const done = useRef(false);

  useEffect(() => {
    if (!open) return;
    done.current = false;
    setError(null);
    let scanner: { stop: () => Promise<void>; clear: () => void; isScanning?: boolean } | null = null;
    let cancelled = false;

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError("Camera access needs a secure (https) connection. Type the barcode instead.");
        return;
      }
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats: F } = await import("html5-qrcode");
        if (cancelled) return;
        const s = new Html5Qrcode(regionId, { verbose: false, formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128] });
        scanner = s;
        await s.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 140 } },
          (text) => {
            if (done.current) return;
            done.current = true;
            onDetected(text.replace(/\D/g, ""));
          },
          () => undefined,
        );
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        setError(/permission|denied|NotAllowed/i.test(msg) ? "Camera permission was denied. Allow camera access in your browser, or type the barcode instead." : "No camera could be started on this device. Type the barcode instead.");
      }
    })();

    return () => {
      cancelled = true;
      if (scanner) {
        scanner
          .stop()
          .then(() => scanner?.clear())
          .catch(() => undefined);
      }
    };
  }, [open, onDetected]);

  return (
    <Modal open={open} onClose={onClose} title="Scan a barcode" description="Hold the barcode inside the frame. It is read automatically." size="sm">
      {error ? (
        <p role="alert" className="rounded-lg bg-turmeric-soft px-3 py-2 text-sm text-turmeric">
          {error}
        </p>
      ) : (
        <div id={regionId} className="overflow-hidden rounded-xl bg-black/80" style={{ minHeight: 220 }} />
      )}
    </Modal>
  );
}

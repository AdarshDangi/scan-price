import { useEffect, useRef, useState } from "react";

type Props = {
  onResult: (text: string) => void;
  onError?: (msg: string) => void;
};

export function QrScanner({ onResult, onError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<any>(null);
  const stoppedRef = useRef(false);
  const [status, setStatus] = useState("Requesting camera…");

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        if (!window.isSecureContext) {
          throw new Error(
            "Camera requires HTTPS. Open this page over https:// (or use the published URL).",
          );
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("This browser does not support camera access.");
        }

        // Explicitly request permission first so the OS prompt appears.
        // We immediately stop this stream; html5-qrcode will open its own.
        setStatus("Requesting camera permission…");
        const probe = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        probe.getTracks().forEach((t) => t.stop());

        if (cancelled || !containerRef.current) return;

        setStatus("Starting scanner…");
        const mod: any = await import("html5-qrcode");
        if (cancelled || !containerRef.current) return;
        const Html5Qrcode = mod.Html5Qrcode;
        const elId = "qr-reader-region";
        containerRef.current.innerHTML = `<div id="${elId}" style="width:100%"></div>`;
        const scanner = new Html5Qrcode(elId, { verbose: false });
        scannerRef.current = scanner;

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.3333,
        };

        const onSuccess = (decodedText: string) => {
          if (stoppedRef.current) return;
          stoppedRef.current = true;
          scanner
            .stop()
            .catch(() => {})
            .finally(() => onResult(decodedText));
        };

        try {
          await scanner.start(
            { facingMode: { exact: "environment" } },
            config,
            onSuccess,
            () => {},
          );
        } catch {
          // Fallback for devices without a rear camera or that reject `exact`.
          await scanner.start(
            { facingMode: "environment" },
            config,
            onSuccess,
            () => {},
          );
        }
        if (!cancelled) setStatus("");
      } catch (e: any) {
        const name = e?.name ?? "";
        let msg = e?.message ?? "Unable to start camera";
        if (name === "NotAllowedError" || name === "SecurityError") {
          msg =
            "Camera permission denied. Enable camera access for this site in your browser settings, then try again.";
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          msg = "No camera found on this device.";
        } else if (name === "NotReadableError") {
          msg =
            "Camera is in use by another app. Close other camera apps and retry.";
        }
        onError?.(msg);
      }
    };

    start();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s && s.isScanning) {
        s.stop().catch(() => {});
      }
    };
  }, [onResult, onError]);

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-border bg-card">
      <div ref={containerRef} className="w-full min-h-[320px]" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative h-64 w-64 rounded-2xl border-2 border-primary/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
          <div className="absolute inset-x-0 top-0 h-1 animate-[scan_2s_ease-in-out_infinite] bg-primary" />
        </div>
      </div>
      {status && (
        <div className="absolute inset-x-0 bottom-0 bg-background/80 px-4 py-2 text-center text-xs text-muted-foreground">
          {status}
        </div>
      )}
    </div>
  );
}

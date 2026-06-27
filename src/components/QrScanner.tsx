import { useEffect, useRef } from "react";

type Props = {
  onResult: (text: string) => void;
  onError?: (msg: string) => void;
};

export function QrScanner({ onResult, onError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<any>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod: any = await import("html5-qrcode");
        if (cancelled || !containerRef.current) return;
        const Html5Qrcode = mod.Html5Qrcode;
        const elId = "qr-reader-region";
        containerRef.current.innerHTML = `<div id="${elId}" style="width:100%"></div>`;
        const scanner = new Html5Qrcode(elId, { verbose: false });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => {
            if (stoppedRef.current) return;
            stoppedRef.current = true;
            scanner
              .stop()
              .catch(() => {})
              .finally(() => onResult(decodedText));
          },
          () => {},
        );
      } catch (e: any) {
        onError?.(e?.message ?? "Unable to start camera");
      }
    })();

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
      <div ref={containerRef} className="w-full" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative h-64 w-64 rounded-2xl border-2 border-primary/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
          <div className="absolute inset-x-0 top-0 h-1 animate-[scan_2s_ease-in-out_infinite] bg-primary" />
        </div>
      </div>
    </div>
  );
}

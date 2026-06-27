import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import { ScanLine, Loader2, RotateCw, AlertCircle } from "lucide-react";
import { QrScanner } from "@/components/QrScanner";
import { PriceResultCard } from "@/components/PriceResultCard";
import { lookupPrice } from "@/lib/price-lookup.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ScanPrice — QR price estimator" },
      {
        name: "description",
        content:
          "Scan any product QR code and instantly get an AI-powered price estimate from the web.",
      },
      { property: "og:title", content: "ScanPrice — QR price estimator" },
      {
        property: "og:description",
        content:
          "Scan any product QR code and instantly get an AI-powered price estimate from the web.",
      },
    ],
  }),
  component: Index,
});

type Stage = "idle" | "scanning" | "loading" | "result" | "error";

function Index() {
  const [stage, setStage] = useState<Stage>("idle");
  const [scanned, setScanned] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const lookupFn = useServerFn(lookupPrice);
  const mutation = useMutation({
    mutationFn: (text: string) => lookupFn({ data: { text } }),
    onSuccess: () => setStage("result"),
    onError: (e: any) => {
      setErrorMsg(e?.message ?? "Lookup failed");
      setStage("error");
    },
  });

  const handleResult = useCallback(
    (text: string) => {
      setScanned(text);
      setStage("loading");
      mutation.mutate(text);
    },
    [mutation],
  );

  const reset = () => {
    setScanned("");
    setErrorMsg("");
    mutation.reset();
    setStage("idle");
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ScanLine className="h-5 w-5" />
            </div>
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
              ScanPrice
            </h1>
          </div>
          {stage !== "idle" && (
            <button
              onClick={reset}
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              <RotateCw className="h-3 w-3" />
              New scan
            </button>
          )}
        </header>

        {stage === "idle" && (
          <div className="flex flex-col items-center gap-6 pt-12 text-center">
            <h2 className="font-display text-3xl font-bold leading-tight text-foreground">
              Scan a QR code.
              <br />
              <span className="text-primary">Get the price.</span>
            </h2>
            <p className="text-sm text-muted-foreground">
              Point your camera at any product QR code. We&apos;ll search the
              web and estimate the price for you.
            </p>
            <button
              onClick={() => setStage("scanning")}
              className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-primary px-8 py-4 font-display text-base font-semibold text-primary-foreground shadow-[0_0_30px_-5px_var(--primary)] transition active:scale-95"
            >
              <ScanLine className="h-5 w-5" />
              Start scanning
            </button>
          </div>
        )}

        {stage === "scanning" && (
          <>
            <QrScanner
              onResult={handleResult}
              onError={(m) => {
                setErrorMsg(m);
                setStage("error");
              }}
            />
            <p className="text-center text-xs text-muted-foreground">
              Align the QR code within the frame.
            </p>
          </>
        )}

        {stage === "loading" && (
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-card p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div>
              <div className="font-display text-base font-semibold text-foreground">
                Looking up price…
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {scanned}
              </div>
            </div>
          </div>
        )}

        {stage === "result" && mutation.data && (
          <>
            <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-2 text-xs text-muted-foreground">
              Scanned: <span className="font-mono text-foreground">{scanned}</span>
            </div>
            <PriceResultCard result={mutation.data} />
          </>
        )}

        {stage === "error" && (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-destructive/40 bg-card p-6 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div className="font-display font-semibold text-foreground">
              Something went wrong
            </div>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <button
              onClick={reset}
              className="mt-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

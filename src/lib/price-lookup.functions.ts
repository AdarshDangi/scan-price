import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({ text: z.string().min(1).max(2000) });

const ResultSchema = z.object({
  productName: z.string(),
  priceEstimate: z.string(),
  priceLow: z.number().nullable(),
  priceHigh: z.number().nullable(),
  currency: z.string(),
  summary: z.string(),
  imageUrl: z.string().nullable(),
  sources: z
    .array(z.object({ title: z.string(), url: z.string() }))
    .max(5),
});

export type PriceResult = z.infer<typeof ResultSchema>;

function detectInputType(text: string): "url" | "barcode" | "text" {
  const trimmed = text.trim();
  if (/^https?:\/\//i.test(trimmed)) return "url";
  if (/^\d{8,14}$/.test(trimmed)) return "barcode";
  return "text";
}

export const lookupPrice = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<PriceResult> => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!lovableKey) throw new Error("Missing LOVABLE_API_KEY");
    if (!firecrawlKey) throw new Error("Missing FIRECRAWL_API_KEY");

    const { default: Firecrawl } = await import("@mendable/firecrawl-js");
    const firecrawl = new Firecrawl({ apiKey: firecrawlKey });

    const kind = detectInputType(data.text);
    let context = "";
    const sources: { title: string; url: string }[] = [];
    let scrapedImage: string | null = null;

    try {
      if (kind === "url") {
        const res: any = await firecrawl.scrape(data.text, {
          formats: ["markdown", "summary"],
          onlyMainContent: true,
        });
        const md = res.markdown ?? res.data?.markdown ?? "";
        const summary = res.summary ?? res.data?.summary ?? "";
        const meta = res.metadata ?? res.data?.metadata ?? {};
        scrapedImage = meta.ogImage || meta.image || null;
        context = `Scraped product page (${data.text}):\nTitle: ${meta.title ?? ""}\nSummary: ${summary}\n\nContent:\n${String(md).slice(0, 4000)}`;
        sources.push({ title: meta.title ?? data.text, url: data.text });
      } else {
        const query =
          kind === "barcode"
            ? `product barcode ${data.text} price`
            : `${data.text} price buy`;
        const res: any = await firecrawl.search(query, { limit: 5 });
        const results: any[] =
          res.web ?? res.data?.web ?? res.data ?? res.results ?? [];
        const lines: string[] = [];
        for (const r of results.slice(0, 5)) {
          const title = r.title ?? "";
          const url = r.url ?? r.link ?? "";
          const desc = r.description ?? r.snippet ?? "";
          if (url) sources.push({ title: title || url, url });
          lines.push(`- ${title}\n  ${url}\n  ${desc}`);
        }
        context = `Web search results for "${query}":\n${lines.join("\n\n")}`;
      }
    } catch (e: any) {
      context = `(Web lookup failed: ${e?.message ?? "unknown error"}) Input: ${data.text}`;
    }

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const { generateText, Output } = await import("ai");
    const gateway = createLovableAiGatewayProvider(lovableKey);

    const prompt = `You are a product price estimator. Based on the input and the web data below, identify the product and estimate its current retail price.

Input (from QR code): ${data.text}
Input type: ${kind}

Web data:
${context}

Return:
- productName: short clean product name
- priceEstimate: human-readable price or range (e.g. "$199" or "$180 - $220")
- priceLow / priceHigh: numeric low/high in the chosen currency; null if unknown
- currency: ISO code like "USD", "EUR", "INR"
- summary: 1-2 sentence description of the product and pricing notes
- imageUrl: a product image URL if available in the data, else null
- sources: up to 3 most relevant source URLs from the web data

If you cannot identify the product, set productName to "Unknown product" and explain in summary.`;

    const { experimental_output } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      prompt,
      experimental_output: Output.object({
        schema: z.object({
          productName: z.string(),
          priceEstimate: z.string(),
          priceLow: z.number().nullable(),
          priceHigh: z.number().nullable(),
          currency: z.string(),
          summary: z.string(),
          imageUrl: z.string().nullable(),
          sources: z
            .array(z.object({ title: z.string(), url: z.string() }))
            .max(5),
        }),
      }),
    });

    const out = experimental_output as PriceResult;
    return {
      ...out,
      imageUrl: out.imageUrl ?? scrapedImage,
      sources: out.sources?.length ? out.sources : sources.slice(0, 3),
    };
  });

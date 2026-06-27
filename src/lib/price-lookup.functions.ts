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

function extractJSON(s: string): any {
  let cleaned = s
    .replace(/^```json\s*/im, "")
    .replace(/^```\s*/im, "")
    .replace(/```\s*$/im, "")
    .trim();
  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
    else throw new Error("No valid JSON found in AI response");
  }
  return JSON.parse(cleaned);
}

function extractPrices(text: string): string[] {
  const re = /(?:USD|EUR|GBP|INR|CAD|AUD|JPY|Rs\.?|₹|\$|€|£|¥)\s?\d[\d,]*(?:\.\d{1,2})?/gi;
  const found = text.match(re) ?? [];
  return Array.from(new Set(found)).slice(0, 20);
}

export const lookupPrice = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<PriceResult> => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!lovableKey) throw new Error("Missing LOVABLE_API_KEY");
    if (!firecrawlKey) throw new Error("Missing FIRECRAWL_API_KEY");

    const { default: Firecrawl } = await import("@mendable/firecrawl-js");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const { generateText } = await import("ai");
    const firecrawl = new Firecrawl({ apiKey: firecrawlKey });
    const gateway = createLovableAiGatewayProvider(lovableKey);
    const model = gateway("google/gemini-3-flash-preview");

    const kind = detectInputType(data.text);
    const sources: { title: string; url: string }[] = [];
    let scrapedImage: string | null = null;
    const contextBlocks: string[] = [];
    const pricesFound = new Set<string>();

    // Stage 1: seed context — direct scrape (URL) or AI-refined search query (barcode/text)
    let searchQuery = "";
    try {
      if (kind === "url") {
        const res: any = await firecrawl.scrape(data.text, {
          formats: ["markdown", "summary"],
          onlyMainContent: true,
        });
        const md = String(res.markdown ?? res.data?.markdown ?? "");
        const summary = res.summary ?? res.data?.summary ?? "";
        const meta = res.metadata ?? res.data?.metadata ?? {};
        scrapedImage = meta.ogImage || meta.image || null;
        sources.push({ title: meta.title ?? data.text, url: data.text });
        extractPrices(md).forEach((p) => pricesFound.add(p));
        contextBlocks.push(
          `# Source page (${data.text})\nTitle: ${meta.title ?? ""}\nSummary: ${summary}\n\n${md.slice(0, 3000)}`,
        );
        // also derive a search query from the page title for cross-checking
        searchQuery = `${meta.title ?? ""} price`.trim();
      } else {
        // Ask the model for the best query
        const { text: q } = await generateText({
          model,
          prompt: `Given this QR code payload, produce ONE concise web search query (max 12 words) that would find current retail prices for the product. Return just the query, no quotes.\n\nPayload (${kind}): ${data.text}`,
        });
        searchQuery = q.trim().replace(/^["']|["']$/g, "") ||
          (kind === "barcode" ? `barcode ${data.text} product price` : `${data.text} price buy`);
      }
    } catch (e: any) {
      contextBlocks.push(`(Initial lookup failed: ${e?.message ?? "unknown"})`);
    }

    // Stage 2: web search
    let searchResults: any[] = [];
    if (searchQuery) {
      try {
        const res: any = await firecrawl.search(searchQuery, { limit: 6 });
        searchResults = res.web ?? res.data?.web ?? res.data ?? res.results ?? [];
        const lines: string[] = [];
        for (const r of searchResults.slice(0, 6)) {
          const title = r.title ?? "";
          const url = r.url ?? r.link ?? "";
          const desc = r.description ?? r.snippet ?? "";
          if (url && !sources.find((s) => s.url === url)) sources.push({ title: title || url, url });
          extractPrices(`${title} ${desc}`).forEach((p) => pricesFound.add(p));
          lines.push(`- ${title}\n  ${url}\n  ${desc}`);
        }
        contextBlocks.push(`# Web search "${searchQuery}"\n${lines.join("\n\n")}`);
      } catch (e: any) {
        contextBlocks.push(`(Search failed: ${e?.message ?? "unknown"})`);
      }
    }

    // Stage 3: scrape top 2 search results in parallel for richer pricing data
    if (kind !== "url" && searchResults.length > 0) {
      const top = searchResults
        .slice(0, 3)
        .map((r) => r.url ?? r.link)
        .filter(Boolean)
        .slice(0, 2);

      const scraped = await Promise.allSettled(
        top.map((url: string) =>
          firecrawl.scrape(url, {
            formats: ["markdown"],
            onlyMainContent: true,
          }),
        ),
      );

      scraped.forEach((s, i) => {
        if (s.status !== "fulfilled") return;
        const res: any = s.value;
        const md = String(res.markdown ?? res.data?.markdown ?? "");
        const meta = res.metadata ?? res.data?.metadata ?? {};
        if (!scrapedImage) scrapedImage = meta.ogImage || meta.image || null;
        extractPrices(md).forEach((p) => pricesFound.add(p));
        contextBlocks.push(
          `# Scraped result ${i + 1} (${top[i]})\nTitle: ${meta.title ?? ""}\n\n${md.slice(0, 2500)}`,
        );
      });
    }

    const context = contextBlocks.join("\n\n---\n\n").slice(0, 12000);
    const priceHints = Array.from(pricesFound).slice(0, 15).join(", ") || "(none detected)";

    // Stage 4: synthesize
    const prompt = `You are a product price estimator. Identify the product and estimate its current retail price using the web evidence below. Prefer prices that appear across multiple sources.

QR payload: ${data.text}
Payload type: ${kind}
Search query used: ${searchQuery || "(none)"}

Price strings detected in scraped/search text: ${priceHints}

Web evidence:
${context}

Respond with ONLY a raw JSON object (no markdown, no code fences) matching this shape:
{
  "productName": string,
  "priceEstimate": string,
  "priceLow": number | null,
  "priceHigh": number | null,
  "currency": string,
  "summary": string,
  "imageUrl": string | null,
  "sources": [{ "title": string, "url": string }]
}

Rules:
- priceEstimate is human-readable (e.g. "$199" or "$180 - $220").
- priceLow/priceHigh are raw numbers, no separators or symbols; null if unknown.
- currency is an ISO code ("USD", "EUR", "INR", ...). Infer from the dominant price symbol.
- summary: 2-3 sentences mentioning how many sources agree and any price spread.
- sources: up to 3 most relevant URLs from the evidence.
- If the product cannot be identified, set productName to "Unknown product" and explain in summary.`;

    const { text: raw } = await generateText({ model, prompt });
    const parsed = ResultSchema.parse(extractJSON(raw));
    return {
      ...parsed,
      imageUrl: parsed.imageUrl ?? scrapedImage,
      sources: parsed.sources?.length ? parsed.sources : sources.slice(0, 3),
    };
  });



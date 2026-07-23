import { createServerFn } from "@tanstack/react-start";

export interface ResearchNarrativeInput {
  summary: string;
  detail?: string;
  watch?: string[];
}

export interface GeneratedResearchNarrative {
  summary: string;
  detail?: string;
  watch: string[];
  source: "ai" | "fallback";
}

export const getResearchNarrative = createServerFn({ method: "POST" })
  .validator((input: ResearchNarrativeInput) => input)
  .handler(async ({ data }): Promise<GeneratedResearchNarrative> => {
    const fallback = fallbackNarrative(data);
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return fallback;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7_000);
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content:
                'Rewrite the supplied research facts in direct, plain English. Return strict JSON with {"summary":"...","detail":"...","watch":["..."]}. Preserve every number and date exactly, add no facts, predictions or recommendations, avoid mathematical jargon, and keep the summary under 55 words.',
            },
            {
              role: "user",
              content: JSON.stringify({
                summary: data.summary.slice(0, 1_500),
                detail: data.detail?.slice(0, 1_500) ?? "",
                watch: (data.watch ?? []).slice(0, 4).map((item) => item.slice(0, 400)),
              }),
            },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!response.ok) return fallback;
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = body.choices?.[0]?.message?.content;
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<GeneratedResearchNarrative>;
      if (typeof parsed.summary !== "string" || !parsed.summary.trim()) return fallback;
      const candidate: GeneratedResearchNarrative = {
        summary: parsed.summary.slice(0, 1_500),
        detail:
          typeof parsed.detail === "string" && parsed.detail.trim()
            ? parsed.detail.slice(0, 1_500)
            : data.detail,
        watch: Array.isArray(parsed.watch)
          ? parsed.watch
              .filter((item): item is string => typeof item === "string")
              .slice(0, 4)
              .map((item) => item.slice(0, 400))
          : (data.watch ?? []).slice(0, 4),
        source: "ai",
      };
      const allowedNumbers = new Set(numberTokens(JSON.stringify(data)));
      if (numberTokens(JSON.stringify(candidate)).some((number) => !allowedNumbers.has(number))) {
        return fallback;
      }
      return candidate;
    } catch {
      return fallback;
    } finally {
      clearTimeout(timeout);
    }
  });

function fallbackNarrative(data: ResearchNarrativeInput): GeneratedResearchNarrative {
  return {
    summary: data.summary,
    detail: data.detail,
    watch: (data.watch ?? []).slice(0, 4),
    source: "fallback",
  };
}

function numberTokens(value: string): string[] {
  return value.match(/-?\d+(?:[.,]\d+)?%?/g) ?? [];
}

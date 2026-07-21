import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const ingestStooqSymbol = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ symbol: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { runStooqIngest } = await import("./ingest.server");
    return runStooqIngest(data.symbol);
  });

export const ingestAllStooq = createServerFn({ method: "POST" }).handler(async () => {
  const { runAllStooqIngest } = await import("./ingest.server");
  return { results: await runAllStooqIngest() };
});
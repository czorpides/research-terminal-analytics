import { createServerFn } from "@tanstack/react-start";

export interface AlertRuleView {
  id: string;
  name: string;
  active: boolean;
  subjectType: string;
  subjectId: string | null;
  subjectLabel: string;
  condition: string;
  updatedAt: string;
  firedCount: number;
  latestFiringAt: string | null;
}

export interface AlertFiringView {
  id: string;
  headline: string;
  state: "pending" | "triggered" | "acknowledged" | "dismissed";
  confidence: number;
  triggeredAt: string;
  ruleId: string | null;
  ruleName: string;
  detail: string;
}

export interface AlertsDashboard {
  generatedAt: string;
  rules: AlertRuleView[];
  firings: AlertFiringView[];
  counts: {
    activeRules: number;
    inactiveRules: number;
    openAlerts: number;
    triggeredSevenDays: number;
    acknowledged: number;
    averageConfidence: number;
  };
}

interface RuleRow {
  id: string;
  name: string;
  active: boolean;
  condition: unknown;
  subject_id: string | null;
  subject_type: string;
  updated_at: string;
}

interface FiringRow {
  id: string;
  headline: string;
  state: AlertFiringView["state"];
  confidence: number;
  triggered_at: string;
  rule_id: string | null;
  detail: unknown;
}

export const getAlertsDashboard = createServerFn({ method: "GET" }).handler(
  async (): Promise<AlertsDashboard> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: ruleData, error: ruleError }, { data: firingData, error: firingError }] =
      await Promise.all([
        supabaseAdmin
          .from("alert_rules")
          .select("id,name,active,condition,subject_id,subject_type,updated_at")
          .order("updated_at", { ascending: false })
          .limit(250),
        supabaseAdmin
          .from("alerts")
          .select("id,headline,state,confidence,triggered_at,rule_id,detail")
          .order("triggered_at", { ascending: false })
          .limit(250),
      ]);
    if (ruleError) throw ruleError;
    if (firingError) throw firingError;

    const rawRules = (ruleData ?? []) as RuleRow[];
    const rawFirings = (firingData ?? []) as FiringRow[];
    const subjectIds = unique(rawRules.map((rule) => rule.subject_id).filter(Boolean) as string[]);
    const { data: assets, error: assetError } = subjectIds.length
      ? await supabaseAdmin.from("assets").select("id,symbol,name").in("id", subjectIds)
      : { data: [], error: null };
    if (assetError) throw assetError;

    const assetLabels = new Map(
      (assets ?? []).map((asset) => [String(asset.id), `${String(asset.symbol)} · ${String(asset.name)}`]),
    );
    const firingByRule = new Map<string, FiringRow[]>();
    for (const firing of rawFirings) {
      if (!firing.rule_id) continue;
      const rows = firingByRule.get(firing.rule_id) ?? [];
      rows.push(firing);
      firingByRule.set(firing.rule_id, rows);
    }
    const ruleNames = new Map(rawRules.map((rule) => [rule.id, rule.name]));

    const rules: AlertRuleView[] = rawRules.map((rule) => {
      const firings = firingByRule.get(rule.id) ?? [];
      return {
        id: rule.id,
        name: rule.name,
        active: rule.active,
        subjectType: rule.subject_type,
        subjectId: rule.subject_id,
        subjectLabel: rule.subject_id
          ? assetLabels.get(rule.subject_id) ?? `${humanise(rule.subject_type)} · ${rule.subject_id.slice(0, 8)}`
          : `All ${humanise(rule.subject_type)} subjects`,
        condition: describeCondition(rule.condition),
        updatedAt: rule.updated_at,
        firedCount: firings.length,
        latestFiringAt: firings[0]?.triggered_at ?? null,
      };
    });
    const firings: AlertFiringView[] = rawFirings.map((firing) => ({
      id: firing.id,
      headline: firing.headline,
      state: firing.state,
      confidence: Number(firing.confidence),
      triggeredAt: firing.triggered_at,
      ruleId: firing.rule_id,
      ruleName: firing.rule_id ? ruleNames.get(firing.rule_id) ?? "Deleted or unavailable rule" : "System alert",
      detail: describeDetail(firing.detail),
    }));

    const sevenDaysAgo = Date.now() - 7 * 86_400_000;
    const confidenceValues = firings.map((firing) => firing.confidence).filter(Number.isFinite);
    return {
      generatedAt: new Date().toISOString(),
      rules,
      firings,
      counts: {
        activeRules: rules.filter((rule) => rule.active).length,
        inactiveRules: rules.filter((rule) => !rule.active).length,
        openAlerts: firings.filter((firing) => ["pending", "triggered"].includes(firing.state)).length,
        triggeredSevenDays: firings.filter(
          (firing) => new Date(firing.triggeredAt).getTime() >= sevenDaysAgo,
        ).length,
        acknowledged: firings.filter((firing) => firing.state === "acknowledged").length,
        averageConfidence: confidenceValues.length
          ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
          : 0,
      },
    };
  },
);

function describeCondition(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Condition details unavailable";
  const condition = value as Record<string, unknown>;
  const metric = stringValue(condition.metric_code ?? condition.metric ?? condition.field);
  const operator = stringValue(condition.operator ?? condition.op ?? condition.comparison);
  const threshold = condition.threshold ?? condition.value;
  const window = condition.window ?? condition.lookback ?? condition.period;
  const pieces = [metric ? humanise(metric) : null, operator ? operatorLabel(operator) : null, scalar(threshold)];
  const sentence = pieces.filter(Boolean).join(" ");
  return `${sentence || compactJson(condition)}${window ? ` over ${scalar(window)}` : ""}`;
}

function describeDetail(value: unknown): string {
  if (value == null) return "No additional firing detail was stored.";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return String(value);
  const detail = value as Record<string, unknown>;
  const preferred = [detail.reason, detail.explanation, detail.message, detail.actual, detail.threshold]
    .map(scalar)
    .filter(Boolean);
  return preferred.length ? preferred.join(" · ") : compactJson(detail);
}

function operatorLabel(value: string): string {
  const operators: Record<string, string> = {
    gt: ">",
    gte: "≥",
    lt: "<",
    lte: "≤",
    eq: "=",
    ne: "≠",
    crosses_above: "crosses above",
    crosses_below: "crosses below",
  };
  return operators[value.toLowerCase()] ?? value;
}

function scalar(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return compactJson(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function compactJson(value: unknown): string {
  try {
    const text = JSON.stringify(value);
    return text.length > 180 ? `${text.slice(0, 177)}…` : text;
  } catch {
    return "Unserialisable condition";
  }
}

function humanise(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

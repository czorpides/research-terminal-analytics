import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { ChartZone } from "@/lib/panels/contract";
import { SlidersHorizontal } from "lucide-react";

const KINDS: ChartZone["kind"][] = ["good", "warn", "bad"];

export function ZoneEditor({
  overrideKey,
  defaults,
  onChange,
}: {
  overrideKey: string;
  defaults: ChartZone[];
  onChange: (zones: ChartZone[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [zones, setZones] = useState<ChartZone[]>(defaults);
  const [saving, setSaving] = useState(false);

  function update(i: number, patch: Partial<ChartZone>) {
    setZones((z) => z.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function save() {
    setSaving(true);
    try {
      const { data: sess } = await supabase.auth.getUser();
      if (!sess.user) return;
      await supabase.from("user_zone_overrides").upsert(
        { user_id: sess.user.id, indicator_id: overrideKey, zones: zones as unknown as never },
        { onConflict: "user_id,indicator_id" },
      );
      onChange(zones);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true);
    try {
      const { data: sess } = await supabase.auth.getUser();
      if (!sess.user) return;
      await supabase.from("user_zone_overrides").delete().eq("user_id", sess.user.id).eq("indicator_id", overrideKey);
      setZones(defaults);
      onChange(defaults);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-sm border border-border/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          title="Customise zones for this indicator"
        >
          <SlidersHorizontal className="h-3 w-3" />
          Zones
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[360px] sm:max-w-[360px]">
        <SheetHeader>
          <SheetTitle>Custom zones</SheetTitle>
        </SheetHeader>
        <p className="mt-2 text-xs text-muted-foreground">
          Override the goldilocks / warning / danger bands used on this chart. Applies only to your account.
        </p>
        <div className="mt-4 space-y-4">
          {zones.length === 0 ? (
            <div>
              {KINDS.map((k) => (
                <Button
                  key={k}
                  size="sm"
                  variant="outline"
                  className="mr-2"
                  onClick={() => setZones((z) => [...z, { kind: k }])}
                >
                  + {k}
                </Button>
              ))}
            </div>
          ) : (
            zones.map((z, i) => (
              <div key={i} className="rounded-sm border border-border/70 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <select
                    value={z.kind}
                    onChange={(e) => update(i, { kind: e.target.value as ChartZone["kind"] })}
                    className="rounded-sm border border-border/70 bg-background px-1.5 py-0.5 text-xs"
                  >
                    {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => setZones((z2) => z2.filter((_, idx) => idx !== i))}
                  >
                    remove
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor={`from-${i}`} className="text-[10px]">From</Label>
                    <Input id={`from-${i}`} type="number" step="any" value={z.from ?? ""} onChange={(e) => update(i, { from: e.target.value === "" ? undefined : Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label htmlFor={`to-${i}`} className="text-[10px]">To</Label>
                    <Input id={`to-${i}`} type="number" step="any" value={z.to ?? ""} onChange={(e) => update(i, { to: e.target.value === "" ? undefined : Number(e.target.value) })} />
                  </div>
                </div>
              </div>
            ))
          )}
          {zones.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setZones((z) => [...z, { kind: "warn" }])}>+ Add band</Button>
          )}
        </div>
        <div className="mt-6 flex justify-between">
          <Button variant="ghost" size="sm" onClick={reset} disabled={saving}>Reset to default</Button>
          <Button size="sm" onClick={save} disabled={saving}>{saving ? "…" : "Save"}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Load current user's override for the given key. Null if none. */
export async function loadZoneOverride(overrideKey: string): Promise<ChartZone[] | null> {
  const { data: sess } = await supabase.auth.getUser();
  if (!sess.user) return null;
  const { data } = await supabase
    .from("user_zone_overrides")
    .select("zones")
    .eq("user_id", sess.user.id)
    .eq("indicator_id", overrideKey)
    .maybeSingle();
  return (data?.zones as ChartZone[] | undefined) ?? null;
}
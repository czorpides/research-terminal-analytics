import { timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CREDENTIAL_NAME = "release-calendar";
const HEADER_NAME = "x-scheduler-secret";

export async function isCalendarSchedulerRequest(request: Request) {
  const received = request.headers.get(HEADER_NAME);
  if (!received) return false;

  const { data, error } = await supabaseAdmin
    .from("scheduler_credentials")
    .select("token")
    .eq("name", CREDENTIAL_NAME)
    .maybeSingle();

  if (error || !data?.token) return false;

  const encoder = new TextEncoder();
  const expectedBytes = encoder.encode(data.token);
  const receivedBytes = encoder.encode(received);

  return (
    expectedBytes.byteLength === receivedBytes.byteLength &&
    timingSafeEqual(expectedBytes, receivedBytes)
  );
}

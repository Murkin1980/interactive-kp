import { createClient } from "@supabase/supabase-js";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "TEST_USER_EMAIL",
  "TEST_USER_PASSWORD",
  "TEST_KP_ID",
  "TEST_PUBLIC_TOKEN",
];

for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing environment variable: ${name}`);
}

const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

const { data: publicKp, error: publicError } = await anon.rpc(
  "get_public_kp",
  { p_token: process.env.TEST_PUBLIC_TOKEN }
);

if (publicError) throw publicError;
if (publicKp?.status !== "confirmed") {
  throw new Error(`Expected confirmed public KP, got: ${publicKp?.status}`);
}
if (Number(publicKp.selected_total) !== 1_650_000) {
  throw new Error(`Unexpected confirmed total: ${publicKp.selected_total}`);
}
if (Object.keys(publicKp.selected_variants ?? {}).length !== 1) {
  throw new Error("Confirmed selection was not restored");
}

const itemId = publicKp.items?.[0]?.id;
if (!itemId) throw new Error("Public KP has no item");

const { error: anonOwnerRpcError } = await anon.rpc("add_kp_variant", {
  p_item_id: itemId,
  p_name: "Unauthorized variant",
  p_price: 1,
});
if (!anonOwnerRpcError) throw new Error("Anon unexpectedly executed owner RPC");

const owner = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);
const { error: signInError } = await owner.auth.signInWithPassword({
  email: process.env.TEST_USER_EMAIL,
  password: process.env.TEST_USER_PASSWORD,
});
if (signInError) throw signInError;

const { error: lockedUpdateError } = await owner
  .from("kps")
  .update({ project_name: publicKp.project_name })
  .eq("id", process.env.TEST_KP_ID);
if (!lockedUpdateError) {
  throw new Error("Owner unexpectedly updated a confirmed KP");
}

console.log("Security smoke passed: public restore, RPC grants, confirmed lock.");

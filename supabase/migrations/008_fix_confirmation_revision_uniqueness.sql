-- A proposal may be confirmed once per revision, while preserving prior confirmations.
alter table public.kp_confirmations
  drop constraint if exists kp_confirmations_unique_kp;

alter table public.kp_confirmations
  drop constraint if exists kp_confirmations_kp_id_key;

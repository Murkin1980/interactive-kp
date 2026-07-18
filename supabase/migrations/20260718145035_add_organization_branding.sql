alter table public.organizations
  add column if not exists logo_url text,
  add column if not exists pdf_watermark_text text,
  add column if not exists brand_primary_color text not null default '#14263D';

alter table public.organizations
  add constraint organizations_brand_primary_color_check
  check (brand_primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint organizations_logo_url_check
  check (logo_url is null or logo_url ~ '^https://');

create or replace function public.get_public_kp_branding(p_token uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'company_name', o.name,
    'logo_url', o.logo_url,
    'watermark_text', coalesce(nullif(o.pdf_watermark_text, ''), o.name),
    'primary_color', o.brand_primary_color
  )
  from public.kps k
  join public.organizations o on o.id = k.organization_id
  where k.public_token = p_token
    and k.status in ('sent', 'viewed', 'confirmed', 'expired')
  limit 1;
$$;

revoke all on function public.get_public_kp_branding(uuid) from public;
grant execute on function public.get_public_kp_branding(uuid) to anon, authenticated;

-- Inventory & Beverage Intelligence Platform (PostgreSQL) - v1 schema
-- Notes:
-- 1) UUID primary keys; use gen_random_uuid() from pgcrypto
-- 2) consumption_events is append-only: updates/deletes blocked by triggers

create extension if not exists pgcrypto;

-- Enums
do $$ begin
  create type role_t as enum ('admin','manager','staff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type inventory_item_type_t as enum ('packaged_beer','keg_beer','liquor','wine','food','misc');
exception when duplicate_object then null; end $$;

do $$ begin
  create type uom_t as enum ('units','oz','ml','grams');
exception when duplicate_object then null; end $$;

do $$ begin
  create type source_system_t as enum ('toast','square','lightspeed','clover','other','manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type mapping_mode_t as enum ('packaged_unit','draft_by_tap','draft_by_product');
exception when duplicate_object then null; end $$;

do $$ begin
  create type keg_status_t as enum ('in_storage','in_service','empty','returned');
exception when duplicate_object then null; end $$;

do $$ begin
  create type event_type_t as enum ('pos_sale','tap_flow','manual_adjustment','inventory_count_adjustment','transfer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type confidence_level_t as enum ('theoretical','measured','estimated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type variance_reason_t as enum ('waste_foam','comp','staff_drink','theft','breakage','line_cleaning','transfer','unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type session_type_t as enum ('shift','daily','weekly','monthly');
exception when duplicate_object then null; end $$;

-- Core
create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'America/Montreal',
  closeout_hour int not null default 4 check (closeout_hour between 0 and 23),
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  role role_t not null,
  location_id uuid not null references locations(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  type inventory_item_type_t not null,
  name text not null,
  barcode text,
  vendor_sku text,
  base_uom uom_t not null,
  pack_size numeric,
  pack_uom uom_t,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists ix_inventory_items_location on inventory_items(location_id);

create table if not exists price_history (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references inventory_items(id),
  unit_cost numeric not null check (unit_cost >= 0),
  currency text not null default 'CAD',
  effective_from_ts timestamptz not null,
  effective_to_ts timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ix_price_history_item_from on price_history(inventory_item_id, effective_from_ts);

-- Draft
create table if not exists keg_sizes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  total_oz numeric not null check (total_oz > 0)
);

create table if not exists keg_instances (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  inventory_item_id uuid not null references inventory_items(id),
  keg_size_id uuid not null references keg_sizes(id),
  status keg_status_t not null default 'in_storage',
  received_ts timestamptz not null,
  tapped_ts timestamptz,
  emptied_ts timestamptz,
  starting_oz numeric not null check (starting_oz > 0),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists ix_keg_instances_location on keg_instances(location_id);
create index if not exists ix_keg_instances_item on keg_instances(inventory_item_id);

create table if not exists tap_lines (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists tap_assignments (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  tap_line_id uuid not null references tap_lines(id),
  keg_instance_id uuid not null references keg_instances(id),
  effective_start_ts timestamptz not null,
  effective_end_ts timestamptz,
  created_at timestamptz not null default now(),
  check (effective_end_ts is null or effective_end_ts > effective_start_ts)
);

create unique index if not exists ux_tap_assign_open on tap_assignments(tap_line_id) where effective_end_ts is null;
create index if not exists ix_tap_assign_line_time on tap_assignments(tap_line_id, effective_start_ts);

create table if not exists pour_profiles (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  name text not null,
  oz numeric not null check (oz > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- POS canonical
create table if not exists pos_connections (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  source_system source_system_t not null,
  method text not null check (method in ('api','sftp_export','webhook','manual_upload')),
  status text not null default 'active',
  last_success_ts timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table if not exists sales_lines (
  id uuid primary key default gen_random_uuid(),
  source_system source_system_t not null,
  source_location_id text not null,
  location_id uuid not null references locations(id),
  business_date date not null,
  sold_at timestamptz not null,
  receipt_id text not null,
  line_id text not null,
  pos_item_id text not null,
  pos_item_name text not null,
  quantity numeric not null check (quantity >= 0),
  is_voided boolean not null default false,
  is_refunded boolean not null default false,
  size_modifier_id text,
  size_modifier_name text,
  raw_payload_json jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_salesline_idem on sales_lines
(source_system, source_location_id, business_date, receipt_id, line_id, coalesce(size_modifier_id,''));

create index if not exists ix_sales_lines_location_time on sales_lines(location_id, sold_at);

create table if not exists pos_item_mappings (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  source_system source_system_t not null,
  pos_item_id text not null,
  inventory_item_id uuid not null references inventory_items(id),
  mode mapping_mode_t not null,
  pour_profile_id uuid references pour_profiles(id),
  tap_line_id uuid references tap_lines(id),
  active boolean not null default true,
  effective_from_ts timestamptz not null,
  effective_to_ts timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ix_mappings_lookup on pos_item_mappings(location_id, source_system, pos_item_id, effective_from_ts);

-- Ledger
create table if not exists consumption_events (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  event_type event_type_t not null,
  source_system source_system_t not null,
  event_ts timestamptz not null,
  inventory_item_id uuid not null references inventory_items(id),
  keg_instance_id uuid references keg_instances(id),
  tap_line_id uuid references tap_lines(id),
  receipt_id text,
  sales_line_id uuid references sales_lines(id),
  quantity_delta numeric not null,
  uom uom_t not null,
  confidence_level confidence_level_t not null,
  variance_reason variance_reason_t,
  notes text,
  reversal_of_event_id uuid references consumption_events(id),
  created_at timestamptz not null default now()
);

create index if not exists ix_events_loc_ts on consumption_events(location_id, event_ts);
create index if not exists ix_events_item_ts on consumption_events(inventory_item_id, event_ts);

-- Sessions
create table if not exists inventory_sessions (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  session_type session_type_t not null,
  started_ts timestamptz not null,
  ended_ts timestamptz,
  created_by uuid references users(id),
  closed_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table if not exists inventory_session_lines (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references inventory_sessions(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id),
  count_units numeric,
  tap_line_id uuid references tap_lines(id),
  keg_instance_id uuid references keg_instances(id),
  percent_remaining numeric check (percent_remaining is null or (percent_remaining >= 0 and percent_remaining <= 100)),
  gross_weight_grams numeric check (gross_weight_grams is null or gross_weight_grams >= 0),
  is_manual boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists ix_session_lines_session on inventory_session_lines(session_id);

-- Immutability triggers for consumption_events
create or replace function block_ledger_mutation() returns trigger as $$
begin
  raise exception 'consumption_events is immutable; use correction endpoints (reversal+replacement)';
end;
$$ language plpgsql;

drop trigger if exists trg_block_update_consumption_events on consumption_events;
create trigger trg_block_update_consumption_events
before update on consumption_events
for each row execute function block_ledger_mutation();

drop trigger if exists trg_block_delete_consumption_events on consumption_events;
create trigger trg_block_delete_consumption_events
before delete on consumption_events
for each row execute function block_ledger_mutation();

-- ===========================
-- v1.1 PATCH: ORG + MULTI-LOCATION + SCALE/BOTTLE MODELS
-- ===========================

create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

alter table locations add column if not exists org_id uuid references orgs(id);

create table if not exists user_locations (
  user_id uuid not null references users(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  role role_t not null,
  primary key (user_id, location_id)
);

-- Bottle templates: org-level (location_id null) with optional location override
create table if not exists bottle_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references orgs(id),
  location_id uuid references locations(id),
  inventory_item_id uuid not null references inventory_items(id),
  container_size_ml numeric not null,
  empty_bottle_weight_g numeric not null,
  full_bottle_weight_g numeric not null,
  density_g_per_ml numeric,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists ix_bottle_templates_item on bottle_templates(inventory_item_id);

-- Bottle measurements: raw weight capture
create table if not exists bottle_measurements (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  inventory_item_id uuid not null references inventory_items(id),
  session_id uuid references inventory_sessions(id),
  measured_at_ts timestamptz not null,
  gross_weight_g numeric not null check (gross_weight_g >= 0),
  is_manual boolean not null default false,
  confidence_level text not null check (confidence_level in ('measured','estimated')),
  scale_device_id text,
  scale_device_name text,
  notes text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

alter table inventory_session_lines
  add column if not exists derived_ml numeric,
  add column if not exists derived_oz numeric,
  add column if not exists bottle_template_id uuid references bottle_templates(id),
  add column if not exists confidence_level text;

-- ===========================
-- v1.2 PATCH: BAR AREAS + SUB-AREAS
-- ===========================

create table if not exists bar_areas (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ix_bar_areas_location on bar_areas(location_id);

create table if not exists sub_areas (
  id uuid primary key default gen_random_uuid(),
  bar_area_id uuid not null references bar_areas(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ix_sub_areas_bar_area on sub_areas(bar_area_id);

-- Add optional bar_area_id to tap_lines
alter table tap_lines
  add column if not exists bar_area_id uuid references bar_areas(id);

-- Add optional sub_area_id to inventory_session_lines
alter table inventory_session_lines
  add column if not exists sub_area_id uuid references sub_areas(id);

-- Add optional sub_area_id to bottle_measurements
alter table bottle_measurements
  add column if not exists sub_area_id uuid references sub_areas(id);

-- ===========================
-- v1.3 PATCH: ORG → BUSINESS RENAME + EXPANDED ROLES
-- ===========================

-- Expand role_t enum: remove 'admin', add new roles
-- NOTE: PostgreSQL does not support removing enum values, so we recreate the type.
-- This requires a fresh DB or a migration that casts columns.
do $$ begin
  -- Add new enum values if they don't exist
  alter type role_t add value if not exists 'platform_admin';
  alter type role_t add value if not exists 'business_admin';
  alter type role_t add value if not exists 'auditor';
end $$;

-- Rename orgs → businesses
alter table if exists orgs rename to businesses;

-- Rename org_id → business_id on locations
alter table locations rename column org_id to business_id;
alter table locations alter column business_id set not null;

-- Add business_id to users
alter table users add column if not exists business_id uuid references businesses(id);

-- Rename org_id → business_id on bottle_templates
alter table bottle_templates rename column org_id to business_id;

-- ===========================
-- v1.4 PATCH: PLATFORM INFRASTRUCTURE (roles, slug, audit, settings, notifications)
-- ===========================

-- Expand role_t: replace auditor with accounting, add curator
do $$ begin
  alter type role_t add value if not exists 'accounting';
  alter type role_t add value if not exists 'curator';
end $$;

-- Add slug to businesses
alter table businesses add column if not exists slug text unique;

-- Audit logs
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  actor_user_id uuid references users(id),
  action_type text not null,
  object_type text not null,
  object_id text,
  metadata_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ix_audit_logs_business_time on audit_logs(business_id, created_at);
create index if not exists ix_audit_logs_object on audit_logs(object_type, object_id);

-- Business settings
create table if not exists business_settings (
  business_id uuid primary key references businesses(id),
  settings_json jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Notifications
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  recipient_user_id uuid not null references users(id),
  title text not null,
  body text,
  link_url text,
  image_url text,
  metadata_json jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ix_notifications_recipient on notifications(recipient_user_id, is_read, created_at desc);
create index if not exists ix_notifications_business on notifications(business_id, created_at desc);

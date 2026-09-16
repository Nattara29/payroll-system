-- ============================================================
-- ระบบเงินเดือน เทศบาลเมืองศรีสัชนาลัย — โครงสร้างฐานข้อมูล (Supabase/Postgres)
-- ไฟล์นี้เก็บไว้เป็นหลักฐาน/สำเนา ถ้าต้องสร้างฐานข้อมูลใหม่ที่อื่น
-- สามารถคัดลอกไปรันใน Supabase SQL editor ได้ทั้งไฟล์
-- ============================================================

-- โปรไฟล์ผู้ใช้งาน (ต่อยอดจาก auth.users ของ Supabase)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'staff' check (role in ('admin','staff')),
  created_at timestamptz not null default now()
);

-- กอง/สำนัก ในเทศบาล
create table if not exists public.departments (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

-- บุคลากร
create table if not exists public.employees (
  id bigint generated always as identity primary key,
  full_name text not null,
  employee_type text not null,
  department_id bigint references public.departments(id),
  employee_code text unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- งวดเงินเดือน (หนึ่งงวด = หนึ่งเดือน/ปี ที่นำเข้าข้อมูล)
create table if not exists public.payroll_periods (
  id bigint generated always as identity primary key,
  year int not null,           -- ปี พ.ศ. ของงวดเงินเดือน
  month int not null check (month between 1 and 12),
  status text not null default 'draft' check (status in ('draft','confirmed')),
  source_filename text,
  imported_by uuid references public.profiles(id),
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  unique (year, month)
);

-- แม่แบบการ mapping คอลัมน์ Excel (จำไว้ใช้ซ้ำเดือนถัดไป)
create table if not exists public.column_mapping_templates (
  id bigint generated always as identity primary key,
  name text not null,
  mapping jsonb not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ข้อมูลเงินเดือนรายบุคคลต่องวด
create table if not exists public.payroll_records (
  id bigint generated always as identity primary key,
  payroll_period_id bigint not null references public.payroll_periods(id) on delete cascade,
  employee_id bigint not null references public.employees(id),
  department_id bigint references public.departments(id),
  income jsonb not null default '{}',
  deductions jsonb not null default '{}',
  total_income numeric(12,2) not null default 0,
  total_deduction numeric(12,2) not null default 0,
  net_pay numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (payroll_period_id, employee_id)
);

-- ประวัติการนำเข้าไฟล์ Excel
create table if not exists public.import_logs (
  id bigint generated always as identity primary key,
  payroll_period_id bigint references public.payroll_periods(id) on delete cascade,
  filename text,
  row_count int not null default 0,
  error_count int not null default 0,
  status text not null default 'success' check (status in ('success','partial','failed')),
  detail jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_payroll_records_period on public.payroll_records(payroll_period_id);
create index if not exists idx_payroll_records_employee on public.payroll_records(employee_id);
create index if not exists idx_employees_department on public.employees(department_id);

-- ============================================================
-- Row Level Security: ต้องล็อกอินก่อนถึงจะเข้าถึงข้อมูลได้
-- ============================================================
alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.employees enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.column_mapping_templates enable row level security;
alter table public.payroll_records enable row level security;
alter table public.import_logs enable row level security;

create policy "profiles_self_select" on public.profiles for select using (auth.uid() = id);
create policy "profiles_self_update" on public.profiles for update using (auth.uid() = id);

create policy "departments_read" on public.departments for select using (auth.role() = 'authenticated');
create policy "departments_write" on public.departments for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "employees_read" on public.employees for select using (auth.role() = 'authenticated');
create policy "employees_write" on public.employees for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "periods_read" on public.payroll_periods for select using (auth.role() = 'authenticated');
create policy "periods_insert" on public.payroll_periods for insert with check (auth.role() = 'authenticated');
create policy "periods_update" on public.payroll_periods for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
-- ลบงวดเงินเดือนได้เฉพาะผู้ดูแลระบบ (admin) เท่านั้น เพราะจะพ่วงลบข้อมูลเงินเดือนทั้งงวด
create policy "periods_delete_admin" on public.payroll_periods for delete using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "mapping_read" on public.column_mapping_templates for select using (auth.role() = 'authenticated');
create policy "mapping_write" on public.column_mapping_templates for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "records_read" on public.payroll_records for select using (auth.role() = 'authenticated');
create policy "records_write" on public.payroll_records for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "logs_read" on public.import_logs for select using (auth.role() = 'authenticated');
create policy "logs_write" on public.import_logs for insert with check (auth.role() = 'authenticated');
create policy "logs_delete_admin" on public.import_logs for delete using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- เมื่อมีผู้ใช้สมัคร/ถูกสร้างใน auth.users ให้สร้างแถว profile อัตโนมัติ
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'staff');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- กองเริ่มต้น จากไฟล์ Excel ตัวอย่างที่ใช้อ้างอิงตอนออกแบบระบบ
insert into public.departments (name) values
  ('งานบริหารทั่วไป'),
  ('งานบริหารงานคลัง'),
  ('งานควบคุมภายในและการตรวจสอบภายใน'),
  ('งานบริหารทั่วไปเกี่ยวกับการรักษาความสงบภายใน'),
  ('งานบริหารทั่วไปเกี่ยวกับการศึกษา'),
  ('งานบริหารทั่วไปเกี่ยวกับสาธารณสุข'),
  ('งานบริหารทั่วไปเกี่ยวกับเคหะและชุมชน'),
  ('งานบริหารทั่วไปเกี่ยวกับสร้างความเข้มแข็งชุมชน')
on conflict (name) do nothing;

-- ============================================================
-- ข้อมูลตั้งค่าหน่วยงาน (singleton row) + ที่เก็บโลโก้
-- ============================================================
create table if not exists public.org_settings (
  id int primary key default 1 check (id = 1),
  org_name text not null default 'เทศบาลเมืองศรีสัชนาลัย',
  org_name_short text default 'ทม.',
  address text,
  phone text,
  email text,
  director_name text,
  director_title text,
  logo_url text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.org_settings (id) values (1) on conflict (id) do nothing;

alter table public.org_settings enable row level security;

create policy "org_settings_read" on public.org_settings for select using (auth.role() = 'authenticated');
create policy "org_settings_update_admin" on public.org_settings for update using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- ที่เก็บโลโก้หน่วยงาน (public bucket: อ่านได้โดยไม่ต้องล็อกอิน, เขียนได้เฉพาะ admin)
insert into storage.buckets (id, name, public)
values ('org-assets', 'org-assets', true)
on conflict (id) do nothing;

create policy "org_assets_public_read" on storage.objects for select using (bucket_id = 'org-assets');

create policy "org_assets_admin_insert" on storage.objects for insert with check (
  bucket_id = 'org-assets' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "org_assets_admin_update" on storage.objects for update using (
  bucket_id = 'org-assets' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "org_assets_admin_delete" on storage.objects for delete using (
  bucket_id = 'org-assets' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

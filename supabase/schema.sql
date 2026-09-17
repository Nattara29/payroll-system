-- ============================================================
-- ระบบเงินเดือน เทศบาลเมืองศรีสัชนาลัย — โครงสร้างฐานข้อมูล (Supabase/Postgres)
-- ไฟล์นี้เก็บไว้เป็นหลักฐาน/สำเนา ถ้าต้องสร้างฐานข้อมูลใหม่ที่อื่น
-- สามารถคัดลอกไปรันใน Supabase SQL editor ได้ทั้งไฟล์
-- ============================================================

-- โปรไฟล์ผู้ใช้งาน (ต่อยอดจาก auth.users ของ Supabase)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  role text not null default 'staff' check (role in ('admin','staff')),
  active boolean not null default true,
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

-- เก็บว่ายอดเงินเดือนแต่ละแถวมาจากการนำเข้าครั้งไหน เพื่อให้ลบเฉพาะรายการของการนำเข้าที่ผิด
-- ได้โดยไม่ลบข้อมูลทั้งงวด (งวดเดียวอาจมีข้อมูลจากหลายการนำเข้าปะปนกัน)
alter table public.payroll_records
  add column if not exists import_log_id bigint references public.import_logs(id) on delete set null;

create index if not exists idx_payroll_records_period on public.payroll_records(payroll_period_id);
create index if not exists idx_payroll_records_employee on public.payroll_records(employee_id);
create index if not exists idx_payroll_records_import_log on public.payroll_records(import_log_id);
create index if not exists idx_employees_department on public.employees(department_id);

-- ============================================================
-- Row Level Security: ต้องล็อกอินและบัญชียังเปิดใช้งานอยู่ (active) ถึงจะเข้าถึงข้อมูลได้
-- ============================================================
alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.employees enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.column_mapping_templates enable row level security;
alter table public.payroll_records enable row level security;
alter table public.import_logs enable row level security;

-- ฟังก์ชันช่วยตรวจสิทธิ์ (security definer เพื่อเลี่ยง RLS recursion เวลาใช้เป็นเงื่อนไขบนตาราง profiles เอง)
create or replace function public.is_active_user()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select active from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_admin_user()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select role = 'admin' and active from public.profiles where id = auth.uid()), false);
$$;

-- ผู้ใช้ดู/แก้ไขโปรไฟล์ตัวเองได้เสมอ (แม้บัญชีจะถูกปิดใช้งาน จะได้รู้ตัวว่าถูกปิด)
-- แก้ชื่อตัวเองได้ แต่เปลี่ยน role/active เองไม่ได้ (บังคับด้วย trigger prevent_self_role_escalation ด้านล่าง)
create policy "profiles_self_select" on public.profiles for select using (auth.uid() = id);
create policy "profiles_self_update" on public.profiles for update using (auth.uid() = id);
-- admin ดู/แก้ไขโปรไฟล์ผู้ใช้ทุกคนได้ (หน้าจัดการผู้ใช้งาน: เปลี่ยน role, ปิด/เปิดบัญชี)
create policy "profiles_admin_read" on public.profiles for select using (public.is_admin_user());
create policy "profiles_admin_update" on public.profiles for update using (public.is_admin_user()) with check (public.is_admin_user());

-- นำเข้าข้อมูลเงินเดือน (departments/employees/periods/mapping/records/logs) แก้ไขได้เฉพาะ admin เท่านั้น
-- staff อ่านได้อย่างเดียว (เมนูนำเข้าถูกซ่อนจาก staff ที่ฝั่งหน้าเว็บด้วย)
create policy "departments_read" on public.departments for select using (public.is_active_user());
create policy "departments_insert_admin" on public.departments for insert with check (public.is_admin_user());
create policy "departments_update_admin" on public.departments for update using (public.is_admin_user()) with check (public.is_admin_user());
create policy "departments_delete_admin" on public.departments for delete using (public.is_admin_user());

create policy "employees_read" on public.employees for select using (public.is_active_user());
create policy "employees_insert_admin" on public.employees for insert with check (public.is_admin_user());
create policy "employees_update_admin" on public.employees for update using (public.is_admin_user()) with check (public.is_admin_user());
create policy "employees_delete_admin" on public.employees for delete using (public.is_admin_user());

create policy "periods_read" on public.payroll_periods for select using (public.is_active_user());
create policy "periods_insert_admin" on public.payroll_periods for insert with check (public.is_admin_user());
create policy "periods_update_admin" on public.payroll_periods for update using (public.is_admin_user()) with check (public.is_admin_user());
-- ลบงวดเงินเดือนได้เฉพาะผู้ดูแลระบบ (admin) เท่านั้น เพราะจะพ่วงลบข้อมูลเงินเดือนทั้งงวด
create policy "periods_delete_admin" on public.payroll_periods for delete using (public.is_admin_user());

create policy "mapping_read" on public.column_mapping_templates for select using (public.is_active_user());
create policy "mapping_write_admin" on public.column_mapping_templates for all using (public.is_admin_user()) with check (public.is_admin_user());

create policy "records_read" on public.payroll_records for select using (public.is_active_user());
create policy "records_insert_admin" on public.payroll_records for insert with check (public.is_admin_user());
create policy "records_update_admin" on public.payroll_records for update using (public.is_admin_user()) with check (public.is_admin_user());
-- ลบข้อมูลเงินเดือนได้เฉพาะ admin เท่านั้น (ใช้ตอนลบรายการนำเข้าที่ผิดจากหน้าประวัติการนำเข้า)
create policy "records_delete_admin" on public.payroll_records for delete using (public.is_admin_user());

create policy "logs_read" on public.import_logs for select using (public.is_active_user());
create policy "logs_write_admin" on public.import_logs for insert with check (public.is_admin_user());
create policy "logs_delete_admin" on public.import_logs for delete using (public.is_admin_user());

-- ป้องกัน staff แก้ไข role/active ของตัวเองผ่านฟีเจอร์ "แก้ไขข้อมูลตนเอง" (เปลี่ยนได้เฉพาะแอดมิน)
create or replace function public.prevent_self_role_escalation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.active is distinct from old.active) and not public.is_admin_user() then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่เปลี่ยนบทบาทหรือสถานะการใช้งานได้';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role_active on public.profiles;
create trigger profiles_guard_role_active
before update on public.profiles
for each row execute function public.prevent_self_role_escalation();

-- เมื่อมีผู้ใช้สมัคร/ถูกสร้างใน auth.users ให้สร้างแถว profile อัตโนมัติ (พร้อม email สำหรับหน้าจัดการผู้ใช้งาน)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'staff', new.email);
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

create policy "org_settings_read" on public.org_settings for select using (public.is_active_user());
create policy "org_settings_update_admin" on public.org_settings for update using (public.is_admin_user()) with check (public.is_admin_user());

-- ที่เก็บโลโก้หน่วยงาน (public bucket: อ่านได้โดยไม่ต้องล็อกอิน, เขียนได้เฉพาะ admin)
insert into storage.buckets (id, name, public)
values ('org-assets', 'org-assets', true)
on conflict (id) do nothing;

create policy "org_assets_public_read" on storage.objects for select using (bucket_id = 'org-assets');

create policy "org_assets_admin_insert" on storage.objects for insert with check (
  bucket_id = 'org-assets' and public.is_admin_user()
);

create policy "org_assets_admin_update" on storage.objects for update using (
  bucket_id = 'org-assets' and public.is_admin_user()
);

create policy "org_assets_admin_delete" on storage.objects for delete using (
  bucket_id = 'org-assets' and public.is_admin_user()
);

-- ============================================================
-- สลิปเงินเดือนที่จัดทำเอง (Manual) แยกอิสระจากข้อมูลที่นำเข้าจาก Excel
-- ใช้สำหรับกรณีจ่ายเพิ่มเติม/ตกเบิก ที่ไม่ได้อยู่ในรอบนำเข้าปกติ
-- ============================================================
create table if not exists public.manual_slips (
  id bigint generated always as identity primary key,
  employee_id bigint references public.employees(id),
  employee_name text not null,
  employee_type text,
  department_name text,
  title text not null,
  issue_date date not null default current_date,
  income jsonb not null default '{}',
  deductions jsonb not null default '{}',
  total_income numeric(12,2) not null default 0,
  total_deduction numeric(12,2) not null default 0,
  net_pay numeric(12,2) not null default 0,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_manual_slips_employee on public.manual_slips(employee_id);
create index if not exists idx_manual_slips_issue_date on public.manual_slips(issue_date);

alter table public.manual_slips enable row level security;

create policy "manual_slips_read" on public.manual_slips for select using (public.is_active_user());
create policy "manual_slips_insert" on public.manual_slips for insert with check (public.is_active_user());
create policy "manual_slips_update" on public.manual_slips for update using (public.is_active_user()) with check (public.is_active_user());
create policy "manual_slips_delete_admin" on public.manual_slips for delete using (public.is_admin_user());

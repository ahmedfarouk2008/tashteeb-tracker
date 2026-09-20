-- ============================================================
--  حاسب التشطيب — مخطط قاعدة البيانات على Supabase
--  شغّل هذا الملف مرة واحدة من: Supabase → SQL Editor → New query
-- ============================================================

-- جدول واحد يحمل كل أنواع السجلات (مصاريف، بنود، فواتير، إعدادات).
-- payload يحمل السجل كما هو في التطبيق، فلا نحتاج تعديل المخطط مع كل تغيير.
create table if not exists public.documents (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('expense', 'category', 'receipt', 'settings')),
  id         text        not null,
  payload    jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted    boolean     not null default false,
  primary key (user_id, kind, id)
);

-- فهرس يسرّع سحب التغييرات الجديدة فقط عند كل مزامنة
create index if not exists documents_sync_idx
  on public.documents (user_id, updated_at desc);

-- ------------------------------------------------------------
--  updated_at يُكتب بساعة الخادم دائماً، لا بساعة الجهاز.
--  بدون هذا تختلف الساعات بين الموبايل واللابتوب فتضيع تغييرات
--  الجهاز «المتأخر» ولا تصل إلى الجهاز الآخر أبداً.
-- ------------------------------------------------------------
create or replace function public.set_document_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before insert or update on public.documents
  for each row execute function public.set_document_updated_at();

-- ============================================================
--  أمان مستوى الصف: كل مستخدم يرى ويعدّل بياناته فقط
-- ============================================================

alter table public.documents enable row level security;

drop policy if exists "المستخدم يقرأ بياناته" on public.documents;
create policy "المستخدم يقرأ بياناته"
  on public.documents for select
  using (auth.uid() = user_id);

drop policy if exists "المستخدم يضيف بياناته" on public.documents;
create policy "المستخدم يضيف بياناته"
  on public.documents for insert
  with check (auth.uid() = user_id);

drop policy if exists "المستخدم يعدّل بياناته" on public.documents;
create policy "المستخدم يعدّل بياناته"
  on public.documents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "المستخدم يحذف بياناته" on public.documents;
create policy "المستخدم يحذف بياناته"
  on public.documents for delete
  using (auth.uid() = user_id);

-- ============================================================
--  تخزين صور الفواتير
-- ============================================================

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- مسار كل صورة: <user_id>/<blobKey> — فيُمنع الوصول لمجلد أي مستخدم آخر
drop policy if exists "صور المستخدم — قراءة" on storage.objects;
create policy "صور المستخدم — قراءة"
  on storage.objects for select
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "صور المستخدم — رفع" on storage.objects;
create policy "صور المستخدم — رفع"
  on storage.objects for insert
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "صور المستخدم — تحديث" on storage.objects;
create policy "صور المستخدم — تحديث"
  on storage.objects for update
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "صور المستخدم — حذف" on storage.objects;
create policy "صور المستخدم — حذف"
  on storage.objects for delete
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

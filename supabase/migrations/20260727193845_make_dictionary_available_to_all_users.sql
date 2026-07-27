drop policy if exists "Role based read" on public.tags;
drop policy if exists "Role based insert" on public.tags;
drop policy if exists "Role based update" on public.tags;
drop policy if exists "Role based delete" on public.tags;

create policy "Users can read own dictionary"
on public.tags for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can add to own dictionary"
on public.tags for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own dictionary"
on public.tags for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete from own dictionary"
on public.tags for delete
to authenticated
using ((select auth.uid()) = user_id);

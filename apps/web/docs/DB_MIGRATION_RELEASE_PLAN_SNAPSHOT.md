Run this in Supabase SQL Editor:

```sql
alter table public.release_workspaces
  add column if not exists plan_snapshot jsonb null;
```

This stores the structured AI release plan snapshot used to render strategy summary and timeline phases on the plan dashboard.

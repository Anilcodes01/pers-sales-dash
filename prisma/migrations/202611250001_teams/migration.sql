CREATE TABLE public.teams (
  id uuid PRIMARY KEY,
  name varchar(100) NOT NULL,
  name_key varchar(100) NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.team_memberships (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_memberships_team_id_idx ON public.team_memberships(team_id);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teams, public.team_memberships FROM anon, authenticated;

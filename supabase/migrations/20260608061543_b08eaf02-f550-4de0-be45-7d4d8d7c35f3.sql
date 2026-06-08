
-- Roles enum + table
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  pterodactyl_user_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- Plans
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  game TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly_cents INTEGER NOT NULL,
  ram_mb INTEGER NOT NULL,
  cpu_percent INTEGER NOT NULL,
  disk_mb INTEGER NOT NULL,
  swap_mb INTEGER NOT NULL DEFAULT 0,
  io_weight INTEGER NOT NULL DEFAULT 500,
  pterodactyl_nest_id INTEGER NOT NULL,
  pterodactyl_egg_id INTEGER NOT NULL,
  docker_image TEXT NOT NULL,
  startup TEXT NOT NULL,
  environment JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads active plans" ON public.plans FOR SELECT TO anon, authenticated USING (is_active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage plans" ON public.plans FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Server orders
CREATE TYPE public.server_status AS ENUM ('pending', 'provisioning', 'active', 'suspended', 'failed', 'cancelled');

CREATE TABLE public.server_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  server_name TEXT NOT NULL,
  pterodactyl_server_id INTEGER,
  pterodactyl_server_identifier TEXT,
  status server_status NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.server_orders TO authenticated;
GRANT ALL ON public.server_orders TO service_role;
ALTER TABLE public.server_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own orders" ON public.server_orders FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "users insert own orders" ON public.server_orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins update orders" ON public.server_orders FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete orders" ON public.server_orders FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.server_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Seed example plans (nest/egg IDs are placeholders the admin will tune)
INSERT INTO public.plans (slug, game, name, description, price_monthly_cents, ram_mb, cpu_percent, disk_mb, pterodactyl_nest_id, pterodactyl_egg_id, docker_image, startup, environment, sort_order) VALUES
('mc-iron',      'Minecraft',     'Iron',      '4 GB RAM — great for friends',         499,  4096, 200, 15000, 1, 1,  'ghcr.io/pterodactyl/yolks:java_17', 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}', '{"SERVER_JARFILE":"server.jar","MINECRAFT_VERSION":"latest","BUILD_NUMBER":"latest"}'::jsonb, 10),
('mc-diamond',   'Minecraft',     'Diamond',   '8 GB RAM — modpacks & big worlds',     999,  8192, 300, 30000, 1, 1,  'ghcr.io/pterodactyl/yolks:java_17', 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}', '{"SERVER_JARFILE":"server.jar","MINECRAFT_VERSION":"latest","BUILD_NUMBER":"latest"}'::jsonb, 11),
('mc-netherite', 'Minecraft',     'Netherite', '16 GB RAM — large communities',       1999, 16384, 400, 60000, 1, 1,  'ghcr.io/pterodactyl/yolks:java_17', 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}', '{"SERVER_JARFILE":"server.jar","MINECRAFT_VERSION":"latest","BUILD_NUMBER":"latest"}'::jsonb, 12),
('conan-basic',  'Conan Exiles',  'Hyborian',  '6 GB RAM — your own savage land',     1299,  6144, 300, 40000, 2, 10, 'ghcr.io/parkervcp/games:source',    './ConanSandboxServer.sh', '{}'::jsonb, 20),
('conan-pro',    'Conan Exiles',  'Warlord',   '12 GB RAM — busy PvP servers',        2499, 12288, 400, 60000, 2, 10, 'ghcr.io/parkervcp/games:source',    './ConanSandboxServer.sh', '{}'::jsonb, 21),
('ark-starter',  'ARK',           'Survivor',  '8 GB RAM — tribe-ready',              1499,  8192, 300, 50000, 3, 20, 'ghcr.io/parkervcp/games:source',    './ShooterGameServer', '{}'::jsonb, 30),
('ark-pro',      'ARK',           'Alpha',     '16 GB RAM — modded cluster',          2999, 16384, 500, 90000, 3, 20, 'ghcr.io/parkervcp/games:source',    './ShooterGameServer', '{}'::jsonb, 31),
('gmod-basic',   'Garry''s Mod',  'Sandbox',   '24 slots — DarkRP / Sandbox',          799,  2048, 200, 15000, 4, 30, 'ghcr.io/parkervcp/games:source',    './srcds_run -game garrysmod', '{}'::jsonb, 40),
('gmod-pro',     'Garry''s Mod',  'Roleplay',  '64 slots — busy community',           1599,  4096, 300, 25000, 4, 30, 'ghcr.io/parkervcp/games:source',    './srcds_run -game garrysmod', '{}'::jsonb, 41);

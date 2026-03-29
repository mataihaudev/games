Supabase scaffold for the multiplayer room game.

Runtime configuration options:
- Vercel environment variables exposed through /api/runtime-config:
	- SUPABASE_URL
	- SUPABASE_ANON_KEY
- Optional local override in assets/multiplayer/config.js for local testing.

Initial tables:
- rooms
- players
- submissions

Notes:
- The frontend now tries to use Supabase first and falls back to a local mock backend if no runtime config is available.
- For Vercel, add SUPABASE_URL and SUPABASE_ANON_KEY in the project settings, then redeploy.
- Run supabase/schema.sql in the Supabase SQL editor before the first online multiplayer test.
- The room link format is multiplayer.html?room=ROOMID&name=PLAYERNAME.

Recommended manual flow:
1. Open the Supabase project "Game" and run supabase/schema.sql.
2. In Vercel, set SUPABASE_URL and SUPABASE_ANON_KEY.
3. Deploy the site.
4. Open multiplayer.html from the deployed URL and verify backend mode is online.

Important:
- The anon key is safe to expose to the browser.
- The service_role key must never be exposed in the browser or committed in the repo.

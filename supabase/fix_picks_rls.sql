-- Fix RLS on prode_stage1_picks so users can INSERT new picks (not just UPDATE existing ones).
-- The upsert fails on INSERT when there's no explicit INSERT policy.

-- Drop any conflicting policy that uses USING-only for ALL operations
-- (Postgres applies USING as the check for new rows in INSERT, which can fail unexpectedly)
DROP POLICY IF EXISTS "Users can manage own picks" ON prode_stage1_picks;
DROP POLICY IF EXISTS "picks_all"    ON prode_stage1_picks;
DROP POLICY IF EXISTS "picks_select" ON prode_stage1_picks;
DROP POLICY IF EXISTS "picks_insert" ON prode_stage1_picks;
DROP POLICY IF EXISTS "picks_update" ON prode_stage1_picks;
DROP POLICY IF EXISTS "picks_delete" ON prode_stage1_picks;

-- Recreate with explicit per-operation policies
CREATE POLICY "picks_select" ON prode_stage1_picks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "picks_insert" ON prode_stage1_picks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "picks_update" ON prode_stage1_picks
  FOR UPDATE USING (auth.uid() = user_id)
             WITH CHECK (auth.uid() = user_id);

CREATE POLICY "picks_delete" ON prode_stage1_picks
  FOR DELETE USING (auth.uid() = user_id);

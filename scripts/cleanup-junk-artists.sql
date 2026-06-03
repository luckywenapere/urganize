-- =============================================================================
-- Cleanup: delete 28 junk artist rows (Lucky-cluster test data, 0 releases).
-- Transactional guard + delete + count-check; aborts on any anomaly.
-- Reversible from backups/20260602T224044Z/artists.json if needed.
-- Generated 2026-06-03 against project jsueloedjwpfiyzfoutv.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  target_ids uuid[] := ARRAY[
    '248de42d-3cf4-4b9f-b69e-33c33604ea79', -- Luks            (owner 1631e63f)
    '5339451f-72aa-4895-96e0-6e79394ca1f5', -- ttt             (owner 1631e63f)
    '8ed424a6-aded-4a7c-859a-7868f85c1801', -- tttt            (owner 1631e63f)
    '3f155982-b428-44af-a427-3c688ac57331', -- 43              (owner 1631e63f)
    '75e37491-60b0-469b-a8dc-4d03cf743f11', -- test            (owner 1631e63f)
    '5bc41619-9628-43a7-8c12-fb0ab29d1622', -- 5555            (owner 1631e63f)
    'f1a94499-418d-4779-81cd-f9dd1745156c', -- 4444            (owner 1631e63f)
    'ee28ce72-9da1-4072-b7c3-cba60e7ca34d', -- Luckydidthis    (owner 1631e63f)
    '5733e4b3-19c6-49dc-840e-b38cd3c7321b', -- ffff            (owner 1631e63f)
    '9a13c8d1-f2c2-4535-ab1c-a5b1a7ac178a', -- fff             (owner 1631e63f)
    '300874eb-efeb-4d29-871f-d6fe21504daa', -- Dorian          (owner 1631e63f)
    '8a249a2a-eba8-4ef6-99ae-bdc7f6029d89', -- Zilla Oaks      (owner 1631e63f)
    '3596e57b-5173-43ad-90c1-d5a7009838f3', -- Marvin          (owner 1631e63f)
    '2cb0132d-5031-4e05-b22a-20762415b029', -- God             (owner 3cceee7a)
    'c111f0cc-dd07-414c-9314-c06f14cd54a1', -- 333             (owner 3cceee7a)
    '6b4e0a91-583c-4d7d-88cd-e002ca5882c2', -- T3n             (owner 3cceee7a)
    '8091d6d2-68c0-4b27-86ca-72daab652642', -- Greenday        (owner 3cceee7a)
    '87e67ed2-dc50-4e8f-9436-301638e930c6', -- LUCKY           (owner 3cceee7a)
    'dbd84866-9073-4c6f-af89-800b813807d8', -- Quiries         (owner 3cceee7a)
    '32bfee73-6b3c-4c86-94b9-cf27d548c11b', -- Luckydidthis    (owner 3cceee7a)
    'b1e277a6-9d32-4355-bbb9-7a57e6c8c9a0', -- EESKAY          (owner fa6011e9)
    '5b0ce716-48fa-4e53-babf-2390443034a6', -- Amaarae         (owner fa6011e9)
    '81c8cfa4-c4ff-4203-b902-232e980893e7', -- Odeal           (owner fa6011e9)
    'd8a65996-a94a-470f-8c31-1e916dbee69c', -- Tay Iwar        (owner fa6011e9)
    '2959ce53-d53b-4dfc-b992-ade6bcffc61d', -- Tengarin        (owner 9e56aa30)
    'd58def59-31c0-437e-814e-22f92544faea', -- Babyboy Dorian  (owner 9e56aa30)
    '622f5521-874a-43fa-800c-39aa8ab3883a', -- Luckydidthis    (owner 0a6cad1c)
    '757fd4a2-c66f-4f02-b218-bb1a43d4ced7'  -- Luckydidthis    (owner 2d861503)
  ]::uuid[];
  guard_count   int;
  deleted_count int;
BEGIN
  -- Step 2: GUARD - abort if any release would lose its artist link.
  SELECT count(*) INTO guard_count
    FROM public.releases
   WHERE artist_id = ANY(target_ids);
  RAISE NOTICE 'Guard: releases referencing target artist ids = % (expect 0)', guard_count;
  IF guard_count <> 0 THEN
    RAISE EXCEPTION
      'GUARD FAILED: % release row(s) reference the target artists. Aborting; transaction will roll back.',
      guard_count;
  END IF;

  -- Step 3 + 4: DELETE and count-check.
  WITH del AS (
    DELETE FROM public.artists
     WHERE id = ANY(target_ids)
     RETURNING id, name
  )
  SELECT count(*) INTO deleted_count FROM del;
  RAISE NOTICE 'Deleted: % artist rows (expect exactly 28)', deleted_count;
  IF deleted_count <> 28 THEN
    RAISE EXCEPTION
      'COUNT MISMATCH: deleted % rows, expected 28. Aborting; transaction will roll back.',
      deleted_count;
  END IF;

  RAISE NOTICE 'All checks passed. COMMIT will run next.';
END $$;

-- Step 5: post-delete total (still inside the open txn; visible before COMMIT).
SELECT count(*) AS artists_total_after_delete FROM public.artists;
-- Expect: 12

COMMIT;

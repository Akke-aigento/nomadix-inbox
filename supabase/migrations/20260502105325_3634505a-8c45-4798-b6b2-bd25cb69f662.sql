-- Force-close the stale running sync row from 10:52 so the next cron tick
-- can start a fresh batch with the new poison-message-skip code path.
UPDATE public.sync_log
SET status = 'error',
    finished_at = now(),
    batch_complete = true,
    error_message = 'Manual cleanup: stuck before poison-message-skip rollout'
WHERE status = 'running';
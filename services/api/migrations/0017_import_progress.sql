ALTER TABLE import_jobs ADD COLUMN progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100);
ALTER TABLE import_jobs ADD COLUMN progress_stage TEXT NOT NULL DEFAULT 'queued';
UPDATE import_jobs SET progress=100,progress_stage='ready' WHERE status='ready';
UPDATE import_jobs SET progress_stage='failed' WHERE status='failed';

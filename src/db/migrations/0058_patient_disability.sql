-- Capture accessibility needs that can affect a patient's care and visit experience.
ALTER TABLE patients ADD COLUMN has_disability INTEGER NOT NULL DEFAULT 0 CHECK (has_disability IN (0, 1));
ALTER TABLE patients ADD COLUMN disability_notes TEXT;

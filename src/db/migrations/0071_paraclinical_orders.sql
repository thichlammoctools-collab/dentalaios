-- Paraclinical orders: imaging, lab tests, procedures ordered during visits.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS paraclinical_orders (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id),
  visit_id         TEXT NOT NULL REFERENCES visits(id),
  patient_id       TEXT NOT NULL REFERENCES patients(id),
  diagnosis_id     TEXT REFERENCES clinical_diagnoses(id),

  -- Order type
  order_type       TEXT NOT NULL CHECK (order_type IN (
    'panoramic_xray', 'periapical_xray', 'bitewing_xray',
    'cbct', 'cephalometric_xray',
    'blood_test', 'coagulation_test', 'blood_glucose',
    'hba1c', 'allergy_test',
    'biopsy', 'culture_sensitivity', 'other'
  )),
  custom_type_name TEXT,
  body_site        TEXT,

  -- Status
  status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),

  -- Clinical justification (required)
  clinical_reason  TEXT NOT NULL,

  -- Results (updated on completion)
  result_summary   TEXT,
  result_file_id   TEXT REFERENCES file_objects(id),
  abnormal_flag    TEXT CHECK (abnormal_flag IN ('normal', 'abnormal', 'critical')),

  -- Audit
  ordered_by       TEXT NOT NULL REFERENCES users(id),
  ordered_at       TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at     TEXT,
  cancelled_at     TEXT,
  cancel_reason    TEXT,
  notes            TEXT,

  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_para_orders_tenant_visit
  ON paraclinical_orders(tenant_id, visit_id);
CREATE INDEX IF NOT EXISTS idx_para_orders_tenant_patient
  ON paraclinical_orders(tenant_id, patient_id, status);
CREATE INDEX IF NOT EXISTS idx_para_orders_diagnosis
  ON paraclinical_orders(diagnosis_id);

CREATE TABLE IF NOT EXISTS movements (
  id TEXT PRIMARY KEY,
  movement_date TEXT NOT NULL,
  partner TEXT NOT NULL CHECK (partner IN ('Felipe', 'Hernan')),
  entered_by TEXT NOT NULL CHECK (entered_by IN ('Felipe', 'Hernan')),
  type TEXT NOT NULL CHECK (type IN ('normal_income', 'special_income', 'shared_expense')),
  concept TEXT NOT NULL,
  amount INTEGER NOT NULL,
  special_partner_pct REAL,
  paid_to_partner INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_movements_date_created ON movements (movement_date, created_at);
CREATE INDEX IF NOT EXISTS idx_movements_partner_type ON movements (partner, type);

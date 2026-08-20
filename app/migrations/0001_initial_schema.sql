-- ============================================================
-- SAMPLE APP RUNTIME - Initial Schema (D1 / SQLite)
-- Sample innovation-program schema adapted from the shared
-- Azure/Cloudflare portability layout.
-- para Cloudflare Workers + D1.
-- ============================================================

-- ---------- SECURITY & IDENTITY ----------

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('master_admin','admin','executive','legal')),
  is_client_manager INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending_activation' CHECK (status IN ('pending_activation','active','suspended')),
  locale TEXT DEFAULT 'pt-BR',
  token_hash TEXT,
  token_expires_at TEXT,
  activation_token_hash TEXT,
  activation_token_expires_at TEXT,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  terms_accepted_at TEXT,
  privacy_accepted_at TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  session_token_hash TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS user_project_access (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  moonshot_id TEXT,
  challenge_id TEXT,
  role_in_project TEXT CHECK (role_in_project IN ('owner','client_manager','project_lead','tech_lead','financial_viewer','legal_reviewer','collaborator')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_edition_access (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  edition_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- MASTER DATA ----------

CREATE TABLE IF NOT EXISTS countries (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS currencies (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  symbol TEXT
);

CREATE TABLE IF NOT EXISTS exchange_rates (
  id TEXT PRIMARY KEY,
  currency_code TEXT NOT NULL,
  rate_to_eur REAL NOT NULL,
  rate_date TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sectors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS technologies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hubs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country_id TEXT REFERENCES countries(id),
  city TEXT,
  website TEXT,
  description TEXT,
  logo_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  observations TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS hyperscalers_partners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('hyperscaler','partner')),
  country_id TEXT REFERENCES countries(id),
  logo_url TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- ---------- EDITIONS ----------

CREATE TABLE IF NOT EXISTS editions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  base_currency_code TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','planned','open','in_execution','closed','archived')),
  start_date TEXT,
  end_date TEXT,
  masterclass_start TEXT,
  masterclass_end TEXT,
  challenge_open_start TEXT,
  challenge_open_end TEXT,
  execution_start TEXT,
  execution_end TEXT,
  catalyst_day_date TEXT,
  irl_min_score REAL NOT NULL DEFAULT 6,
  reopened_at TEXT,
  reopened_by TEXT,
  reopen_justification TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS edition_countries (
  id TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL REFERENCES editions(id),
  country_id TEXT NOT NULL REFERENCES countries(id)
);

-- ---------- MASTERCLASS ----------

CREATE TABLE IF NOT EXISTS masterclass_modules (
  id TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL REFERENCES editions(id),
  code TEXT NOT NULL, -- M1, M2, M3, M4
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS masterclass_contents (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES masterclass_modules(id),
  type TEXT NOT NULL CHECK (type IN ('video','audio','pdf','text','link','presentation')),
  title TEXT NOT NULL,
  description TEXT,
  content_url TEXT,
  text_body TEXT,
  is_required INTEGER NOT NULL DEFAULT 1,
  duration_seconds INTEGER,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS video_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  content_id TEXT NOT NULL REFERENCES masterclass_contents(id),
  segments_watched TEXT NOT NULL DEFAULT '[]', -- JSON array of [start,end] watched ranges
  percent_watched REAL NOT NULL DEFAULT 0,
  playback_speed REAL NOT NULL DEFAULT 1,
  started_at TEXT,
  completed_at TEXT,
  last_position_seconds REAL DEFAULT 0,
  last_access_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, content_id)
);

CREATE TABLE IF NOT EXISTS module_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  module_id TEXT NOT NULL REFERENCES masterclass_modules(id),
  completed_at TEXT,
  UNIQUE(user_id, module_id)
);

CREATE TABLE IF NOT EXISTS certificate_templates (
  id TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL REFERENCES editions(id),
  name TEXT NOT NULL,
  background_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS certificates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  edition_id TEXT NOT NULL REFERENCES editions(id),
  template_id TEXT REFERENCES certificate_templates(id),
  code TEXT NOT NULL UNIQUE,
  validation_code TEXT NOT NULL UNIQUE,
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  hours REAL,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','invalidated','reissued')),
  invalidated_at TEXT,
  reissued_from TEXT
);

-- ---------- CLIENTS / ACCOUNTS ----------

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country_id TEXT REFERENCES countries(id),
  sector_id TEXT REFERENCES sectors(id),
  logo_url TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,
  country_id TEXT REFERENCES countries(id),
  primary_client_manager_id TEXT REFERENCES users(id),
  baseline_type TEXT CHECK (baseline_type IN ('annual_revenue','annual_pipeline','tcv','budget','commercial_target','other')),
  baseline_value REAL,
  currency_code TEXT NOT NULL DEFAULT 'EUR',
  target_value REAL,
  observations TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS account_client_managers (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  is_primary INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stakeholders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT,
  organization TEXT,
  email TEXT,
  phone TEXT,
  role_in_project TEXT,
  observations TEXT,
  client_id TEXT REFERENCES clients(id),
  account_id TEXT REFERENCES accounts(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- CHALLENGES ----------

CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL REFERENCES editions(id),
  title TEXT NOT NULL,
  description TEXT,
  business_mission TEXT,
  problem_statement TEXT,
  context TEXT,
  current_impact TEXT,
  affected_audience TEXT,
  expected_outcome TEXT,
  is_internal INTEGER NOT NULL DEFAULT 0,
  sponsor TEXT,
  country_id TEXT REFERENCES countries(id),
  sector_id TEXT REFERENCES sectors(id),
  available_data TEXT,
  constraints_text TEXT,
  expected_deadline TEXT,
  expected_budget REAL,
  value_hypothesis TEXT,
  success_criteria TEXT,
  known_risks TEXT,
  confidentiality TEXT NOT NULL DEFAULT 'internal' CHECK (confidentiality IN ('internal','confidential','project_restricted','client_restricted','legal_restricted','financial_restricted')),
  cubo_gate_completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','cubo_gate_pending','cubo_gate_done','in_scouting','in_moonshot','closed','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS challenge_clients (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id),
  client_id TEXT NOT NULL REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS challenge_accounts (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id),
  account_id TEXT NOT NULL REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS challenge_technologies (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id),
  technology_id TEXT NOT NULL REFERENCES technologies(id)
);

CREATE TABLE IF NOT EXISTS challenge_collaborators (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id),
  user_id TEXT NOT NULL REFERENCES users(id)
);

-- ---------- CUBO EXPERIENCES ----------

CREATE TABLE IF NOT EXISTS cubo_experiences (
  id TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL REFERENCES editions(id),
  type TEXT NOT NULL CHECK (type IN ('cubo_presential','cubo_experience_offsite','remote','internal_discovery','other')),
  location_flag TEXT NOT NULL CHECK (location_flag IN ('presential_cubo','presential_offsite','remote','internal')),
  event_date TEXT,
  start_time TEXT,
  end_time TEXT,
  country_id TEXT REFERENCES countries(id),
  city TEXT,
  location TEXT,
  client_manager_id TEXT REFERENCES users(id),
  facilitators TEXT,
  participants TEXT,
  objective TEXT,
  agenda TEXT,
  description TEXT,
  pre_materials TEXT,
  presented_materials TEXT,
  post_materials TEXT,
  report TEXT,
  action_plan_url TEXT,
  next_steps TEXT,
  mana_opportunity_number TEXT,
  mana_opportunity_link TEXT,
  mana_registered_by TEXT,
  mana_registered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS cubo_experience_clients (
  id TEXT PRIMARY KEY,
  experience_id TEXT NOT NULL REFERENCES cubo_experiences(id),
  client_id TEXT NOT NULL REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS cubo_experience_challenges (
  id TEXT PRIMARY KEY,
  experience_id TEXT NOT NULL REFERENCES cubo_experiences(id),
  challenge_id TEXT NOT NULL REFERENCES challenges(id)
);

-- ---------- STARTUPS & IRL ----------

CREATE TABLE IF NOT EXISTS startups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hub_id TEXT REFERENCES hubs(id),
  hub_exception INTEGER NOT NULL DEFAULT 0,
  hub_exception_justification TEXT,
  country_id TEXT REFERENCES countries(id),
  website TEXT,
  sector_id TEXT REFERENCES sectors(id),
  stage TEXT CHECK (stage IN ('ideation','mvp','early_traction','growth','scale')),
  financial_health TEXT,
  ip_notes TEXT,
  price_range_min REAL,
  price_range_max REAL,
  price_range_currency TEXT DEFAULT 'EUR',
  logo_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','blocked')),
  confidentiality TEXT NOT NULL DEFAULT 'internal',
  observations TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS startup_contacts (
  id TEXT PRIMARY KEY,
  startup_id TEXT NOT NULL REFERENCES startups(id),
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  phone TEXT
);

CREATE TABLE IF NOT EXISTS startup_technologies (
  id TEXT PRIMARY KEY,
  startup_id TEXT NOT NULL REFERENCES startups(id),
  technology_id TEXT NOT NULL REFERENCES technologies(id)
);

CREATE TABLE IF NOT EXISTS irl_assessments (
  id TEXT PRIMARY KEY,
  startup_id TEXT NOT NULL REFERENCES startups(id),
  challenge_id TEXT REFERENCES challenges(id), -- NULL = avaliacao institucional geral
  dimension TEXT NOT NULL, -- one of 12 dims
  score REAL NOT NULL CHECK (score >= 1 AND score <= 9),
  weight REAL NOT NULL DEFAULT 1,
  justification TEXT,
  evidence_url TEXT,
  evaluator_id TEXT REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1,
  ai_suggested INTEGER NOT NULL DEFAULT 0,
  ai_confirmed_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- MOONSHOTS ----------

CREATE TABLE IF NOT EXISTS moonshots (
  id TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL REFERENCES editions(id),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  primary_challenge_id TEXT REFERENCES challenges(id),
  is_internal INTEGER NOT NULL DEFAULT 0,
  owner_id TEXT REFERENCES users(id),
  project_lead_id TEXT REFERENCES users(id),
  tech_lead_id TEXT REFERENCES users(id),
  sponsor TEXT,
  success_criteria TEXT,
  planned_start_date TEXT,
  planned_end_date TEXT,
  actual_start_date TEXT,
  actual_end_date TEXT,
  duration_weeks INTEGER,
  duration_exception_justification TEXT,
  phase TEXT NOT NULL DEFAULT 'ideation' CHECK (phase IN (
    'ideation','qualification','cubo_gate','scouting','matching','solution_design',
    'legal_feasibility','financial_feasibility','approval','contracting','kickoff',
    'execution','validation','scale_or_stop','closing','commercial_conversion'
  )),
  legal_status TEXT NOT NULL DEFAULT 'not_started' CHECK (legal_status IN ('not_started','in_review','pending_signature','signed','waived')),
  financial_status TEXT NOT NULL DEFAULT 'not_started' CHECK (financial_status IN ('not_started','in_review','approved','funded')),
  started_with_pending_by TEXT,
  started_with_pending_at TEXT,
  started_with_pending_justification TEXT,
  final_decision TEXT CHECK (final_decision IN ('scale','pivot','stop')),
  final_decision_date TEXT,
  final_decision_justification TEXT,
  final_results TEXT,
  lessons_learned TEXT,
  next_steps TEXT,
  potential_value REAL,
  estimated_final_project_value REAL,
  estimated_value_currency TEXT DEFAULT 'EUR',
  mana_opportunity_number TEXT,
  mana_opportunity_link TEXT,
  commercial_conversion_registered INTEGER NOT NULL DEFAULT 0,
  commercial_conversion_value REAL,
  commercial_conversion_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS moonshot_challenges (
  id TEXT PRIMARY KEY,
  moonshot_id TEXT NOT NULL REFERENCES moonshots(id),
  challenge_id TEXT NOT NULL REFERENCES challenges(id)
);

CREATE TABLE IF NOT EXISTS moonshot_clients (
  id TEXT PRIMARY KEY,
  moonshot_id TEXT NOT NULL REFERENCES moonshots(id),
  client_id TEXT NOT NULL REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS moonshot_startups (
  id TEXT PRIMARY KEY,
  moonshot_id TEXT NOT NULL REFERENCES moonshots(id),
  startup_id TEXT NOT NULL REFERENCES startups(id)
);

CREATE TABLE IF NOT EXISTS moonshot_hyperscalers (
  id TEXT PRIMARY KEY,
  moonshot_id TEXT NOT NULL REFERENCES moonshots(id),
  hyperscaler_partner_id TEXT NOT NULL REFERENCES hyperscalers_partners(id)
);

CREATE TABLE IF NOT EXISTS moonshot_members (
  id TEXT PRIMARY KEY,
  moonshot_id TEXT NOT NULL REFERENCES moonshots(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role_in_project TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS moonshot_phase_history (
  id TEXT PRIMARY KEY,
  moonshot_id TEXT NOT NULL REFERENCES moonshots(id),
  from_phase TEXT,
  to_phase TEXT NOT NULL,
  changed_by TEXT REFERENCES users(id),
  comment TEXT,
  justification TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS moonshot_checkpoints (
  id TEXT PRIMARY KEY,
  moonshot_id TEXT NOT NULL REFERENCES moonshots(id),
  checkpoint_date TEXT NOT NULL,
  overall_status TEXT NOT NULL DEFAULT 'on_track' CHECK (overall_status IN ('on_track','at_risk','delayed','blocked')),
  percent_progress REAL NOT NULL DEFAULT 0,
  comments TEXT,
  blockers TEXT,
  next_steps TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS moonshot_milestones (
  id TEXT PRIMARY KEY,
  moonshot_id TEXT NOT NULL REFERENCES moonshots(id),
  name TEXT NOT NULL,
  phase_label TEXT,
  planned_start TEXT,
  planned_end TEXT,
  actual_start TEXT,
  actual_end TEXT,
  percent_complete REAL NOT NULL DEFAULT 0,
  depends_on_milestone_id TEXT REFERENCES moonshot_milestones(id),
  is_milestone INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS moonshot_kpis (
  id TEXT PRIMARY KEY,
  moonshot_id TEXT NOT NULL REFERENCES moonshots(id),
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT,
  baseline_value REAL,
  target_value REAL,
  current_value REAL,
  frequency TEXT,
  responsible_id TEXT REFERENCES users(id),
  source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kpi_records (
  id TEXT PRIMARY KEY,
  kpi_id TEXT NOT NULL REFERENCES moonshot_kpis(id),
  value REAL NOT NULL,
  measured_at TEXT NOT NULL,
  observations TEXT,
  created_by TEXT
);

-- ---------- FUNDING ----------

CREATE TABLE IF NOT EXISTS moonshot_funding (
  id TEXT PRIMARY KEY,
  moonshot_id TEXT NOT NULL REFERENCES moonshots(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('client','hyperscaler','ntt_data','innovation_hq','account','sector','innovation_fund','startup','partner','hybrid','other')),
  description TEXT,
  amount REAL NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'EUR',
  exchange_rate REAL DEFAULT 1,
  rate_date TEXT,
  amount_eur REAL,
  status TEXT NOT NULL DEFAULT 'identified' CHECK (status IN ('identified','requested','reserved','approved','received','committed','consumed','cancelled')),
  cost_center TEXT,
  ext_identifier TEXT,
  internal_order TEXT,
  observations TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS moonshot_financials (
  id TEXT PRIMARY KEY,
  moonshot_id TEXT NOT NULL UNIQUE REFERENCES moonshots(id),
  total_revenue REAL DEFAULT 0,
  total_cost REAL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'EUR',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- LEGAL ----------

CREATE TABLE IF NOT EXISTS legal_templates (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('msa','sow')),
  country_id TEXT REFERENCES countries(id),
  language TEXT NOT NULL DEFAULT 'pt-BR',
  version TEXT NOT NULL,
  effective_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','superseded')),
  file_url TEXT,
  observations TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS legal_clauses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  country_id TEXT REFERENCES countries(id),
  language TEXT NOT NULL DEFAULT 'pt-BR',
  clause_text TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0',
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS legal_documents (
  id TEXT PRIMARY KEY,
  moonshot_id TEXT REFERENCES moonshots(id),
  template_id TEXT REFERENCES legal_templates(id),
  type TEXT NOT NULL CHECK (type IN ('msa','sow','nda','other')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','pending_signature','signed','rejected')),
  file_url TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  legal_opinion TEXT,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);

-- ---------- GENERIC DOCUMENTS ----------

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  file_key TEXT NOT NULL, -- R2 object key
  original_filename TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('client','startup','hub','hyperscaler','challenge','moonshot','edition','cubo_experience','legal')),
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  confidentiality TEXT NOT NULL DEFAULT 'internal',
  uploaded_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- ---------- CATALYST DAY ----------

CREATE TABLE IF NOT EXISTS catalyst_days (
  id TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL REFERENCES editions(id),
  name TEXT NOT NULL,
  event_date TEXT,
  start_time TEXT,
  location TEXT,
  capacity INTEGER,
  description TEXT,
  agenda TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS catalyst_day_moonshots (
  id TEXT PRIMARY KEY,
  catalyst_day_id TEXT NOT NULL REFERENCES catalyst_days(id),
  moonshot_id TEXT NOT NULL REFERENCES moonshots(id),
  presentation_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recognitions (
  id TEXT PRIMARY KEY,
  catalyst_day_id TEXT NOT NULL REFERENCES catalyst_days(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('user','startup','hub','hyperscaler','partner')),
  entity_id TEXT NOT NULL,
  entity_name TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- AI CONFIGURATION (disabled by default) ----------

CREATE TABLE IF NOT EXISTS ai_configuration (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  enabled INTEGER NOT NULL DEFAULT 0,
  azure_endpoint TEXT,
  deployment_name TEXT,
  api_version TEXT,
  auth_method TEXT DEFAULT 'key_vault',
  key_vault_secret_ref TEXT,
  timeout_ms INTEGER DEFAULT 30000,
  max_tokens INTEGER DEFAULT 2000,
  temperature REAL DEFAULT 0.3,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS ai_executions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  function_name TEXT NOT NULL,
  model TEXT,
  sources TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  result_accepted INTEGER,
  error_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- NOTIFICATIONS ----------

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  entity_type TEXT,
  entity_id TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- AUDIT LOG (immutable) ----------

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  user_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details TEXT, -- JSON
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_challenges_edition ON challenges(edition_id);
CREATE INDEX IF NOT EXISTS idx_moonshots_edition ON moonshots(edition_id);
CREATE INDEX IF NOT EXISTS idx_moonshots_phase ON moonshots(phase);
CREATE INDEX IF NOT EXISTS idx_startups_hub ON startups(hub_id);
CREATE INDEX IF NOT EXISTS idx_irl_startup ON irl_assessments(startup_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_moonshot ON moonshot_checkpoints(moonshot_id);
CREATE INDEX IF NOT EXISTS idx_milestones_moonshot ON moonshot_milestones(moonshot_id);
CREATE INDEX IF NOT EXISTS idx_funding_moonshot ON moonshot_funding(moonshot_id);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_accounts_client ON accounts(client_id);

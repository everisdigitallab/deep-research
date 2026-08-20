-- ============================================================
-- SAMPLE APP RUNTIME - Minimal Seed Data
-- This seed intentionally stays small and neutral so it can be
-- reused as a project-agnostic starter dataset.
-- ============================================================

-- ---------- USERS ----------
-- Demo personal tokens:
--   masteradmin@sampleapp.demo   token: master-admin-demo-token-2026
--   admin@sampleapp.demo         token: admin-demo-token-2026
--   executive@sampleapp.demo     token: executive-demo-token-2026
--
-- Demo activation token:
--   reviewer@sampleapp.demo      token: reviewer-activate-demo-token-2026

INSERT INTO users (
  id,
  name,
  email,
  role,
  is_client_manager,
  status,
  locale,
  token_hash,
  token_expires_at,
  activation_token_hash,
  activation_token_expires_at,
  created_at,
  updated_at
) VALUES
(
  'u-master-001',
  'Jordan Avery',
  'masteradmin@sampleapp.demo',
  'master_admin',
  0,
  'active',
  'pt-BR',
  'seedsalt-master:7a7495be6ef5291ad4afe66ba5b502b5da9660e575578c03d7123ec74cadb45d',
  '2027-01-01T00:00:00.000Z',
  NULL,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'u-admin-001',
  'Taylor Brooks',
  'admin@sampleapp.demo',
  'admin',
  0,
  'active',
  'pt-BR',
  'seedsalt01admin:c8d42905850128b5b490dd166ca59d49760d0d03c7b4b00bf87cdba435a76aa8',
  '2027-01-01T00:00:00.000Z',
  NULL,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'u-exec-001',
  'Casey Morgan',
  'executive@sampleapp.demo',
  'executive',
  0,
  'active',
  'pt-BR',
  'seedsalt02exec:4f647ee0a87432a6eedaf3759ef589e5bf4bcb7ca61030a5df8373916527dd55',
  '2027-01-01T00:00:00.000Z',
  NULL,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'u-legal-001',
  'Riley Chen',
  'reviewer@sampleapp.demo',
  'legal',
  0,
  'pending_activation',
  'pt-BR',
  NULL,
  NULL,
  'seedsalt-reviewer:33e292b8be6c84784f1fd435e60d4ccb7f9f41cc9d58256765c83555420e8b18',
  '2027-01-01T00:00:00.000Z',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT DO NOTHING;

-- ---------- REFERENCE DATA ----------

INSERT INTO countries (id, code, name) VALUES
('co-br', 'BR', 'Brasil'),
('co-us', 'US', 'Estados Unidos'),
('co-pt', 'PT', 'Portugal')
ON CONFLICT DO NOTHING;

INSERT INTO currencies (id, code, name, symbol) VALUES
('cur-eur', 'EUR', 'Euro', 'EUR'),
('cur-brl', 'BRL', 'Real Brasileiro', 'R$'),
('cur-usd', 'USD', 'Dolar Americano', 'USD')
ON CONFLICT DO NOTHING;

INSERT INTO exchange_rates (id, currency_code, rate_to_eur, rate_date, created_by, created_at) VALUES
('ex-eur-1', 'EUR', 1.0, '2026-08-01', 'u-master-001', CURRENT_TIMESTAMP),
('ex-brl-1', 'BRL', 0.17, '2026-08-01', 'u-master-001', CURRENT_TIMESTAMP),
('ex-usd-1', 'USD', 0.92, '2026-08-01', 'u-master-001', CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

INSERT INTO technologies (id, name) VALUES
('tech-ai', 'Inteligencia Artificial'),
('tech-cloud', 'Cloud'),
('tech-data', 'Dados e Analytics')
ON CONFLICT DO NOTHING;

INSERT INTO hubs (
  id,
  name,
  country_id,
  city,
  website,
  description,
  status,
  created_at,
  created_by,
  updated_at
) VALUES
(
  'hub-sp',
  'Innovation Hub Sao Paulo',
  'co-br',
  'Sao Paulo',
  'https://example.test/hubs/sao-paulo',
  'Hub de referencia para a amostra generica.',
  'active',
  CURRENT_TIMESTAMP,
  'u-master-001',
  CURRENT_TIMESTAMP
),
(
  'hub-lis',
  'Innovation Hub Lisboa',
  'co-pt',
  'Lisboa',
  'https://example.test/hubs/lisboa',
  'Ponto adicional para demonstrar cadastros multiplos.',
  'active',
  CURRENT_TIMESTAMP,
  'u-master-001',
  CURRENT_TIMESTAMP
)
ON CONFLICT DO NOTHING;

-- ---------- SESSIONS ----------

INSERT INTO sessions (
  id,
  user_id,
  session_token_hash,
  ip_address,
  user_agent,
  expires_at,
  created_at
) VALUES
(
  'sess-demo-001',
  'u-admin-001',
  'session-salt-demo:0e9d3cdbf6b124dd0752ee53f9af54d612848b4e5aa503d1dfb9629a0f667fd3',
  '127.0.0.1',
  'seed-demo',
  '2027-01-01T00:00:00.000Z',
  CURRENT_TIMESTAMP
)
ON CONFLICT DO NOTHING;

-- ---------- AUDIT ----------

INSERT INTO audit_log (
  id,
  user_id,
  user_name,
  action,
  entity_type,
  entity_id,
  details_json,
  created_at
) VALUES
(
  'audit-001',
  'u-master-001',
  'Jordan Avery',
  'bootstrap_master_admin',
  'user',
  'u-master-001',
  '{"source":"seed"}',
  datetime('now', '-3 days')
),
(
  'audit-002',
  'u-admin-001',
  'Taylor Brooks',
  'create_reference_data',
  'hub',
  'hub-sp',
  '{"source":"seed"}',
  datetime('now', '-2 days')
),
(
  'audit-003',
  'u-admin-001',
  'Taylor Brooks',
  'invite_user',
  'user',
  'u-legal-001',
  '{"source":"seed"}',
  datetime('now', '-1 day')
)
ON CONFLICT DO NOTHING;

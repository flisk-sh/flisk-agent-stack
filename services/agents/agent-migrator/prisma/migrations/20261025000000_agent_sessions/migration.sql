-- Agent checkpoints. The agent writes the whole transcript of a session here after every turn,
-- so a restarted agent resumes each session where it stopped. The table name is part of the agent contract.
create table if not exists flisk_agent_sessions (
  session_id varchar(128) primary key,
  messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

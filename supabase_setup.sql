-- ─────────────────────────────────────────────────────────────────────────────
-- LinkedAI – Supabase Schema Setup (fresh project)
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to run multiple times (all statements use IF NOT EXISTS / OR REPLACE)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create users table
CREATE TABLE IF NOT EXISTS users (
  id                        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  linkedin_id               TEXT    UNIQUE NOT NULL,
  email                     TEXT,
  name                      TEXT,
  profile_pic               TEXT,
  subscription_status       TEXT    NOT NULL DEFAULT 'free',
  razorpay_subscription_id  TEXT,
  razorpay_customer_id      TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create usage tracking table
CREATE TABLE IF NOT EXISTS usage (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month      TEXT    NOT NULL,  -- format: 'YYYY-MM'
  count      INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT usage_user_month_unique UNIQUE (user_id, month)
);

-- 3. Create the increment_usage function (atomic, avoids race conditions)
CREATE OR REPLACE FUNCTION increment_usage(p_user_id UUID, p_month TEXT)
RETURNS INTEGER
LANGUAGE sql
AS $$
  INSERT INTO usage (user_id, month, count)
  VALUES (p_user_id, p_month, 1)
  ON CONFLICT (user_id, month)
  DO UPDATE SET count = usage.count + 1
  RETURNING count;
$$;

-- 4. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_linkedin_id    ON users(linkedin_id);
CREATE INDEX IF NOT EXISTS idx_users_razorpay_sub   ON users(razorpay_subscription_id);
CREATE INDEX IF NOT EXISTS idx_usage_user_month     ON usage(user_id, month);

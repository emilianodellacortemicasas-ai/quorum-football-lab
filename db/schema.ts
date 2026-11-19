import { integer, real, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
export const portfolios = sqliteTable('portfolios', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), name: text('name').notNull(),
  mode: text('mode').notNull().default('paper'), initialCents: integer('initial_cents').notNull(),
  stakeBps: integer('stake_bps').notNull().default(50), exposureBps: integer('exposure_bps').notNull().default(300),
  dayBps: integer('day_bps').notNull().default(200), drawdownBps: integer('drawdown_bps').notNull().default(1000),
  limitsEnabled: integer('limits_enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
}, t => [index('portfolios_owner').on(t.owner)]);
export const bets = sqliteTable('bets', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), portfolioId: text('portfolio_id').notNull().references(() => portfolios.id),
  fixtureId: text('fixture_id').notNull(), fixture: text('fixture').notNull(), competition: text('competition').notNull(),
  market: text('market').notNull(), marketLabel: text('market_label').notNull(), probability: real('probability').notNull(),
  odds: real('odds').notNull(), stakeCents: integer('stake_cents').notNull(), source: text('source').notNull(),
  modelVersion: text('model_version').notNull(), snapshot: text('snapshot').notNull(),
  status: text('status').notNull().default('pending'), pnlCents: integer('pnl_cents').notNull().default(0),
  createdAt: text('created_at').notNull(), settledAt: text('settled_at'),
}, t => [index('bets_owner_portfolio').on(t.owner, t.portfolioId)]);
export const locks = sqliteTable('portfolio_revisions', {
  portfolioId: text('portfolio_id').primaryKey().references(() => portfolios.id), revision: integer('revision').notNull().default(0),
});
// Only RSA-OAEP ciphertext is persisted; the decryption key lives in hosted secrets.
export const serviceCredentials = sqliteTable('service_credentials', {
  provider: text('provider').primaryKey(), owner: text('owner').notNull(),
  ciphertext: text('ciphertext').notNull(), recipientId: text('recipient_id').notNull(),
  verifiedAt: text('verified_at').notNull(),
});
export const operationCounters = sqliteTable('operation_counters', {
  id: text('id').primaryKey(), count: integer('count').notNull().default(0),
});

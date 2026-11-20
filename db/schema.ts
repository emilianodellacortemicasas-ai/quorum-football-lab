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
  shared: integer('shared').notNull().default(0), author: text('author'),
}, t => [index('bets_shared').on(t.shared, t.createdAt), index('bets_owner_portfolio').on(t.owner, t.portfolioId)]);
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
// Value scanner: every evaluated outcome is stored, so picks can be settled and back-tested later.
export const scannerRuns = sqliteTable('scanner_runs', {
  id: text('id').primaryKey(), trigger: text('trigger').notNull(), status: text('status').notNull(),
  startedAt: text('started_at').notNull(), finishedAt: text('finished_at'),
  fixtures: integer('fixtures').notNull().default(0), matched: integer('matched').notNull().default(0),
  modelled: integer('modelled').notNull().default(0), picks: integer('picks').notNull().default(0),
  oddsRemaining: integer('odds_remaining'), message: text('message'),
}, t => [index('scanner_runs_started').on(t.startedAt)]);
export const scannerRows = sqliteTable('scanner_rows', {
  id: text('id').primaryKey(), runId: text('run_id').notNull(), fixtureId: text('fixture_id').notNull(),
  fixture: text('fixture').notNull(), competition: text('competition').notNull(), kickoff: text('kickoff').notNull(),
  market: text('market').notNull(), label: text('label').notNull(),
  pModel: real('p_model').notNull(), pMarket: real('p_market').notNull(), pBlend: real('p_blend').notNull(),
  bestOdds: real('best_odds').notNull(), bookmaker: text('bookmaker').notNull(), books: integer('books').notNull(),
  edge: real('edge').notNull(), kelly: real('kelly').notNull(), isPick: integer('is_pick').notNull().default(0),
  result: text('result'), createdAt: text('created_at').notNull(),
  itOdds: real('it_odds'), itBook: text('it_book'), itEdge: real('it_edge'), itKelly: real('it_kelly'),
}, t => [index('scanner_rows_run').on(t.runId, t.isPick), index('scanner_rows_fixture').on(t.fixtureId)]);
export const scannerMatches = sqliteTable('scanner_matches', {
  id: text('id').primaryKey(), runId: text('run_id').notNull(), fixtureId: text('fixture_id').notNull(),
  fixture: text('fixture').notNull(), competition: text('competition').notNull(), kickoff: text('kickoff').notNull(),
  modelled: integer('modelled').notNull().default(0), lambdaHome: real('lambda_home'), lambdaAway: real('lambda_away'),
  markets: text('markets').notNull(), createdAt: text('created_at').notNull(),
}, t => [index('scanner_matches_run').on(t.runId, t.kickoff)]);
export const modelState = sqliteTable('model_state', { id: text('id').primaryKey(), builtAt: text('built_at').notNull(), payload: text('payload').notNull() });

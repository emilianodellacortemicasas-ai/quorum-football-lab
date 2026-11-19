CREATE TABLE `scanner_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`fixtures` integer DEFAULT 0 NOT NULL,
	`matched` integer DEFAULT 0 NOT NULL,
	`modelled` integer DEFAULT 0 NOT NULL,
	`picks` integer DEFAULT 0 NOT NULL,
	`odds_remaining` integer,
	`message` text
);
--> statement-breakpoint
CREATE INDEX `scanner_runs_started` ON `scanner_runs` (`started_at`);
--> statement-breakpoint
CREATE TABLE `scanner_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`fixture_id` text NOT NULL,
	`fixture` text NOT NULL,
	`competition` text NOT NULL,
	`kickoff` text NOT NULL,
	`market` text NOT NULL,
	`label` text NOT NULL,
	`p_model` real NOT NULL,
	`p_market` real NOT NULL,
	`p_blend` real NOT NULL,
	`best_odds` real NOT NULL,
	`bookmaker` text NOT NULL,
	`books` integer NOT NULL,
	`edge` real NOT NULL,
	`kelly` real NOT NULL,
	`is_pick` integer DEFAULT 0 NOT NULL,
	`result` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scanner_rows_run` ON `scanner_rows` (`run_id`,`is_pick`);
--> statement-breakpoint
CREATE INDEX `scanner_rows_fixture` ON `scanner_rows` (`fixture_id`);

CREATE TABLE `bets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`portfolio_id` text NOT NULL,
	`fixture_id` text NOT NULL,
	`fixture` text NOT NULL,
	`competition` text NOT NULL,
	`market` text NOT NULL,
	`market_label` text NOT NULL,
	`probability` real NOT NULL,
	`odds` real NOT NULL,
	`stake_cents` integer NOT NULL,
	`source` text NOT NULL,
	`model_version` text NOT NULL,
	`snapshot` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`pnl_cents` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`settled_at` text,
	FOREIGN KEY (`portfolio_id`) REFERENCES `portfolios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bets_owner_portfolio` ON `bets` (`owner`,`portfolio_id`);--> statement-breakpoint
CREATE TABLE `portfolio_revisions` (
	`portfolio_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`portfolio_id`) REFERENCES `portfolios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `portfolios` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`mode` text DEFAULT 'paper' NOT NULL,
	`initial_cents` integer NOT NULL,
	`stake_bps` integer DEFAULT 50 NOT NULL,
	`exposure_bps` integer DEFAULT 300 NOT NULL,
	`day_bps` integer DEFAULT 200 NOT NULL,
	`drawdown_bps` integer DEFAULT 1000 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `portfolios_owner` ON `portfolios` (`owner`);
CREATE TABLE `scanner_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`fixture_id` text NOT NULL,
	`fixture` text NOT NULL,
	`competition` text NOT NULL,
	`kickoff` text NOT NULL,
	`modelled` integer DEFAULT 0 NOT NULL,
	`lambda_home` real,
	`lambda_away` real,
	`markets` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scanner_matches_run` ON `scanner_matches` (`run_id`,`kickoff`);

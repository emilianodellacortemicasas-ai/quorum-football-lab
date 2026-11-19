CREATE TABLE `scanner_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`legs` text NOT NULL,
	`odds` real NOT NULL,
	`p` real NOT NULL,
	`created_at` text NOT NULL,
	`result` text,
	`settled_at` text
);
--> statement-breakpoint
CREATE TABLE `fixture_results` (
	`fixture_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`payload` text NOT NULL,
	`checked_at` text NOT NULL
);

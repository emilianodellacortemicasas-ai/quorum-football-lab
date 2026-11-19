CREATE TABLE `operation_counters` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `service_credentials` (
	`provider` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`ciphertext` text NOT NULL,
	`recipient_id` text NOT NULL,
	`verified_at` text NOT NULL
);

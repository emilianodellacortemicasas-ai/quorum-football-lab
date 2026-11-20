ALTER TABLE `bets` ADD `shared` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `bets` ADD `author` text;--> statement-breakpoint
CREATE INDEX `bets_shared` ON `bets` (`shared`,`created_at`);

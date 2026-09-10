CREATE TABLE `commute_locks` (
	`name` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `commute_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);

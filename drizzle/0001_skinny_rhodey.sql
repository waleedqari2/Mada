CREATE TABLE `hotels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`hotelId` varchar(100) NOT NULL,
	`city` varchar(100) NOT NULL DEFAULT 'Makkah',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `hotels_id` PRIMARY KEY(`id`),
	CONSTRAINT `hotels_hotelId_unique` UNIQUE(`hotelId`)
);
--> statement-breakpoint
CREATE TABLE `priceHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`hotelId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`displayPrice` int,
	`actualPrice` int,
	`currency` varchar(3) NOT NULL DEFAULT 'SAR',
	`available` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `priceHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `syncLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`totalHotels` int NOT NULL DEFAULT 0,
	`totalDates` int NOT NULL DEFAULT 0,
	`successCount` int NOT NULL DEFAULT 0,
	`errorCount` int NOT NULL DEFAULT 0,
	`errorMessage` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`duration` int,
	CONSTRAINT `syncLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webbedCredentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`username` text NOT NULL,
	`password` text NOT NULL,
	`lastSyncAt` timestamp,
	`syncStatus` enum('idle','syncing','error','success') NOT NULL DEFAULT 'idle',
	`syncError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `webbedCredentials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `priceHistory` ADD CONSTRAINT `priceHistory_hotelId_hotels_id_fk` FOREIGN KEY (`hotelId`) REFERENCES `hotels`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `syncLogs` ADD CONSTRAINT `syncLogs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `webbedCredentials` ADD CONSTRAINT `webbedCredentials_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
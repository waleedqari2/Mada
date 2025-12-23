CREATE TABLE `priceAlerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`hotelId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`userPrice` int NOT NULL,
	`competitorPrice` int NOT NULL,
	`priceDifference` int NOT NULL,
	`alertType` enum('price_lower','price_higher','price_equal') NOT NULL,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`dismissedAt` timestamp,
	CONSTRAINT `priceAlerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userPrices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`hotelId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`customPrice` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userPrices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `priceAlerts` ADD CONSTRAINT `priceAlerts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `priceAlerts` ADD CONSTRAINT `priceAlerts_hotelId_hotels_id_fk` FOREIGN KEY (`hotelId`) REFERENCES `hotels`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `userPrices` ADD CONSTRAINT `userPrices_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `userPrices` ADD CONSTRAINT `userPrices_hotelId_hotels_id_fk` FOREIGN KEY (`hotelId`) REFERENCES `hotels`(`id`) ON DELETE no action ON UPDATE no action;
-- AlterTable
ALTER TABLE `refresh_tokens` DROP PRIMARY KEY,
    MODIFY `refresh_token` VARCHAR(2048) NOT NULL,
    ADD PRIMARY KEY (`device_id`);

-- CreateIndex
CREATE INDEX `refresh_tokens_username_idx` ON `refresh_tokens`(`username`);

-- CreateIndex
CREATE INDEX `refresh_tokens_token_idx` ON `refresh_tokens`(`refresh_token`(191));


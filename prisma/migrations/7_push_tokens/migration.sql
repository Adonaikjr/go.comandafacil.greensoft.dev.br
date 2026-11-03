-- Tokens de push do app (Expo). Um por aparelho; o mesmo aparelho trocando
-- de conta reaproveita a linha (token unico). Collation igual a de `users`:
-- o envio faz JOIN por username, e MySQL recusa comparar collations diferentes.
CREATE TABLE `push_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NOT NULL,
    `username` VARCHAR(255) NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `platform` VARCHAR(10) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `push_tokens_token_key`(`token`),
    INDEX `push_tokens_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- AddForeignKey
ALTER TABLE `push_tokens` ADD CONSTRAINT `push_tokens_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

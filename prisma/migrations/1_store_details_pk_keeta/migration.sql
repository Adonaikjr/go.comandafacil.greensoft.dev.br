-- DropForeignKey
ALTER TABLE `store_details` DROP FOREIGN KEY `store_details_ibfk_1`;

-- AlterTable
ALTER TABLE `store_details` MODIFY `tenant_id` INTEGER NOT NULL,
    ADD PRIMARY KEY (`tenant_id`);

-- DropIndex
DROP INDEX `tenant_id_pk` ON `store_details`;

-- CreateTable
CREATE TABLE `keeta_credentials` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NOT NULL,
    `client_id` VARCHAR(500) NOT NULL,
    `client_secret` VARCHAR(500) NOT NULL,
    `restaurant_id` VARCHAR(255) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `keeta_credentials_tenant_id_key`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `keeta_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `keeta_order_id` VARCHAR(255) NOT NULL,
    `tenant_id` INTEGER NOT NULL,
    `customer_name` VARCHAR(255) NULL,
    `total` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(100) NOT NULL DEFAULT 'PLACED',
    `raw_data` LONGTEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `keeta_orders_tenant_idx`(`tenant_id`),
    UNIQUE INDEX `uq_keeta_order_tenant`(`keeta_order_id`, `tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `store_details` ADD CONSTRAINT `store_details_ibfk_1` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `keeta_credentials` ADD CONSTRAINT `keeta_credentials_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `keeta_orders` ADD CONSTRAINT `keeta_orders_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateTable
CREATE TABLE `inventory_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `unit` VARCHAR(10) NOT NULL DEFAULT 'un',
    `quantity` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `min_quantity` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `cost_price` DECIMAL(10, 2) NULL,
    `menu_item_id` INTEGER NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `inventory_items_menu_item_id_idx`(`menu_item_id`),
    UNIQUE INDEX `inventory_items_tenant_id_menu_item_id_key`(`tenant_id`, `menu_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_movements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NOT NULL,
    `inventory_item_id` INTEGER NOT NULL,
    `type` ENUM('entry', 'exit', 'adjustment', 'sale', 'sale_return') NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `balance` DECIMAL(12, 3) NOT NULL,
    `order_id` INTEGER NULL,
    `notes` VARCHAR(255) NULL,
    `username` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `inventory_movements_tenant_id_created_at_idx`(`tenant_id`, `created_at`),
    INDEX `inventory_movements_inventory_item_id_created_at_idx`(`inventory_item_id`, `created_at`),
    INDEX `inventory_movements_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `inventory_items` ADD CONSTRAINT `inventory_items_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_items` ADD CONSTRAINT `inventory_items_menu_item_id_fkey` FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_inventory_item_id_fkey` FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Os defaults passam a ser gerados pelo MySQL (sessão em -03:00) em vez do
-- Prisma Client, que gravava now() em UTC e adiantava as datas em 3 h.
-- O DDL é o mesmo que já existe no banco; só alinha o histórico ao schema.
-- AlterTable
ALTER TABLE `BlogPost` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `BlogTags` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `customers` MODIFY `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `update_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE `ifood_auth_tokens` MODIFY `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updated_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE `ifood_catalog_mapping` MODIFY `last_synced_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE `ifood_credentials` MODIFY `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE `ifood_orders` MODIFY `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE `invoices` MODIFY `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE `order_items` MODIFY `date` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE `orders` MODIFY `date` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE `page_visitors` MODIFY `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE `qr_order_items` MODIFY `date` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE `qr_orders` MODIFY `date` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE `refresh_tokens` MODIFY `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE `reservations` MODIFY `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE `subscription_history` MODIFY `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE `tenants` MODIFY `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE `keeta_credentials` MODIFY `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE `keeta_orders` MODIFY `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE `inventory_items` MODIFY `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE `inventory_movements` MODIFY `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE `push_tokens` MODIFY `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP;


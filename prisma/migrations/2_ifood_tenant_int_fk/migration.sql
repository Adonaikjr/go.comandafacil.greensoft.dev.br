-- AlterTable
ALTER TABLE `ifood_credentials` MODIFY `tenant_id` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `ifood_orders` MODIFY `tenant_id` INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX `ifood_orders_tenant_idx` ON `ifood_orders`(`tenant_id`);

-- AddForeignKey
ALTER TABLE `ifood_credentials` ADD CONSTRAINT `ifood_credentials_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ifood_orders` ADD CONSTRAINT `ifood_orders_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


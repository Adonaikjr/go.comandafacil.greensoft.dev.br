-- Layout escolhido para o cardapio digital. NULL = classico (/m/:codigo).
ALTER TABLE `store_details` ADD COLUMN `qr_menu_template` VARCHAR(30) NULL;

-- Forma de pagamento da fatura. O titulo e copiado no fechamento: renomear ou
-- excluir a forma depois nao reescreve o historico do caixa.
-- Nulo nas faturas antigas e nas fechadas por clientes que ainda nao mandam
-- o campo (o legado insere com lista de colunas explicita e segue valendo).
ALTER TABLE `invoices`
    ADD COLUMN `payment_type_id` INTEGER NULL,
    ADD COLUMN `payment_type_title` VARCHAR(100) NULL;

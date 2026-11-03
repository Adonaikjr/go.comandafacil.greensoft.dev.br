-- O app gravava '80mm', '58mm' e 'A4' em page_format, mas o PDV web monta a
-- largura com `w-[${page_format}mm]` e so oferece '80' e '57'. Normaliza os
-- valores que o app deixou para os do web.
UPDATE `print_settings` SET `page_format` = '80' WHERE `page_format` IN ('80mm', 'A4');
UPDATE `print_settings` SET `page_format` = '57' WHERE `page_format` IN ('58mm', '57mm', '58');

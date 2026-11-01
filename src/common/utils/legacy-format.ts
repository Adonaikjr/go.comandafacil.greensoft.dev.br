// O legado lê o MySQL com `dateStrings=true`, então o frontend recebe as datas
// como texto ("2026-11-01" / "2026-11-01 14:30:00"), não em ISO. O Prisma
// devolve DATETIME como Date em UTC com o mesmo "relógio" gravado no banco,
// por isso a formatação usa os getters UTC.

const pad = (n: number) => String(n).padStart(2, '0');

export function toSqlDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

export function toSqlDateTime(value: Date | null | undefined): string | null {
  if (!value) return null;
  return `${toSqlDate(value)} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
}

// TINYINT(1) chega como 0/1 no legado
export function toTinyInt(value: boolean | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return value ? 1 : 0;
}

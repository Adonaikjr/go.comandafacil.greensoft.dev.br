// Convenção de datas do banco novo: as colunas DATETIME/DATE guardam o horário
// de São Paulo (a sessão MySQL roda com time_zone '-03:00', ver PrismaService,
// então NOW()/CURRENT_TIMESTAMP seguem a mesma regra).
//
// O Prisma lê e grava DATETIME como se fosse UTC. Por isso, para gravar
// "agora" ou comparar com "hoje", convertemos o instante real para o relógio
// de São Paulo e o representamos como uma Date "UTC" com esses números.

export const DB_TIMEZONE = 'America/Sao_Paulo';
export const DB_UTC_OFFSET = '-03:00';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DB_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function asDbDateTime(date: Date): Date {
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return new Date(
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`,
  );
}

export function nowAsDbDateTime(): Date {
  return asDbDateTime(new Date());
}

// Meia-noite de hoje (São Paulo), para colunas DATE e filtros por dia
export function todayAsDbDate(): Date {
  const now = nowAsDbDateTime();
  now.setUTCHours(0, 0, 0, 0);
  return now;
}

// "YYYY-MM-DD" de hoje em São Paulo
export function todayString(): string {
  return todayAsDbDate().toISOString().slice(0, 10);
}

// Converte "YYYY-MM-DD" ou "YYYY-MM-DD HH:mm[:ss]" (horário de São Paulo, como
// o frontend envia) para a Date que o Prisma grava com esses mesmos números.
export function parseDbDateTime(value: string): Date {
  const normalized = value.trim().replace(' ', 'T');
  const withTime =
    normalized.length === 10 ? `${normalized}T00:00:00` : normalized;
  return new Date(`${withTime.slice(0, 19)}Z`);
}

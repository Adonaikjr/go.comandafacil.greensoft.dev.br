/**
 * Copia os dados do banco legado (`pdv`) para o banco do backend-new.
 *
 *   npm run data:migrate-legacy                         # simulação: só confere e conta
 *   npm run data:migrate-legacy -- --execute            # copia (destino precisa estar vazio)
 *   npm run data:migrate-legacy -- --execute --truncate # apaga os dados do destino antes
 *
 * Variáveis:
 *   LEGACY_DATABASE_URL  origem (somente leitura)
 *   DATABASE_URL         destino (já com `npm run prisma:migrate` aplicado)
 *   LEGACY_TZ            fuso IANA em que o legado gravou as datas. Se vazio, usa o
 *                        deslocamento atual do servidor de origem (não trata horário de verão).
 *
 * Transformações (ver MIGRACAO_NESTJS.md, seção 6):
 *   - DATETIME/TIMESTAMP: do fuso do legado para o horário de São Paulo
 *   - ifood_*.tenant_id: VARCHAR → INT
 *   - store_details sem tenant_id: descartado (tenant_id virou chave primária)
 */
import 'dotenv/config';
import mariadb, { type Connection } from 'mariadb';

const TARGET_TZ = 'America/Sao_Paulo';
const BATCH = 500;
const SKIP_TABLES = new Set(['_prisma_migrations']);

const args = new Set(process.argv.slice(2));
const execute = args.has('--execute');
const truncate = args.has('--truncate');

function connect(urlString: string | undefined, name: string) {
  if (!urlString) throw new Error(`${name} não definida`);
  const url = new URL(urlString);
  return mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    connectTimeout: 30_000,
    // Datas como texto: a conversão de fuso é feita aqui, sem o driver interferir
    dateStrings: true,
    bigIntAsNumber: true,
    decimalAsNumber: false,
  });
}

async function columns(conn: Connection, table: string) {
  const rows: { name: string; type: string }[] = await conn.query(
    `SELECT COLUMN_NAME AS name, DATA_TYPE AS type FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ORDINAL_POSITION`,
    [table],
  );
  return rows;
}

async function tables(conn: Connection) {
  const rows: { name: string }[] = await conn.query(
    `SELECT table_name AS name FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  return rows.map((r) => r.name);
}

async function count(conn: Connection, table: string) {
  const [row] = await conn.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
  return Number(row.n);
}

// ---- Fuso horário ----

const pad = (n: number) => String(n).padStart(2, '0');

function partsIn(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

// "relógio" de um fuso → instante real (UTC)
function wallClockToInstant(value: string, timeZone: string | null, fixedOffsetMin: number) {
  const asUtc = new Date(`${value.replace(' ', 'T').slice(0, 19)}Z`);
  if (!timeZone) return new Date(asUtc.getTime() - fixedOffsetMin * 60_000);
  // Ajusta pelo deslocamento do fuso naquela data (trata horário de verão)
  const offset = (new Date(`${partsIn(asUtc, timeZone).replace(' ', 'T')}Z`).getTime() - asUtc.getTime()) / 60_000;
  return new Date(asUtc.getTime() - offset * 60_000);
}

function convertDateTime(value: unknown, sourceTz: string | null, sourceOffsetMin: number) {
  if (typeof value !== 'string' || value.startsWith('0000')) return value;
  return partsIn(wallClockToInstant(value, sourceTz, sourceOffsetMin), TARGET_TZ);
}

// ---- Regras por tabela ----

type Row = Record<string, unknown>;

function transform(table: string, row: Row): Row | null {
  if (table === 'store_details' && row.tenant_id == null) return null;
  if (table === 'ifood_credentials' || table === 'ifood_orders') {
    const tenantId = Number(row.tenant_id);
    if (!Number.isInteger(tenantId)) return null;
    row.tenant_id = tenantId;
  }
  return row;
}

async function main() {
  const source = await connect(process.env.LEGACY_DATABASE_URL, 'LEGACY_DATABASE_URL');
  const target = await connect(process.env.DATABASE_URL, 'DATABASE_URL');

  try {
    const sourceTz = process.env.LEGACY_TZ || null;
    const [{ diff }] = await source.query(`SELECT TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS diff`);
    const sourceOffsetMin = Number(diff);
    console.log(
      `Origem: fuso ${sourceTz ?? `fixo ${sourceOffsetMin >= 0 ? '+' : ''}${sourceOffsetMin / 60}h (defina LEGACY_TZ para tratar horário de verão)`} → destino ${TARGET_TZ}`,
    );

    const sourceTables = new Set(await tables(source));
    const targetTables = (await tables(target)).filter((t) => !SKIP_TABLES.has(t));
    const toCopy = targetTables.filter((t) => sourceTables.has(t));
    const onlyTarget = targetTables.filter((t) => !sourceTables.has(t));
    if (onlyTarget.length) console.log(`Só no destino (ficam vazias): ${onlyTarget.join(', ')}`);

    const nonEmpty: string[] = [];
    for (const table of toCopy) if ((await count(target, table)) > 0) nonEmpty.push(table);
    if (nonEmpty.length && !truncate) {
      console.log(`Destino já tem dados em: ${nonEmpty.join(', ')}`);
      if (execute) throw new Error('Use --truncate para apagar os dados do destino antes de copiar.');
    }

    if (!execute) {
      console.log('\nSimulação (use --execute para copiar):');
      for (const table of toCopy) console.log(`  ${table.padEnd(24)} ${await count(source, table)} linha(s)`);
      return;
    }

    await target.query('SET FOREIGN_KEY_CHECKS = 0');
    await target.beginTransaction();

    if (truncate) {
      for (const table of toCopy) await target.query(`DELETE FROM \`${table}\``);
    }

    const report: { table: string; source: number; copied: number; skipped: number }[] = [];

    for (const table of toCopy) {
      const targetCols = await columns(target, table);
      const sourceCols = new Set((await columns(source, table)).map((c) => c.name));
      const cols = targetCols.filter((c) => sourceCols.has(c.name));
      const dateTimeCols = new Set(
        cols.filter((c) => c.type === 'datetime' || c.type === 'timestamp').map((c) => c.name),
      );
      const names = cols.map((c) => `\`${c.name}\``).join(', ');
      const placeholders = `(${cols.map(() => '?').join(', ')})`;

      let offset = 0;
      let copied = 0;
      let skipped = 0;
      for (;;) {
        const rows: Row[] = await source.query(
          `SELECT ${names} FROM \`${table}\` LIMIT ${BATCH} OFFSET ${offset}`,
        );
        if (!rows.length) break;
        offset += rows.length;

        const values: unknown[][] = [];
        for (const original of rows) {
          const row = transform(table, { ...original });
          if (!row) {
            skipped++;
            continue;
          }
          values.push(
            cols.map((c) =>
              dateTimeCols.has(c.name) ? convertDateTime(row[c.name], sourceTz, sourceOffsetMin) : row[c.name],
            ),
          );
        }
        if (values.length) {
          await target.batch(`INSERT INTO \`${table}\` (${names}) VALUES ${placeholders}`, values);
          copied += values.length;
        }
      }
      report.push({ table, source: offset, copied, skipped });
    }

    await target.commit();
    await target.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('\nTabela                   origem  copiadas  descartadas  destino');
    let mismatch = false;
    for (const r of report) {
      const after = await count(target, r.table);
      if (after !== r.copied) mismatch = true;
      console.log(
        `${r.table.padEnd(24)} ${String(r.source).padStart(6)}  ${String(r.copied).padStart(8)}  ${String(r.skipped).padStart(11)}  ${String(after).padStart(7)}`,
      );
    }
    if (mismatch) throw new Error('Contagem do destino diferente do copiado — verifique.');
    console.log('\nMigração de dados concluída.');
  } catch (error) {
    await target.rollback().catch(() => {});
    throw error;
  } finally {
    await source.end();
    await target.end();
  }
}

await main();

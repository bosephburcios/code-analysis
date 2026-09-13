import { node, type DetectionContext } from './types.ts';
export function detectDatabase({ files, manifests }: DetectionContext) {
  return files.filter(file => file.endsWith('.prisma')).map(file => {
    const provider = manifests[file]?.match(/provider\s*=\s*"(postgresql|mysql|sqlite|mongodb|sqlserver|cockroachdb)"/)?.[1];
    const names: Record<string, string> = { postgresql: 'PostgreSQL', mysql: 'MySQL', sqlite: 'SQLite', mongodb: 'MongoDB', sqlserver: 'SQL Server', cockroachdb: 'CockroachDB' };
    return node('database', provider ? `Prisma / ${names[provider]}` : 'Prisma Database', file, file);
  });
}

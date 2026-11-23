# Lembretes do ensaio: véspera, no dia e 1 hora antes (#121) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar os lembretes do ensaio ("Ensaio em 30 min" e "Ensaio agora") por três avisos com o mesmo tag `setlist-{id}-ensaio`: véspera (24 h antes), no dia (8h00, ensaio às 11h00 ou depois) e 1 hora antes (retroativo), com aviso "Ensaio mudou" quando o horário muda.

**Architecture:** O planejador vira duas funções puras em `rehearsal.ts`: `dueRehearsalNotice` (qual aviso é devido agora, sem I/O) e `buildRehearsalReminder` (título e corpo, com a marca anterior já lida). `reminders.ts` consulta `setlists` com `rehearsalAt` em (agora, agora + 24 h], lê as marcas do repertório só quando há aviso devido, cria a marca com `create()` antes do envio e envia por `sendToDevices`. Nada muda em Rules, índices, `firebase.json`, variáveis ou `apps/web`.

**Tech Stack:** TypeScript strict, Firebase Admin (Firestore), Cloud Functions v2 (`onSchedule`), vitest.

**Spec:** Análise consolidada `C:\Users\Kaique\AppData\Local\Temp\claude\fe1fde71fa0b7744\27074a00-c26a-4a28-8bbc-f9dd9e039b6f\scratchpad\analise-121.md` (regras, 16 critérios, decisões). Os pontos em que o spec está errado ou incompleto estão na seção "Pontos do spec" abaixo; este plano segue a decisão escrita ali.

## Global Constraints

- Horas e dias sempre de Brasília (`America/Sao_Paulo`, UTC−3 fixo), pelos helpers existentes (`todayInSaoPaulo`, `formatSaoPauloHour`, `formatCultoDate`); nunca o fuso da máquina.
- Tag de todos os avisos do ensaio: `setlist-{setlistId}-ensaio`. Link: `/repertorios/{setlistId}`.
- Títulos e corpos exatos (pt-BR): `Ensaio amanhã às {hora}`; `Ensaio hoje às {hora}`; `Ensaio em 1 hora` (N ≥ 59) ou `Ensaio em {N} min`; `Ensaio mudou para {hora}` ou `Ensaio mudou para {dia-sem dd/mm} às {hora}`. Corpo de véspera, dia e mudou: `{rótulo} · {dia-sem dd/mm}. Toque para ver os louvores.`; corpo do 1 hora: `{rótulo} · {hoje|amanhã} às {hora}. Toque para ver os louvores.`. `{hora}` no formato `18h30`.
- Marca: `avisosEnviados/{setlistId}_{tipo}_{rehearsalAtMs}`, criada com `create()` antes do envio; `tipo` ∈ `vespera`, `dia`, `perto`. Marca legada `perto` vale para o aviso de 1 hora (sem migração).
- Interruptor `config/push.enabled === false` bloqueia os três; origem do aparelho e papel (membro/admin) seguem como hoje.
- Sem mudança em Rules, `firestore.indexes.json`, `firebase.json`, variáveis, `apps/web` ou nas travas (`.claude/`, `.github/workflows/`, `firebase.json`, `cors.json`, `AGENTS.md`, `CLAUDE.md`).
- Testes antes do código; testes rodam com `TZ=UTC` e `TZ=Asia/Tokyo`.
- Host com pouca memória: só `vitest run` focado nos arquivos listados (nunca a suíte inteira local); no máximo dois processos de teste ao mesmo tempo.

## Review Focus

1. Função parada por 15 min (cron atrasado) com ensaio a 40 min: o aviso de 1 hora ainda sai, uma vez, com "Ensaio em 40 min". Teste: T3 "cron atrasado".
2. Falha ao ler as marcas do repertório (Firestore indisponível) não cria marca nem perde o aviso: a execução seguinte envia. Teste: T3 "falha ao ler marcas".
3. Datas perto da meia-noite UTC: véspera e 1 hora usam o dia de Brasília ("dom 22/11" mesmo com UTC já em 23/11). Teste: T1 e T3 "perto da meia-noite UTC".
4. Ensaio com N arredondado (1 ms, 58 min 30 s): "Ensaio em 1 min" e "Ensaio em 1 hora" sem "0 min" ou "60 min". Teste: T1 tabela de N.
5. Repertório sem `rehearsalAt`, com `rehearsalAt` em texto, ou já passado: nenhum aviso, nenhum erro, nenhuma marca. Teste: T3 "sem hora ou passado" (reaproveita o teste atual).

## Pontos do spec (decisões deste plano)

- **Véspera (critério 1 errado):** o critério diz "entre 18h20:01 e 18h30:00" de sexta para um ensaio de sábado 18h30. A regra escrita na tabela (`rehearsalAt ∈ (agora + 24 h − 10 min, agora + 24 h]`) dá agora ∈ [18h30:00, 18h40:00) de sexta, que é a janela de tolerância do cron. O plano segue a regra escrita: testes em 18h29:59 (nada), 18h30:00 (sai), 18h40:00 (nada).
- **"No dia" e a folga de 3 h (decisão contraditória):** a decisão diz "pelo menos 3 h entre o aviso das 8h e o 1 hora", mas o critério 4 manda sair com ensaio às 11h00. Com ensaio às 11h00, o 1 hora sai às 10h00: são 2 h. O plano segue o critério 4 (11h00). Se a folga de 3 h importa, o limite passa a ser 12h00 (uma constante, `DIA_MIN_REHEARSAL_MINUTE`).
- **Janela do "no dia":** o critério 3 diz "entre 8h00 e 8h10". O plano usa [08h00:00, 08h10:00): às 08h10:00 exatos não sai.
- **"Ensaio em 30 min" (critério 7):** a string pode ainda aparecer pela forma `Ensaio em {N} min` quando o ensaio é gravado a 30 min. O que sai é o aviso fixo das 30 min. O teste prova que, em 60, 30 e 5 min antes, sai um único aviso (o de 1 hora).
- **"Mudou" com ensaio anterior já passado (lacuna):** a marca de maior `createdAt` pode ser de um ensaio já passado (repertório reaproveitado para outra data). Nesse caso o primeiro aviso da nova data sai como "Ensaio mudou para…". O plano segue o spec. Ajuste possível (uma linha em `lastRehearsalAt`): só considerar marcas com `rehearsalAt > now`. Decisão para o orquestrador antes do T1.
- **Texto do formulário fora do escopo:** `apps/web/src/setlists/SetlistFormDialog.tsx:220` diz "Quem ativou os avisos é lembrado 30 min antes e na hora.", que fica falso com este release. Trocar o texto mexe em `apps/web/src/setlists/`, trava de `teste-celular-ok` (AGENTS.md "Teste no celular"), e exige ajustar `SetlistFormDialog.test.tsx:293`, `e2e/setlists.spec.ts:620` e `docs/design-system.md:106`. Não está no plano: decisão da pessoa/product-owner, com nova entrega ou com este PR.
- **Leituras:** a leitura das marcas acontece antes do claim, então, enquanto o aviso está devido (até 60 leituras por ensaio na janela de 1 hora, 10 na véspera e 10 no dia), cada minuto lê as marcas, mesmo quando a marca já existe. Aceito: se a leitura falhar, nenhuma marca é criada e o aviso sai no minuto seguinte. Critério 8 vale para minutos sem aviso devido.
- **Paper:** artboard "31 · Aviso do sistema" pendente (designer). No PR: "Paper pendente: artboard 31 · Aviso do sistema (textos novos)".

## Tarefas e grupos

| Tarefa | Arquivos | Depende de | Grupo |
| --- | --- | --- | --- |
| T1 planejador | `apps/functions/src/push/rehearsal.ts`, `rehearsal.test.ts` | — | A |
| T2 consulta do repertório | `apps/functions/src/push/reminderDeps.ts`, `reminderDeps.test.ts` | — | A |
| T3 runner | `apps/functions/src/push/reminders.ts`, `reminders.test.ts` | T1 (exports) | B |
| T4 docs/sistema.md | `docs/sistema.md` | — | A |
| T5 docs/design-system.md | `docs/design-system.md` | — | A |
| T6 docs/deploy.md §16 | `docs/deploy.md` | — | A |
| T7 verificação | nenhum arquivo novo | T1–T6 | C |

Grupo A: T1, T2, T4, T5, T6 não compartilham arquivo e podem ir em paralelo. T4–T6 são só texto e podem ficar num único subagente, para poupar memória. T3 espera T1. Não há arquivo compartilhado entre tarefas.

Implementação: `backend-dev`, Haiku, effort low (pré-voo: Haiku high). Revisão por tarefa: `code-reviewer`, Haiku high. Sem QA (só Functions e docs).

---

### Task T1: Planejador (`rehearsal.ts`)

**Files:**
- Modify: `apps/functions/src/push/rehearsal.ts` (reescrito: sai `planRehearsalReminder`, `SOON_MS`, `NOW_MS`, `ReminderPlan`)
- Test: `apps/functions/src/push/rehearsal.test.ts` (reescrito; mantém os testes de `formatSaoPauloHour`, `formatSaoPauloDay` e `readRehearsalSetlist` que já existem)

**Interfaces:**
- Consumes: `todayInSaoPaulo(now: Date): string` (`apps/functions/src/stats/dates.ts`); `formatCultoDate(date: string): string | null`, `readSetlist`, `toDate` (`newSetlist.ts`); `SendInput` (`send.ts`); `Origin` (`token.ts`).
- Produces (usado pela T3):
  - `export const LOOKAHEAD_MS: number` = 24 h em ms.
  - `export type RehearsalTipo = 'vespera' | 'dia' | 'perto'`.
  - `export type RehearsalSetlist = { id: string; label: string; origin: Origin; rehearsalAt: Date; expiresAt: Date | undefined }` (sem mudança).
  - `export function dueRehearsalNotice(now: Date, rehearsalAt: Date): RehearsalTipo | null`.
  - `export function lastRehearsalAt(markers: Array<Record<string, unknown>>): Date | undefined`.
  - `export function buildRehearsalReminder(now: Date, setlist: RehearsalSetlist, tipo: RehearsalTipo, previous: Date | undefined): SendInput`.
  - Mantidos sem mudança: `formatSaoPauloHour(date: Date): string`, `formatSaoPauloDay(rehearsalAt: Date, now: Date): 'hoje' | 'amanhã'`, `readRehearsalSetlist(id, data)`.
  - Novo, interno ao módulo mas exportado para teste: `export function saoPauloMinuteOfDay(date: Date): number` (minutos desde 00h00 de Brasília).

- [ ] **Step 1: Escrever os testes (`rehearsal.test.ts`)**

Helper de teste: `const br = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00-03:00`);` (ex.: `br('2026-11-21', '18:30')`). `MIN = 60_000`, `HOUR = 60 * MIN`, `DAY = 24 * HOUR`. Dia de referência: sábado 21/11/2026; domingo 22/11; sexta 20/11.

Casos obrigatórios, cada um como `it.each` ou `it`:

- `dueRehearsalNotice` véspera: `(now = br('2026-11-20','18:30'), at = br('2026-11-21','18:30'))` → `'vespera'`. `at` = now + DAY − 9 min 59 s → `'vespera'`; at = now + DAY − 10 min → `null`; at = now + DAY + 1 ms → `null`.
- `dueRehearsalNotice` 1 hora: `at = now + 1 ms` → `'perto'`; `at = now + HOUR` → `'perto'`; `at = now + HOUR + 1` → `null`; `at = now` → `null`; `at = now − MIN` → `null`; `at = now + 20 min` → `'perto'`.
- `dueRehearsalNotice` "no dia" (dia de 21/11, ensaio às 18h30):
  - `now = br('2026-11-21','08:00')` → `'dia'`; `now = br('2026-11-21','08:09:59')` → `'dia'` (usar `'08:09:59'` aceita `HH:MM:SS`: ajustar o helper para aceitar `hh:mm` ou `hh:mm:ss`); `now = br(..., '08:10:00')` → `null`; `now = br(..., '07:59:59')` → `null`.
  - ensaio `br('2026-11-21','10:59')` com `now = 08:00` → `null`; ensaio `br('2026-11-21','11:00')` com `now = 08:00` → `'dia'`.
  - ensaio às 07h00 de sábado: `now = br('2026-11-20','07:00')` → `'vespera'`; `now = br('2026-11-21','06:00')` → `'perto'`; `now = br('2026-11-21','08:05')` → `null`.
- Perto da meia-noite UTC: `now = new Date('2026-11-22T02:40:00Z')` (sáb 23h40 de Brasília), `at = new Date('2026-11-22T03:10:00Z')` (dom 00h10) → `'perto'`; `at = now + DAY − 5 min` → `'vespera'`.
- `lastRehearsalAt`:
  - `[]` → `undefined`.
  - Três marcas (`vespera`, `perto`, `dia`) com `createdAt` distintos e `rehearsalAt` diferentes: devolve o `rehearsalAt` da de maior `createdAt` (a ordem do array não importa).
  - Marcas `agora` e `novo` com `createdAt` mais recente: ignoradas; sem outras marcas → `undefined`.
  - Marca sem `createdAt` ou sem `rehearsalAt`: ignorada.
  - `createdAt` e `rehearsalAt` no formato `{ toDate: () => Date }` (Timestamp do Admin SDK) e como `Date`: ambos aceitos.
- `formatSaoPauloHour`, `formatSaoPauloDay`, `readRehearsalSetlist`: manter os testes que já existem.
- `buildRehearsalReminder`, textos exatos (setlist `{ id: 'r1', label: 'Culto de domingo', origin: 'producao', rehearsalAt, expiresAt: undefined }`):
  - vespera, `rehearsalAt = br('2026-11-21','18:30')`, `now = br('2026-11-20','18:30')`, `previous = undefined` → `title: 'Ensaio amanhã às 18h30'`, `body: 'Culto de domingo · sáb 21/11. Toque para ver os louvores.'`, `tag: 'setlist-r1-ensaio'`, `link: '/repertorios/r1'`, `origin: 'producao'`, `respectSwitch: true`.
  - dia (mesmo ensaio, `now = br('2026-11-21','08:00')`) → `title: 'Ensaio hoje às 18h30'`, mesmo body.
  - perto, `now = NOW = br('2026-11-21','17:00')`: `at = now + N min` → título: 60 min → `'Ensaio em 1 hora'`; 59 min 30 s → `'Ensaio em 1 hora'`; 58 min 30 s → `'Ensaio em 1 hora'`; 58 min → `'Ensaio em 58 min'`; 20 min → `'Ensaio em 20 min'` e body `'Culto de domingo · hoje às 17h20. Toque para ver os louvores.'`; 1 ms → `'Ensaio em 1 min'`.
  - mudou, mesmo dia: `previous = br('2026-11-21','18:30')`, ensaio `br('2026-11-21','19:00')`, `tipo = 'perto'`, `now = br('2026-11-21','18:00')` → `title: 'Ensaio mudou para 19h00'`, body `'Culto de domingo · sáb 21/11. Toque para ver os louvores.'`.
  - mudou, dia diferente: `previous = br('2026-11-21','18:30')`, ensaio `br('2026-11-22','19:00')`, `tipo = 'vespera'`, `now = br('2026-11-21','19:00')` → `title: 'Ensaio mudou para dom 22/11 às 19h00'`, body `'Culto de domingo · dom 22/11. Toque para ver os louvores.'`.
  - `previous` igual ao horário do ensaio → título normal (`'Ensaio amanhã às 18h30'`).
  - origem `teste` segue para `origin`.

- [ ] **Step 2: Rodar e ver falhar**

Run (em `apps/functions`): `npx vitest run src/push/rehearsal.test.ts`
Expected: FAIL — `dueRehearsalNotice`, `lastRehearsalAt`, `buildRehearsalReminder` e `saoPauloMinuteOfDay` não exportados.

- [ ] **Step 3: Implementar `rehearsal.ts`**

Constantes (privadas, exceto `LOOKAHEAD_MS`): `MIN_MS = 60_000`, `HOUR_MS = 60 * MIN_MS`, `DAY_MS = 24 * HOUR_MS`, `VESPERA_WINDOW_MS = 10 * MIN_MS`, `PERTO_MS = HOUR_MS`, `DIA_START_MINUTE = 8 * 60`, `DIA_END_MINUTE = 8 * 60 + 10`, `DIA_MIN_REHEARSAL_MINUTE = 11 * 60`, `SAO_PAULO_OFFSET_MS = 3 * HOUR_MS`. `LOOKAHEAD_MS = DAY_MS`.

`dueRehearsalNotice`: a regra é a única lógica de janela; use esta ordem e estes limites:

```ts
const diff = rehearsalAt.getTime() - now.getTime();
if (diff <= 0) return null;
if (diff <= PERTO_MS) return 'perto';
if (diff <= DAY_MS && diff > DAY_MS - VESPERA_WINDOW_MS) return 'vespera';
const nowMinute = saoPauloMinuteOfDay(now);
if (
  nowMinute >= DIA_START_MINUTE &&
  nowMinute < DIA_END_MINUTE &&
  saoPauloMinuteOfDay(rehearsalAt) >= DIA_MIN_REHEARSAL_MINUTE &&
  todayInSaoPaulo(now) === todayInSaoPaulo(rehearsalAt)
) return 'dia';
return null;
```

`saoPauloMinuteOfDay`: subtrai `SAO_PAULO_OFFSET_MS` e devolve `getUTCHours() * 60 + getUTCMinutes()` (mesmo cálculo de `formatSaoPauloHour`).

`lastRehearsalAt`: percorre as marcas; considera só `tipo` ∈ {`vespera`, `dia`, `perto`} (função `isRehearsalTipo(value: unknown): value is RehearsalTipo`), com `toDate(createdAt)` e `toDate(rehearsalAt)` definidos; devolve o `rehearsalAt` da de maior `createdAt` (comparação em `getTime()`).

`buildRehearsalReminder`:
- `hour = formatSaoPauloHour(at)`; `weekdayDate = formatCultoDate(todayInSaoPaulo(at)) ?? ''` (nunca é `null` para uma data gerada por `todayInSaoPaulo`).
- `common = { link, tag, origin, respectSwitch: true }`.
- Se `previous !== undefined && previous.getTime() !== at.getTime()`: `sameDay = todayInSaoPaulo(previous) === todayInSaoPaulo(at)`; título `Ensaio mudou para ${hour}` (mesmo dia) ou `Ensaio mudou para ${weekdayDate} às ${hour}`; corpo `${label} · ${weekdayDate}. Toque para ver os louvores.`.
- Senão, `vespera` → `Ensaio amanhã às ${hour}`; `dia` → `Ensaio hoje às ${hour}`; corpo de ambos `${label} · ${weekdayDate}. Toque para ver os louvores.`.
- `perto`: `minutes = Math.max(1, Math.ceil((at − now) / MIN_MS))`; título `minutes >= 59 ? 'Ensaio em 1 hora' : \`Ensaio em ${minutes} min\``; corpo `${label} · ${formatSaoPauloDay(at, now)} às ${hour}. Toque para ver os louvores.`.

- [ ] **Step 4: Rodar com os dois fusos**

Run (Git Bash, em `apps/functions`): `TZ=UTC npx vitest run src/push/rehearsal.test.ts` e `TZ=Asia/Tokyo npx vitest run src/push/rehearsal.test.ts`
Expected: PASS nos dois.

- [ ] **Step 5: Commit**

```bash
git add apps/functions/src/push/rehearsal.ts apps/functions/src/push/rehearsal.test.ts
git commit -m "feat(push): planejador dos lembretes do ensaio (véspera, dia e 1 hora) (#121)"
```

---

### Task T2: Consulta do repertório (`reminderDeps.ts`)

**Files:**
- Modify: `apps/functions/src/push/reminderDeps.ts`
- Test: `apps/functions/src/push/reminderDeps.test.ts`

**Interfaces:**
- Consumes: nada de T1.
- Produces (usado pela T3): `createReminderDeps(): ReminderDeps` com `listRehearsalSetlists(after: Date, until: Date)` que consulta `rehearsalAt` em (after, until] e `listRehearsalMarkers(setlistId)` (sem mudança).

- [ ] **Step 1: Ajustar o teste**

Em `reminderDeps.test.ts`, o teste de `listRehearsalSetlists` passa a esperar:

```ts
expect(fs.wheres).toEqual([
  ['rehearsalAt', '>', from],
  ['rehearsalAt', '<=', to],
]);
```

Renomear o `it` para `'consulta setlists por rehearsalAt em (after, until], com id e dados'`. O teste de `listRehearsalMarkers` não muda.

- [ ] **Step 2: Rodar e ver falhar**

Run (em `apps/functions`): `npx vitest run src/push/reminderDeps.test.ts`
Expected: FAIL no primeiro `where` (`'>='` recebido).

- [ ] **Step 3: Implementar**

Em `reminderDeps.ts`, trocar `'>='` por `'>'` no campo `rehearsalAt`; atualizar o comentário do `listRehearsalSetlists` para "(after, until]". Assinatura `(after, until)`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/push/reminderDeps.test.ts` (com `TZ=UTC` e `TZ=Asia/Tokyo`)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/functions/src/push/reminderDeps.ts apps/functions/src/push/reminderDeps.test.ts
git commit -m "feat(push): consulta de ensaios em (agora, agora + 24 h] (#121)"
```

---

### Task T3: Runner (`reminders.ts`)

**Files:**
- Modify: `apps/functions/src/push/reminders.ts` (reescrito: sai `earlierSoonTimes`, `NOW_MS`, `SOON_MS`, `toDate`)
- Test: `apps/functions/src/push/reminders.test.ts` (reescrito)

**Interfaces:**
- Consumes (T1): `dueRehearsalNotice`, `lastRehearsalAt`, `buildRehearsalReminder`, `readRehearsalSetlist`, `LOOKAHEAD_MS`, `RehearsalSetlist`, `RehearsalTipo`. Consumes (T2): `createReminderDeps` (só o tipo `ReminderDeps` aqui; a implementação não muda).
- Produces: `export type ReminderDeps = PushDeps & MarkerDeps & { listRehearsalSetlists(after: Date, until: Date): Promise<Array<{ id: string; data: Record<string, unknown> }>>; listRehearsalMarkers(setlistId: string): Promise<Array<Record<string, unknown>>> }`; `export type ReminderRun = { sent; already; blocked; failed }` (sem mudança); `export function runRehearsalReminders(deps: ReminderDeps): Promise<ReminderRun>`.

- [ ] **Step 1: Escrever os testes (`reminders.test.ts`)**

Estrutura: `setup(docs, now, fake?, markers?)` que usa `fakeDeps(fake)`, seta `clock.now = now` e devolve `{ reminderDeps, calls, store, clock, reads }`, onde `reads.setlists: Array<[Date, Date]>` registra a consulta e `reads.markers: string[]` registra cada leitura de marcas. `listRehearsalSetlists` devolve o array `docs` (o teste pode trocar `docs[0]` para simular mudança de horário). `claimMarker` usa o `store` (mesmo código atual). `members = { roles: { m1: 'member', a1: 'admin' } }`. Dispositivo: `device('t1', 'm1')`. Data de referência: `br(day, hhmm)` como em T1.

Testes (nomes e asserções exatos):

1. `'consulta (agora, agora + 24 h] e não lê marcas sem aviso devido'`: now = `br('2026-11-21','12:00')`, ensaio `br('2026-11-22','18:30')`. `reads.setlists` = `[[now, now + 24 h]]`; `reads.markers` = `[]`; resultado `{ sent: 0, already: 0, blocked: 0, failed: 0 }`.
2. `'véspera: sexta 18h30 avisa "Ensaio amanhã às 18h30", uma vez'`: now `br('2026-11-20','18:30')`, ensaio `br('2026-11-21','18:30')`, devices `[device('t1','m1')]`. Primeira execução `{ sent: 1, ... }`; `calls.flat()[0].message` = `{ title: 'Ensaio amanhã às 18h30', body: 'Culto de domingo · sáb 21/11. Toque para ver os louvores.', tag: 'setlist-r1-ensaio', link: 'https://louvor-hajaluz.web.app/repertorios/r1' }`; segunda execução no mesmo minuto → `already: 1`; `store` tem a chave `r1_vespera_<ms do ensaio>` com `tipo: 'vespera'`.
3. `'véspera: fora da janela não sai'`: now `br('2026-11-20','18:29:59')` → 0 envios; now `br('2026-11-20','18:40:00')` → 0 envios.
4. `'repertório gravado depois da véspera não recebe véspera'`: now `br('2026-11-20','18:45')`, ensaio `br('2026-11-21','18:30')` → 0 envios e `reads.markers` vazio.
5. `'ensaio às 7h: véspera às 7h do dia anterior e 1 hora às 6h, sem no dia'`: ensaio `br('2026-11-21','07:00')`; now `br('2026-11-20','07:00')` → título `'Ensaio amanhã às 07h00'`; now `br('2026-11-21','06:00')` → `'Ensaio em 1 hora'`; now `br('2026-11-21','08:05')` → nada. Títulos em `calls.flat().map((m) => m.message.title)` = `['Ensaio amanhã às 07h00', 'Ensaio em 1 hora']`.
6. `'no dia: ensaio às 18h30, às 08h00 sai "Ensaio hoje às 18h30"; às 08h10 não sai'`: now `br('2026-11-21','08:00')` → título `'Ensaio hoje às 18h30'`; now `br('2026-11-21','08:10')` → 0 envios.
7. `'no dia: ensaio às 10h59 não recebe; às 11h00 recebe'`: now `08:05`, ensaio `10:59` → 0; ensaio `11:00` → título `'Ensaio hoje às 11h00'`.
8. `'no dia: repertório gravado às 08h20 não recebe'`: now `br('2026-11-21','08:20')`, ensaio `18:30` → 0 envios.
9. `'1 hora: gravado 20 min antes sai na hora, com "Ensaio em 20 min"'`: now `br('2026-11-21','17:00')`, ensaio `br('2026-11-21','17:20')` → título `'Ensaio em 20 min'`, body `'Culto de domingo · hoje às 17h20. Toque para ver os louvores.'`.
10. `'1 hora: um único aviso para 60, 30 e 5 min antes (sem aviso de 30 min)'`: ensaio `br('2026-11-21','18:00')`; execuções em `17:00`, `17:30`, `17:55` e `17:01` → `calls.flat()` tem 1 mensagem, com título `'Ensaio em 1 hora'`; soma de `sent` = 1.
11. `'1 hora: 61 min antes não sai; ensaio passado não sai'`: now `17:00`, ensaio `18:01` → 0; ensaio `16:59` → 0.
12. `'cron atrasado: parado 15 min, ensaio a 40 min ainda sai o 1 hora'`: now `br('2026-11-21','17:25')` (após uma execução que não rodou), ensaio `br('2026-11-21','18:05')` → título `'Ensaio em 40 min'`, sent 1.
13. `'marca perto antiga do mesmo horário impede novo 1 hora (deploy)'`: marcas `[ ['r1_perto_<ms>', { setlistId: 'r1', tipo: 'perto', rehearsalAt: ensaio, createdAt: now-1h }] ]`, now `17:00`, ensaio `17:20` → `already: 1`, 0 envios.
14. `'marcas "agora" e "novo" não contam como mudança'`: marcas `agora` (ensaio outro horário, createdAt mais recente) e `{id}_novo` (sem `rehearsalAt`); now `17:00`, ensaio `17:20` → título `'Ensaio em 20 min'`.
15. `'mudou no mesmo dia: "Ensaio mudou para 19h00"; o aviso seguinte volta ao normal'`: marca `vespera` antiga com `rehearsalAt = br('2026-11-22','18:30')` e `createdAt = br('2026-11-21','18:30')` (inclusive no `store`, chave `r1_vespera_<ms de 18h30 de domingo>`). Ensaio atual `br('2026-11-22','19:00')`, now `br('2026-11-21','19:00')` (diff de 24 h → véspera) → título `'Ensaio mudou para 19h00'`. Depois: now `br('2026-11-22','08:00')` → título `'Ensaio hoje às 19h00'` (normal, a marca de maior `createdAt` agora é a véspera do ensaio atual).
16. `'mudou em outro dia: "Ensaio mudou para sáb 21/11 às 20h00"'`: marca `vespera` antiga com `rehearsalAt = br('2026-11-20','23:30')` (sexta) e `createdAt = br('2026-11-19','23:30')`. Ensaio atual `br('2026-11-21','20:00')` (sábado), now `br('2026-11-20','20:00')` (sexta; diff de 24 h → véspera) → título `'Ensaio mudou para sáb 21/11 às 20h00'`, body `'Culto de domingo · sáb 21/11. Toque para ver os louvores.'`. Os valores são escolhidos para que o ensaio antigo ainda esteja no futuro em relação a `now` e as marcas tenham `createdAt` anterior a `now`.
17. `'A→B→A: volta ao horário já enviado não reenvia; tipo ainda não enviado para A sai'`: `docs[0]` = ensaio A `br('2026-11-22','18:30')`; now `br('2026-11-21','18:30')` → vespera A enviada ("Ensaio amanhã às 18h30"). Troca para B: `docs[0]` = ensaio `br('2026-11-22','19:00')`; now `br('2026-11-21','19:00')` (diff de 24 h → véspera) → título `'Ensaio mudou para 19h00'`. Volta para A: `docs[0]` = ensaio A; now `br('2026-11-21','18:31')` → `already: 1`. Depois now `br('2026-11-22','17:30')` (diff de 1 h para o ensaio A → perto); `previous` = B (maior `createdAt`, sábado 19h00) → título `'Ensaio mudou para 18h30'`, sent 1.
18. `'config/push desligado: marca criada, nenhum envio'`: vespera, now `br('2026-11-20','18:30')`, `config: { enabled: false }` → `blocked: 1`, `calls` vazio, marca existe.
19. `'só aparelhos da mesma origem; link do domínio de teste'`: repertório com `origin: 'teste'`, perto de 10 min; devices `device('t1','m1','producao')` e `device('t2','m1','teste')` → só `t2`, link `https://louvor-hajaluz-teste.web.app/repertorios/r1`.
20. `'FCM indisponível: conta a falha e não reenvia no minuto seguinte'`: `sendBatch` lança erro com `code: 'messaging/internal-error'`; primeira execução `failed: 1`; execução seguinte `already: 1`.
21. `'falha ao ler marcas: nenhuma marca, nenhum envio; o minuto seguinte envia'`: `listRehearsalMarkers` lança na primeira execução (com aviso devido); resultado `failed: 1`; `store` vazio; depois, com leitura normal, `sent: 1`.
22. `'erro ao criar a marca: loga só o código e segue com os outros'`: mesmo teste atual, com repertórios `r1` e `r2` na janela de 1 hora (ensaio 20 min). Resultado `{ sent: 1, failed: 1 }`; log `push: falha no lembrete do ensaio` com `{ setlistId: 'r1', code: 'unavailable' }`; sem o segredo.
23. `'repertórios diferentes na mesma execução não interferem'`: r1 ensaio 17:30 (now 17:10, título `'Ensaio em 20 min'`, tag `setlist-r1-ensaio`); r2 ensaio 18:10 com marca `perto` antiga de outro horário → título `'Ensaio mudou para 18h10'`, tag `setlist-r2-ensaio`. Cada um com uma mensagem.
24. `'perto da meia-noite UTC: véspera e 1 hora usam o dia de Brasília'`: now `new Date('2026-11-22T02:40:00Z')` (sáb 23h40 de Brasília), ensaio `new Date('2026-11-23T02:35:00Z')` (dom 23h35 de Brasília) → título `'Ensaio amanhã às 23h35'`, body `'Culto de domingo · dom 22/11. Toque para ver os louvores.'`.
25. `'sem hora gravada, ou com a hora passada, não envia nem falha'` (mantido do teste atual, adaptado a `now` = `br('2026-11-21','17:00')`).
26. Log: `'sem nada a fazer, não loga'` (mantido); `'com envio, loga só as contagens'` (mantido, com `'push: lembretes do ensaio'`).

- [ ] **Step 2: Rodar e ver falhar**

Run (em `apps/functions`): `npx vitest run src/push/reminders.test.ts`
Expected: FAIL (o runner atual ainda usa a janela de 30 min e lê marcas a cada minuto).

- [ ] **Step 3: Implementar `reminders.ts`**

- `remind(deps, setlist, now, run)`:
  1. `tipo = dueRehearsalNotice(now, setlist.rehearsalAt)`; se `null`, retorna (sem leitura de marcas).
  2. `previous = lastRehearsalAt(await deps.listRehearsalMarkers(setlist.id))` (só aqui, com aviso devido; leitura antes do claim).
  3. `input = buildRehearsalReminder(now, setlist, tipo, previous)`.
  4. `rehearsalAtMs = setlist.rehearsalAt.getTime()`; `claimMarker(\`${setlist.id}_${tipo}_${rehearsalAtMs}\`, { setlistId, tipo, rehearsalAt: new Date(rehearsalAtMs), createdAt: now, expiresAt: markerExpiresAt(now, setlist.expiresAt) })`.
  5. `'exists'` → `run.already += 1` e retorna. Senão `sendToDevices(deps, input)`; `blocked` → `run.blocked += 1`; senão soma `sent` e `failed`.
- `runRehearsalReminders(deps)`: `now = deps.now()`; `docs = await deps.listRehearsalSetlists(now, new Date(now.getTime() + LOOKAHEAD_MS))`; para cada doc, `readRehearsalSetlist` e `remind` dentro de `try/catch` (mesmo código de log atual, com `'push: falha no lembrete do ensaio'` e `{ setlistId, code: failureCode(error) }`). Log final `'push: lembretes do ensaio'` só se houve contagem > 0.
- Remover imports não usados (`toDate`, `NOW_MS`, `SOON_MS`).
- O comentário de cabeçalho da função muda para: "Avisa os ensaios com horário em (agora, agora + 24 h]: véspera, no dia e 1 hora antes."

- [ ] **Step 4: Rodar com os dois fusos**

Run (em `apps/functions`): `TZ=UTC npx vitest run src/push/reminders.test.ts` e `TZ=Asia/Tokyo npx vitest run src/push/reminders.test.ts`
Expected: PASS nos dois. Também `npx vitest run src/push/reminderSchedule.test.ts` PASS (não muda).

- [ ] **Step 5: Commit**

```bash
git add apps/functions/src/push/reminders.ts apps/functions/src/push/reminders.test.ts
git commit -m "feat(push): lembretes do ensaio com marca do horário anterior e aviso de mudança (#121)"
```

---

### Task T4: `docs/sistema.md`

**Files:**
- Modify: `docs/sistema.md`

**Interfaces:** nenhuma (só texto; o texto segue a Global Constraints).

- [ ] **Step 1: Verificação antes**

Run: `wc -l docs/sistema.md`
Expected: `303`. O resultado final tem de ser menor que 303 (meta ≤ 300).

- [ ] **Step 2: Editar**

1. Linha da tabela de `avisosEnviados/{setlistId}_{perto\|agora}_{rehearsalAtMs}` (linha ~116): trocar a chave por `avisosEnviados/{setlistId}_{vespera\|dia\|perto}_{rehearsalAtMs}` e `tipo` por (`vespera`/`dia`/`perto`); manter o resto ("marca dos lembretes do ensaio (#102, #121)").
2. Linha da tabela `sendRehearsalReminders` (linha ~150): substituir a célula de descrição por: "Avisa o ensaio com horário em até 24 h: "Ensaio amanhã às HHhMM" (24 h antes), "Ensaio hoje às HHhMM" (08h00 do dia, ensaio às 11h00 ou depois) e "Ensaio em N min" / "Ensaio em 1 hora" (até 60 min antes, retroativo); uma vez por horário, a membros e admins, inclusive quem gravou; só aparelhos da mesma origem; respeita `config/push`".
3. Bloco "Regra dos lembretes do ensaio" (linhas ~171–176), 4 bullets (mesmo número de linhas, sem bullet novo):
   - "Agendada a cada minuto; consulta `setlists` com `rehearsalAt` em (agora, agora + 24 h]. Marcas só são lidas quando há aviso devido."
   - "Três avisos, cada um numa faixa: véspera (ensaio em (agora + 24 h − 10 min, agora + 24 h]); no dia (agora entre 08h00 e 08h10 de Brasília, ensaio no mesmo dia às 11h00 ou depois); 1 hora (ensaio em (agora, agora + 60 min]; é o único retroativo). Todos com a tag `setlist-{id}-ensaio`, que substitui o aviso anterior no aparelho."
   - "Uma vez por horário: `avisosEnviados/{setlistId}_{tipo}_{rehearsalAtMs}` é criada antes do envio. Marca antiga `perto` vale para o aviso de 1 hora."
   - "Horário mudou: se a marca de maior `createdAt` entre véspera, dia e 1 hora (marcas `agora` e de repertório novo não contam) é de outro horário, o título vira `Ensaio mudou para HHhMM` (mesmo dia) ou `Ensaio mudou para dom 22/11 às HHhMM`. Horas e datas em Brasília (UTC−3, sem horário de verão); sem `rehearsalAt`, ou com a hora passada, não avisa."
4. Bullets de "Limites conhecidos" sobre lembretes do ensaio (3 bullets, linhas ~283–285): trocar por 2:
   - "Lembretes do ensaio: até 1 min de atraso (cron). Se a função ficar parada por mais de 10 min, o aviso da véspera ou do dia daquela janela se perde. Falha de envio depois da marca perde o aviso (sem reenvio); com `config/push.enabled === false`, a marca é criada e nada sai. Sem horário de silêncio na v1."
   - "Lembretes do ensaio: A → B → A não reenvia o horário já avisado, mas pode enviar um tipo ainda não enviado para A. O "mudou" chega no próximo aviso devido, que pode ser horas depois. Marca de ensaio já passado conta para o "mudou" do próximo ensaio do mesmo repertório (ver ponto aberto do spec #121)."
5. Pendências: sem mudança (a linha do §16 continua).

- [ ] **Step 3: Verificação**

Run: `wc -l docs/sistema.md` → menor que `303`. Run: `git grep -n "Ensaio em 30\|Ensaio agora\|30 min antes\|perto\\|agora" -- docs/sistema.md`. Expected: nenhum hit para "Ensaio em 30" / "Ensaio agora"; "agora" só nos sentidos gerais (ex.: "agora + 24 h").

- [ ] **Step 4: Commit**

```bash
git add docs/sistema.md
git commit -m "docs(sistema): lembretes do ensaio na véspera, no dia e 1 hora antes (#121)"
```

---

### Task T5: `docs/design-system.md`

**Files:**
- Modify: `docs/design-system.md` (linha ~117, bullet "Aviso do sistema" em "Textos fixos dos avisos")

**Interfaces:** nenhuma.

- [ ] **Step 1: Verificação antes**

Run: `git grep -n "Ensaio agora\|Ensaio em {N} min" -- docs/design-system.md`
Expected: 1 hit (linha ~117).

- [ ] **Step 2: Editar**

Substituir o bullet "Aviso do sistema" pelo texto:

"- Aviso do sistema: "Novo repertório" / "{rótulo} · {dia} {dd/mm}"; "Ensaio amanhã às {hora}" / "{rótulo} · {dia-sem dd/mm}. Toque para ver os louvores." (24 h antes); "Ensaio hoje às {hora}" / mesmo corpo (08h00 do dia do ensaio, só para ensaio às 11h00 ou depois); "Ensaio em 1 hora" ou "Ensaio em {N} min" / "{rótulo} · {hoje|amanhã} às {hora}. Toque para ver os louvores." (até 60 min antes; N ≥ 59 vira "1 hora"); "Ensaio mudou para {hora}" ou "Ensaio mudou para {dia-sem dd/mm} às {hora}" / "{rótulo} · {dia-sem dd/mm}. Toque para ver os louvores."; "Aviso de teste" / "Está tudo certo. Você vai receber os avisos do Church Cifras neste aparelho.". `{hora}` no formato `18h30`; `{dia-sem dd/mm}` no formato `sáb 21/11`."

Não mexer na linha 106 (texto do formulário; ver ponto do spec).

- [ ] **Step 3: Verificação**

Run: `git grep -n "Ensaio agora" -- docs/design-system.md` → sem hit.
Run (em `/c/Users/Kaique/orca/workspaces/church-cifras/121-lembretes-ensaio`): `npm run test:harness` → PASS (confere tokens; este texto não é token).

- [ ] **Step 4: Commit**

```bash
git add docs/design-system.md
git commit -m "docs(design): textos dos lembretes do ensaio (#121)"
```

---

### Task T6: `docs/deploy.md` §16

**Files:**
- Modify: `docs/deploy.md` (§16, linhas 211–222)

**Interfaces:** nenhuma. O roteiro de aparelho é o passo da pessoa e vai na mensagem final do orquestrador também.

- [ ] **Step 1: Verificação antes**

Run: `git grep -n "Ensaio agora\|30 min\|Ensaio em N min" -- docs/deploy.md`
Expected: hits no parágrafo "Teste no aparelho" (linha 222). O §16 cita "agora", então precisa de atualização.

- [ ] **Step 2: Editar**

No §16, trocar o parágrafo "**Teste no aparelho (passo da pessoa, critério 8 da #102):** ..." por:

"**Teste no aparelho (passo da pessoa, critério 8 da #102; atualizado pela #121):** Android e iPhone com iOS 16.4+, com o app instalado em produção (`https://louvor-hajaluz.web.app`) e os avisos ativados. Crie o repertório também em produção: aparelho só recebe aviso de repertório da mesma origem. Com um ensaio marcado para amanhã, às HHhMM: chega "Ensaio amanhã às HHhMM" na véspera, entre HHhMM e HHhMM+10 min (horário de Brasília), com o app fechado. No dia, entre 08h00 e 08h10, se o ensaio for às 11h00 ou depois: "Ensaio hoje às HHhMM". Uma hora antes: "Ensaio em 1 hora". Mude a hora do ensaio depois de um aviso: chega "Ensaio mudou para HHhMM" (ou "Ensaio mudou para dom 22/11 às HHhMM", se o dia mudou) uma vez, na execução seguinte. Desligue `config/push` (`enabled: false`) e confira que nada chega."

Acrescentar uma linha em "Depois do deploy": "- Sem migração: marcas antigas `perto` e `agora` ficam; o aviso de 1 hora de um ensaio já avisado com 30 min não se repete."

- [ ] **Step 3: Verificação**

Run: `git grep -n "Ensaio agora\|30 min" -- docs/deploy.md` → nenhum hit no §16 (outros hits fora do §16 não existem).

- [ ] **Step 4: Commit**

```bash
git add docs/deploy.md
git commit -m "docs(deploy): roteiro de aparelho dos lembretes do ensaio (#121)"
```

---

### Task T7: Verificação final (sem arquivo novo)

**Depends on:** T1–T6.

- [ ] **Step 1: Testes focados, nos dois fusos**

Run (em `apps/functions`): `TZ=UTC npx vitest run src/push/rehearsal.test.ts src/push/reminders.test.ts src/push/reminderDeps.test.ts src/push/reminderSchedule.test.ts src/push/markers.test.ts`
Run: a mesma linha com `TZ=Asia/Tokyo`.
Expected: todos PASS nos dois.

- [ ] **Step 2: Tipos e lint (só o necessário)**

Run (na raiz): `npm run typecheck -w @cifras/functions`
Run (na raiz): `npx eslint apps/functions/src/push/rehearsal.ts apps/functions/src/push/reminders.ts apps/functions/src/push/reminderDeps.ts`
Expected: sem erro. Se a memória não permitir, deixar para o CI e registrar na Análise.

- [ ] **Step 3: Textos antigos fora dos históricos**

Run: `git grep -n "Ensaio em 30 min\|Ensaio agora\|sendRehearsal.*30 min" -- apps/functions docs/sistema.md docs/design-system.md docs/deploy.md`
Expected: nenhum hit (`docs/superpowers/plans/2026-11-21-*` e `2026-11-22-*` são históricos e não são editados).

- [ ] **Step 4: Tamanho do sistema.md**

Run: `wc -l docs/sistema.md`
Expected: menor que `303`.

- [ ] **Step 5: Harness**

Run (na raiz): `npm run test:harness`
Expected: PASS.

PR (não é este plano que abre): corpo com "Parte de"/"Resolve #121"; "Paper pendente: artboard 31 · Aviso do sistema (textos novos)"; "Teste no celular: não exigido (só Functions e docs)"; "Mudanças em Rules, índices ou variáveis: nenhuma".

---

## Mapa de critérios para testes

| Critério | Prova |
| --- | --- |
| 1 véspera | T1 véspera (24 h, 24 h − 9 min 59 s, 24 h − 10 min, 24 h + 1 ms); T3 #2 e #3 (Fri 18h29:59 nada, 18h30 sai, 18h40 nada). Critério escrito diz 18h20:01: ver Pontos do spec |
| 2 ensaio às 7h | T3 #5 |
| 3 no dia 08h00–08h10 | T1 no dia (08:00, 08:09:59, 08:10, 07:59:59); T3 #6 |
| 4 10h59 / 11h00 | T1 no dia (10:59, 11:00); T3 #7 |
| 5 1 hora (0, N ≥ 59, N < 59, 61 min) | T1 perto e tabela de N; T3 #9, #10, #11 |
| 6 só 1 hora retroativo | T3 #4 (véspera gravada depois); T3 #8 (dia gravado às 08h20) |
| 7 sem "30 min" fixo nem "agora", passado não sai | T1 (0 ms → null; passado → null); T3 #10 (um aviso só), #11 |
| 8 consulta (agora, agora + 24 h], zero leituras sem devido | T2 (`>`); T3 #1 |
| 9 idempotência | T3 #2 (already); #13; teste existente de reentrega (concorrência) mantido em T3 |
| 10 marca `perto` legada impede; `agora`/`novo` fora do mudou | T3 #13, #14 |
| 11 mudou com data quando o dia muda, depois normal | T3 #15, #16; T1 mudou (mesmo dia, dia diferente, igual) |
| 12 A→B→A | T3 #17 |
| 13 interruptor e origem e papel | T3 #18, #19 (e testes atuais de `send.ts`, sem mudança) |
| 14 Brasília, TZ=UTC e TZ=Asia/Tokyo, meia-noite UTC | T1 e T3 #24; T7 Step 1 nos dois fusos |
| 15 repertórios independentes | T3 #23 |
| 16 roteiro de aparelho | T6 (§16); mensagem final do orquestrador |

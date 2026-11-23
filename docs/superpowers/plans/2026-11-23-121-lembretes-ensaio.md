# Lembretes do ensaio: véspera, no dia e 1 hora antes (#121) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar os lembretes do ensaio ("Ensaio em 30 min" e "Ensaio agora") por três avisos com o mesmo tag `setlist-{id}-ensaio`: véspera (24 h antes), no dia (8h00, ensaio às 11h00 ou depois) e 1 hora antes (retroativo), com aviso "Ensaio mudou" quando o horário muda.

**Architecture:** O planejador ganha duas funções puras em `rehearsal.ts`: `dueRehearsalNotice` (qual aviso é devido agora, sem I/O) e `buildRehearsalReminder` (título e corpo, com a marca anterior já lida). As funções antigas saem na T3. `reminders.ts` consulta `setlists` com `rehearsalAt` em (agora, agora + 24 h], lê as marcas do repertório só quando há aviso devido, cria a marca com `create()` antes do envio e envia por `sendToDevices`. Nada muda em Rules, índices, `firebase.json` ou variáveis. Em `apps/web` muda só o texto de ajuda do formulário (T8).

**Tech Stack:** TypeScript strict, Firebase Admin (Firestore), Cloud Functions v2 (`onSchedule`), vitest.

**Spec:** a seção "Spec colada" abaixo (regras e 16 critérios da Análise da #121, já com as decisões 1 e 4 do orquestrador aplicadas). Os pontos em que o spec estava errado ou incompleto estão em "Pontos do spec", todos resolvidos.

## Spec colada

### Regras

Três avisos, todos com a tag `setlist-{id}-ensaio` (um substitui o anterior no aparelho). "Ensaio em 30 min" e "Ensaio agora" saem.

| Aviso | Quando | Janela | Supressão | Título | Corpo |
| --- | --- | --- | --- | --- | --- |
| Véspera | 24 h antes do ensaio | 10 min | — | `Ensaio amanhã às 18h30` | `{rótulo} · sáb 21/11. Toque para ver os louvores.` |
| No dia | 8h00 do dia do ensaio | 8h00–8h10 | ensaio antes das 11h00 | `Ensaio hoje às 18h30` | `{rótulo} · sáb 21/11. Toque para ver os louvores.` |
| 1 hora antes | `rehearsalAt` em (agora, agora + 60 min] | a própria faixa | — | `Ensaio em 1 hora` (N ≥ 59) ou `Ensaio em {N} min` | `{rótulo} · {hoje\|amanhã} às {hora}. Toque para ver os louvores.` |
| Mudou | no lugar do título do próximo aviso devido | a do aviso | — | `Ensaio mudou para 19h00` (mesmo dia) ou `Ensaio mudou para dom 22/11 às 19h00` | `{rótulo} · {dia-sem dd/mm}. Toque para ver os louvores.` |

- Véspera e "no dia" não são retroativos; o "1 hora" é (hora gravada a 20 min avisa "Ensaio em 20 min").
- Consulta `rehearsalAt` em (agora, agora + 24 h]; marcas só lidas quando há aviso devido.
- "Mudou": a marca de maior `createdAt` (véspera, dia ou 1 hora) cujo `rehearsalAt` ainda não passou foi para outro horário. Marca de ensaio já passado não conta (ajuste da decisão 3 do orquestrador, incorporado aqui).

### Critérios de aceite

1. [U] Ensaio sáb 18h30: véspera na sexta entre 18h30:00 e 18h40:00 (Brasília; às 18h40:00 já não sai), com os textos acima; fora disso, nada.
2. [U] Ensaio às 7h: véspera às 7h do dia anterior e "1 hora" às 6h; sem "no dia".
3. [U] "No dia" entre 8h00 e 8h10; depois de 8h10, não sai.
4. [U] Ensaio às 10h59 não recebe "no dia"; às 11h00 recebe.
5. [U] "1 hora": (agora, agora + 60 min]; N ≥ 59 → "Ensaio em 1 hora", senão "Ensaio em N min"; agora + 61 min não gera.
6. [U] Só o "1 hora" é retroativo; repertório gravado depois da janela da véspera ou do "no dia" não recebe esses avisos.
7. [U] Não há mais um aviso fixo de 30 min nem o "Ensaio agora"; `Ensaio em {N} min` pode dizer 30 quando o ensaio é gravado 30 min antes; ensaio já passado não gera aviso.
8. [U] Consulta (agora, agora + 24 h]; zero leituras de marcas num minuto sem aviso devido.
9. [U] Idempotência: uma marca por tipo e horário; a segunda execução devolve `already`.
10. [U] Marca antiga `perto` do mesmo horário impede um segundo "1 hora" no deploy; marcas `agora` e `{id}_novo` ficam fora da regra do "mudou".
11. [U] Horário mudou depois de um aviso: o próximo sai com "mudou" (com data quando o dia mudou); o seguinte, com o texto normal.
12. [U] A→B→A não reenvia o tipo já enviado para A; um tipo ainda não enviado para A sai.
13. [U] `config/push.enabled === false` bloqueia os três; `origin` e papel continuam valendo.
14. [U] Datas e horas em Brasília pelos helpers; testes com `TZ=UTC` e `TZ=Asia/Tokyo`, incluindo perto da meia-noite UTC.
15. [U] Repertórios diferentes na mesma execução não interferem.
16. [A] Roteiro de aparelho na mensagem final; entrega só de Functions vai direto à produção.

## Pré-requisitos

- `node_modules` instalado na raiz (`npm ci`), feito pelo orquestrador antes do despacho. Nenhuma tarefa roda `npm ci`.
- Host com Node v24 (engines 22): aceito, como nas entregas anteriores; o CI roda Node 22.

## Global Constraints

- Horas e dias sempre de Brasília (`America/Sao_Paulo`, UTC−3 fixo), pelos helpers existentes (`todayInSaoPaulo`, `formatSaoPauloHour`, `formatCultoDate`); nunca o fuso da máquina.
- Tag de todos os avisos do ensaio: `setlist-{setlistId}-ensaio`. Link: `/repertorios/{setlistId}`.
- Títulos e corpos exatos (pt-BR): `Ensaio amanhã às {hora}`; `Ensaio hoje às {hora}`; `Ensaio em 1 hora` (N ≥ 59) ou `Ensaio em {N} min`; `Ensaio mudou para {hora}` ou `Ensaio mudou para {dia-sem dd/mm} às {hora}`. Corpo de véspera, dia e mudou: `{rótulo} · {dia-sem dd/mm}. Toque para ver os louvores.`; corpo do 1 hora: `{rótulo} · {hoje|amanhã} às {hora}. Toque para ver os louvores.`. `{hora}` no formato `18h30`.
- Marca: `avisosEnviados/{setlistId}_{tipo}_{rehearsalAtMs}`, criada com `create()` antes do envio; `tipo` ∈ `vespera`, `dia`, `perto`. Marca legada `perto` vale para o aviso de 1 hora (sem migração).
- Interruptor `config/push.enabled === false` bloqueia os três; origem do aparelho e papel (membro/admin) seguem como hoje.
- Sem mudança em Rules, `firestore.indexes.json`, `firebase.json`, variáveis nem nas travas (`.claude/`, `.github/workflows/`, `firebase.json`, `cors.json`, `AGENTS.md`, `CLAUDE.md`). `apps/web` muda só o texto de ajuda do formulário (T8).
- Helper de data nos dois arquivos de teste (idêntico em T1 e T3): `const br = (day: string, t: string) => new Date(\`${day}T${t.length === 5 ? \`${t}:00\` : t}-03:00\`);` (aceita `hh:mm` e `hh:mm:ss`). Cada arquivo de teste começa com a asserção-guarda `expect(br('2026-11-21', '08:09:59').getTime()).not.toBeNaN();`. Constantes: `MIN = 60_000`, `HOUR = 60 * MIN`, `DAY = 24 * HOUR`.
- Testes rodam com `TZ=UTC` e `TZ=Asia/Tokyo`. Esses comandos `TZ=...` são de Git Bash (não funcionam no PowerShell).
- Comandos de teste: sempre arquivos explícitos. Nunca `npm test` (raiz ou `apps/functions`) nem filtro de diretório. Máximo de dois processos de teste ao mesmo tempo.
- Cada tarefa termina verde: testes da tarefa e `npm run typecheck -w @cifras/functions` (T1–T3).
- Um commit por vez na worktree: o índice do git é único. O orquestrador não deixa dois subagentes commitarem ao mesmo tempo.

## Review Focus

1. Função parada por 15 min (cron atrasado) com ensaio a 40 min: o aviso de 1 hora ainda sai, uma vez, com "Ensaio em 40 min". Teste: T3 #12.
2. Falha ao ler as marcas do repertório (Firestore indisponível) não cria marca nem perde o aviso: a execução seguinte envia. Teste: T3 #21.
3. Datas perto da meia-noite UTC: véspera e 1 hora usam o dia de Brasília ("dom 22/11" mesmo com UTC já em 23/11). Teste: T1 e T3 #24.
4. Ensaio com N arredondado (1 ms, 58 min 30 s): "Ensaio em 1 min" e "Ensaio em 1 hora" sem "0 min" ou "60 min". Teste: T1 tabela de N.
5. Repertório sem `rehearsalAt`, com `rehearsalAt` em texto, ou já passado: nenhum aviso, nenhum erro, nenhuma marca. Teste: T3 #25.

## Pontos do spec (resolvidos)

1. **Véspera (critério 1).** Resolvido: o critério estava errado (dizia 18h20:01 a 18h30:00). Foi corrigido na Análise para "sexta entre 18h30:00 e 18h40:00", e a regra da tabela prevalece: `rehearsalAt ∈ (agora + 24 h − 10 min, agora + 24 h]`. Testes: 18h29:59 nada, 18h30:00 sai, 18h40:00 nada (T3 #2 e #3).
2. **"No dia" e a folga.** Resolvido: o limite fica em 11h00 (critério 4). O motivo na Análise passa a ser "pelo menos 2 h entre o aviso das 8h e o de 1 hora" (com ensaio às 11h00, o 1 hora sai às 10h00). Sem mudança de código.
3. **Janela do "no dia".** Aceita: [08h00:00, 08h10:00). Às 08h10:00 exatos não sai (T1, T3 #6).
4. **"Ensaio em 30 min" (critério 7).** Resolvido na redação: não há mais aviso fixo de 30 min nem "Ensaio agora". A forma `Ensaio em {N} min` pode dizer 30 quando o ensaio é gravado 30 min antes. A prova de que sai um só aviso é T3 #10.
5. **"Mudou" com ensaio já passado.** Resolvido no código: `lastRehearsalAt(markers, now)` só considera marcas com `rehearsalAt > now`. Uma marca de ensaio já passado não é "mudança". Testes: T1 (marca de 14/11 com agora em 21/11 → `undefined`) e T3 #27 (repertório reaproveitado → "Ensaio amanhã às 19h00"). T3 #15 a #17 seguem valendo: conferido, o `rehearsalAt` das marcas antigas é futuro em relação ao `now` de cada teste.
6. **Texto do formulário.** Resolvido: entra nesta entrega. T8 troca o texto de `apps/web/src/setlists/SetlistFormDialog.tsx:220` e os testes (unit e E2E). T5 troca `docs/design-system.md:106` pelo mesmo texto e `:102` ("dois lembretes" → "três lembretes"). Como o PR toca `apps/web/src/setlists/`, ele exige `teste-celular-ok`: a pessoa confere o texto de ajuda do grupo "Hora do ensaio" no site de teste.
7. **Leituras de marcas antes do claim.** Aceito. Enquanto um aviso está devido, cada minuto da janela lê as marcas (até 60 leituras por ensaio na última hora). Uma falha de leitura não consome a marca: nenhuma marca é criada e o aviso sai no minuto seguinte. O critério 8 vale para minutos sem aviso devido.
8. **Paper.** Artboard "31 · Aviso do sistema" pendente (designer). No corpo do PR: "Paper pendente: artboard 31 · Aviso do sistema (textos novos)".

## Tarefas e grupos

| Tarefa | Dono | Arquivos | Depende de | Grupo |
| --- | --- | --- | --- | --- |
| T1 planejador (acrescenta às funções antigas) | `backend-dev` | `apps/functions/src/push/rehearsal.ts`, `rehearsal.test.ts` | — | A |
| T2 consulta do repertório | `backend-dev` | `apps/functions/src/push/reminderDeps.ts`, `reminderDeps.test.ts` | — | A |
| T4 `docs/sistema.md` | `backend-dev` (texto) | `docs/sistema.md` | — | A |
| T5 `docs/design-system.md` | `backend-dev` (texto) | `docs/design-system.md` | — | A |
| T6 `docs/deploy.md` §16 | `backend-dev` (texto) | `docs/deploy.md` | — | A |
| T8 texto de ajuda do formulário | `frontend-dev` | `apps/web/src/setlists/SetlistFormDialog.tsx`, `apps/web/src/setlists/SetlistFormDialog.test.tsx`, `e2e/setlists.spec.ts` | — | A |
| T3 runner e remoção do código antigo | `backend-dev` | `apps/functions/src/push/reminders.ts`, `reminders.test.ts`, `rehearsal.ts` e `rehearsal.test.ts` (remove o antigo), `reminderSchedule.ts` (comentário) | T1, T2 | B |
| T7 verificação | orquestrador | nenhum arquivo novo | T1–T6, T8 | C |

Grupo A: T1, T2, T4, T5, T6 e T8 não compartilham arquivo e podem ir em paralelo. T4–T6 são só texto e podem ficar num único subagente, para poupar memória. T8 é do `frontend-dev` e não mexe em Functions.

T3 espera T1 e T2. Ele toca `rehearsal.ts` e `rehearsal.test.ts` para remover o código antigo; como roda depois de T1 (e não em paralelo), não há arquivo compartilhado no mesmo grupo. A remoção do antigo entra no mesmo commit do chamador novo: assim, T1 termina verde (o antigo continua existindo e tem seus testes) e T3 termina verde (sem código antigo).

Implementação: `backend-dev` (T1–T6), `frontend-dev` (T8), Haiku, effort low (pré-voo: Haiku high). Revisão por tarefa: `code-reviewer`, Haiku high. Sem QA para T1–T6 (só Functions e docs). T8 tem E2E no CI: o `qa` confere `e2e/setlists.spec.ts` quando o roteiro pedir.

---

### Task T1: Planejador (acrescenta em `rehearsal.ts`)

**Files:**
- Modify: `apps/functions/src/push/rehearsal.ts`. Acrescenta as funções novas. `planRehearsalReminder`, `SOON_MS`, `NOW_MS` e `ReminderPlan` ficam até a T3.
- Test: `apps/functions/src/push/rehearsal.test.ts`. Acrescenta os testes novos. Os testes atuais (`planRehearsalReminder`, `formatSaoPauloHour`, `formatSaoPauloDay`, `readRehearsalSetlist`) ficam como estão.

**Interfaces:**
- Consumes: `todayInSaoPaulo(now: Date): string` (`apps/functions/src/stats/dates.ts`); `formatCultoDate(date: string): string | null` e `toDate(value: unknown): Date | undefined` (`apps/functions/src/push/newSetlist.ts`); `SendInput` (`send.ts`); `Origin` (`token.ts`).
- Produces (usado pela T3):
  - `export const LOOKAHEAD_MS: number` = 24 h em ms.
  - `export type RehearsalTipo = 'vespera' | 'dia' | 'perto'`.
  - `export type RehearsalSetlist = { id: string; label: string; origin: Origin; rehearsalAt: Date; expiresAt: Date | undefined }` (sem mudança).
  - `export function dueRehearsalNotice(now: Date, rehearsalAt: Date): RehearsalTipo | null`.
  - `export function lastRehearsalAt(markers: Array<Record<string, unknown>>, now: Date): Date | undefined`.
  - `export function buildRehearsalReminder(now: Date, setlist: RehearsalSetlist, tipo: RehearsalTipo, previous: Date | undefined): SendInput`.
  - `export function saoPauloMinuteOfDay(date: Date): number` (minutos desde 00h00 de Brasília).
  - Mantidos sem mudança: `formatSaoPauloHour(date: Date): string`, `formatSaoPauloDay(rehearsalAt: Date, now: Date): 'hoje' | 'amanhã'`, `readRehearsalSetlist(id, data)`.
- Nomes novos: `MIN_MS`, `HOUR_MS`, `DAY_MS`. Antes de acrescentar, rode `git grep -n "MIN_MS\|HOUR_MS\|DAY_MS" -- apps/functions/src/push/rehearsal.ts`. Se já existir um deles, use o existente.

- [ ] **Step 1: Escrever os testes (`rehearsal.test.ts`)**

Acrescente o helper `br` e a asserção-guarda (ver Global Constraints). Constantes `MIN`, `HOUR`, `DAY`. Dia de referência: sexta 20/11/2026, sábado 21/11, domingo 22/11. Defina `const NOW = br('2026-11-21', '17:00');` (usado nos testes de "1 hora").

Casos obrigatórios, cada um como `it` ou `it.each`:

- `dueRehearsalNotice` véspera: `now = br('2026-11-20','18:30')`, `at = br('2026-11-21','18:30')` → `'vespera'`. `at = now + DAY − 9 min 59 s` → `'vespera'`; `at = now + DAY − 10 min` → `null`; `at = now + DAY + 1 ms` → `null`.
- `dueRehearsalNotice` 1 hora (com `now = NOW`): `at = NOW + 1 ms` → `'perto'`; `at = NOW + HOUR` → `'perto'`; `at = NOW + HOUR + 1` → `null`; `at = NOW` → `null`; `at = NOW − MIN` → `null`; `at = NOW + 20 min` → `'perto'`.
- `dueRehearsalNotice` "no dia" (`at = br('2026-11-21','18:30')`):
  - `now = br('2026-11-21','08:00')` → `'dia'`; `now = br('2026-11-21','08:09:59')` → `'dia'`; `now = br('2026-11-21','08:10:00')` → `null`; `now = br('2026-11-21','07:59:59')` → `null`.
  - ensaio `br('2026-11-21','10:59')` com `now = 08:00` → `null`; ensaio `br('2026-11-21','11:00')` com `now = 08:00` → `'dia'`.
  - ensaio às 07h00 de sábado (`at = br('2026-11-21','07:00')`): `now = br('2026-11-20','07:00')` → `'vespera'`; `now = br('2026-11-21','06:00')` → `'perto'`; `now = br('2026-11-21','08:05')` → `null`.
- Perto da meia-noite UTC: `now = new Date('2026-11-22T02:40:00Z')` (sáb 23h40 de Brasília), `at = new Date('2026-11-22T03:10:00Z')` (dom 00h10) → `'perto'`; `at = now + DAY − 5 min` → `'vespera'`.
- `saoPauloMinuteOfDay`: `br('2026-11-21','08:09:59')` → `489`; `br('2026-11-21','00:00')` → `0`; `new Date('2026-11-21T03:00:00Z')` (00h00 de Brasília) → `0`.
- `lastRehearsalAt` (com `now = br('2026-11-20','12:00')`, marcas com `rehearsalAt` em 21/11 ou 22/11):
  - `[]` → `undefined`.
  - Três marcas (`vespera`, `perto`, `dia`) com `createdAt` distintos e `rehearsalAt` diferentes: devolve o `rehearsalAt` da de maior `createdAt` (a ordem do array não importa).
  - Marcas `agora` e `novo` com `createdAt` mais recente: ignoradas; sem outras marcas → `undefined`.
  - Marca sem `createdAt` ou sem `rehearsalAt`: ignorada.
  - `createdAt` e `rehearsalAt` no formato `{ toDate: () => Date }` (Timestamp do Admin SDK) e como `Date`: ambos aceitos.
  - Marca de ensaio já passado (decisão 3 do orquestrador): `[{ tipo: 'vespera', createdAt: br('2026-11-13','18:30'), rehearsalAt: br('2026-11-14','18:30') }]` com `now = br('2026-11-21','19:00')` → `undefined`.
  - Marca passada com `createdAt` maior que uma futura: a futura ganha. Ex.: passada (`createdAt` 20/11 10h00, `rehearsalAt` 20/11 11h00) e futura (`createdAt` 19/11, `rehearsalAt` 22/11 18h30), com `now = br('2026-11-20','12:00')` → `br('2026-11-22','18:30')`.
- `formatSaoPauloHour`, `formatSaoPauloDay`, `readRehearsalSetlist`: manter os testes que já existem.
- `buildRehearsalReminder`, textos exatos (setlist `{ id: 'r1', label: 'Culto de domingo', origin: 'producao', rehearsalAt, expiresAt: undefined }`):
  - vespera, `rehearsalAt = br('2026-11-21','18:30')`, `now = br('2026-11-20','18:30')`, `previous = undefined` → `title: 'Ensaio amanhã às 18h30'`, `body: 'Culto de domingo · sáb 21/11. Toque para ver os louvores.'`, `tag: 'setlist-r1-ensaio'`, `link: '/repertorios/r1'`, `origin: 'producao'`, `respectSwitch: true`.
  - dia (mesmo ensaio, `now = br('2026-11-21','08:00')`) → `title: 'Ensaio hoje às 18h30'`, mesmo body.
  - perto, `now = NOW`, `at = NOW + N`: 60 min → `'Ensaio em 1 hora'`; 59 min 30 s → `'Ensaio em 1 hora'`; 58 min 30 s → `'Ensaio em 1 hora'`; 58 min → `'Ensaio em 58 min'`; 20 min → `'Ensaio em 20 min'` e body `'Culto de domingo · hoje às 17h20. Toque para ver os louvores.'`; 1 ms → `'Ensaio em 1 min'`.
  - mudou, mesmo dia: `previous = br('2026-11-21','18:30')`, ensaio `br('2026-11-21','19:00')`, `tipo = 'perto'`, `now = br('2026-11-21','18:00')` → `title: 'Ensaio mudou para 19h00'`, body `'Culto de domingo · sáb 21/11. Toque para ver os louvores.'`.
  - mudou, dia diferente: `previous = br('2026-11-21','18:30')`, ensaio `br('2026-11-22','19:00')` (domingo), `tipo = 'vespera'`, `now = br('2026-11-21','19:00')` → `title: 'Ensaio mudou para dom 22/11 às 19h00'`, body `'Culto de domingo · dom 22/11. Toque para ver os louvores.'`.
  - `previous` igual ao horário do ensaio → título normal (`'Ensaio amanhã às 18h30'`).
  - origem `teste` segue para `origin`.

- [ ] **Step 2: Rodar e ver falhar**

Run (em `apps/functions`): `npx vitest run src/push/rehearsal.test.ts`
Expected: FAIL. `dueRehearsalNotice`, `lastRehearsalAt`, `buildRehearsalReminder` e `saoPauloMinuteOfDay` não exportados.

- [ ] **Step 3: Acrescentar em `rehearsal.ts`**

Não remova nada do arquivo nesta tarefa. As funções antigas e suas constantes ficam até a T3.

Constantes privadas, exceto `LOOKAHEAD_MS`: `MIN_MS = 60_000`, `HOUR_MS = 60 * MIN_MS`, `DAY_MS = 24 * HOUR_MS`, `VESPERA_WINDOW_MS = 10 * MIN_MS`, `PERTO_MS = HOUR_MS`, `DIA_START_MINUTE = 8 * 60`, `DIA_END_MINUTE = 8 * 60 + 10`, `DIA_MIN_REHEARSAL_MINUTE = 11 * 60`, `SAO_PAULO_OFFSET_MS = 3 * HOUR_MS`. `LOOKAHEAD_MS = DAY_MS`.

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

`lastRehearsalAt(markers, now)`: percorre as marcas; considera só `tipo` ∈ {`vespera`, `dia`, `perto`} (função `isRehearsalTipo(value: unknown): value is RehearsalTipo`), com `toDate(createdAt)` e `toDate(rehearsalAt)` definidos, e só marcas com `rehearsalAt.getTime() > now.getTime()`. Devolve o `rehearsalAt` da de maior `createdAt` (comparação em `getTime()`).

`buildRehearsalReminder`:
- `hour = formatSaoPauloHour(at)`; `weekdayDate = formatCultoDate(todayInSaoPaulo(at)) ?? ''` (importado de `./newSetlist`; nunca é `null` para uma data gerada por `todayInSaoPaulo`).
- `common = { link, tag, origin, respectSwitch: true }`.
- Se `previous !== undefined && previous.getTime() !== at.getTime()`: `sameDay = todayInSaoPaulo(previous) === todayInSaoPaulo(at)`; título `Ensaio mudou para ${hour}` (mesmo dia) ou `Ensaio mudou para ${weekdayDate} às ${hour}`; corpo `${label} · ${weekdayDate}. Toque para ver os louvores.`.
- Senão, `vespera` → `Ensaio amanhã às ${hour}`; `dia` → `Ensaio hoje às ${hour}`; corpo de ambos `${label} · ${weekdayDate}. Toque para ver os louvores.`.
- `perto`: `minutes = Math.max(1, Math.ceil((at − now) / MIN_MS))`; título `minutes >= 59 ? 'Ensaio em 1 hora' : \`Ensaio em ${minutes} min\``; corpo `${label} · ${formatSaoPauloDay(at, now)} às ${hour}. Toque para ver os louvores.`.

- [ ] **Step 4: Rodar com os dois fusos**

Run (Git Bash, em `apps/functions`): `TZ=UTC npx vitest run src/push/rehearsal.test.ts` e `TZ=Asia/Tokyo npx vitest run src/push/rehearsal.test.ts`
Run (na raiz): `npm run typecheck -w @cifras/functions`
Expected: PASS nos dois fusos; typecheck sem erro.

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
- Produces (usado pela T3): `createReminderDeps(): ReminderDeps` com `listRehearsalSetlists(after: Date, until: Date)`, que consulta `rehearsalAt` em (after, until], e `listRehearsalMarkers(setlistId)` (sem mudança).

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

Run (em `apps/functions`, Git Bash): `TZ=UTC npx vitest run src/push/reminderDeps.test.ts` e `TZ=Asia/Tokyo npx vitest run src/push/reminderDeps.test.ts`
Expected: PASS nos dois fusos.

- [ ] **Step 5: Commit**

```bash
git add apps/functions/src/push/reminderDeps.ts apps/functions/src/push/reminderDeps.test.ts
git commit -m "feat(push): consulta de ensaios em (agora, agora + 24 h] (#121)"
```

---

### Task T3: Runner, remoção do código antigo (`reminders.ts`, `rehearsal.ts`)

**Files:**
- Modify: `apps/functions/src/push/reminders.ts` (reescrito: sai `earlierSoonTimes`, `NOW_MS`, `SOON_MS`, `toDate`)
- Test: `apps/functions/src/push/reminders.test.ts` (reescrito)
- Modify: `apps/functions/src/push/rehearsal.ts` (remove `planRehearsalReminder`, `SOON_MS`, `NOW_MS`, `ReminderPlan`)
- Test: `apps/functions/src/push/rehearsal.test.ts` (remove os testes de `planRehearsalReminder`; os de `formatSaoPauloHour`, `formatSaoPauloDay`, `readRehearsalSetlist` e os novos ficam)
- Modify: `apps/functions/src/push/reminderSchedule.ts` (comentário da linha 8)

**Interfaces:**
- Consumes (T1): `dueRehearsalNotice`, `lastRehearsalAt`, `buildRehearsalReminder`, `readRehearsalSetlist`, `LOOKAHEAD_MS`, `RehearsalSetlist`, `RehearsalTipo`. Consumes (T2): `createReminderDeps` (só o tipo `ReminderDeps`; a implementação não muda).
- Produces: `export type ReminderDeps = PushDeps & MarkerDeps & { listRehearsalSetlists(after: Date, until: Date): Promise<Array<{ id: string; data: Record<string, unknown> }>>; listRehearsalMarkers(setlistId: string): Promise<Array<Record<string, unknown>>> }`; `export type ReminderRun = { sent; already; blocked; failed }` (sem mudança); `export function runRehearsalReminders(deps: ReminderDeps): Promise<ReminderRun>`.

- [ ] **Step 1: Escrever os testes (`reminders.test.ts`)**

Helper `br` e asserção-guarda como em Global Constraints. `members = { roles: { m1: 'member', a1: 'admin' } }`. Dispositivo: `device('t1', 'm1')`.

Estrutura: `setup(docs, fake, markers)` como hoje (`reminders.test.ts:36–40`). `fakeDeps` devolve `{ deps, devices, calls, clock }` (`fakeDeps.ts:68`), e `deps.now` lê `clock.now`. O `setup` devolve também `reads`: envolve `listRehearsalSetlists` e `listRehearsalMarkers` para registrar cada chamada (`reads.setlists: Array<[Date, Date]>`, `reads.markers: string[]`). O teste define a hora com `clock.now = br(...)` antes de rodar. Para mudar o horário do ensaio no meio do teste: `docs[0] = doc('r1', br(...))` (o `rehearsalAt` fica em `data`).

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
10. `'1 hora: um único aviso para 60, 30 e 5 min antes (sem aviso de 30 min)'`: ensaio `br('2026-11-21','18:00')`; execuções em `17:00`, `17:01`, `17:30` e `17:55` → `calls.flat()` tem 1 mensagem, com título `'Ensaio em 1 hora'`; soma de `sent` = 1.
11. `'1 hora: 61 min antes não sai; ensaio passado não sai'`: now `17:00`, ensaio `18:01` → 0; ensaio `16:59` → 0.
12. `'cron atrasado: parado 15 min, ensaio a 40 min ainda sai o 1 hora'`: now `br('2026-11-21','17:25')`, ensaio `br('2026-11-21','18:05')` → título `'Ensaio em 40 min'`, sent 1.
13. `'marca perto antiga do mesmo horário impede novo 1 hora (deploy)'`: marcas `[ ['r1_perto_<ms>', { setlistId: 'r1', tipo: 'perto', rehearsalAt: ensaio, createdAt: now − 1 h }] ]`, now `17:00`, ensaio `17:20` → `already: 1`, 0 envios.
14. `'marcas "agora" e "novo" não contam como mudança'`: marcas `agora` (ensaio outro horário, `createdAt` mais recente) e `{id}_novo` (sem `rehearsalAt`); now `17:00`, ensaio `17:20` → título `'Ensaio em 20 min'`.
15. `'mudou no mesmo dia: "Ensaio mudou para 19h00"; o aviso seguinte volta ao normal'`: marca `vespera` antiga com `rehearsalAt = br('2026-11-22','18:30')` e `createdAt = br('2026-11-21','18:30')` (inclusive no `store`, chave `r1_vespera_<ms de 22/11 18h30>`). Ensaio atual `br('2026-11-22','19:00')`, now `br('2026-11-21','19:00')` (diff de 24 h → véspera) → título `'Ensaio mudou para 19h00'`. Depois: now `br('2026-11-22','08:00')` → título `'Ensaio hoje às 19h00'` (normal: a marca de maior `createdAt` agora é a véspera do ensaio atual).
16. `'mudou em outro dia: "Ensaio mudou para sáb 21/11 às 20h00"'`: marca `vespera` antiga com `rehearsalAt = br('2026-11-20','23:30')` (sexta) e `createdAt = br('2026-11-19','23:30')`. Ensaio atual `br('2026-11-21','20:00')` (sábado), now `br('2026-11-20','20:00')` (sexta; diff de 24 h → véspera) → título `'Ensaio mudou para sáb 21/11 às 20h00'`, body `'Culto de domingo · sáb 21/11. Toque para ver os louvores.'`. O ensaio antigo está no futuro em relação a `now`, e as marcas têm `createdAt` anterior a `now`.
17. `'A→B→A: volta ao horário já enviado não reenvia; tipo ainda não enviado para A sai'`: `docs[0]` = ensaio A `br('2026-11-22','18:30')`; now `br('2026-11-21','18:30')` → vespera A enviada ("Ensaio amanhã às 18h30"). Troca para B: `docs[0]` = ensaio B `br('2026-11-22','19:00')` (domingo); now `br('2026-11-21','19:00')` (diff de 24 h → véspera) → título `'Ensaio mudou para 19h00'`. Volta para A: `docs[0]` = ensaio A; now `br('2026-11-21','18:31')` → `already: 1`. Depois now `br('2026-11-22','17:30')` (diff de 1 h para o ensaio A → perto); `previous` = B (maior `createdAt`, domingo 19h00, ainda futuro) → título `'Ensaio mudou para 18h30'`, sent 1.
18. `'config/push desligado: marca criada, nenhum envio'`: vespera, now `br('2026-11-20','18:30')`, `config: { enabled: false }` → `blocked: 1`, `calls` vazio, marca existe.
19. `'só aparelhos da mesma origem; link do domínio de teste'`: repertório com `origin: 'teste'`, perto de 10 min; devices `device('t1','m1','producao')` e `device('t2','m1','teste')` → só `t2`, link `https://louvor-hajaluz-teste.web.app/repertorios/r1`.
20. `'FCM indisponível: conta a falha e não reenvia no minuto seguinte'`: `sendBatch` lança erro com `code: 'messaging/internal-error'`; primeira execução `failed: 1`; execução seguinte `already: 1`.
21. `'falha ao ler marcas: nenhuma marca, nenhum envio; o minuto seguinte envia'`: `listRehearsalMarkers` lança na primeira execução (com aviso devido); resultado `failed: 1`; `store` vazio; depois, com leitura normal, `sent: 1`.
22. `'erro ao criar a marca: loga só o código e segue com os outros'`: repertórios `r1` e `r2` na janela de 1 hora (ensaio 20 min), e `create()` falha para `r1` com código `unavailable`. Resultado `{ sent: 1, failed: 1 }`; log `push: falha no lembrete do ensaio` com `{ setlistId: 'r1', code: 'unavailable' }`; sem o segredo.
23. `'repertórios diferentes na mesma execução não interferem'`: now `br('2026-11-21','17:10')`. r1 ensaio `17:30` → título `'Ensaio em 20 min'`, tag `setlist-r1-ensaio`; r2 ensaio `18:10` com marca `perto` antiga de outro horário (`rehearsalAt = br('2026-11-21','18:05')`, futuro em relação a now) → título `'Ensaio mudou para 18h10'`, tag `setlist-r2-ensaio`. Cada um com uma mensagem.
24. `'perto da meia-noite UTC: véspera e 1 hora usam o dia de Brasília'`: now `new Date('2026-11-22T02:40:00Z')` (sáb 23h40 de Brasília), ensaio `new Date('2026-11-23T02:35:00Z')` (dom 23h35 de Brasília) → título `'Ensaio amanhã às 23h35'`, body `'Culto de domingo · dom 22/11. Toque para ver os louvores.'`.
25. `'sem hora gravada, ou com a hora passada, não envia nem falha'` (mantido do teste atual, adaptado a now = `br('2026-11-21','17:00')`).
26. Log: `'sem nada a fazer, não loga'`; `'só "already", não loga'` (segunda execução no mesmo minuto de um aviso já enviado); `'com envio, loga só as contagens'` (com `'push: lembretes do ensaio'`).
27. `'repertório reaproveitado: marca de ensaio passado não gera "mudou"'`: marca `vespera` com `rehearsalAt = br('2026-11-14','18:30')` e `createdAt = br('2026-11-13','18:30')` (ensaio da semana passada). Ensaio atual `br('2026-11-22','19:00')`, now `br('2026-11-21','19:00')` (diff de 24 h → véspera) → título `'Ensaio amanhã às 19h00'` (sem "mudou").

- [ ] **Step 2: Rodar e ver falhar**

Run (em `apps/functions`, Git Bash): `npx vitest run src/push/reminders.test.ts`
Expected: FAIL (o runner atual ainda usa a janela de 30 min e lê marcas a cada minuto).

- [ ] **Step 3: Implementar**

- `remind(deps, setlist, now, run)`:
  1. `tipo = dueRehearsalNotice(now, setlist.rehearsalAt)`; se `null`, retorna (sem leitura de marcas).
  2. `previous = lastRehearsalAt(await deps.listRehearsalMarkers(setlist.id), now)` (só aqui, com aviso devido; leitura antes do claim).
  3. `input = buildRehearsalReminder(now, setlist, tipo, previous)`.
  4. `rehearsalAtMs = setlist.rehearsalAt.getTime()`; `claimMarker(\`${setlist.id}_${tipo}_${rehearsalAtMs}\`, { setlistId, tipo, rehearsalAt: new Date(rehearsalAtMs), createdAt: now, expiresAt: markerExpiresAt(now, setlist.expiresAt) })`.
  5. `'exists'` → `run.already += 1` e retorna. Senão `sendToDevices(deps, input)`; `blocked` → `run.blocked += 1`; senão soma `sent` e `failed`.
- `runRehearsalReminders(deps)`: `now = deps.now()`; `docs = await deps.listRehearsalSetlists(now, new Date(now.getTime() + LOOKAHEAD_MS))`; para cada doc, `readRehearsalSetlist` e `remind` dentro de `try/catch`. O `catch` soma `failed` e loga com `'push: falha no lembrete do ensaio'` e `{ setlistId, code: failureCode(error) }`, como hoje. Log final `'push: lembretes do ensaio'` só se `sent + failed + blocked > 0` (não loga só por `already`).
- Remover imports não usados (`toDate`, `NOW_MS`, `SOON_MS`).
- O comentário de cabeçalho da função muda para: "Avisa os ensaios com horário em (agora, agora + 24 h]: véspera, no dia e 1 hora antes."
- Remoção do código antigo, no mesmo commit:
  - `rehearsal.ts`: remover `planRehearsalReminder`, `SOON_MS`, `NOW_MS` e `ReminderPlan` (e imports que sobrarem).
  - `rehearsal.test.ts`: remover os testes de `planRehearsalReminder` (os de "Ensaio em 30 min", "Ensaio agora" e as tabelas de N antigas). Os demais testes ficam.
- `reminderSchedule.ts` linha 8: trocar o comentário "janela de 5 min para trás" por "o aviso do ensaio tem janelas próprias (véspera, no dia e 1 hora), em `rehearsal.ts`".

- [ ] **Step 4: Rodar com os dois fusos**

Run (em `apps/functions`, Git Bash): `TZ=UTC npx vitest run src/push/reminders.test.ts` e `TZ=Asia/Tokyo npx vitest run src/push/reminders.test.ts`
Run (em `apps/functions`, Git Bash): `npx vitest run src/push/rehearsal.test.ts src/push/reminderSchedule.test.ts`
Run (na raiz): `npm run typecheck -w @cifras/functions`
Expected: PASS nos dois fusos; typecheck sem erro.

- [ ] **Step 5: Commit**

```bash
git add apps/functions/src/push/reminders.ts apps/functions/src/push/reminders.test.ts apps/functions/src/push/rehearsal.ts apps/functions/src/push/rehearsal.test.ts apps/functions/src/push/reminderSchedule.ts
git commit -m "feat(push): lembretes do ensaio com marca do horário anterior e aviso de mudança (#121)"
```

---

### Task T4: `docs/sistema.md`

**Files:**
- Modify: `docs/sistema.md` (hoje com 303 linhas)

**Interfaces:** nenhuma (só texto; segue Global Constraints).

- [ ] **Step 1: Verificação antes**

Run: `wc -l docs/sistema.md`
Expected: `303`. O resultado final tem de ser ≤ 300.

- [ ] **Step 2: Editar**

1. Linha da tabela de `avisosEnviados/{setlistId}_{perto\|agora}_{rehearsalAtMs}` (linha ~116): trocar a chave por `avisosEnviados/{setlistId}_{vespera\|dia\|perto}_{rehearsalAtMs}` e `tipo` por (`vespera`/`dia`/`perto`); manter o resto ("marca dos lembretes do ensaio (#102, #121)").
2. Linha da tabela `sendRehearsalReminders` (linha ~150): substituir a célula de descrição por: "Avisa o ensaio com horário em até 24 h: "Ensaio amanhã às HHhMM" (24 h antes), "Ensaio hoje às HHhMM" (08h00 do dia, ensaio às 11h00 ou depois) e "Ensaio em N min" / "Ensaio em 1 hora" (até 60 min antes, retroativo); uma vez por horário, a membros e admins, inclusive quem gravou; só aparelhos da mesma origem; respeita `config/push`".
3. Bloco "Regra dos lembretes do ensaio" (linhas ~171–176), 4 bullets (mesmo número de linhas, sem bullet novo):
   - "Agendada a cada minuto; consulta `setlists` com `rehearsalAt` em (agora, agora + 24 h]. Marcas só são lidas quando há aviso devido."
   - "Três avisos, cada um numa faixa: véspera (ensaio em (agora + 24 h − 10 min, agora + 24 h]); no dia (agora entre 08h00 e 08h10 de Brasília, ensaio no mesmo dia às 11h00 ou depois); 1 hora (ensaio em (agora, agora + 60 min]; é o único retroativo). Todos com a tag `setlist-{id}-ensaio`, que substitui o aviso anterior no aparelho."
   - "Uma vez por horário: `avisosEnviados/{setlistId}_{tipo}_{rehearsalAtMs}` é criada antes do envio. Marca antiga `perto` vale para o aviso de 1 hora."
   - "Horário mudou: se a marca de maior `createdAt` entre as marcas de ensaios ainda futuros (véspera, dia e 1 hora; marcas `agora` e de repertório novo não contam) é de outro horário, o título vira `Ensaio mudou para HHhMM` (mesmo dia) ou `Ensaio mudou para dom 22/11 às HHhMM`. Horas e datas em Brasília (UTC−3, sem horário de verão); sem `rehearsalAt`, ou com a hora passada, não avisa."
4. Bullets de "Limites conhecidos" sobre lembretes do ensaio (3 bullets, linhas ~283–285): trocar por 2:
   - "Lembretes do ensaio: até 1 min de atraso (cron). Se a função ficar parada por mais de 10 min, o aviso da véspera ou do dia daquela janela se perde. Falha de envio depois da marca perde o aviso (sem reenvio); com `config/push.enabled === false`, a marca é criada e nada sai. Sem horário de silêncio na v1."
   - "Lembretes do ensaio: A → B → A não reenvia o horário já avisado, mas pode enviar um tipo ainda não enviado para A. O "mudou" chega no próximo aviso devido, que pode ser horas depois."
5. Pendências: sem mudança (a linha do §16 continua).
6. Depois das edições acima o arquivo fica perto de 302 linhas. Cortar 2 a 3 linhas na área de push e lembretes (ex.: juntar bullets que repetem a mesma regra), sem perder fato, para terminar em no máximo 300 linhas.

- [ ] **Step 3: Verificação**

Run: `wc -l docs/sistema.md` → ≤ 300.
Run: `git grep -n "Ensaio em 30\|Ensaio agora\|30 min antes\|perto\|agora" -- docs/sistema.md`. Expected: nenhum hit para "Ensaio em 30" / "Ensaio agora" / "30 min antes"; "agora" só nos sentidos gerais (ex.: "agora + 24 h").

- [ ] **Step 4: Commit**

```bash
git add docs/sistema.md
git commit -m "docs(sistema): lembretes do ensaio na véspera, no dia e 1 hora antes (#121)"
```

---

### Task T5: `docs/design-system.md`

**Files:**
- Modify: `docs/design-system.md`: linha ~102 (tabela "Aviso do sistema"), linha ~106 (ajuda do formulário "Dia + Hora do ensaio"), linha ~117 (bullet "Aviso do sistema" em "Textos fixos dos avisos").

**Interfaces:** nenhuma.

- [ ] **Step 1: Verificação antes**

Run: `git grep -n "dois lembretes\|Ensaio agora\|Ensaio em {N} min\|30 min antes" -- docs/design-system.md`
Expected: 3 linhas: ~102 ("dois lembretes do ensaio"), ~106 ("30 min antes e na hora") e ~117 ("Ensaio agora" e "Ensaio em {N} min").

- [ ] **Step 2: Editar**

a) Linha ~102: "dois lembretes do ensaio" → "três lembretes do ensaio".

b) Linha ~106: "Quem ativou os avisos é lembrado 30 min antes e na hora." → "Quem ativou os avisos é lembrado na véspera, no dia e 1 hora antes." (mesmo texto de `SetlistFormDialog.tsx`, T8).

c) Linha ~117: substituir o bullet "Aviso do sistema" pelo texto:

"- Aviso do sistema: "Novo repertório" / "{rótulo} · {dia} {dd/mm}"; "Ensaio amanhã às {hora}" / "{rótulo} · {dia-sem dd/mm}. Toque para ver os louvores." (24 h antes); "Ensaio hoje às {hora}" / mesmo corpo (08h00 do dia do ensaio, só para ensaio às 11h00 ou depois); "Ensaio em 1 hora" ou "Ensaio em {N} min" / "{rótulo} · {hoje|amanhã} às {hora}. Toque para ver os louvores." (até 60 min antes; N ≥ 59 vira "1 hora"); "Ensaio mudou para {hora}" ou "Ensaio mudou para {dia-sem dd/mm} às {hora}" / "{rótulo} · {dia-sem dd/mm}. Toque para ver os louvores."; "Aviso de teste" / "Está tudo certo. Você vai receber os avisos do Church Cifras neste aparelho.". `{hora}` no formato `18h30`; `{dia-sem dd/mm}` no formato `sáb 21/11`."

- [ ] **Step 3: Verificação**

Run: `git grep -n "dois lembretes\|Ensaio agora\|30 min antes" -- docs/design-system.md` → sem hit.
Run (na raiz): `npm run test:harness` → PASS (confere que todo token está documentado; este texto não é token).

- [ ] **Step 4: Commit**

```bash
git add docs/design-system.md
git commit -m "docs(design): textos dos lembretes do ensaio (#121)"
```

---

### Task T6: `docs/deploy.md` §16

**Files:**
- Modify: `docs/deploy.md` (§16, parágrafo "Teste no aparelho" na linha ~222, e "Depois do deploy")

**Interfaces:** nenhuma. O roteiro de aparelho é passo da pessoa e vai também na mensagem final do orquestrador.

- [ ] **Step 1: Verificação antes**

Run: `git grep -n "Ensaio agora\|30 min\|Ensaio em N min" -- docs/deploy.md`
Expected: hits no parágrafo "Teste no aparelho" (linha ~222).

- [ ] **Step 2: Editar**

No §16, trocar o parágrafo "**Teste no aparelho (passo da pessoa, critério 8 da #102):** ..." por:

"**Teste no aparelho (passo da pessoa, critério 8 da #102; atualizado pela #121):** Android e iPhone com iOS 16.4+, com o app instalado em produção (`https://louvor-hajaluz.web.app`) e os avisos ativados. Crie o repertório também em produção: aparelho só recebe aviso de repertório da mesma origem. Com um ensaio marcado para amanhã, às HHhMM: chega "Ensaio amanhã às HHhMM" na véspera, entre HHhMM e HHhMM+10 min (horário de Brasília), com o app fechado. No dia, entre 08h00 e 08h10, se o ensaio for às 11h00 ou depois: "Ensaio hoje às HHhMM". Uma hora antes: "Ensaio em 1 hora". Mude a hora do ensaio depois de um aviso: chega "Ensaio mudou para HHhMM" (ou "Ensaio mudou para dom 22/11 às HHhMM", se o dia mudou) uma vez, na execução seguinte. Desligue `config/push` (`enabled: false`) e confira que nada chega."

Acrescentar uma linha em "Depois do deploy": "- Sem migração: marcas antigas `perto` e `agora` ficam; um aviso já enviado antes do deploy não se repete."

- [ ] **Step 3: Verificação**

Run: `git grep -n "Ensaio agora\|30 min" -- docs/deploy.md` → nenhum hit no §16 (hits fora do §16, se houver, são de outro assunto e não mudam).

- [ ] **Step 4: Commit**

```bash
git add docs/deploy.md
git commit -m "docs(deploy): roteiro de aparelho dos lembretes do ensaio (#121)"
```

---

### Task T8: Texto de ajuda do formulário (`frontend-dev`)

**Files:**
- Modify: `apps/web/src/setlists/SetlistFormDialog.tsx` (linha 220)
- Test: `apps/web/src/setlists/SetlistFormDialog.test.tsx` (linha 293)
- Modify (E2E, roda só no CI): `e2e/setlists.spec.ts` (linha 620)

**Interfaces:** nenhuma. Só o texto de ajuda do grupo "Hora do ensaio (opcional)". Texto exato: `Quem ativou os avisos é lembrado na véspera, no dia e 1 hora antes.`

- [ ] **Step 1: Ajustar o teste (RED)**

Em `SetlistFormDialog.test.tsx:293`, trocar o texto esperado por `'Quem ativou os avisos é lembrado na véspera, no dia e 1 hora antes.'`.

- [ ] **Step 2: Rodar e ver falhar**

Run (em `apps/web`): `npx vitest run src/setlists/SetlistFormDialog.test.tsx`
Expected: FAIL (o componente ainda tem o texto antigo).

- [ ] **Step 3: Implementar**

Em `SetlistFormDialog.tsx:220`, trocar o texto por `Quem ativou os avisos é lembrado na véspera, no dia e 1 hora antes.`. Em `e2e/setlists.spec.ts:620`, trocar o texto esperado pelo mesmo.

- [ ] **Step 4: Rodar e ver passar**

Run (em `apps/web`): `npx vitest run src/setlists/SetlistFormDialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verificação**

Run: `git grep -n "Quem ativou os avisos é lembrado 30 min" -- apps e2e` → sem hit.
E2E (`e2e/setlists.spec.ts`) não roda local: o CI roda.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/setlists/SetlistFormDialog.tsx apps/web/src/setlists/SetlistFormDialog.test.tsx e2e/setlists.spec.ts
git commit -m "fix(setlists): ajuda do formulário com os novos avisos do ensaio (#121)"
```

---

### Task T7: Verificação final (sem arquivo novo)

**Depends on:** T1–T6 e T8.

- [ ] **Step 1: Testes focados, nos dois fusos**

Run (em `apps/functions`, Git Bash): `TZ=UTC npx vitest run src/push/rehearsal.test.ts src/push/reminders.test.ts src/push/reminderDeps.test.ts src/push/reminderSchedule.test.ts src/push/markers.test.ts`
Run (em `apps/functions`, Git Bash): a mesma linha com `TZ=Asia/Tokyo`.
Expected: todos PASS nos dois fusos.

- [ ] **Step 2: Tipos e lint (só o necessário)**

Run (na raiz): `npm run typecheck -w @cifras/functions`
Run (na raiz): `npx eslint apps/functions/src/push/rehearsal.ts apps/functions/src/push/reminders.ts apps/functions/src/push/reminderDeps.ts apps/web/src/setlists/SetlistFormDialog.tsx`
Expected: sem erro. Se a memória não permitir, deixar para o CI e registrar na Análise.

- [ ] **Step 3: Textos antigos fora dos históricos**

Run: `git grep -n "Ensaio em 30 min\|Ensaio agora\|30 min antes\|dois lembretes do ensaio\|sendRehearsal.*30 min" -- apps e2e docs/sistema.md docs/design-system.md docs/deploy.md`
Expected: nenhum hit. `docs/superpowers/plans/2026-11-21-*` e `2026-11-22-*` são históricos e não são editados (não estão no escopo do grep).

- [ ] **Step 4: Tamanho do sistema.md**

Run: `wc -l docs/sistema.md`
Expected: ≤ 300.

- [ ] **Step 5: Harness**

Run (na raiz): `npm run test:harness`
Expected: PASS.

PR (não é este plano que abre; o corpo é do orquestrador): "Resolve #121" (ou "Parte de #N", se #121 for sub-issue); "Teste no celular: exigido (toca `apps/web/src/setlists/`, texto de ajuda do formulário; etiqueta `teste-celular-ok` depois do "ok" da pessoa)"; "Paper pendente: artboard 31 · Aviso do sistema (textos novos)"; "Mudanças em Rules, índices ou variáveis: nenhuma"; roteiro de aparelho de `docs/deploy.md` §16 na mensagem final.

---

## Mapa de critérios para testes

| Critério | Prova |
| --- | --- |
| 1 véspera | T1 véspera (24 h; 24 h − 9 min 59 s; 24 h − 10 min; 24 h + 1 ms); T3 #2 (sexta 18h30 sai), #3 (18h29:59 e 18h40:00 não saem) |
| 2 ensaio às 7h | T3 #5 |
| 3 no dia 08h00–08h10 | T1 no dia (08:00, 08:09:59, 08:10, 07:59:59); T3 #6 |
| 4 10h59 / 11h00 | T1 no dia (10:59, 11:00); T3 #7 |
| 5 1 hora (N, 0, 61 min) | T1 1 hora e tabela de N; T3 #9, #10, #11, #12 |
| 6 só 1 hora retroativo | T3 #4 (véspera gravada depois), #8 (dia gravado às 08h20) |
| 7 sem 30 fixo nem "agora"; passado não sai | T1 (0 ms → null; passado → null); T3 #10 (um aviso só), #11; T7 Step 3 |
| 8 consulta e zero leituras sem aviso devido | T2 (`>`); T3 #1 (`reads.markers` vazio), #4 |
| 9 idempotência | T3 #2 (`already`), #13, #20 (falha do FCM não reenvia); teste de reentrega concorrente (atual) mantido em T3 |
| 10 marca `perto` legada; `agora`/`novo` fora do "mudou" | T3 #13, #14 |
| 11 mudou com data quando o dia muda, depois normal | T3 #15, #16, #27; T1 mudou (mesmo dia, dia diferente, igual) e `lastRehearsalAt` com marca passada |
| 12 A→B→A | T3 #17 |
| 13 interruptor, origem e papel | T3 #18, #19 (testes atuais de `send.ts`, sem mudança) |
| 14 Brasília, `TZ=UTC`, `TZ=Asia/Tokyo`, meia-noite UTC | T1 `saoPauloMinuteOfDay` e meia-noite UTC; T3 #24; T7 Step 1 nos dois fusos; asserção-guarda do `br` |
| 15 repertórios independentes | T3 #23 |
| 16 roteiro de aparelho | T6 (§16); mensagem final do orquestrador |
| Pontos 5 (mudou com ensaio passado) | T1 `lastRehearsalAt` (marca de 14/11); T3 #27 |
| Pontos 6 (texto do formulário) | T8 Steps 1–5; T5 (`design-system.md` 102 e 106); T7 Step 3 |
| Pontos 7 (falha de leitura não consome marca) | T3 #21 |

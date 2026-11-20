// Regras puras do guard de Git: decide se um comando de shell pode rodar
// sob o fluxo de branches do projeto. Sem dependências, sem I/O.
//
// evaluateCommand({ command, branch, stagedFiles, resolvePr, now, openIncidents }) devolve
//   { allow: false, reason }     comando bloqueado;
//   { allow: true, reminder }    permitido, com lembrete (ex.: `gh pr create` -> rodar testes);
//   { allow: true }              permitido.
// resolvePr(alvo, repo) -> PrFacts | null: injetado pelo entrypoint, só chamado em `gh pr merge`.

/**
 * @typedef {{ name: string; status?: string; conclusion?: string; state?: string }} CheckRun
 * @typedef {{ base: string; head: string; headSha: string; checks: CheckRun[]; labels: string[]; files: string[]; body: string }} PrFacts
 */

// Travas: PRs que tocam estes caminhos só são mergeados pela pessoa responsável.
// Entradas terminadas em `/` são prefixos de pasta; as demais são arquivos da raiz.
export const GUARD_PATHS = ['.claude/', '.github/workflows/', 'firebase.json', 'cors.json', 'AGENTS.md', 'CLAUDE.md'];

// Caminhos que exigem teste no celular (etiqueta `teste-celular-ok`).
export const DEVICE_TEST_PATHS = ['apps/web/src/viewer/', 'apps/web/src/setlists/', 'apps/web/src/pad/'];

// Arquivos de `files` que batem em algum prefixo (`/` no fim: startsWith; senão: igualdade).
// Sem diferenciar maiúsculas: num checkout Windows `.Claude/x` é o mesmo arquivo de `.claude/x`.
export function touches(files, prefixes) {
  return files.filter((f) => {
    const lf = f.toLowerCase();
    return prefixes.some((p) => {
      const lp = p.toLowerCase();
      return lp.endsWith('/') ? lf.startsWith(lp) : lf === lp;
    });
  });
}

const GREEN_CONCLUSIONS = new Set(['SUCCESS', 'SKIPPED', 'NEUTRAL']);

// Verde: ao menos um check e todos verdes. StatusContext tem `state`; CheckRun tem `status`/`conclusion`.
export function ciGreen(checks) {
  return (
    checks.length > 0 &&
    checks.every((c) =>
      c.state !== undefined
        ? c.state === 'SUCCESS'
        : c.status === 'COMPLETED' && GREEN_CONCLUSIONS.has(c.conclusion)
    )
  );
}

// Janela do culto: quinta e domingo, a partir das 16h30 em Brasília (sem horário de verão).
const WORSHIP_DAYS = new Set(['Thu', 'Sun']);
const WORSHIP_START_MINUTES = 16 * 60 + 30;
const SAO_PAULO_CLOCK = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function isFreezeWindow(date) {
  const parts = Object.fromEntries(SAO_PAULO_CLOCK.formatToParts(date).map((p) => [p.type, p.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return WORSHIP_DAYS.has(parts.weekday) && minutes >= WORSHIP_START_MINUTES;
}

// Números de issues que o corpo do PR fecha (`Closes #N`, `fixes #N`, `resolve #N`...), sem repetição.
export function closingRefs(body) {
  const nums = [...body.matchAll(/\b(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?)\s+#(\d+)/gi)].map((m) => Number(m[1]));
  return [...new Set(nums)];
}

export const PROTECTED_BRANCHES = ['main', 'develop'];

const isProtected = (b) => PROTECTED_BRANCHES.includes(b);

const SEPARATORS = new Set([';', '\n', '\r', '|', '&', '{', '}', '(', ')']);

// Fim de um here-string do PowerShell (`@'...'@` / `@"..."@`) que começa em `start`,
// ou -1 se `start` não abre um. Se não terminar, consome o resto do comando.
function hereStringEnd(command, start) {
  const m = /^@(['"])\r?\n/.exec(command.slice(start, start + 4));
  if (!m) return -1;
  const close = command.indexOf(`\n${m[1]}@`, start + m[0].length - 1);
  return close === -1 ? command.length : close + 3;
}

// Delimitador de um heredoc (`<<WORD`, `<<-'WORD'`) que começa em `start`.
function heredocAt(command, start) {
  const m = /^<<(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/.exec(command.slice(start));
  return m ? { length: m[0].length, dashed: m[1] === '-', word: m[3] } : null;
}

// Índice do fim da linha terminadora do heredoc, a partir do início do corpo.
function skipHeredocBody(command, from, { dashed, word }) {
  let pos = from;
  while (pos < command.length) {
    let end = command.indexOf('\n', pos);
    if (end === -1) end = command.length;
    let line = command.slice(pos, end).replace(/\r$/, '');
    if (dashed) line = line.replace(/^\t+/, '');
    if (line === word) return end;
    pos = end + 1;
  }
  return command.length;
}

// Divide o comando em segmentos (separados por &&, ||, ;, |, &, quebras de linha,
// chaves e parênteses fora de aspas); cada segmento é uma lista de tokens sem as aspas.
// Here-strings e corpos de heredoc são opacos.
export function splitSegments(command) {
  const segments = [];
  let tokens = [];
  let cur = '';
  let has = false; // token em andamento (permite string vazia entre aspas)
  let quote = null;
  const pendingHeredocs = [];

  const endToken = () => {
    if (has) tokens.push(cur);
    cur = '';
    has = false;
  };
  const endSegment = () => {
    endToken();
    if (tokens.length) segments.push(tokens);
    tokens = [];
  };

  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      else cur += c;
      continue;
    }
    const hereEnd = c === '@' ? hereStringEnd(command, i) : -1;
    const heredoc = c === '<' && command[i - 1] !== '<' ? heredocAt(command, i) : null;
    if (hereEnd !== -1) {
      has = true;
      i = hereEnd - 1;
    } else if (heredoc) {
      pendingHeredocs.push(heredoc);
      endToken();
      i += heredoc.length - 1;
    } else if (c === '"' || c === "'") {
      quote = c;
      has = true;
    } else if (SEPARATORS.has(c)) {
      endSegment();
      if (c === '\n') {
        for (const h of pendingHeredocs.splice(0)) i = skipHeredocBody(command, i + 1, h);
      }
    } else if (/\s/.test(c)) {
      endToken();
    } else {
      cur += c;
      has = true;
    }
  }
  endSegment();
  return segments;
}

const block = (reason) => ({ allow: false, reason });

// Branch efetiva desconhecida (ex.: depois de `git checkout <caminho>` no mesmo comando).
const UNKNOWN = '<desconhecida>';

const unknownBranchBlock = () =>
  block(
    'Não foi possível determinar a branch após trocar de branch (checkout/switch); ' +
      'rode a troca em um comando separado e só então faça commit/push.'
  );

const pdfBlock = (files) =>
  block(
    `Nunca commite arquivos PDF (repositório público, letras protegidas por direitos autorais): ${files.join(', ')}. ` +
      'Remova do stage com `git restore --staged <arquivo>` em um comando separado, ' +
      'adicione o padrão ao .gitignore e tente de novo.'
  );

const isPdf = (f) => /\.pdf$/i.test(f);

// Argumentos de `git add`/`git commit` que são caminhos (ignora flags e valores de -m/-F/etc.).
function pathArgs(args) {
  const valueFlags = ['--message', '--file', '--author', '--date', '--reuse-message', '--reedit-message'];
  const paths = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (valueFlags.includes(a) || /^-[a-zA-Z]*[mFcC]$/.test(a)) i++; // consome o valor
    else if (!a.startsWith('-')) paths.push(a);
  }
  return paths;
}

function checkPdfPaths(args) {
  const pdfs = pathArgs(args).filter(isPdf);
  return pdfs.length ? pdfBlock(pdfs) : null;
}

function checkCommit(args, branch, stagedFiles) {
  if (branch === UNKNOWN) return unknownBranchBlock();
  if (isProtected(branch)) {
    return block(
      `Commit direto em "${branch}" é proibido. Crie uma branch a partir do develop: ` +
        '`git checkout -b <tipo>/<nome> origin/develop` e commite nela.'
    );
  }
  const staged = stagedFiles.filter(isPdf);
  if (staged.length) return pdfBlock(staged);
  return checkPdfPaths(args);
}

// Destino do refspec: após o último ":", sem "+" inicial e sem "refs/heads/".
function refspecDestination(refspec) {
  const dest = refspec.slice(refspec.lastIndexOf(':') + 1).replace(/^\+/, '');
  return dest.replace(/^refs\/heads\//, '');
}

const PUSH_VALUE_FLAGS = ['-o', '--push-option', '--receive-pack', '--exec', '--repo'];

// Argumentos posicionais de `git push` (ignora flags e os valores das que recebem um).
function pushPositionals(args) {
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (PUSH_VALUE_FLAGS.includes(a)) i++;
    else if (!a.startsWith('-')) positional.push(a);
  }
  return positional;
}

function checkPush(args, branch) {
  if (args.some((a) => a === '--all' || a === '--mirror')) {
    return block(
      'Push para todas as branches (`--all`/`--mirror`) é proibido: enviaria main/develop. ' +
        'Publique apenas sua branch de feature (`git push -u origin <tipo>/<nome>`).'
    );
  }
  const refspecs = pushPositionals(args).slice(1); // primeiro posicional é o remote
  const targets = refspecs.length ? refspecs.map(refspecDestination) : ['HEAD'];
  for (const t of targets) {
    const implicit = t === 'HEAD' || t === '';
    if (implicit && branch === UNKNOWN) return unknownBranchBlock();
    const dest = implicit ? branch : t;
    if (isProtected(dest)) {
      return block(
        `Push para "${dest}" é proibido. Publique sua branch de feature ` +
          '(`git push -u origin <tipo>/<nome>`) e abra um PR com `gh pr create --base develop`.'
      );
    }
  }
  return null;
}

function optionValue(args, names) {
  for (let i = 0; i < args.length; i++) {
    for (const n of names) {
      if (args[i] === n) return args[i + 1];
      if (n.startsWith('--') && args[i].startsWith(`${n}=`)) return args[i].slice(n.length + 1);
    }
  }
  return undefined;
}

function checkPrCreate(args, branch) {
  const base = optionValue(args, ['--base', '-B']);
  if (!base) {
    return block(
      'Informe a base do PR explicitamente: `gh pr create --base develop ...` ' +
        '(só o develop pode abrir PR para main, com `--base main --head develop`).'
    );
  }
  if (base === 'main') {
    const head = (optionValue(args, ['--head', '-H']) ?? branch).replace(/^[^:]+:/, ''); // sem `owner:`
    if (head === UNKNOWN) return unknownBranchBlock();
    if (head !== 'develop') {
      return block(
        `PR para main só pode vir do develop (head atual: "${head}"). ` +
          'Para features use `gh pr create --base develop`.'
      );
    }
  }
  return null;
}

// Pula flags iniciais; `valueFlags` consomem o argumento seguinte.
// Devolve [primeiro não-flag, argumentos restantes].
function skipLeadingFlags(args, valueFlags) {
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) i += valueFlags.includes(args[i]) ? 2 : 1;
  return [args[i], args.slice(i + 1)];
}

const parseGitArgs = (args) => skipLeadingFlags(args, ['-C', '-c', '--git-dir', '--work-tree']);

// Primeiro argumento não-flag antes de `--` (ou undefined). "-" (branch anterior) conta como alvo.
function firstTarget(args) {
  for (const a of args) {
    if (a === '--') return undefined;
    if (!a.startsWith('-') || a === '-') return a;
  }
  return undefined;
}

// `git switch --track origin/x` troca para uma branch local cujo nome não aparece no comando.
const tracksRemote = (args) => args.some((a) => a === '--track' || a === '-t');

// Atualiza a branch efetiva após checkout/switch.
function trackBranch(sub, args, state) {
  const createFlags = sub === 'checkout' ? ['-b', '-B'] : ['-c', '-C', '--create', '--force-create'];
  const i = args.findIndex((a) => createFlags.includes(a));
  if (i !== -1 && args[i + 1]) {
    state.branch = args[i + 1];
    return;
  }
  const target = firstTarget(args);
  if (target === undefined) return; // ex.: `git checkout -- arquivo`
  if (sub === 'switch') state.branch = target === '-' || tracksRemote(args) ? UNKNOWN : target;
  else state.branch = isProtected(target) ? target : UNKNOWN;
}

function checkGit(tokens, state, stagedFiles) {
  const [sub, rest] = parseGitArgs(tokens.slice(1));
  if (!sub) return null;

  if (sub === 'commit') return checkCommit(rest, state.branch, stagedFiles);
  if (sub === 'push') return checkPush(rest, state.branch);
  if (sub === 'add') return checkPdfPaths(rest);
  if (sub === 'checkout' || sub === 'switch') trackBranch(sub, rest, state);
  return null;
}

const MERGE_VALUE_FLAGS = [
  '--subject', '-t', '--body', '-b', '--body-file', '-F',
  '--author-email', '-A', '-R', '--repo',
];

// Argumentos de `gh pr merge`: { positionals, repo, matchHead } ignorando valores e redirecionamentos.
function parseMergeArgs(args) {
  const positionals = [];
  let repo = null;
  let matchHead = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-R' || a === '--repo') repo = args[++i] ?? repo;
    else if (a.startsWith('--repo=')) repo = a.slice(7);
    else if (/^-R./.test(a)) repo = a.slice(2);
    else if (a === '--match-head-commit') matchHead = args[++i] ?? null;
    else if (a.startsWith('--match-head-commit=')) matchHead = a.slice(20);
    else if (MERGE_VALUE_FLAGS.includes(a)) i++;
    else if (/^[\d*]*[<>]/.test(a)) {
      if (/^[\d*]*[<>]+$/.test(a)) i++; // `> arquivo`: o próximo token é o destino
    } else if (!a.startsWith('-')) positionals.push(a);
  }
  return { positionals, repo, matchHead };
}

// `--auto` (qualquer forma, exceto `--auto=false`) e o alias `-a`, sozinho ou em grupo curto
// (`-sa`), não existem neste fluxo, em nenhuma base. `-R...` é o repositório, não grupo.
const SHORT_AUTO = /^-(?!R)[A-Za-z]*a[A-Za-z]*(=|$)/;
const autoOption = (args) =>
  args.find((a) => (a.split('=')[0] === '--auto' ? a !== '--auto=false' : SHORT_AUTO.test(a)));

// Comando simples: nenhum token do merge pode ter redirecionamento ou expansão, nem mesmo dentro de valor
// de opção (senão `--subject >x` engole o token seguinte). Opções com valor precisam de um valor depois.
const UNSAFE_TOKEN = /[<>$`*?{}~!]/;
const MERGE_OPTIONS_WITH_VALUE = [
  '--subject', '-t', '--body', '-b', '--body-file', '-F', '--match-head-commit', '-R', '--repo', '--author-email', '-A',
];

function checkSimpleMerge(args) {
  const unsafe = args.find((a) => UNSAFE_TOKEN.test(a));
  if (unsafe !== undefined) {
    return block(
      'Faça o merge com um comando simples, sem redirecionamento nem expansão: `gh pr merge <n> ...`. ' +
        `Encontrado: ${unsafe}.`
    );
  }
  for (let i = 0; i < args.length; i++) {
    if (!MERGE_OPTIONS_WITH_VALUE.includes(args[i])) continue;
    const next = args[i + 1];
    if (next === undefined || next.startsWith('-')) {
      return block(
        `A opção \`${args[i]}\` precisa de um valor logo depois dela (sem outro \`-\` no meio). ` +
          `Encontrado: ${args[i]}.`
      );
    }
    i++;
  }
  return null;
}

// Merge na develop: travas, CI verde, etiquetas e teste no celular, nesta ordem; para no primeiro bloqueio.
function checkDevelopMerge(facts, target) {
  const ref = /^\d+$/.test(target) ? `#${target}` : target;
  const guarded = touches(facts.files, GUARD_PATHS);
  if (guarded.length) {
    return block(
      `O PR ${ref} altera as travas ou o processo (${guarded.join(', ')}): o merge é da pessoa responsável.`
    );
  }
  if (!ciGreen(facts.checks)) {
    const names = facts.checks.map((c) => c.name).join(', ') || 'nenhum check';
    return block(`CI não está verde no PR ${ref} (${names}): espere o CI (\`gh pr checks ${target} --watch\`).`);
  }
  const missing = ['revisado', 'qa-ok'].filter((l) => !facts.labels.includes(l));
  if (missing.length) {
    return block(
      `Faltam as etiquetas ${missing.join(', ')} no PR ${ref}: o merge na develop exige revisão (\`revisado\`) e QA (\`qa-ok\`).`
    );
  }
  if (touches(facts.files, DEVICE_TEST_PATHS).length && !facts.labels.includes('teste-celular-ok')) {
    return block(
      `O PR ${ref} mexe em cifra, repertório ou pad: precisa do teste no celular (\`teste-celular-ok\`).`
    );
  }
  return null;
}

// Release develop -> main, feito pelo agente só com todas as travas: head develop, opções na allowlist
// (só `--merge`, `--match-head-commit` e as de valor listadas), SHA conferido, CI verde, fora da janela
// do culto e sem incidente aberto. Qualquer outro token que comece com `-` bloqueia: não se tenta
// interpretar as formas do pflag (`-dm=false`, `-md`, `--merge=true`...).
const RELEASE_BOOL_OPTIONS = ['--merge', '-m'];
const RELEASE_VALUE_OPTIONS = ['--subject', '-t', '--body', '-b', '--body-file', '-F', '-R', '--repo', '--match-head-commit'];
const RELEASE_LONG_VALUE_OPTION = /^--(subject|body|body-file|repo|match-head-commit)=/;

// Varre as opções do release: { offending: primeiro token fora da allowlist ou null, merge: se --merge/-m veio }.
// Posicionais (alvo) e redirecionamentos passam; valores das opções de valor são pulados.
function scanReleaseOptions(args) {
  let merge = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('-')) {
      if (/^[\d*]*[<>]+$/.test(a)) i++; // `> arquivo`
      continue;
    }
    if (RELEASE_BOOL_OPTIONS.includes(a)) merge = true;
    else if (RELEASE_VALUE_OPTIONS.includes(a)) i++;
    else if (!RELEASE_LONG_VALUE_OPTION.test(a)) return { offending: a, merge };
  }
  return { offending: null, merge };
}

const releaseOptionsBlock = (target, sha, found) =>
  block(
    `Release só com \`gh pr merge ${target} --merge --match-head-commit ${sha}\` ` +
      '(opções permitidas: `--merge`/`-m`, `--match-head-commit`, `--subject`/`-t`, `--body`/`-b`, ' +
        '`--body-file`/`-F`, `-R`/`--repo`). ' +
      `Encontrado: ${found}.`
  );

function checkReleaseMerge(facts, args, { matchHead }, target, state) {
  if (facts.head !== 'develop') {
    return block(`O release (PR para main) só pode vir da develop (head atual: "${facts.head}").`);
  }
  const { offending, merge } = scanReleaseOptions(args);
  if (offending !== null) return releaseOptionsBlock(target, facts.headSha, offending);
  if (!merge) return releaseOptionsBlock(target, facts.headSha, 'sem --merge');
  if (matchHead !== facts.headSha) {
    return block(
      `Informe \`--match-head-commit ${facts.headSha}\` (SHA atual da develop no PR de release): ` +
        'o merge só segue se o SHA conferir.'
    );
  }
  if (!ciGreen(facts.checks)) {
    const names = facts.checks.map((c) => c.name).join(', ') || 'nenhum check';
    return block(`CI não está verde no release (${names}): espere o CI (\`gh pr checks ${target} --watch\`).`);
  }
  if (isFreezeWindow(state.now())) {
    return block(
      'Janela do culto (quinta e domingo, a partir das 16h30 em Brasília): o release espera a janela passar.'
    );
  }
  const open = state.openIncidents();
  if (open === null) {
    return block('Não foi possível verificar incidentes abertos: o release fica bloqueado até a checagem voltar.');
  }
  const closes = new Set(closingRefs(facts.body ?? ''));
  const unclosed = open.filter((n) => !closes.has(n));
  if (unclosed.length) {
    const list = unclosed.map((n) => `#${n}`).join(', ');
    return block(
      `Há incidente aberto (${list}): o próximo release precisa fechá-lo (\`Closes #${unclosed[0]}\`).`
    );
  }
  return null;
}

// Merge só para PRs com base develop ou main (fail closed: fatos indisponíveis ou base desconhecida bloqueiam).
function checkMerge(args, state, leadingRepo) {
  if (/\bGH_REPO\b/.test(state.command)) {
    return block('Não use GH_REPO com `gh pr merge`: defina o repositório com -R <dono/repo>.');
  }
  if (++state.merges > 1) {
    return block('Faça um merge por comando: rode cada `gh pr merge` separadamente.');
  }
  const simple = checkSimpleMerge(args);
  if (simple) return simple;
  const auto = autoOption(args);
  if (auto !== undefined) {
    return block(
      'Merge com `--auto` (ou o alias `-a`) não é permitido em nenhuma base: o merge é feito direto. ' +
        `Encontrado: ${auto}. Develop: \`--squash --delete-branch\`; release: \`--merge --match-head-commit <sha>\`.`
    );
  }
  const parsed = parseMergeArgs(args);
  const { positionals, repo } = parsed;
  if (positionals.length > 1) {
    return block('`gh pr merge` com mais de um alvo: informe apenas um PR (`gh pr merge <n> --squash --delete-branch`).');
  }
  const target = positionals[0] ?? null;
  if (target === null) {
    return block(
      'Sem alvo explícito o PR depende da branch/diretório atual: informe o número do PR: ' +
        '`gh pr merge <n> --squash --delete-branch`.'
    );
  }
  const facts = state.resolvePr(target, repo ?? leadingRepo);
  if (facts?.base === 'develop') return checkDevelopMerge(facts, target);
  if (facts?.base === 'main') return checkReleaseMerge(facts, args, parsed, target, state);
  return block(
    'Não foi possível determinar a base do PR; merge bloqueado. ' +
      `Confira com \`gh pr view ${target} --json baseRefName\` e só faça merge de PRs com base develop.`
  );
}

// Tokens de uma invocação de `gh api` no texto cru (as chaves de `{owner}/{repo}` quebram os
// segmentos, então o texto é varrido direto). Aspas agrupam; `;`, `|`, `&` e quebra de linha terminam.
function apiInvocations(command) {
  const calls = [];
  const re = /(?:^|[\s;|&(){}"'/])gh(?:\.exe)?["']?\s+(?:-\S+\s+)*api(?=\s|$)/gi;
  for (let m; (m = re.exec(command)); ) {
    const tokens = [];
    let cur = '';
    let has = false;
    let quote = null;
    for (let i = m.index + m[0].length; i < command.length; i++) {
      const c = command[i];
      if (quote) {
        if (c === quote) quote = null;
        else cur += c;
      } else if (c === '"' || c === "'") {
        quote = c;
        has = true;
      } else if (/[;|&\n\r]/.test(c)) {
        break;
      } else if (/\s/.test(c)) {
        if (has) tokens.push(cur);
        cur = '';
        has = false;
      } else {
        cur += c;
        has = true;
      }
    }
    if (has) tokens.push(cur);
    calls.push(tokens);
  }
  return calls;
}

const API_FIELD = /^(-i*[fF].*|--field(=.*)?|--raw-field(=.*)?|--input(=.*)?)$/;
const API_VALUE_FLAGS = [
  '-H', '--header', '-q', '--jq', '-t', '--template', '-X', '--method', '-f', '-F',
  '--field', '--raw-field', '--input', '--cache', '--hostname', '-p', '--preview',
];

// Endpoint: primeiro posicional depois de `api`, ignorando flags e os valores delas.
function apiEndpoint(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (API_VALUE_FLAGS.includes(t)) i++;
    else if (!t.startsWith('-')) return t;
  }
  return null;
}

// `gh api` só para leitura: método GET, sem campos (que fazem o gh usar POST) e sem --input.
// Exceção: endpoint graphql sem `mutation` e sem `@arquivo` aceita -f/-F (consultas usam POST com campos).
function apiMutates(tokens, command) {
  const graphql =
    apiEndpoint(tokens) === 'graphql' && !/mutation/i.test(command) && !tokens.some((t) => /=@/.test(t));
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    let method;
    if (t === '--method') method = tokens[i + 1];
    else if (t.startsWith('--method=')) method = t.slice(9);
    else if (/^-i*X/.test(t)) method = t.replace(/^-i*X/, '') || tokens[i + 1];
    if (method !== undefined && method.toUpperCase() !== 'GET') return true;
    if (/^--input(=|$)/.test(t)) return true;
    if (API_FIELD.test(t) && !graphql) return true;
  }
  return false;
}

function checkApi(command) {
  if (apiInvocations(command).some((tokens) => apiMutates(tokens, command))) {
    return block('`gh api` só é permitido para leitura (GET); para PRs use `gh pr ...`.');
  }
  return null;
}

function checkGh(tokens, state) {
  let i = 1;
  let leadingRepo = null;
  while (i < tokens.length && tokens[i].startsWith('-')) {
    const t = tokens[i];
    if (t === '-R' || t === '--repo') leadingRepo = tokens[i + 1] ?? null;
    else if (t.startsWith('--repo=')) leadingRepo = t.slice(7);
    else if (/^-R./.test(t)) leadingRepo = t.slice(2);
    i += t === '-R' || t === '--repo' ? 2 : 1;
  }
  const [area, action, ...args] = tokens.slice(i);
  if (area === 'api') {
    return apiMutates(tokens.slice(i + 1), state.command)
      ? block('`gh api` só é permitido para leitura (GET); para PRs use `gh pr ...`.')
      : null;
  }
  if (area !== 'pr') return null;
  if (action === 'merge') return checkMerge(args, state, leadingRepo);
  if (action === 'review' && args.some((a) => a === '--approve' || /^-[A-Za-z]*a[A-Za-z]*$/.test(a))) {
    return block(
      'Aprovar PR é decisão humana: agentes nunca rodam `gh pr review --approve`. ' +
        'A revisão do code-reviewer é por relatório; a aprovação (e o merge) de develop → main é só da pessoa responsável.'
    );
  }
  if (action === 'edit' && optionValue(args, ['--base', '-B']) === 'main') {
    return block(
      'Base main só via PR develop → main criado com `gh pr create --base main --head develop`; ' +
        'não altere a base de um PR existente para main.'
    );
  }
  if (action === 'create') {
    const blocked = checkPrCreate(args, state.branch);
    if (!blocked) state.prCreate = true;
    return blocked;
  }
  return null;
}

const WRAPPERS = new Set([
  '(', '{', '!', 'then', 'do', 'else', 'elif', 'if', 'while', 'until',
  'time', 'command', 'env', 'sudo', 'nohup', 'try', 'catch', 'finally', 'elseif', 'foreach',
]);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'pwsh', 'powershell']);

// Remove do início do segmento: atribuições de ambiente, palavras-chave/wrappers e "(" coladas.
function stripPrefixes(tokens) {
  const out = [...tokens];
  while (out.length) {
    out[0] = out[0].replace(/^\(+/, '');
    if (out[0] === '' || WRAPPERS.has(out[0]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(out[0])) out.shift();
    else break;
  }
  return out;
}

// "/usr/bin/git" -> "git"; "C:\Git\git.EXE" -> "git".
const programName = (token) => token.split(/[\\/]/).pop().replace(/\.exe$/i, '');

// Código inline de `bash -c "..."` / `pwsh -Command "..."`, se houver.
function inlineScript(tokens) {
  const i = tokens.findIndex((t) => /^-(c|command)$/i.test(t));
  return i !== -1 ? tokens[i + 1] : undefined;
}

function evaluateSegments(command, state, stagedFiles) {
  for (const segment of splitSegments(command)) {
    const tokens = stripPrefixes(segment);
    if (!tokens.length) continue;
    const program = programName(tokens[0]);
    let result = null;
    if (program === 'git') result = checkGit(tokens, state, stagedFiles);
    else if (program === 'gh') result = checkGh(tokens, state);
    else if (SHELLS.has(program)) {
      const script = inlineScript(tokens);
      if (script) result = evaluateSegments(script, state, stagedFiles);
    }
    if (result) return result;
  }
  return null;
}

const PR_REMINDER =
  '[git-guard] Lembrete: rode os testes (node --test ".claude/**/*.test.mjs" e os do monorepo) ' +
  'e confirme que passam antes de abrir o PR.';

export function evaluateCommand({
  command,
  branch,
  stagedFiles = [],
  resolvePr = () => null,
  now = () => new Date(),
  openIncidents = () => null,
}) {
  const state = { branch, prCreate: false, resolvePr, now, openIncidents, command, merges: 0 };
  const blocked = checkApi(command) ?? evaluateSegments(command, state, stagedFiles);
  if (blocked) return blocked;
  return state.prCreate ? { allow: true, reminder: PR_REMINDER } : { allow: true };
}

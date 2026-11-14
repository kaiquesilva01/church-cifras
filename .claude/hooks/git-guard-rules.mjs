// Regras puras do guard de Git: decide se um comando de shell pode rodar
// sob o fluxo de branches do projeto. Sem dependências, sem I/O.

export const PROTECTED_BRANCHES = ['main', 'develop'];

const isProtected = (b) => PROTECTED_BRANCHES.includes(b);

// Divide o comando em segmentos (separados por &&, ||, ;, |, & e quebras de
// linha fora de aspas); cada segmento é uma lista de tokens sem as aspas.
export function splitSegments(command) {
  const segments = [];
  let tokens = [];
  let cur = '';
  let has = false; // token em andamento (permite string vazia entre aspas)
  let quote = null;

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
    } else if (c === '"' || c === "'") {
      quote = c;
      has = true;
    } else if (c === ';' || c === '\n' || c === '\r' || c === '|' || c === '&') {
      endSegment();
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
    'Não foi possível determinar a branch após `git checkout`; ' +
      'rode o checkout em um comando separado e só então faça commit/push.'
  );

const pdfBlock = (files) =>
  block(
    `Nunca commite arquivos PDF (repositório público, letras protegidas por direitos autorais): ${files.join(', ')}. ` +
      'Remova do stage com `git restore --staged <arquivo>` e adicione o padrão ao .gitignore.'
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

function checkPush(args, branch) {
  const positional = args.filter((a) => !a.startsWith('-'));
  const refspecs = positional.slice(1); // primeiro posicional é o remote
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
    const head = optionValue(args, ['--head', '-H']) ?? branch;
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
  if (sub === 'switch') state.branch = target === '-' ? UNKNOWN : target;
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

function checkGh(tokens, state) {
  const [area, afterArea] = skipLeadingFlags(tokens.slice(1), ['-R', '--repo']);
  const [action, ...args] = afterArea;
  if (area !== 'pr') return null;
  if (action === 'merge') {
    return block(
      'Agentes nunca executam `gh pr merge`: o merge é decisão humana. ' +
        'Deixe o PR aberto (`gh pr create --base develop`) e avise a pessoa responsável.'
    );
  }
  if (action === 'create') return checkPrCreate(args, state.branch);
  return null;
}

const WRAPPERS = new Set([
  '(', '{', '!', 'then', 'do', 'else', 'elif', 'if', 'while', 'until',
  'time', 'command', 'env', 'sudo', 'nohup',
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

export function evaluateCommand({ command, branch, stagedFiles = [] }) {
  return evaluateSegments(command, { branch }, stagedFiles) ?? { allow: true };
}

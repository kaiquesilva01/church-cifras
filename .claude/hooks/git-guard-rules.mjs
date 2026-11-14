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

function checkCommit(branch, stagedFiles) {
  if (isProtected(branch)) {
    return block(
      `Commit direto em "${branch}" é proibido. Crie uma branch a partir do develop: ` +
        '`git checkout -b <tipo>/<nome> origin/develop` e commite nela.'
    );
  }
  const pdfs = stagedFiles.filter((f) => /\.pdf$/i.test(f));
  if (pdfs.length) {
    return block(
      `Nunca commite arquivos PDF (repositório público, letras protegidas por direitos autorais): ${pdfs.join(', ')}. ` +
        'Remova do stage com `git restore --staged <arquivo>` e adicione o padrão ao .gitignore.'
    );
  }
  return null;
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
    const dest = t === 'HEAD' || t === '' ? branch : t;
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
    if (head !== 'develop') {
      return block(
        `PR para main só pode vir do develop (head atual: "${head}"). ` +
          'Para features use `gh pr create --base develop`.'
      );
    }
  }
  return null;
}

// Pula opções globais do git (-C <dir>, -c <k=v>, --git-dir, --work-tree, ...)
// e devolve [subcomando, argumentos restantes].
function parseGitArgs(args) {
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    const a = args[i];
    const takesValue = a === '-C' || a === '-c' || a === '--git-dir' || a === '--work-tree';
    i += takesValue ? 2 : 1;
  }
  return [args[i], args.slice(i + 1)];
}

function checkGit(tokens, state, stagedFiles) {
  const [sub, rest] = parseGitArgs(tokens.slice(1));
  if (!sub) return null;

  if (sub === 'commit') return checkCommit(state.branch, stagedFiles);
  if (sub === 'push') return checkPush(rest, state.branch);

  if (sub === 'checkout' || sub === 'switch') {
    const createFlags = sub === 'checkout' ? ['-b', '-B'] : ['-c', '-C', '--create', '--force-create'];
    const i = rest.findIndex((a) => createFlags.includes(a));
    if (i !== -1 && rest[i + 1]) state.branch = rest[i + 1];
    else if (rest[0] && !rest[0].startsWith('-')) state.branch = rest[0];
  }
  return null;
}

function checkGh(tokens, state) {
  const [, area, action, ...args] = tokens;
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

// Remove atribuições de ambiente iniciais (FOO=1 git commit).
function skipEnvAssignments(tokens) {
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
  return tokens.slice(i);
}

export function evaluateCommand({ command, branch, stagedFiles = [] }) {
  const state = { branch };
  for (const segment of splitSegments(command)) {
    const tokens = skipEnvAssignments(segment);
    const program = tokens[0];
    let result = null;
    if (program === 'git') result = checkGit(tokens, state, stagedFiles);
    else if (program === 'gh') result = checkGh(tokens, state);
    if (result) return result;
  }
  return { allow: true };
}

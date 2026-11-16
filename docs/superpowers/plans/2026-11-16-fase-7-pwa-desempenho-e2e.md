# Fase 7 — PWA, desempenho e testes E2E: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O site abre rápido no celular (pacote inicial menor, cifra já vista abre em < 1 s), pode ser instalado na tela inicial como app, e os fluxos principais têm testes E2E no navegador (Playwright) contra os emuladores — localmente e na CI. Fecha os débitos registrados nas Fases 5 e 6.

**Architecture:** Firebase Storage/Functions carregados sob demanda; nomes de chunk estáveis; recarga automática em falha de chunk após deploy. Fontes substitutas pré-reduzidas (subset) no repositório, geradas por script, com teste de glyphs. Visualizador com cache de documentos e um `PDFWorker` compartilhado. PWA com `vite-plugin-pwa` (Workbox): precache só do app shell; cache em tempo de execução para chunks lazy, worker do pdf.js, fontes e PDFs (caminhos imutáveis); nunca para callables. Playwright com projetos celular e computador, subindo os emuladores via `firebase emulators:exec` e o site via `vite preview`.

**Tech Stack:** Vite 8, vite-plugin-pwa (exato), Workbox, `subset-font` (exato, dev), Playwright (exato), Firebase emulators.

**Spec:** `docs/superpowers/specs/2026-11-13-church-cifras-design.md` (§6.11 desempenho, §3 anti-objetivo "abrir cifra demorar", §11 item 7)

## Global Constraints

- Metas (medidas e registradas no relatório): JS inicial (gzip) ≤ 60% do atual; abrir cifra já visitada (com SW) < 1 s em perfil "Fast 4G" do Playwright; PDF gerado com fontes reduzidas ≤ 3× o tamanho do original nos 8 PDFs reais.
- Fontes reduzidas: conjunto = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#()/+-°ºø:[]|.,; '` + Latin-1 (U+00A0–U+00FF) + `–—…`. Script `packages/overlay/scripts/subset-fonts.mjs` gera `fonts/*.ttf` a partir dos originais (mantidos em `fonts/source/`); `fonts/README.md` registra o conjunto e os SHA-256 dos dois.
- PWA: `name` `Cifras · Louvor`, `short_name` `Cifras`, `theme_color` `#4f46e5`, `background_color` `#f2f2f4`, `display` `standalone`, `lang` `pt-BR`, ícones 192/512 + maskable; aviso de nova versão `Nova versão disponível.` + botão `Atualizar`; no logout apagar o cache de PDFs (`cifras-pdfs`).
- Cache em tempo de execução: chunks lazy e worker do pdf.js `StaleWhileRevalidate`; fontes `CacheFirst` (1 ano); PDFs do Storage `CacheFirst` (60 dias, máx. 200 entradas) **somente GET de objetos** `/v0/b/*/o/songs%2F...`; Firestore/Functions/Auth **nunca** em cache do SW.
- Hosting: `sw.js` e `index.html` com `Cache-Control: no-cache`.
- E2E: Playwright com projetos `mobile` (Pixel 7) e `desktop` (1280×800); dados criados pelo próprio teste com PDFs **sintéticos**; login pelo popup do Auth Emulator (`Add new account`); screenshots salvos em `e2e/artifacts/` (ignorado pelo Git).
- UI pt-BR; identificadores em inglês; versões exatas; TS strict; Conventional Commits + `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; `git add`/`git commit` separados.

## Review Focus

1. **Deploy novo com aba aberta** → chunk antigo some → recarga automática uma vez (sem loop) — teste do handler `vite:preloadError`.
2. **Logout em aparelho compartilhado** → PDFs em cache do SW apagados — teste.
3. **Acorde com caractere fora do conjunto reduzido** (ex.: `♭`, `♯`) → glyph ausente → teste de cobertura falha / aviso — teste de glyphs com o conjunto exato.
4. **SW servindo HTML antigo** → `index.html` sem cache e atualização com aviso — teste de headers no `firebase.json`.
5. **E2E instável** → esperas por estado da UI, sem `sleep`; 3 execuções seguidas verdes antes do PR.

---

### Task 1: Pacote inicial e visualizador mais leves (frontend-dev)

**Files:** `apps/web/src/lib/firebase.ts` (Storage/Functions sob demanda), `catalogApi.ts` (usa getters assíncronos), `vite.config.ts` (`manualChunks` com nomes estáveis: `firebase-core`, `pdfjs`, `overlay`), `src/main.tsx` (`vite:preloadError` → recarrega uma vez, marcador em `sessionStorage`), `src/viewer/*` (cache LRU de 3 documentos por caminho com `destroy` ao sair; `PDFWorker` único; `closePanel` limpa erro de preparo para tentar de novo; carregar só fontes das runs em negrito + indicador — `createMeasure` tolerante: fonte não carregada → largura estimada 0,6 em e registra aviso; zerar `width/height` dos canvases ao desmontar), `src/import/*` (`console.error` no catch da fila).
- [ ] Testes que falham primeiro: `loads storage and functions lazily` (mock de import dinâmico chamado só ao usar); `reloads once on preload error`; `reuses cached pdf documents across key switches`; `retries preparation after closing the panel`; `measure falls back for unloaded fonts`; `releases canvas memory on unmount`. Registrar no relatório: tamanhos (gzip) antes/depois dos chunks.
- [ ] Commit `perf(web): lazy firebase services, stable chunks and viewer document cache`.

### Task 2: Fontes reduzidas (backend-dev)

**Files:** `packages/overlay/scripts/subset-fonts.mjs`, `packages/overlay/fonts/source/*.ttf` (originais movidos), `packages/overlay/fonts/*.ttf` (reduzidas), `fonts/README.md`, `package.json` (script `fonts:subset`, devDependency `subset-font` exata), testes de glyphs/tamanho.
- [ ] Testes que falham primeiro: `subset fonts cover the chord charset` (cada code point do conjunto tem glyph ≠ 0 com contorno); `subset fonts are smaller than sources`; fixtures reais: PDF gerado ≤ 3× o original (pula sem a pasta) e registrar os tamanhos.
- [ ] Commit `perf(overlay): ship subset substitute fonts`.

### Task 3: PWA (frontend-dev)

**Files:** `apps/web/vite.config.ts` (vite-plugin-pwa `registerType: 'prompt'`, `workbox.globPatterns` só shell, `runtimeCaching` conforme Global Constraints, `navigateFallback: '/index.html'`, excluir `/__/` e APIs), `apps/web/public/icons/*` (ícone simples: fundo `#4f46e5`, nota musical branca; SVG fonte + PNGs 192/512/maskable gerados por script), `src/pwa/UpdatePrompt.tsx`, logout apaga `caches.delete('cifras-pdfs')`, `firebase.json` (headers no-cache para `/sw.js`, `/index.html`), `tests/config/firebase-json.test.ts`.
- [ ] Testes que falham primeiro: `shows update prompt and reloads on Atualizar`; `clears pdf cache on sign out`; `firebase.json serves sw and index without cache`; teste do manifesto gerado no build (nome, cores, ícones).
- [ ] Commit `feat(web): installable pwa with offline shell and pdf cache`.

### Task 4: E2E com Playwright (qa)

**Files:** `e2e/{playwright.config.ts,fixtures/*.ts,*.spec.ts}`, `e2e/package.json` (workspace `@cifras/e2e`), root script `test:e2e` (`firebase emulators:exec --project demo-church-cifras "npm run e2e -w @cifras/e2e"` com functions buildadas e `vite preview` iniciado pelo `webServer` do Playwright), `.github/workflows/ci.yml` (job `e2e`: Java 21, cache dos jars e browsers, `npx playwright install --with-deps chromium`), `.gitignore` (`e2e/artifacts/`, `playwright-report/`, `test-results/`).
- [ ] Cenários (mobile + desktop): login admin (popup do emulador); upload de PDF sintético (sugestões, salvar); busca por música e por cantor (abas); visualizador (tons, baixar PDF → evento de download); Mudar tom (prévia, confirmar, novo tom aberto; colisão avisada); visitante sem "Mudar tom" e sem "Nova cifra"; Pessoas (promover visitante a membro); Gerenciar (editar nome, apagar tom, apagar música digitando o título); Importar em lote (2 PDFs sintéticos + 1 não-PDF; CSV baixado); cabeçalho em 360 px sem estouro; PWA: manifest e SW registrados no build de preview.
- [ ] 3 execuções locais seguidas verdes; screenshots dos passos principais em `e2e/artifacts/` para inspeção do orquestrador.
- [ ] Commits `test(e2e): playwright flows against emulators` e `ci: run e2e against emulators`.

### Task 5: Polimento da importação (frontend-dev)

**Files:** `apps/web/src/import/*`
- [ ] `Remover` por linha e `Limpar lista`; linhas aparecem à medida que cada arquivo termina de ser lido (ordem estável); testes primeiro.
- [ ] Commit `feat(web): progressive rows and list controls in batch import`.

### Task 6: Verificação visual, PR e release (orquestrador)

- [ ] Inspecionar os screenshots E2E (celular e computador) contra os mockups aprovados.
- [ ] Checks completos, PR para `develop`, CI (incluindo E2E) verde, revisão final (code-reviewer), correções, merge.
- [ ] Abrir o PR `develop → main` com o resumo de todas as fases e o checklist de deploy (`docs/deploy.md`) — **merge só pelo dono**.

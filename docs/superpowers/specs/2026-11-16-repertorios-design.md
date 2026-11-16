# Repertórios (setlists) — Documento de Design

- **Data:** 2026-11-16
- **Status:** rascunho para aprovação
- **Fase:** 8 (acrescenta-se à §11 do [design principal](2026-11-13-church-cifras-design.md))
- **Autor da ideia:** responsável pelo ministério de louvor (dono do produto)

> Convenção (a mesma do design principal): **[decidido]** = definido pelo dono do produto;
> **[proposta]** = proposta nossa aceita na conversa; **[decisão nossa]** = resolvido por nós sem consulta, por não mudar
> o que é construído — revisar ao ler.
>
> Reabre o item "Setlists" dos não-objetivos do design principal (§3); as edições estão na §9.

---

## 1. Intenção e porquê

O ministério canta em dois cultos por semana (quinta e domingo). Hoje cada cifra é aberta uma a uma, e a ordem dos
louvores vive na cabeça ou numa conversa à parte. O dono quer **montar com antecedência o repertório de um culto**, com as
cifras na ordem em que serão cantadas, e **mexer nele na hora**: a sequência pode mudar ali mesmo, e podem entrar louvores
novos [decidido].

Valor para o músico: abrir o app no culto, ver o repertório do dia e passar de uma cifra à seguinte sem procurar nada,
já no tom combinado.

> O design principal (§3) listava "Setlists/repertório de culto" como não-objetivo do MVP. As Fases 0–7 estão entregues
> e esta fase reabre o item. A §9 abaixo lista as edições a fazer no design principal.

## 2. Usuários e papéis

Segue o design principal (§2); nada de papel novo.

| Papel | Repertórios |
|---|---|
| **Visitante** | Ver repertórios e navegar pelas cifras deles; **sem** controles de edição [proposta] |
| **Membro** | + criar, editar (ordem, tom, itens, data/rótulo), duplicar e apagar repertórios [proposta] |
| **Admin** | Igual ao membro |

## 3. Objetivos, não-objetivos e anti-objetivos

**Objetivos**
1. Criar o repertório de um culto: **data** + **rótulo** (Quinta, Domingo, …), com louvores **ordenados**, cada um com seu **tom** [decidido].
2. Editar na hora com pouco esforço: reordenar, trocar o tom de um item, remover e acrescentar louvores [decidido].
3. Dentro de uma cifra aberta pelo repertório, ir para a **anterior/próxima** sem voltar à lista [decidido].
4. Mudanças feitas por outra pessoa chegam **ao vivo**, mas só alteram a tela de quem está lendo **se a pessoa aceitar** [decidido].
5. Pode haver **mais de um repertório no mesmo dia**; raro, mas não pode travar no futuro [decidido].
6. Cada repertório é **apagado 30 dias depois da data do culto** [decidido].
7. Mobile-first, como o resto do app.

**Não-objetivos**
- Anotações por louvor (introdução, quem canta, dinâmica) [decisão nossa].
- Link público, exportar o repertório inteiro em um único PDF ou imprimir [decisão nossa].
- Notificação push, escala de músicos/líder, comentários [decisão nossa].
- Histórico de versões ou "desfazer" de edições [decisão nossa].
- Gestos de deslizar para trocar de cifra; a navegação é por botões [proposta].
- Permissões por repertório (todo membro edita todo repertório) [proposta].

**Anti-objetivos (falha mesmo que "funcione")**
- A lista mudar sozinha na tela do músico enquanto ele lê/toca, sem ele aceitar.
- Perder um louvor acrescentado por uma pessoa porque outra editou ao mesmo tempo.
- Um item dizer "Bb" e o app abrir silenciosamente outro tom, sem avisar.
- Abrir uma cifra a partir do repertório ser mais lento que abri-la pela busca (a meta de < 1 s do design principal vale).
- O repertório sumir **antes** do fim do dia do culto.

## 4. Restrições

- Stack e arquitetura do design principal: React + TS, Firebase direto do cliente com Security Rules; **sem Cloud Function** nesta fase [decidido, ver §5].
- Fluxo Git e definição de pronto do `AGENTS.md`: branch a partir de `develop`, TDD, testes das Security Rules, PR para `develop` revisado pelo `code-reviewer`.
- O código novo da fase fica em rota carregada sob demanda; a biblioteca de arrastar não entra no bundle inicial (§6.11 do design principal).
- Texto de UI em pt-BR; identificadores de código em inglês.
- A UI deve ser compatível com o que o `AppShell`, o `HomePage` e o `ViewerPage` já fazem hoje; mudanças nesses arquivos são cirúrgicas.

## 5. Abordagens consideradas

### 5.1 Como identificar e achar o repertório
| | Abordagem | Trade-off | |
|---|---|---|---|
| **A** | **Data de culto + rótulo; "Próximo culto" na tela inicial; histórico de 30 dias; duplicar** | No dia do culto o repertório já está à vista | **Escolhida** [decidido] |
| B | Nome livre, sem data | Mais flexível, mas ninguém sabe qual é o de hoje sem procurar | Descartada |

### 5.2 Como entregar mudanças feitas por outra pessoa
| | Abordagem | Trade-off | |
|---|---|---|---|
| 1 | Só ao reabrir a tela | Simples, mas na troca de última hora cada um precisa atualizar à mão | Descartada |
| 2 | Atualizar sozinho sempre | A lista mexe sob o dedo do músico | Descartada (anti-objetivo) |
| **3** | **Ao vivo com banner "Atualizar"; sem aceitar, a tela fica como está** | Um pouco mais de estado na tela | **Escolhida** [decidido] |

### 5.3 Navegação entre cifras durante o culto
| | Abordagem | Trade-off | |
|---|---|---|---|
| 1 | Voltar para a lista e escolher a próxima | Simples, mas dois toques com a música acabando | Descartada |
| **2** | **Barra "‹ Anterior · 2 de 5 · Próxima ›" dentro da cifra, abrindo no tom do repertório** | O visualizador ganha um modo de contexto | **Escolhida** [decidido] |

### 5.4 Armazenamento
| | Abordagem | Trade-off | |
|---|---|---|---|
| **A** | **Um documento `setlists/{id}` com a lista de itens dentro** | Uma escrita por edição, uma assinatura por tela. Rules não validam o conteúdo de cada item (só tamanho e quem escreve). Edições concorrentes tratadas por transação | **Escolhida** [decidido] |
| B | Um documento por item numa subcoleção, com campo de posição | Sem colisão em acréscimos e regras por item, mas várias leituras, posição fracionária e comparação complexa para o banner | Descartada |
| C | Tudo por Cloud Functions | Valida no servidor, mas soma 1–3 s de atraso a cada edição na hora do culto | Descartada |

### 5.5 Reordenar no celular
| | Abordagem | Trade-off | |
|---|---|---|---|
| **1** | **Arrastar pela alça `≡` + botões ▲ ▼ em cada item** | Natural com o dedo, com alternativa precisa e acessível. Exige biblioteca leve (`@dnd-kit`) | **Escolhida** [decidido] |
| 2 | Só botões ▲ ▼ | Sem biblioteca, mas mover da posição 6 para a 2 vira vários toques | Descartada |

## 6. Design técnico

### 6.1 Modelo de dados (Firestore)

```
setlists/{setlistId}                 // id aleatório do Firestore
  date: string                       // 'YYYY-MM-DD', data local do culto (fuso America/Sao_Paulo)
  label: string                      // 1–60 caracteres: 'Quinta', 'Domingo', 'Domingo à noite', …
  items: Array<{ id: string, songId: string, key: KeyName }>   // até 40; ordem = ordem do array
  expiresAt: Timestamp               // fim do dia `date` + 30 dias; campo de TTL
  createdBy, createdAt, updatedBy, updatedAt
```

- `items[].id` é um identificador estável (UUID) do **item**, não da música: é o que a URL, a navegação e o banner usam,
  então mover itens não quebra nada [decisão nossa]. A mesma música pode aparecer duas vezes (a UI avisa, não impede).
- `key` é o tom do item e deve ser um dos 24 tons válidos (os mesmos de `keyNames()` nas rules).
- Não se copiam título/cantor para o item: a tela resolve `songId` contra `songs` (já assinado pelo `SongsProvider`),
  então renomear uma música reflete no repertório.

### 6.2 Expiração (TTL)

- `expiresAt` = fim do dia da `date` (America/Sao_Paulo) + 30 dias [decidido: 30 dias após o dia do repertório].
  Mudar a data ou duplicar **recalcula** `expiresAt`.
- Política TTL do Firestore sobre `setlists.expiresAt`, declarada em `firestore.indexes.json` (`fieldOverrides` com `ttl: true`)
  e publicada pelo deploy de índices que já existe (§9 do design principal). Quem constrói confirma que o CLI instalado
  aceita essa chave; se não aceitar, configura via `gcloud` e documenta no `AGENTS.md`.
- A exclusão do TTL pode atrasar um dia ou mais, e o emulador não a executa. Por isso **o cliente também esconde**
  repertórios com `expiresAt` no passado: o que o usuário vê não depende do TTL ter rodado [decisão nossa].
- Data nova não pode ser anterior a 29 dias atrás (a UI barra: "já expiraria") [decisão nossa].

### 6.3 Security Rules

```
match /setlists/{setlistId} {
  allow read:   if signedIn();
  allow create: if isEditor() && validSetlist(request.resource.data) && createdBy/updatedBy == auth.uid
                   && createdAt/updatedAt == request.time;
  allow update: if isEditor() && validSetlist(request.resource.data)
                   && createdBy e createdAt inalterados && updatedBy == auth.uid && updatedAt == request.time;
  allow delete: if isEditor();
}
```

- `validSetlist`: chaves exatas, `date` no padrão `YYYY-MM-DD`, `label` de 1–60 caracteres, `items` é lista de até 40,
  `expiresAt` é timestamp.
- **Limite conhecido:** as rules não iteram sobre `items`, então não validam o formato de cada item nem se `songId`
  existe. Como só membro/admin escreve, o risco é aceito [decidido, §5.4]. O cliente valida e tolera itens inválidos
  (renderiza "Música removida" e ignora tom inválido).
- Testes com `@firebase/rules-unit-testing` (`npm run test:rules`): matriz visitante/membro/admin/anônimo em
  leitura, criação, atualização e exclusão; rejeição de `items` com mais de 40; de `label` vazio; de `date` malformada.

### 6.4 Edição e concorrência

- Toda edição de itens (adicionar, remover, mover, trocar tom) é uma **operação** aplicada ao estado mais recente
  dentro de uma **transação** (`runTransaction`): lê o documento, aplica a operação, grava. Nada de enviar a lista
  inteira calculada em cima de uma visão desatualizada.
- As operações são puras e testadas isoladamente (`applySetlistOp(items, op) → items`): `add(songId, key)`,
  `remove(itemId)`, `move(itemId, afterItemId | null)`, `setKey(itemId, key)`. Se o `itemId` não existe mais (outra pessoa
  removeu), a operação não faz nada e a tela avisa [decisão nossa].
- `move` é **relativo a um vizinho** ("depois do item X"; `null` = para o início), não a um índice: se a lista mudou entre
  o toque e a gravação, o item cai ao lado do vizinho que a pessoa viu. Se o vizinho sumiu, o item vai para o fim
  [decisão nossa]. Quem edita com a tela desatualizada pode editar normalmente; não precisa tocar em "Atualizar" antes.
- Edição de data/rótulo é um `update` simples (recalcula `expiresAt`).
- Quando a **própria pessoa** edita, a tela dela passa a exibir o resultado confirmado do servidor, que já inclui o que
  outros mexeram antes. Ela está editando, então é o estado mais recente que importa [decisão nossa].
- A UI otimiza o caso comum (mostra a nova ordem enquanto a transação roda) e reverte com mensagem se falhar.

### 6.5 Tempo real e banner "Atualizar" [decidido]

- Cada repertório aberto tem **uma** assinatura (`onSnapshot`) que alimenta dois estados: `latest` (o que o servidor
  tem) e `shown` (o que a tela desenha).
- Se `latest` e `shown` têm conteúdo diferente (itens: id+tom+ordem; data; rótulo), aparece um **banner na própria tela**
  (`role="status"`; **não** é um `alert()` do navegador): "O repertório foi alterado. **[Atualizar]**".
  "Atualizar" faz `shown := latest` **na própria tela**, sem recarregar o app, sem perder o lugar nem a cifra aberta.
  Se o conteúdo voltar a ser igual (alguém desfez a mudança), o banner some sozinho.
- Sem aceitar, a tela permanece como está, inclusive depois de novas mudanças; o banner continua até aceitar.
- Repertório apagado/expirado enquanto aberto: a tela mantém `shown` e o banner diz que foi removido, com link para a
  lista [decisão nossa].
- O estado `latest`/`shown` vive **acima** da lista e do visualizador (mesma assinatura), para que o músico que pula de
  cifra em cifra não perca o aviso nem reassine o documento a cada troca [restrição para quem constrói].
- Vale também dentro do visualizador (§6.7): o banner aparece sem tirar a cifra da tela.

### 6.6 Telas e rotas

| Rota | Tela |
|---|---|
| `/?aba=repertorios` | Nova aba **Repertórios** na tela inicial ao lado de Músicas/Cantores |
| `/repertorios/:id` | Repertório (lista editável) |
| `/musicas/:songId?tom=X&repertorio=:id&item=:itemId` | Visualizador com barra de repertório (§6.7) |

**Tela inicial.** No topo, o cartão **Próximo culto**: o repertório de data mais próxima a partir de hoje (hoje inclusive).
Se houver mais de um nessa data, o cartão lista todos. Sem repertório futuro, o cartão não aparece.

```
Próximo culto
┌─────────────────────────────────────┐
│ Domingo · 22/11        5 louvores  ›│
└─────────────────────────────────────┘
 Músicas | Cantores | Repertórios   [＋ Novo]
```

**Aba Repertórios.** "Próximos" (data crescente) e "Recentes" (data decrescente, só não expirados). Sem busca [decisão nossa].
"＋ Novo repertório" só para membro/admin, como o "＋ Nova cifra".

**Criar/editar repertório** (diálogo): data (padrão: o próximo dia que seja quinta ou domingo, hoje incluído) e rótulo
(padrão: nome do dia da semana, editável) [proposta]. **Duplicar** (no menu do repertório) abre o mesmo diálogo com os
itens copiados (ids novos) e data/rótulo para o novo culto.

**Repertório.**

```
‹  Domingo · 22/11                 [＋ Adicionar]
┌──────────────────────────────────────────────┐
│ ⚠ O repertório foi alterado.     [Atualizar] │
└──────────────────────────────────────────────┘
 1  ≡  Renova-me            G   ▲ ▼  ✕
 2  ≡  Deus dos Deuses      Bb  ▲ ▼  ✕
 3  ≡  Tua Graça            D   ▲ ▼  ✕
```

- `≡` arrasta (alça própria, para não brigar com a rolagem); ▲ ▼ movem uma posição; `✕` remove; tocar no **tom** abre a
  escolha entre os tons salvos da música; tocar no **título** abre a cifra (§6.7).
- Visitante vê só título e tom, sem controles.
- **＋ Adicionar** abre uma folha de busca (mesma busca em memória de `filterSongs`); tocar numa música a acrescenta **ao
  fim** no seu **tom feito à mão** (o primeiro, em ordem de tons) e a folha continua aberta para acrescentar mais.
  Músicas sem PDF aparecem desabilitadas; músicas já no repertório ganham o selo "já está" [decisão nossa].
- Item cuja música foi apagada aparece como "Música removida" com `✕`, e é pulado na navegação [decisão nossa].
- Se o tom do item deixou de existir (admin apagou o tom), o item mostra o tom riscado e a cifra abre no padrão da
  música com um aviso, nunca em silêncio (anti-objetivo).

### 6.7 Visualizador em contexto de repertório [decidido]

- Aberta pelo repertório (parâmetros `repertorio` e `item`), a cifra abre no **tom do item** e mostra, junto da barra
  de ações atual, a barra **‹ Anterior · 2 de 5 · Próxima ›**.
- Anterior/Próxima navegam por `replace`, de modo que o botão "voltar" do aparelho leva ao repertório em um passo. Nos
  extremos, o botão fica desabilitado.
- Abrir a mesma música pela busca continua exatamente como hoje, sem a barra.
- Se, depois de um "Atualizar", o item aberto não existe mais, a cifra **continua aberta** e a barra mostra
  "Fora do repertório · Voltar ao repertório" [decisão nossa].
- **Tom do item mudou por outra pessoa e o músico toca em "Atualizar":** a cifra aberta **passa para o novo tom na
  hora** [decidido]. Ele aceitou a mudança ao tocar em "Atualizar", e tocar no tom errado no culto é pior que a cifra
  trocar. O banner do visualizador diz qual tom mudou ("O tom deste louvor mudou para A"). Sem tocar em "Atualizar", a
  cifra não muda de tom sozinha.
- **O músico troca o tom pela cifra** (atalhos de tom ou "Mudar tom"): a barra Anterior/Próxima **continua** (os
  parâmetros `repertorio` e `item` sobrevivem à troca) e aparece o lembrete "Tom do repertório: G · Voltar ao G". Essa
  troca vale só para o músico e **não altera o repertório**; quem quer mudar o tom do item faz isso na lista
  [decisão nossa]. Essa troca é um desvio voluntário: ao tocar em "Atualizar" e o tom do item mudar, vale a regra do
  item acima.
- A fonte de verdade do tom exibido é o `?tom=` da URL (como hoje); o repertório define o `?tom=` inicial ao abrir e ao
  navegar Anterior/Próxima, e quando "Atualizar" muda o tom do item aberto.
- O pré-carregamento do PDF da próxima cifra (para a troca ser rápida) é desejável, desde que não pese na abertura da atual
  (anti-objetivo de desempenho); fica a cargo de quem constrói medir.
- "Mudar tom" no visualizador continua independente do repertório: gerar um tom novo não altera o tom do item
  (o músico troca o tom do item na lista).

### 6.8 Performance

- Rota do repertório e `@dnd-kit` em chunk carregado sob demanda; a tela inicial só ganha a aba e o cartão (sem dnd).
- A lista de repertórios usa uma consulta com `expiresAt > agora`; é pequena (dezenas de documentos).
- Os documentos de repertório são pequenos (≤ 40 itens); sem paginação.

### 6.9 Testes

- **Unidade:** `applySetlistOp`; cálculo de `expiresAt` (fuso, virada de mês/ano); comparação `latest` × `shown` (banner);
  escolha de "Próximo culto"; padrão de data/rótulo; filtro de expirados.
- **Componentes:** lista com e sem permissão, banner (aparece, atualizar, sumir ao ficar igual), item com música removida,
  tom inexistente, barra anterior/próxima (extremos, item fora do repertório, troca de tom pelo músico mantém a barra),
  "Atualizar" que muda o tom do item aberto, diálogos.
- **Rules:** §6.3.
- **E2E (Playwright, contra emuladores):** dois contextos de navegador; o líder reordena e o outro vê o banner, ignora,
  e depois aceita; fluxo montar → abrir → próxima → anterior.
- A API do repertório segue o padrão do `CatalogApi` (interface injetável + fake em `src/test/`).

## 7. Deixado para quem constrói

- Versão e integração do `@dnd-kit` (sensores de toque/teclado, anúncios de acessibilidade).
- Visual fino das telas, tokens e estados, em conjunto com o agente `designer`.
- Textos exatos, ordem dos itens do menu, comportamento do teclado nos diálogos.
- Como compartilhar `latest`/`shown` acima das telas (contexto, hook), respeitada a restrição da §6.5.
- Estratégia de pré-carregamento da cifra seguinte e como medi-la.
- Cálculo do fuso (America/Sao_Paulo) sem dependência pesada.
- Detalhes de otimização na UI durante a transação.

## 8. Divisão em entregas

Um plano (Fase 8), em PRs pequenos para `develop`; ordem sugerida, ajustável pelo `tech-lead`:
1. Modelo + Security Rules + TTL + testes de rules.
2. API (`SetlistApi`) + operações puras + estado `latest`/`shown` com testes.
3. Telas: aba/cartão na inicial, criar/editar/duplicar, lista editável (adicionar, remover, tom, reordenar).
4. Visualizador em contexto (barra anterior/próxima + banner).
5. E2E e polimento.

## 9. Edições no design principal (ao aprovar)

- §3 Não-objetivos: remover "Setlists/repertório de culto".
- §6.5 Modelo de dados: apontar para este documento (coleção `setlists`).
- §6.8 Security Rules: apontar para o §6.3 deste documento.
- §11 Ordem de entrega: acrescentar "8. Repertórios (setlists)".

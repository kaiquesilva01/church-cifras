# Espaçamento de acordes após transposição — design curto

Data: 2026-11-16. Aprovado pelo usuário na conversa (tamanho: mudança pequena).

## Intenção

Ao transpor, o acorde novo pode ficar mais largo que o original (`Am` → `F#m`) e encostar no acorde seguinte
(`F#mBm`). Hoje o app só avisa em vermelho (§6.2) e o PDF salvo sai com os acordes colados. O usuário quer que o app
afaste os acordes e deixe **dois espaços** entre eles, para a cifra continuar legível sem retrabalho manual.

## Objetivos

- Quando um acorde novo colide com o **próximo acorde** da mesma linha, o próximo é deslocado para a direita até ficar a
  dois espaços (2 × `spaceWidth`) do fim do anterior. O deslocamento se propaga em cadeia, sempre o mínimo necessário.
- Só quem colide se move; acordes que já cabem ficam sobre a sílaba original. Nunca se desloca para a esquerda
  (musicalmente, atrasar a troca é o aceitável; antecipar não).
- Prévia e PDF continuam desenhando exatamente a mesma coisa (mesmo `overlayOps`).
- O aviso vermelho e a contagem passam a refletir só o que **não** foi resolvido.

## Não objetivos / anti-objetivos

- Não encolher fonte, não quebrar linha, não mexer em letra ou em texto que não seja acorde.
- Não mover o vizinho quando ele não é acorde (`(2x)`, `|`...): continua colisão, em vermelho.
- Não empurrar além da margem direita: se não couber, continua colisão, em vermelho.
- Sem mudança no modelo de dados nem nas Security Rules.

## Restrições

- `packages/overlay/src/ops.ts` é compartilhado por prévia e PDF; o plano (`TransposePlan`) vem de `packages/chords`.
- O vizinho de um acorde é o próximo **token** do segmento (qualquer tipo); `limitX` já o considera. O plano precisa
  informar se esse token é acorde.

## Abordagens consideradas

1. **Empurrar só o acorde seguinte, à direita, o mínimo para sobrar dois espaços, em cadeia** — escolhida.
2. Afastar os dois lados (cada um anda metade): o primeiro acorde fica adiantado em relação à sílaba; ganho pequeno.
3. Reduzir a fonte ou quebrar linha: estraga o layout do PDF original.

O `reflowPackedRuns` atual (junta acordes colados num mesmo trecho com um espaço) é um caso particular da abordagem 1 e
é substituído por ela, passando a dois espaços.

## Desenho

- `packages/chords/src/plan.ts`: `Replacement` ganha `nextIsChord: boolean` — `true` quando o token seguinte
  (`occurrence.next`) é outro acorde encontrado por `findChords`. O indicador de tom recebe `false`.
- `packages/overlay/src/ops.ts`: `overlayOps` percorre os acordes por linha (mesma página e mesma linha de base,
  da esquerda para a direita). Mantém um `x` efetivo por acorde: se o anterior tem `nextIsChord` e a distância real até
  o seguinte (`x` do seguinte − (`x` efetivo do anterior + `newWidth`)) é **menor que um espaço** (`spaceWidth`), o
  seguinte passa a `max(x original, fim do anterior + 2 × spaceWidth)`; o deslocamento continua em cascata. A decisão
  usa a geometria real, não o `collides` do plano (em fontes proporcionais ele marca acordes separados por um espaço).
  Um acorde sem acorde depois (`!nextIsChord`, inclusive o último da linha) nunca passa de
  `limitX − newWidth` (nem vai para a esquerda do `x` original); se mesmo assim o espaço real até o anterior fica
  menor que um espaço, o anterior permanece `collides: true`. `collides` do deslocado é recalculado com o `x` novo.
  `OverlayOp.text.x` usa o `x` efetivo; o retângulo branco cobre a **união** da área original e da nova.
- Ordem de desenho: todos os retângulos brancos primeiro, depois todos os textos (em `overlayWriter.ts` e em
  `PreviewLayer.tsx`). Sem isso, o retângulo do acorde seguinte apagaria a ponta do acorde anterior.
- `README.md` §Prévia e §6.2 do spec são atualizados: colisões resolvidas por deslocamento; vermelho só para o que sobra.

## Testes (primeiro)

- `packages/chords`: `nextIsChord` verdadeiro/falso conforme o token seguinte.
- `packages/overlay/test/ops.test.ts`: desloca para 2 espaços; cadeia; não move quem não colide; nunca para a esquerda;
  não move quando o vizinho não é acorde; marca colisão quando passa da margem; retângulo cobre a união; substitui os
  testes de `reflowPackedRuns`.
- Escrita do PDF e `PreviewLayer`: retângulos antes dos textos.
- E2E (`e2e/transpose.spec.ts`): ajustar o caso do aviso se o PDF sintético passar a resolver a colisão.

## Fica a cargo do implementador

- Tolerância para agrupar "mesma linha" (baseline `y`) entre acordes.
- Se a prévia deve destacar acordes deslocados (padrão: não; só amarelo de alterado e vermelho de colisão).

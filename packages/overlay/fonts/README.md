# Fontes substitutas

TTFs livres usadas para repintar acordes transpostos. Todas são redistribuíveis; os textos integrais das licenças estão em `LICENSES/`.

- `source/*.ttf`: originais completos, sem alterações (fonte da verdade, não são enviados ao navegador).
- `*.ttf` (esta pasta): versões reduzidas geradas por `npm run fonts:subset -w @cifras/overlay` (`scripts/subset-fonts.mjs`, pacote `subset-font`, saída TrueType). São as que o app e o gerador de PDF usam; os nomes de arquivo são os mesmos dos originais.

## Originais (`source/`)

| Arquivo | Origem | Versão | Licença | SHA-256 |
| --- | --- | --- | --- | --- |
| LiberationMono-Bold.ttf | https://github.com/liberationfonts/liberation-fonts/files/7261482/liberation-fonts-ttf-2.1.5.tar.gz (release 2.1.5) | 2.1.5 | SIL OFL 1.1 | bd62a0672d0b9b6710b01df434c80ad54fa5f0835207eb7b17b7a761463067bb |
| LiberationMono-Regular.ttf | idem | 2.1.5 | SIL OFL 1.1 | f2b83c763e8afd21709333370bed4774337fae82267937e2b5aea7e2fbd922c1 |
| LiberationSans-Bold.ttf | idem | 2.1.5 | SIL OFL 1.1 | 788abee4c806d660e8aee46689dd8540cd4bb98da03dcc9d171ce3efd99a9173 |
| LiberationSans-Regular.ttf | idem | 2.1.5 | SIL OFL 1.1 | 76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8 |
| Roboto-Bold.ttf | https://github.com/googlefonts/roboto/releases/download/v2.138/roboto-unhinted.zip | v2.138 | Apache 2.0 | 2ca2b3bfc2c2d43fa8f2b7227982d735fd537ecf113a4c56cc2d292bcc3106c8 |
| Roboto-Regular.ttf | idem | v2.138 | Apache 2.0 | f3edb8058e523f5612bfd99d0745e661568ad85e1b6217bc62f786fabae624c6 |
| RobotoMono-Bold.ttf | https://raw.githubusercontent.com/googlefonts/RobotoMono/7bf0b33178844cc7d0c9915b746ece1be7f46bea/fonts/ttf/RobotoMono-Bold.ttf (googlefonts/RobotoMono, branch main, commit 7bf0b33; última release v3.001) | 3.001 | SIL OFL 1.1 | 3ecf35e5e87accc7578b605d1f5f0bc30d88b195d6807bec8a0c57f6aa95c4db |
| RobotoMono-Regular.ttf | idem (`RobotoMono-Regular.ttf`) | 3.001 | SIL OFL 1.1 | af0bff7599c3df3831755c16e39b3c496df74b8c8d8a1161b14dc8461be17cb4 |

## Reduzidas (esta pasta)

Conjunto de code points mantido (`scripts/charset.mjs`):

- `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#()/+-°ºø:[]|.,; '`
- Latin-1: U+00A0–U+00FF
- `–—…` (U+2013, U+2014, U+2026)

Um acorde com caractere fora desse conjunto (ex.: `♭`, `♯`) não tem glyph na fonte reduzida; o teste `subset fonts cover the chord charset` garante o conjunto acima (glyph ≠ 0 e contorno não vazio, exceto espaços).

| Arquivo | Original (bytes) | Reduzida (bytes) | SHA-256 do original | SHA-256 da reduzida |
| --- | --- | --- | --- | --- |
| LiberationMono-Bold.ttf | 307996 | 31420 | bd62a0672d0b9b6710b01df434c80ad54fa5f0835207eb7b17b7a761463067bb | 91be63525d0c2e2d8af9eb15c6741589e4e53b548305d1c8f735124d161b0507 |
| LiberationMono-Regular.ttf | 319508 | 31480 | f2b83c763e8afd21709333370bed4774337fae82267937e2b5aea7e2fbd922c1 | 8110bbf5668f08bfdc5f037fb9732c476c9fd4be83d99a7e5b71df90f3c87f7f |
| LiberationSans-Bold.ttf | 414456 | 35080 | 788abee4c806d660e8aee46689dd8540cd4bb98da03dcc9d171ce3efd99a9173 | a364c5eab5696dd8e80004e1d831f96ed9fd5b092e49311ab2c13356ed7542e3 |
| LiberationSans-Regular.ttf | 410712 | 36672 | 76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8 | 81e2f0847af4abd544b70f5727138d9fa9a49a66d71eea412fb9902e2b14cb31 |
| Roboto-Bold.ttf | 351108 | 29824 | 2ca2b3bfc2c2d43fa8f2b7227982d735fd537ecf113a4c56cc2d292bcc3106c8 | cd6ed28147a88093627a6d0193bace7bc2e9cdf92c5a38386f6d515619df4d8b |
| Roboto-Regular.ttf | 349400 | 29948 | f3edb8058e523f5612bfd99d0745e661568ad85e1b6217bc62f786fabae624c6 | 5f046ed058871c8018e61ba4d2ec62352b55d15714813d42873d7ddbba619147 |
| RobotoMono-Bold.ttf | 126680 | 35700 | 3ecf35e5e87accc7578b605d1f5f0bc30d88b195d6807bec8a0c57f6aa95c4db | e60b6f81ad499824c31609ab0883b7e094e9f3bb97a92be3fc4c195370f483d0 |
| RobotoMono-Regular.ttf | 125748 | 35120 | af0bff7599c3df3831755c16e39b3c496df74b8c8d8a1161b14dc8461be17cb4 | b9376946ecf01b11ea9e401748628ee259b45ca38391a475a4cc4624c670048d |

Os hashes das reduzidas valem para a saída do script com `subset-font` 2.9.0 (determinística).

## Licenças, modificações e nomes reservados

Todas as `*.ttf` desta pasta (fora de `source/`) são **versões modificadas** dos originais: foram reduzidas (subset) por `scripts/subset-fonts.mjs` ao conjunto de code points acima, mantendo os contornos TrueType, as métricas e os registros de copyright e licença (name IDs 0 e 7–14 copiados do original; IDs 1–6 do subset).

- **Roboto (Apache 2.0, §4(b))**: `Roboto-Regular.ttf` e `Roboto-Bold.ttf` aqui foram modificados (reduzidos pelo script e conjunto de caracteres acima). O aviso de licença e de copyright está preservado nos name IDs 0, 13 e 14 e em `LICENSES/Roboto-Apache-2.0.txt`. Nomes mantidos.
- **Roboto Mono (SIL OFL 1.1)**: `RobotoMono-Regular.ttf` e `RobotoMono-Bold.ttf` aqui são versões modificadas (reduzidas pelo mesmo script). `LICENSES/RobotoMono-OFL-1.1.txt` não declara nome reservado, então os nomes foram mantidos; copyright e licença preservados.
- **Liberation (SIL OFL 1.1)**: a licença reserva o nome `Liberation` (e Arimo, Tinos, Cousine). As quatro `Liberation*.ttf` aqui são versões modificadas (reduzidas) e por isso foram **renomeadas**: família `Cifras Mono` / `Cifras Sans`, PostScript `CifrasMono-Bold`, `CifrasSans-Regular` etc. Copyright e licença permanecem nos name IDs 0, 13 e 14. Os nomes de arquivo `Liberation*.ttf` foram mantidos só por compatibilidade com o código. Os originais completos, com nome original, continuam em `source/`.
- `package.json` exporta apenas as 8 `*.ttf` reduzidas; `source/` e `LICENSES/` não fazem parte da superfície pública do pacote.

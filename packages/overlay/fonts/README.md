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
| LiberationMono-Bold.ttf | 307996 | 29928 | bd62a0672d0b9b6710b01df434c80ad54fa5f0835207eb7b17b7a761463067bb | 041fc9d2a1e788db1de9c9d89ccd07cb532c2b93167b17ff669b54d3d7983654 |
| LiberationMono-Regular.ttf | 319508 | 29988 | f2b83c763e8afd21709333370bed4774337fae82267937e2b5aea7e2fbd922c1 | a6d7d9bfa1884253cb51cedd9fd717822921403a97bbd2a7ce157b4ed1faf81d |
| LiberationSans-Bold.ttf | 414456 | 33608 | 788abee4c806d660e8aee46689dd8540cd4bb98da03dcc9d171ce3efd99a9173 | 4c397a565c8c512ed8caea140ed6389e5933d39b2b669a1d5ff5698ac6b26c3c |
| LiberationSans-Regular.ttf | 410712 | 35196 | 76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8 | 03a556667b4be788cbc1a1b79af6b419c965de553a839c600aea1af6731e87e1 |
| Roboto-Bold.ttf | 351108 | 29408 | 2ca2b3bfc2c2d43fa8f2b7227982d735fd537ecf113a4c56cc2d292bcc3106c8 | c69aa92e405827062be51756071f172122175c24e944df7111bfa637a918a416 |
| Roboto-Regular.ttf | 349400 | 29520 | f3edb8058e523f5612bfd99d0745e661568ad85e1b6217bc62f786fabae624c6 | 22d83d1f02b3135169c220a78d74bac0064b4eb57c637413260725a944d1accc |
| RobotoMono-Bold.ttf | 126680 | 35140 | 3ecf35e5e87accc7578b605d1f5f0bc30d88b195d6807bec8a0c57f6aa95c4db | cb3f5d0427e57a7fe37440dd3a39d2fed2f6a78ab02fb6655e0f4589f3805443 |
| RobotoMono-Regular.ttf | 125748 | 34560 | af0bff7599c3df3831755c16e39b3c496df74b8c8d8a1161b14dc8461be17cb4 | c5dca13194013f26d27790b0b05d6e4aa9fe4017bc31f07d6f4c69c037c36dd1 |

Os hashes das reduzidas valem para a saída do script com `subset-font` 2.9.0 (determinística).

## Licenças e nomes reservados

- **Liberation (SIL OFL 1.1)**: a licença reserva o nome `Liberation` (e Arimo, Tinos, Cousine). Uma versão reduzida é uma versão modificada e não pode usar esses nomes. O script reescreve a tabela `name` das reduzidas: família `Cifras Mono` / `Cifras Sans`, PostScript `CifrasMono-Bold`, `CifrasSans-Regular` etc.; mantém os avisos de copyright e de licença (name IDs 0, 11–14). Os nomes de arquivo `Liberation*.ttf` foram mantidos apenas por compatibilidade com o código; o conteúdo da fonte não se identifica mais como Liberation. Os originais completos continuam em `source/`, com nome original, e a licença em `LICENSES/`.
- **Roboto (Apache 2.0)**: sem restrição de nome; reduzida mantém os nomes.
- **Roboto Mono (SIL OFL 1.1)**: `LICENSES/RobotoMono-OFL-1.1.txt` não declara nome reservado (só o aviso de copyright); reduzida mantém os nomes.

Licenças: `LICENSES/Liberation-OFL-1.1.txt` (+ `Liberation-AUTHORS.txt`), `LICENSES/Roboto-Apache-2.0.txt`, `LICENSES/RobotoMono-OFL-1.1.txt`.

Os repositórios oficiais não publicam checksums; os hashes acima foram calculados no download e cada arquivo foi aberto com fontkit para validar a integridade.

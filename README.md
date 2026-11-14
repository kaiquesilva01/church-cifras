# Church Cifras

Site de cifras para o ministério de louvor de uma igreja.
Permite cadastrar músicas a partir de PDFs, visualizar a cifra no navegador e trocar o tom.
Também gera o PDF da cifra já transposta, pronto para o culto.

- Documento de design: [docs/superpowers/specs/2026-11-13-church-cifras-design.md](docs/superpowers/specs/2026-11-13-church-cifras-design.md)
- Regras do projeto: [AGENTS.md](AGENTS.md)

## Rodar localmente

Pré-requisito: Docker Desktop em execução.

```bash
docker compose up --build
```

- Site: http://localhost:5173
- Emulator UI: http://localhost:4000

Os dados dos emuladores ficam em `./emulator-data` (importados na subida e exportados ao encerrar). Para parar: `docker compose down`.

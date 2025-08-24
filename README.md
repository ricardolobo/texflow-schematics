# TexFlow Schematics

Schematics para **NestJS** focados em eventos de domínio.

- `event` – cria a classe do evento em `src/<modulo>/events/<domain.subdomain.action>.event.ts`
- `handler` – cria o handler do evento (provider) em `src/<modulo>/events/<domain.subdomain.action>.handler.ts` e regista-o no `@Module({ providers })`

## Instalação (noutros projetos)

### Via Git (repo privado, SSH + tag)
```bash
yarn add -D "git+ssh://git@github.com:<org-ou-user>/texflow-schematics.git#v1.0.0"
```
> Garante que tens acesso por SSH ao GitHub (`ssh -T git@github.com`).

## Utilização

Gerar **evento** (classe):
```bash
nest g -c texflow-schematics event process.reconciliation.completed process
```

Gerar **handler** (provider + registo no módulo):
```bash
nest g -c texflow-schematics handler process.reconciliation.completed process-actors
```

### Convenções
- **Separadores:** `.` separa níveis (domain / subdomain / action); `-` une palavras no mesmo nível.
- **Ficheiros gerados:**
  - `src/<modulo>/events/<domain.subdomain.action>.event.ts`
  - `src/<modulo>/events/<domain.subdomain.action>.handler.ts`

## Desenvolvimento (neste repositório)

```bash
yarn clean
yarn install
yarn build
git commit -m "<mensagem>"
git tag v1.0.0
git push && git push --tags
```
> O `yarn build` compila para `dist/` e copia os templates/schemas necessários.

## Requisitos

- Node 18+ e Yarn
- Nest CLI instalado globalmente (`npm i -g @nestjs/cli`) no projeto consumidor

## Troubleshooting

- **“Collection … cannot be resolved”** → garante que `dist/collection.json` existe na tag/commit instalado.
- **“Path must be absolute”** → já é tratado pelos schematics (normalizam paths).
- **“Debug mode enabled…”** → desaparece quando usas a coleção por **nome de pacote** (como acima), em vez de `-c ./caminho/local.json`.

## Licença

Este repositório é privado. Define a licença conforme a política da tua organização.
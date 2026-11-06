# Finanças Igor e Carol

Aplicativo web mobile-first para controle financeiro doméstico compartilhado.
React + TypeScript + Tailwind + Zustand + Recharts, com Supabase (PostgreSQL, Auth e RLS).

## Rodar localmente

```bash
npm install
npm run dev        # http://localhost:5173 (acessível pelo celular na mesma rede)
npm test           # testes das regras financeiras
npm run build      # build de produção em dist/
```

Sem variáveis de ambiente, o app abre em **modo demonstração**: dados de exemplo realistas,
salvos apenas no navegador. Serve para avaliar a interface, não para uso real.

## Configurar o Supabase (uso real)

1. Crie um projeto em <https://supabase.com>.
2. No **SQL Editor**, execute **em ordem** os arquivos de `supabase/migrations/`:
   - `20261106000000_init.sql` — tabelas, constraints, políticas RLS, convites e realtime;
   - `20261106010000_casal_parcela_atual.sql` — responsável "Casal" e contas já em andamento (parcela atual).
   - `20261106020000_cartao_contas_limite.sql` — contas cobradas no cartão e ajuste do limite disponível.
   - `20261106030000_producao.sql` — segurança de perfis, pagamento via fatura e valor pago congelado.
   - `20261106040000_fatura_primeira_parcela.sql` — compra no cartão com a fatura da 1ª parcela escolhida.
   - `20261106050000_reserva.sql` — Reserva (guardar e retirar dinheiro) e o valor inicial de R$ 6.412,00.

   Opcional: `supabase/seed/2026-11_contas_iniciais.sql` cadastra as contas fixas iniciais do casal.
3. Em **Project Settings → API**, copie a URL e a `anon key` e crie um `.env` a partir de `.env.example`:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
4. Rode `npm run dev`. A primeira pessoa cria a conta → **Criar ambiente**
   (as categorias, os cartões e as receitas iniciais são cadastrados automaticamente).
5. Em **Mais → Usuários** aparece o código de convite. A segunda pessoa cria a conta → **Tenho convite**.
   As duas passam a ver o mesmo ambiente, com sincronização em tempo real.
6. Em **Cartões**, informe o limite, o fechamento e o vencimento de cada cartão de crédito
   e o saldo atual dos benefícios.

## Publicar na Vercel

1. No Supabase, rode todas as migrações de `supabase/migrations/` (em ordem) no projeto de produção.
2. Na Vercel: **Add New → Project**, importe o repositório. O `vercel.json` já define build (`npm run build`),
   saída (`dist`), redirecionamento das rotas para o app e cabeçalhos de segurança/cache.
3. Em **Settings → Environment Variables** (Production e Preview), cadastre `VITE_SUPABASE_URL` e
   `VITE_SUPABASE_ANON_KEY` (a chave *publishable/anon* — nunca a *secret*). Faça um novo deploy depois de alterar variáveis.
4. No Supabase, **Authentication → URL Configuration**: em *Site URL* coloque o domínio da Vercel
   (ex.: `https://financas-igor-carol.vercel.app`) e adicione-o também em *Redirect URLs*
   (inclua `https://*-<seu-usuario>.vercel.app` se for usar previews).
5. Abra o endereço da Vercel, faça login e confira: lançar um gasto, marcar uma conta como paga e ver a mudança no outro celular.

## Regras financeiras (resumo)

| Situação | Como o app trata |
|---|---|
| Pix, débito, dinheiro | Saem do dinheiro disponível no mês da compra |
| Cartão de crédito | Cada parcela entra no mês da **fatura** (conforme o fechamento), compromete o limite até a fatura ser paga |
| Pagamento de fatura | Apenas liquida as parcelas e libera o limite; **não** é uma nova despesa |
| Benefício (Flash, Pluxee) | Reduz o saldo do cartão; nunca conta como dinheiro |
| Contas fixas | Entram no orçamento do mês mesmo pendentes; alterações valem "só este mês" ou "deste mês em diante" |
| Receitas | Um registro por mês. O mês seguinte repete o último valor (previsto); meses passados ficam congelados |
| Remover cartão/categoria/conta | Remoção lógica ou reclassificação: o histórico é sempre preservado |
| Duplicidade | Mesmo valor + data + meio de pagamento + categoria/descrição pede confirmação |

Todos os valores são armazenados em centavos (inteiros) para evitar erros de arredondamento.

## Estrutura

```
src/domain/       regras financeiras puras (finance.ts) + testes + tipos
src/data/         repositórios (Supabase e demonstração) + dados iniciais
src/store/        estado global, operações de negócio e fila de persistência
src/components/   componentes reutilizáveis (sheet, campos, máscara de moeda…)
src/pages/        telas
supabase/         migração SQL com RLS
```

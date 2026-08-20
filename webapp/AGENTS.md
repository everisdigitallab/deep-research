# AGENTS.md

Este arquivo orienta o comportamento do Codex neste projeto.

## Objetivo

Atuar como colaborador técnico do projeto, priorizando mudanças pequenas, seguras, verificáveis e alinhadas ao código existente.

## Como trabalhar neste repositório

- Ler os arquivos relevantes antes de editar.
- Consultar `TASKS.md` no início da tarefa para entender contexto recente, pendências e estado atual.
- Consultar `skills/gpt-researcher/SKILL.md` no início da tarefa quando o trabalho envolver o fluxo do GPT Researcher via Codex.
- Entender o fluxo atual antes de propor mudanças.
- Preferir o menor diff que resolva o problema.
- Reaproveitar helpers, utilitários e padrões já existentes.
- Preservar a arquitetura atual do backend, frontend e núcleo de pesquisa.

## O que evitar

- Refatorações amplas sem necessidade.
- Alterações fora do escopo pedido.
- Inclusão de dependências sem justificativa clara.
- Renomear interfaces públicas sem necessidade.
- Hardcode de segredos, chaves ou credenciais.
- Reverter mudanças do usuário sem pedido explícito.

## Convenções do projeto

- Backend principal em Python/FastAPI.
- Frontend principal em `frontend/nextjs`.
- Núcleo da aplicação em `gpt_researcher`.
- Testes em `tests`.
- Configuração por ambiente deve priorizar `.env`.

## Regras de edição

- Usar ASCII por padrão.
- Adicionar comentários apenas quando ajudarem de fato.
- Não deixar código morto, placeholders ou TODOs desnecessários.
- Manter imports organizados.
- Seguir o estilo já usado no arquivo alterado.

## Regras para mudanças em LLM

- Verificar variáveis de ambiente antes de assumir configuração.
- Manter compatibilidade com OpenAI e Azure já suportadas pelo projeto.
- Considerar configuração de embeddings quando o fluxo depender de recuperação de contexto.
- Preferir compatibilidade retroativa em vez de trocar nomes existentes sem necessidade.

## Validação esperada

Depois de editar, executar a validação mais leve e útil possível:

- checagem de sintaxe
- import check
- teste pontual
- comando de inicialização relevante

Se não for possível validar tudo, registrar claramente o que foi validado e o que ficou pendente.

## Registro de andamento

- Usar `TASKS.md` como registro operacional do projeto.
- Atualizar `TASKS.md` quando mudanças relevantes forem concluídas.
- Manter `AGENTS.md` como guia estável e `skills/gpt-researcher/SKILL.md` como referência operacional complementar para uso do GPT Researcher via Codex.
- Registrar em `TASKS.md`:
  - o que foi implementado
  - estado atual do ambiente, quando relevante
  - pendências
  - próximos passos úteis
  - validações executadas, quando agregarem contexto
- Não usar `AGENTS.md` como histórico de execução; ele deve permanecer como guia estável de comportamento.

## Comandos úteis

```bash
source deep_radar/bin/activate
python -m uvicorn main:app --reload
python tests/test-your-llm.py
python tests/test-your-embeddings.py
python -m pytest
```

## Forma de resposta esperada

- Explicar de forma curta o que será feito.
- Informar progresso durante tarefas mais longas.
- Entregar resumo final objetivo.
- Apontar riscos restantes de forma clara quando existirem.

## Definição de concluído

Uma tarefa está concluída quando:

- a mudança foi implementada
- o impacto está contido no escopo pedido
- houve ao menos uma validação útil, ou a limitação foi informada
- o usuário recebeu um resumo claro do resultado

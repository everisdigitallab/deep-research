# TASKS.md

Este arquivo registra tarefas realizadas, estado atual do ambiente e próximos passos úteis neste projeto.

## Concluído

### Configuração Azure OpenAI

- Adicionado suporte de compatibilidade para variáveis de ambiente no formato:
  - `ENDPOINT_URL`
  - `DEPLOYMENT_NAME`
  - `AZURE_OPENAI_API_KEY`
  - `AZURE_API_VERSION`
- Mapeamento automático criado para os nomes esperados internamente pelo projeto.
- Arquivo `.env` criado com configuração inicial para Azure OpenAI.

### Arquivos ajustados

- Criado helper de compatibilidade de ambiente em `gpt_researcher/utils/env_compat.py`.
- Atualizados entrypoints para carregar compatibilidade de variáveis.
- Atualizados `.env.example` e `docker-compose.yml` para refletir configuração Azure/OpenAI.

### Ambiente local

- Ambiente virtual criado com `uv`.
- Ambiente renomeado para `deep_radar`.
- Dependências instaladas com sucesso no ambiente local.

### IC Trend Scout

- Nova tela criada em `/ic-trend-scout` sem substituir a interface atual em `/`.
- Novo endpoint `POST /api/ic-trend-research` para executar pesquisa estruturada para Innovation Radar.
- Novo fluxo combina busca web com URLs fornecidas pelo usuário.
- Resultado estruturado inclui resumo, scores, radar ring, fontes, riscos e sugestões de PoCs.
- Link de navegação adicionado na interface atual para abrir a nova tela.
- Validação estrutural executada com `compileall` e import do app/backend do novo módulo.
- Interface do IC Trend Scout separada com HTML, CSS e JS próprios.

### IC Trend Scout Expansion

- Tela separada expandida para aceitar fontes web e documentos locais selecionados via `DOC_PATH`.
- Novo fluxo gera multiplas `project_trends` ligadas as fontes encontradas e ao contexto do Innovation Center.
- Cada trend agora recebe scoring proprio para:
  - `Strategic Impact`
  - `Market & Client Potential`
  - `Execution Readiness`
  - `Scalable Asset Potential`
- Cada trend recebe classificacao por `Radar ring` (`Adopt`, `Trial`, `Assess`, `Caution`).
- Adicionado `source_map` para conectar trends e evidencias com fontes web e documentos locais.
- Adicionados endpoints para historico e agendamento:
  - `GET /api/ic-trend-runs`
  - `GET /api/ic-trend-monitors`
  - `POST /api/ic-trend-monitors`
  - `DELETE /api/ic-trend-monitors/{monitor_id}`
- Scheduler leve adicionado no backend para reexecutar monitores ativos em intervalo configuravel de dias.
- Todas as rodadas agora sao persistidas no `report_store`.
- Interface nova ganhou:
  - upload e selecao de PDFs/documentos locais
  - salvamento de monitor recorrente
  - lista de monitores ativos
  - historico de rodadas armazenadas
  - cards de `project_trends` mais detalhados

### IC Technology Radar

- Ajustado o painel `Radar result` do `IC Trend Scout` para usar `sticky` com `max-height` e `overflow`, evitando sobreposicao visual com `Recurring runs`.
- Nova pagina separada criada em `/ic-technology-radar`.
- Nova rota backend criada para a pagina:
  - `POST /api/ic-technology-radar`
- Novo fluxo gera um radar inspirado no modelo da Thoughtworks, adaptado ao Innovation Center.
- Cada entrada do radar pode representar trend, tecnologia, capacidade, disciplina, plataforma ou topico emergente.
- Cada entrada recebe:
  - quadrante (`Techniques`, `Tools`, `Platforms`, `Languages & Frameworks`)
  - anel (`Adopt`, `Trial`, `Assess`, `Caution`)
  - links para fontes que sustentam a recomendacao
  - oportunidades de projeto para o Innovation Center
  - scoring de impacto, mercado, readiness e asset potential
- Nova interface criada com HTML, CSS e JS proprios para visualizacao do radar por aneis.
- Navegacao da home e do `IC Trend Scout` atualizada para abrir a nova pagina.

### Persistencia de fontes web

- Adicionada persistencia local para `Web Pages and Sources` nas paginas `IC Trend Scout` e `IC Technology Radar`.
- Cada pagina agora salva automaticamente o rascunho atual das fontes digitadas no navegador.
- Criada uma biblioteca local compartilhada de fontes salvas entre as duas paginas.
- Novos controles adicionados na interface:
  - `Save sources`
  - `Clear saved`
  - `Use` para reinserir uma fonte salva na execucao atual
  - `Remove` para excluir uma fonte da biblioteca local

### Robustez de parsing e exibicao

- Melhorada a extracao de JSON retornado pelos fluxos `IC Trend Scout` e `IC Technology Radar` com fallback via `json_repair`.
- Adicionada recuperacao para casos em que o modelo devolve o JSON inteiro dentro do campo `executive_summary`.
- Melhorada a identificacao de fontes descobertas para usar o titulo real da pagina quando disponivel no backend.
- Adicionado fallback visual no frontend para derivar um nome mais legivel da URL quando a fonte ainda vier como `Discovered source`.

### Governanca de instrucoes

- `AGENTS.md` atualizado para exigir consulta ao arquivo `skills/gpt-researcher/SKILL.md` no inicio das tarefas relacionadas ao fluxo do GPT Researcher via Codex.

### Persistencia de research setups e radar boards

- A pagina `/ic-technology-radar` agora permite salvar combinacoes reutilizaveis de:
  - `Research Topic`
  - `Innovation Center Context`
  - `Keywords`
- Os setups salvos podem ser reaplicados pela interface para iniciar novas rodadas com os mesmos criterios.
- Cada execucao do radar agora gera ou atualiza um `Radar board` persistido no backend.
- Os boards ficam organizados por setup de pesquisa e mantem historico de rodadas por data.
- Cada board acumula trends ao longo do tempo com metadados de:
  - quadrante
  - ring
  - scores
  - fontes vinculadas
  - historico de aparicoes
- Foi adicionada a possibilidade de excluir trends do board persistido.
- A interface do `Radar board` agora inclui:
  - mapa visual de radar numerado
  - legenda textual referenciando os numeros do grafico
  - historico resumido das ultimas rodadas do mesmo setup
  - abertura de boards anteriores e carregamento do setup associado
- Ajustado o frontend para atualizar imediatamente o `Radar history` apos gerar, abrir ou editar um board, evitando casos em que o backend salva corretamente mas a lista visivel nao refletia o estado novo.

### Endpoints adicionados para radar persistente

- `GET /api/ic-radar-setups`
- `POST /api/ic-radar-setups`
- `DELETE /api/ic-radar-setups/{setup_id}`
- `GET /api/ic-radar-boards`
- `GET /api/ic-radar-boards/{board_id}`
- `DELETE /api/ic-radar-boards/{board_id}/trends/{trend_id}`

### Material de apoio para artigo

- Criado o arquivo `INNOVATION_CENTER_ARTICLE_BRIEF.txt` com um briefing consolidado do projeto para apoiar a escrita de um artigo sobre o uso da solucao no Innovation Center.
- O arquivo resume:
  - proposta do projeto
  - funcionalidades principais
  - diferencas entre `IC Trend Scout` e `IC Technology Radar`
  - valor para times de inovacao
  - sugestoes de posicionamento e narrativa para o artigo

### Redesign do frontend

- Iniciado um redesign multi-page com abordagem de design system para padronizar as telas do projeto.
- Criado `design.md` com a direcao visual base do workspace, inspirado na identidade da NTT DATA Business Solutions e adaptado para uma linguagem mais moderna de produto.
- Criados artefatos de sistema visual:
  - `.hallmark/preflight.json`
  - `.hallmark/log.json`
  - `tokens.css`
  - `frontend/tokens.css`
  - `frontend/innovation-theme.css`
- A rota `/` deixou de ser a tela classica e passou a ser uma nova home seletora entre:
  - `Classic Research UI`
  - `IC Technology Radar`
- A interface classica foi preservada em nova rota:
  - `/classic-research`
- Criados:
  - `frontend/classic-research.html`
  - `frontend/classic-research.css`
  - `frontend/landing.css`
- A tela `IC Technology Radar` foi reorientada para o novo sistema visual compartilhado, com navegacao alinhada ao novo workspace.
- O `IC Trend Scout` foi removido da camada visual:
  - rota frontend removida
  - arquivos HTML, CSS e JS removidos
- Corrigido um problema na nova home `/` em que o `frontend/index.html` continha a landing nova, mas ainda carregava HTML antigo concatenado no final do arquivo.
- O `frontend/index.html` foi regravado por completo para manter somente a tela inicial seletora entre `Classic Research UI` e `IC Technology Radar`.
- A pagina `/ic-technology-radar` recebeu uma segunda passada de redesign mais evidente:
  - hero dividido com area visual dedicada ao radar
  - cards-resumo de funcionamento
  - painel de resultado com apresentacao mais destacada
  - ajuste de assets com query string de versao para reduzir efeito de cache no navegador
- Nova passada de redesign guiada por `hallmark redesign` aplicada nas telas do workspace:
  - `/ic-technology-radar` reorganizada em estrutura de bancada:
    - hero separado da area operacional
    - `Research setup` convertido em coluna de controle mais clara
    - `Innovation Center signal map` ampliado com coluna direita mais larga
    - janela de scroll do board aumentada para usar melhor a altura da viewport
  - `/` refinada com cards mais interativos, composicao mais intencional e maior sensacao de profundidade
  - `/classic-research` refinada com formulario mais panelizado, melhor ritmo visual e distribuicao mais clara em telas largas
- Refinamento visual do `IC Technology Radar` com referencia de interacao inspirada no Tally:
  - controles de `Output Type` convertidos em cards de selecao completos, com checkbox, titulo e explicacao
  - botoes de setup, fontes e documentos alinhados e padronizados com icones, estados de foco, pressionado e desabilitado
  - coluna do `Radar board` ampliada para priorizar o mapa e reduzir o espaco ocioso na direita
  - `Innovation Center signal map` redesenhado como SVG acessivel, com aneis coloridos, centro IC, marcadores numerados e legenda mais clara
  - mapa e lista de trends agora usam melhor a largura disponivel, sem alterar os dados, persistencia ou endpoints existentes
- Segunda calibracao do `IC Technology Radar` a partir de validacao visual:
  - coluna de `Research setup` ampliada para melhorar a leitura dos campos, fontes e documentos
  - painel `Radar board` passou a usar uma janela alta em desktop, mantendo mais resultados visiveis antes de exigir scroll interno
  - botoes de fontes, setups e arquivos receberam hierarquia de cor e alinhamento por grupo de acao
  - arte CSS do topo foi substituida por imagem de radar gerada para o projeto em `frontend/assets/ic-radar-hero.png`
- Exportacao para SharePoint do `IC Technology Radar`:
  - criado `scripts/export_latest_radar_pdf.py` para gerar uma versao estatica de um Radar Board persistido
  - gerado `outputs/ic-technology-radar-latest.pdf` a partir da rodada mais recente, com setup, resumo, mapa numerado, tendencias, scores e fontes
  - o exportador aceita `--board-id` para produzir um PDF de uma rodada especifica
  - PDF validado em A4, com sete paginas, compilacao Python e previa visual da capa e do mapa

### Deep Research Service reutilizavel

- Criado um novo modulo de servico em `backend/server/deep_research_service.py`.
- O projeto agora expoe um endpoint reutilizavel:
  - `POST /api/deep-research-service`
- O endpoint aceita payload JSON para:
  - executar pesquisa com o core do GPT Researcher
  - retornar saida livre em markdown
  - retornar saida estruturada em JSON
  - retornar modo hibrido com report + JSON
  - incluir URLs, dominios, documentos locais selecionados e instrucoes de formato
- Adicionada persistencia das execucoes do servico em `reports.json` com tipo `deep_research_service_run`.
- Adicionado endpoint de historico recente:
  - `GET /api/deep-research-service/runs`
- Criada nova tela playground em:
  - `/deep-research-service`
- A nova tela permite:
  - carregar exemplos prontos de payload
  - editar a entrada em JSON bruto
  - selecionar arquivos locais de `DOC_PATH` para adicionar em `local_documents`
  - visualizar o `cURL` correspondente
  - executar a chamada e inspecionar a resposta completa
  - acompanhar execucoes salvas recentes
- O servico agora tambem expoe um modo simples de entrada tipo chat:
  - `POST /api/deep-research-service/simple`
- A tela `/deep-research-service` ganhou um bloco `Simple chat input` com um unico campo de mensagem, pensado para testes rapidos sem precisar montar o payload completo.
- O exemplo inicial do `Simple chat input` foi configurado com a avaliacao da startup `autou.io`, seus clientes, projetos realizados e rede de interacao.
- A home `/` foi atualizada para incluir o novo acesso `Deep Research Service`.

## Estado atual

- Ambiente virtual disponível em `./deep_radar`
- Ativação:

```bash
source deep_radar/bin/activate
```

- Arquivo de ambiente disponível em:

```bash
.env
```

## Pendências

- Substituir `SUA_CHAVE` no `.env` pela chave real.
- Confirmar o nome real do deployment de embeddings no Azure.
- Rodar teste de LLM com credenciais válidas.
- Rodar teste de embeddings com deployment configurado.
- Validar visualmente as novas telas `/`, `/classic-research` e `/ic-technology-radar` com o backend ativo.
- Confirmar se o ambiente virtual local existe de fato em `./deep_radar/bin/activate` no host atual; a validacao de import com esse Python nao foi possivel porque o binario nao foi encontrado em `/root/deep_radar`.
- Rodar um teste real do endpoint `POST /api/deep-research-service` com credenciais validas e, se necessario, um retriever web configurado.
- Validar visualmente a nova tela `/deep-research-service` com o backend ativo.

## Próximos comandos úteis

```bash
source deep_radar/bin/activate
python tests/test-your-llm.py
python tests/test-your-embeddings.py
python -m uvicorn main:app --reload
```

## Observações

- O projeto usa embeddings no fluxo de recuperação e compressão de contexto.
- No Azure, o deployment de chat e o deployment de embedding normalmente são separados.
- O ambiente instalado localmente está usando Python `3.13.12`.
- Validacoes executadas nesta etapa:
  - `python -m compileall backend/server/app.py backend/server/ic_trend_scout.py`
  - `python -m py_compile backend/server/app.py backend/server/ic_trend_scout.py`
  - `node --check frontend/ic-trend-scout.js`
- Validacoes adicionais executadas:
  - `python -m py_compile backend/server/app.py backend/server/ic_trend_scout.py backend/server/ic_technology_radar.py`
  - `python -m compileall backend/server/app.py backend/server/ic_technology_radar.py`
  - `node --check frontend/ic-technology-radar.js frontend/ic-trend-scout.js`
- Validacoes desta etapa:
  - `python -m py_compile backend/server/app.py backend/server/ic_trend_scout.py`
  - `node --check frontend/ic-technology-radar.js`
  - `node --check frontend/ic-technology-radar.js` apos ajuste de refresh do `Radar history`
- Validacoes do redesign:
  - `python -m py_compile backend/server/app.py`
  - `node --check frontend/scripts.js`
  - `node --check frontend/ic-technology-radar.js`
  - `git diff --check`
  - import de `main.app` com o Python de `deep_radar` (40 rotas carregadas)
  - verificacao do asset `frontend/assets/ic-radar-hero.png` (PNG 1672 x 941)
  - validacao visual em navegador permanece pendente porque nao ha navegador headless instalado e a porta temporaria `8010` ja estava ocupada no host
- Validacoes do `Deep Research Service`:
  - `python -m py_compile backend/server/deep_research_service.py backend/server/app.py`
  - `node --check frontend/deep-research-service.js`
  - `git diff --check`
  - import de `main.app` com `./deep_radar/bin/python` (44 rotas carregadas apos adicionar o modo simples)
  - import do app com o Python global falhou por ausencia de `aiofiles`, entao a validacao util ficou registrada com o ambiente do projeto

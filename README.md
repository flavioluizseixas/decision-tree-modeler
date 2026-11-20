# Modelador de Árvores de Decisão

Ferramenta visual para construir árvores de decisão: perguntas com opções de resposta que levam a outras perguntas ou a uma decisão/recomendação final. O resultado é salvo em um arquivo `.json` que pode ser reaberto e editado a qualquer momento.

Feita para estudantes da pós-graduação profissional em enfermagem assistencial. Não precisa de instalação nem de internet.

## Como abrir

**Online:** https://flavioluizseixas.github.io/decision-tree-modeler/

**No computador, sem internet:** baixe esta pasta e dê um duplo clique em `index.html`. Ele abre no navegador (Chrome ou Edge recomendados).

No Chrome e no Edge, **Salvar** grava direto no arquivo escolhido. As próximas vezes que você salvar, ele grava no mesmo arquivo. Em outros navegadores, **Salvar** baixa o arquivo `.json` para a pasta Downloads.

## Como montar uma árvore

1. **+ Pergunta**: cria uma pergunta. Escreva o texto no painel à direita.
2. **Opções de resposta**: clique em **+ Adicionar opção** (ou **Sim / Não**). Use Enter para passar para a próxima opção.
3. **Ligar uma resposta à próxima pergunta**, de três formas:
   - no painel, em **Leva a**, escolha um nó existente ou **+ Nova pergunta** / **+ Nova decisão**;
   - no desenho, arraste a **bolinha** à direita da opção até outra pergunta;
   - arraste a bolinha para um espaço vazio e escolha o que criar ali.
4. **+ Decisão**: cria uma decisão ou recomendação. Ela não tem opções e encerra o caminho.
5. **Testar árvore**: percorre a árvore respondendo às perguntas, como seria usada na prática.

Regras que a ferramenta garante:

- cada resposta leva a **um único** nó;
- uma pergunta pode receber **várias** respostas de perguntas anteriores;
- não é possível criar ciclos (uma resposta que volte a uma pergunta anterior do mesmo caminho).

O painel **Verificação da árvore** (aparece quando nada está selecionado) lista o que falta: opções sem destino, perguntas sem opções, textos vazios e nós que não são alcançados a partir do início. Clique em um item para ir até ele.

### Atalhos

| Atalho | Ação |
| --- | --- |
| Ctrl+S | Salvar |
| Ctrl+Shift+S | Salvar em outro arquivo |
| Ctrl+O | Abrir |
| Ctrl+Z / Ctrl+Y | Desfazer / refazer |
| Delete | Excluir o nó selecionado (ou remover a ligação selecionada) |
| Duplo clique no fundo | Criar nó naquele ponto |
| Roda do mouse | Zoom |

Também é possível abrir um arquivo arrastando o `.json` para a área de desenho. Uma cópia do trabalho em andamento fica guardada no navegador e é restaurada ao reabrir a página, mas o arquivo `.json` é o que vale: salve-o.

## Formato do arquivo JSON

```json
{
  "formato": "arvore-decisao",
  "versao": 1,
  "titulo": "Avaliação da dor no pós-operatório",
  "descricao": "",
  "autor": "",
  "atualizadoEm": "2026-11-20T19:01:20.129Z",
  "inicio": "n1",
  "nos": [
    {
      "id": "n1",
      "tipo": "pergunta",
      "texto": "O paciente consegue relatar a intensidade da dor?",
      "observacao": "",
      "posicao": { "x": 0, "y": 0 },
      "respostas": [
        { "id": "r1", "texto": "Sim", "destino": "n2" },
        { "id": "r2", "texto": "Não", "destino": "n3" }
      ]
    },
    {
      "id": "n4",
      "tipo": "decisao",
      "texto": "Manter analgesia prescrita e reavaliar na rotina.",
      "observacao": "",
      "posicao": { "x": 800, "y": 60 }
    }
  ]
}
```

| Campo | Significado |
| --- | --- |
| `inicio` | `id` do nó por onde a árvore começa |
| `nos[].tipo` | `"pergunta"` (tem respostas) ou `"decisao"` (decisão/recomendação final, sem respostas) |
| `nos[].observacao` | fundamentação, referência ou cuidado a observar (opcional) |
| `nos[].posicao` | posição no desenho; se faltar, a ferramenta organiza os nós automaticamente |
| `respostas[].destino` | `id` do próximo nó, ou `null` se ainda não estiver ligada |

O arquivo [exemplos/avaliacao-dor-pos-operatorio.json](exemplos/avaliacao-dor-pos-operatorio.json) é um exemplo ilustrativo. Ele não é um protocolo clínico validado.

## Estrutura do código

| Arquivo | Conteúdo |
| --- | --- |
| `index.html` | estrutura da página |
| `css/app.css` | aparência (tema claro e escuro) |
| `js/model.js` | dados da árvore, regras, verificação, layout automático e leitura/escrita do JSON (sem dependência do navegador; pode ser usado no Node) |
| `js/canvas.js` | desenho dos nós e ligações, zoom, arrastar e conectar |
| `js/inspector.js` | painel de edição |
| `js/app.js` | desfazer/refazer, arquivos, rascunho automático, teste da árvore e atalhos |

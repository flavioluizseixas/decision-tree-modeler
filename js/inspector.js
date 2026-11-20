/* Painel lateral: edição do nó selecionado ou, sem seleção, dados da árvore e verificação. */
(function () {
  'use strict';
  var DT = window.DT = window.DT || {};
  var M = window.DTModel;
  var painel;

  function h(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function botao(txt, cls, fn, titulo) {
    var b = h('button', 'btn ' + (cls || ''), txt);
    b.type = 'button';
    if (titulo) { b.title = titulo; b.setAttribute('aria-label', titulo); }
    b.addEventListener('click', fn);
    return b;
  }
  /* campo de texto ligado a uma propriedade; agrupa a digitação num único passo de "desfazer" */
  function campoTexto(id, rotulo, valor, multi, aoMudar, opts) {
    opts = opts || {};
    var f = h('div', 'field');
    var l = h('label', null, rotulo);
    l.htmlFor = id;
    f.appendChild(l);
    var inp = h(multi ? 'textarea' : 'input', multi ? 'textarea' + (opts.grande ? ' textarea--big' : '') : 'input');
    inp.id = id;
    if (!multi) inp.type = 'text';
    if (opts.placeholder) inp.placeholder = opts.placeholder;
    inp.value = valor || '';
    inp.addEventListener('focus', DT.iniciarEdicao);
    inp.addEventListener('input', function () { DT.editando(); aoMudar(inp.value); DT.alterou({ semPainel: true }); });
    f.appendChild(inp);
    if (opts.ajuda) f.appendChild(h('small', null, opts.ajuda));
    return f;
  }
  function codigo(doc, id) {
    var n = M.no(doc, id), rot = M.rotulos(doc);
    return h('span', 'code' + (n && n.tipo === 'decisao' ? ' code--dec' : ''), rot[id] || '?');
  }
  function resumo(txt, max) {
    txt = String(txt || '').trim() || '(sem texto)';
    return txt.length > max ? txt.slice(0, max - 1) + '…' : txt;
  }

  /* ---------- sem seleção: a árvore inteira ---------- */
  function painelArvore(doc) {
    var p1 = h('section', 'panel');
    p1.appendChild(h('h2', null, 'Sobre esta árvore'));
    p1.appendChild(campoTexto('f-titulo', 'Título', doc.titulo, false, function (v) {
      doc.titulo = v;
      document.getElementById('docTitle').value = v;
    }));
    p1.appendChild(campoTexto('f-descricao', 'Descrição', doc.descricao, true, function (v) { doc.descricao = v; },
      { placeholder: 'Objetivo, público e contexto de uso da árvore.' }));
    p1.appendChild(campoTexto('f-autor', 'Autoria', doc.autor, false, function (v) { doc.autor = v; },
      { placeholder: 'Nome(s) de quem elaborou' }));

    var nP = doc.nos.filter(function (n) { return n.tipo === 'pergunta'; }).length;
    var nD = doc.nos.length - nP, nR = 0;
    doc.nos.forEach(function (n) { nR += n.respostas.length; });
    var stats = h('div', 'stats');
    [[nP, 'perguntas'], [nD, 'decisões'], [nR, 'opções']].forEach(function (x) {
      var st = h('div', 'stat');
      st.appendChild(h('b', null, String(x[0])));
      st.appendChild(h('span', null, x[1]));
      stats.appendChild(st);
    });
    p1.appendChild(stats);
    return [p1, painelVerificacao(doc), painelAjuda()];
  }

  function painelVerificacao(doc) {
    var p = h('section', 'panel');
    p.appendChild(h('h2', null, 'Verificação da árvore'));
    var probs = DT.problemas || [];
    if (!probs.length) {
      p.appendChild(h('div', 'ok-banner', 'Árvore completa: todas as opções levam a um destino.'));
      return p;
    }
    var nE = probs.filter(function (x) { return x.nivel === 'erro'; }).length;
    p.appendChild(h('p', 'muted', nE ? nE + (nE > 1 ? ' pendências impedem' : ' pendência impede') +
      ' que todos os caminhos cheguem a uma decisão.' : 'Nenhuma pendência. Há apenas avisos.'));
    var ul = h('ul', 'issues');
    probs.slice(0, 40).forEach(function (x) {
      var li = h('li');
      var b = h('button', 'issue issue--' + x.nivel);
      b.type = 'button';
      b.appendChild(h('span', 'issue__ico', x.nivel === 'erro' ? 'PEND' : 'AVISO'));
      b.appendChild(h('span', null, x.msg));
      b.addEventListener('click', function () {
        if (!x.noId) return;
        DT.selecionar({ tipo: x.respId ? 'resp' : 'no', noId: x.noId, respId: x.respId });
        DT.canvas.mostrarNo(x.noId, true);
      });
      li.appendChild(b);
      ul.appendChild(li);
    });
    p.appendChild(ul);
    return p;
  }

  function painelAjuda() {
    var p = h('section', 'panel');
    p.appendChild(h('h3', null, 'Como usar'));
    var ol = h('ol', 'help');
    ['Clique em "+ Pergunta" e escreva a pergunta no painel.',
      'Adicione as opções de resposta (ex.: Sim / Não).',
      'Em cada opção, escolha em "Leva a" a próxima pergunta ou crie uma nova.',
      'Use "+ Decisão" para conclusões e recomendações: elas encerram o caminho.',
      'Várias respostas podem levar ao mesmo nó; cada resposta leva a um só.',
      'Clique em "Testar árvore" para percorrer os caminhos e em "Salvar" para gerar o arquivo .json.'
    ].forEach(function (t) { ol.appendChild(h('li', null, t)); });
    p.appendChild(ol);
    var atalhos = h('p', 'muted');
    atalhos.innerHTML = 'Atalhos: <kbd>Ctrl</kbd>+<kbd>S</kbd> salvar · <kbd>Ctrl</kbd>+<kbd>Z</kbd> desfazer · <kbd>Delete</kbd> excluir seleção · duplo clique no fundo cria um nó.';
    p.appendChild(atalhos);
    return p;
  }

  /* ---------- nó selecionado ---------- */
  function painelNo(doc, n) {
    var rot = M.rotulos(doc), sel = DT.state.sel;
    var p = h('section', 'panel');
    var t = h('h2');
    t.appendChild(codigo(doc, n.id));
    t.appendChild(document.createTextNode(n.tipo === 'decisao' ? 'Decisão / recomendação' : 'Pergunta'));
    p.appendChild(t);

    var seg = h('div', 'seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Tipo do nó');
    [['pergunta', 'Pergunta', 'is-q'], ['decisao', 'Decisão / recomendação', 'is-dec']].forEach(function (x) {
      var b = h('button', x[2], x[1]);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(n.tipo === x[0]));
      b.addEventListener('click', function () {
        if (n.tipo === x[0]) return;
        function trocar() { DT.checkpoint(); M.definirTipo(doc, n.id, x[0]); DT.alterou(); }
        if (x[0] === 'decisao' && n.respostas.length) {
          DT.confirmar('Transformar em decisão?', 'Decisões não têm opções de resposta. As ' + n.respostas.length +
            ' opções desta pergunta e suas ligações serão removidas (é possível desfazer).', 'Transformar').then(function (ok) { if (ok) trocar(); });
        } else trocar();
      });
      seg.appendChild(b);
    });
    p.appendChild(seg);

    p.appendChild(campoTexto('f-texto', n.tipo === 'decisao' ? 'Texto da decisão ou recomendação' : 'Texto da pergunta', n.texto, true,
      function (v) { n.texto = v; }, {
        grande: true,
        placeholder: n.tipo === 'decisao' ? 'Ex.: Comunicar a equipe médica e reavaliar em 30 minutos.' : 'Ex.: O paciente apresenta febre (≥ 37,8 °C)?'
      }));
    p.appendChild(campoTexto('f-obs', 'Observação ou fundamentação (opcional)', n.observacao, true, function (v) { n.observacao = v; },
      { placeholder: 'Referência, evidência, escala utilizada, cuidado a observar…' }));

    var secoes = [p];
    if (n.tipo === 'pergunta') secoes.push(painelRespostas(doc, n, rot, sel));

    var pe = h('section', 'panel');
    pe.appendChild(h('h3', null, 'Chega aqui a partir de'));
    var ent = M.entradas(doc, n.id);
    if (doc.inicio === n.id) pe.appendChild(h('p', 'muted', 'Este é o início da árvore.'));
    if (!ent.length && doc.inicio !== n.id) pe.appendChild(h('p', 'muted', 'Nenhuma opção leva a este nó ainda.'));
    if (ent.length) {
      var ul = h('ul', 'links');
      ent.forEach(function (e) {
        var li = h('li'), b = h('button');
        b.type = 'button';
        b.appendChild(codigo(doc, e.no.id));
        b.appendChild(document.createTextNode(' ' + resumo(e.no.texto, 46) + '  →  "' + resumo(e.resposta.texto, 24) + '"'));
        b.addEventListener('click', function () {
          DT.selecionar({ tipo: 'resp', noId: e.no.id, respId: e.resposta.id });
          DT.canvas.mostrarNo(e.no.id, true);
        });
        li.appendChild(b);
        ul.appendChild(li);
      });
      pe.appendChild(ul);
    }
    secoes.push(pe);

    var pa = h('section', 'panel');
    var row = h('div', 'row');
    if (doc.inicio !== n.id) row.appendChild(botao('Definir como início', 'btn--sm', function () {
      DT.checkpoint(); doc.inicio = n.id; DT.alterou();
    }));
    row.appendChild(botao('Testar a partir daqui', 'btn--sm', function () { DT.abrirTeste(n.id); }));
    row.appendChild(botao('Duplicar', 'btn--sm', function () {
      DT.checkpoint();
      var c = M.duplicarNo(doc, n.id);
      DT.state.sel = { tipo: 'no', noId: c.id };
      DT.alterou();
    }));
    row.appendChild(botao('Excluir', 'btn--sm btn--danger', function () { DT.excluirNo(n.id); }));
    pa.appendChild(row);
    secoes.push(pa);
    return secoes;
  }

  function painelRespostas(doc, n, rot, sel) {
    var p = h('section', 'panel');
    p.appendChild(h('h2', null, 'Opções de resposta'));
    if (!n.respostas.length) p.appendChild(h('p', 'muted', 'Adicione as respostas possíveis. Cada uma leva a um único próximo nó.'));
    var lista = h('div', 'resp-list');
    n.respostas.forEach(function (r, i) {
      var box = h('div', 'resp' + (sel && sel.respId === r.id ? ' is-selected' : '') + (r.destino ? '' : ' is-open'));
      var inp = h('input', 'input');
      inp.type = 'text';
      inp.id = 'f-resp-' + r.id;
      inp.value = r.texto;
      inp.placeholder = 'Opção ' + (i + 1);
      inp.setAttribute('aria-label', 'Texto da opção ' + (i + 1));
      inp.addEventListener('focus', DT.iniciarEdicao);
      inp.addEventListener('input', function () { DT.editando(); r.texto = inp.value; DT.alterou({ semPainel: true }); });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var prox = n.respostas[i + 1];
          if (prox) { var el = document.getElementById('f-resp-' + prox.id); if (el) el.focus(); }
          else { DT.checkpoint(); var nr = M.adicionarResposta(doc, n.id, ''); DT.alterou({ focar: 'f-resp-' + nr.id }); }
        }
      });
      box.appendChild(inp);

      var tools = h('div', 'resp__tools');
      tools.appendChild(botao('↑', 'btn--icon btn--sm', function () { DT.checkpoint(); M.moverResposta(doc, n.id, r.id, -1); DT.alterou(); }, 'Mover opção para cima'));
      tools.appendChild(botao('↓', 'btn--icon btn--sm', function () { DT.checkpoint(); M.moverResposta(doc, n.id, r.id, 1); DT.alterou(); }, 'Mover opção para baixo'));
      tools.appendChild(botao('✕', 'btn--icon btn--sm btn--danger', function () { DT.checkpoint(); M.removerResposta(doc, n.id, r.id); DT.alterou(); }, 'Excluir opção'));
      box.appendChild(tools);

      var dest = h('div', 'resp__dest');
      var lbl = h('label', null, 'Leva a');
      lbl.htmlFor = 'f-dest-' + r.id;
      dest.appendChild(lbl);
      var selEl = h('select', 'select');
      selEl.id = 'f-dest-' + r.id;
      function opt(v, t, grupo) { var o = h('option', null, t); o.value = v; (grupo || selEl).appendChild(o); return o; }
      opt('', '— sem destino (pendente) —');
      var gNovo = h('optgroup');
      gNovo.label = 'Criar';
      opt('__novaP', '+ Nova pergunta', gNovo);
      opt('__novaD', '+ Nova decisão / recomendação', gNovo);
      selEl.appendChild(gNovo);
      var gEx = h('optgroup');
      gEx.label = 'Nós existentes';
      doc.nos.forEach(function (m) {
        if (m.id === n.id) return;
        var o = opt(m.id, rot[m.id] + ' · ' + resumo(m.texto, 48), gEx);
        if (r.destino !== m.id && !M.podeConectar(doc, n.id, m.id).ok) { o.disabled = true; o.textContent += ' (criaria ciclo)'; }
      });
      if (gEx.children.length) selEl.appendChild(gEx);
      selEl.value = r.destino || '';
      selEl.addEventListener('change', function () {
        var v = selEl.value;
        if (v === '__novaP' || v === '__novaD') {
          var pos = { x: n.posicao.x + M.LARGURA_NO + 120, y: n.posicao.y + i * 70 };
          DT.criarNo(v === '__novaP' ? 'pergunta' : 'decisao', pos, { noId: n.id, respId: r.id });
          return;
        }
        DT.checkpoint();
        var res = M.conectar(doc, n.id, r.id, v || null);
        if (!res.ok) DT.aviso(res.motivo, true);
        DT.state.sel = { tipo: 'resp', noId: n.id, respId: r.id };
        DT.alterou();
      });
      dest.appendChild(selEl);
      if (r.destino) dest.appendChild(botao('Ir', 'btn--sm', function () {
        DT.selecionar({ tipo: 'no', noId: r.destino });
        DT.canvas.mostrarNo(r.destino, true);
      }, 'Ir para o nó de destino'));
      box.appendChild(dest);
      lista.appendChild(box);
    });
    p.appendChild(lista);

    var row = h('div', 'row');
    row.appendChild(botao('+ Adicionar opção', 'btn--sm btn--q', function () {
      DT.checkpoint();
      var nr = M.adicionarResposta(doc, n.id, '');
      DT.alterou({ focar: 'f-resp-' + nr.id });
    }));
    if (!n.respostas.length) row.appendChild(botao('Sim / Não', 'btn--sm', function () {
      DT.checkpoint();
      M.adicionarResposta(doc, n.id, 'Sim');
      M.adicionarResposta(doc, n.id, 'Não');
      DT.alterou();
    }, 'Adicionar as opções Sim e Não'));
    p.appendChild(row);
    return p;
  }

  function render() {
    var doc = DT.state.doc, sel = DT.state.sel;
    var foco = document.activeElement && painel.contains(document.activeElement) ? document.activeElement.id : null;
    var rolagem = painel.scrollTop;
    painel.textContent = '';
    var n = sel && M.no(doc, sel.noId);
    var secoes = n ? painelNo(doc, n) : painelArvore(doc);
    secoes.forEach(function (s) { painel.appendChild(s); });
    painel.scrollTop = rolagem;
    if (foco) { var el = document.getElementById(foco); if (el) el.focus(); }
  }

  DT.inspector = {
    init: function () { painel = document.getElementById('inspector'); },
    render: render,
    focar: function (id) {
      var el = document.getElementById(id);
      if (el) { el.focus(); if (el.select) el.select(); el.scrollIntoView({ block: 'nearest' }); }
    }
  };
})();

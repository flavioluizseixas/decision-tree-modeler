/* Aplicação: estado, desfazer/refazer, arquivos JSON, rascunho automático, teste da árvore e atalhos. */
(function () {
  'use strict';
  var DT = window.DT = window.DT || {};
  var M = window.DTModel;
  var $ = function (id) { return document.getElementById(id); };

  var CHAVE_RASCUNHO = 'modelador-arvore-decisao:rascunho';
  var noArtifact = !!(window.claude && typeof window.claude.use === 'function');
  var fsApi = false;
  try { fsApi = !noArtifact && window.self === window.top && 'showSaveFilePicker' in window; } catch (e) { fsApi = false; }
  var downloads = null;
  var tiposArquivo = [{ description: 'Árvore de decisão (JSON)', accept: { 'application/json': ['.json'] } }];

  var desfazerPilha = [], refazerPilha = [], pendente = null;
  var sujo = false, nomeArquivo = null, handle = null, salvoEm = null, timerRascunho = null, timerAviso = null;

  /* ---------- histórico ---------- */
  function empilhar(snap) {
    desfazerPilha.push(snap);
    if (desfazerPilha.length > 200) desfazerPilha.shift();
    refazerPilha.length = 0;
    atualizarBotoes();
  }
  DT.checkpoint = function () { pendente = null; empilhar(JSON.stringify(DT.state.doc)); };
  DT.iniciarEdicao = function () { pendente = JSON.stringify(DT.state.doc); };
  DT.editando = function () { if (pendente) { empilhar(pendente); pendente = null; } };

  function trocarDoc(snap, pilhaOrigem, pilhaDestino) {
    if (!pilhaOrigem.length) return;
    pilhaDestino.push(JSON.stringify(DT.state.doc));
    DT.state.doc = JSON.parse(pilhaOrigem.pop());
    var sel = DT.state.sel;
    if (sel && !M.no(DT.state.doc, sel.noId)) DT.state.sel = null;
    else if (sel && sel.respId && !M.resposta(DT.state.doc, sel.noId, sel.respId)) DT.state.sel = { tipo: 'no', noId: sel.noId };
    $('docTitle').value = DT.state.doc.titulo;
    DT.alterou();
  }
  function desfazer() { trocarDoc(null, desfazerPilha, refazerPilha); }
  function refazer() { trocarDoc(null, refazerPilha, desfazerPilha); }

  /* ---------- ciclo de atualização ---------- */
  function calcularProblemas() {
    DT.problemas = M.validar(DT.state.doc);
    var por = {};
    DT.problemas.forEach(function (p) {
      if (!p.noId) return;
      var x = por[p.noId] = por[p.noId] || { erros: 0, avisos: 0, msgs: [] };
      if (p.nivel === 'erro') x.erros++; else x.avisos++;
      x.msgs.push(p.msg);
    });
    DT.problemasPorNo = por;
  }
  DT.alterou = function (opts) {
    opts = opts || {};
    if (!opts.semSujar) sujo = true;
    calcularProblemas();
    DT.canvas.render();
    if (!opts.semPainel) DT.inspector.render();
    if (opts.focar) DT.inspector.focar(opts.focar);
    agendarRascunho();
    atualizarStatus();
    atualizarBotoes();
  };
  DT.selecionar = function (sel) {
    DT.state.sel = sel;
    DT.canvas.render();
    DT.inspector.render();
  };
  function renderTudo() {
    $('docTitle').value = DT.state.doc.titulo;
    calcularProblemas();
    DT.canvas.render();
    DT.inspector.render();
    atualizarStatus();
    atualizarBotoes();
  }

  function atualizarBotoes() {
    $('btnUndo').disabled = !desfazerPilha.length;
    $('btnRedo').disabled = !refazerPilha.length;
  }
  function atualizarStatus() {
    var st = $('status'), txt;
    st.classList.toggle('is-dirty', sujo);
    if (!sujo && nomeArquivo) txt = 'Salvo em ' + nomeArquivo + (salvoEm ? ' às ' + salvoEm : '');
    else if (!sujo) txt = 'Sem alterações';
    else if (nomeArquivo) txt = 'Alterações não salvas em ' + nomeArquivo;
    else txt = 'Ainda não salvo em arquivo';
    $('statusText').textContent = txt;
    st.title = 'Uma cópia de trabalho também fica guardada neste navegador.';
  }

  /* ---------- avisos e confirmação ---------- */
  DT.aviso = function (msg, erro) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.toggle('is-error', !!erro);
    t.hidden = false;
    clearTimeout(timerAviso);
    timerAviso = setTimeout(function () { t.hidden = true; }, erro ? 6000 : 3800);
  };
  DT.confirmar = function (titulo, texto, sim) {
    return new Promise(function (resolve) {
      var modal = $('confirmModal');
      $('confirmTitle').textContent = titulo;
      $('confirmText').textContent = texto;
      $('confirmYes').textContent = sim || 'Confirmar';
      modal.hidden = false;
      $('confirmYes').focus();
      function fim(v) {
        modal.hidden = true;
        $('confirmYes').onclick = $('confirmNo').onclick = null;
        modal.onkeydown = null;
        resolve(v);
      }
      $('confirmYes').onclick = function () { fim(true); };
      $('confirmNo').onclick = function () { fim(false); };
      modal.onkeydown = function (e) { if (e.key === 'Escape') { e.stopPropagation(); fim(false); } };
    });
  };
  DT.fecharMenu = function () { $('popmenu').hidden = true; };

  /* ---------- criação e exclusão ---------- */
  var contCriados = 0;
  DT.criarNo = function (tipo, pos, origem) {
    var doc = DT.state.doc;
    if (!pos) {
      var c = DT.canvas.centroVisivel(), k = (contCriados++ % 6) * 26;
      pos = { x: c.x - 140 + k, y: c.y - 70 + k };
    }
    DT.checkpoint();
    var n = M.adicionarNo(doc, tipo, pos);
    if (origem) M.conectar(doc, origem.noId, origem.respId, n.id);
    DT.state.sel = { tipo: 'no', noId: n.id };
    DT.alterou({ focar: 'f-texto' });
    DT.canvas.mostrarNo(n.id);
    return n;
  };
  DT.excluirNo = function (id) {
    var doc = DT.state.doc, rot = M.rotulos(doc);
    if (!M.no(doc, id)) return;
    DT.checkpoint();
    M.removerNo(doc, id);
    DT.state.sel = null;
    DT.alterou();
    DT.aviso(rot[id] + ' excluído. Use Desfazer (Ctrl+Z) se foi engano.');
  };
  DT.excluirSelecao = function () {
    var sel = DT.state.sel, doc = DT.state.doc;
    if (!sel) return;
    if (sel.respId) {
      var r = M.resposta(doc, sel.noId, sel.respId);
      if (r && r.destino) {
        DT.checkpoint();
        r.destino = null;
        DT.alterou();
        DT.aviso('Ligação removida. A opção "' + (r.texto || 'sem texto') + '" ficou sem destino.');
        return;
      }
    }
    DT.excluirNo(sel.noId);
  };

  /* ---------- arquivos ---------- */
  function marcarSalvo(nome) {
    sujo = false;
    nomeArquivo = nome;
    var d = new Date();
    salvoEm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    atualizarStatus();
    agendarRascunho();
  }
  function copiarComoAlternativa(texto) {
    if (!navigator.clipboard) { DT.aviso('Salvar não está disponível nesta visualização.', true); return; }
    navigator.clipboard.writeText(texto).then(function () {
      DT.aviso('O download não está disponível aqui. O conteúdo JSON foi copiado: cole-o num arquivo .json.');
    }, function () { DT.aviso('Salvar não está disponível nesta visualização.', true); });
  }
  function salvar(comoNovo) {
    var doc = DT.state.doc, texto = M.serializar(doc), nome = nomeArquivo || M.nomeArquivo(doc);
    if (comoNovo) nome = M.nomeArquivo(doc);
    if (noArtifact) {
      if (!downloads) { copiarComoAlternativa(texto); return; }
      downloads.save({ filename: nome, data: texto }).then(function () {
        marcarSalvo(nome);
        DT.aviso('Arquivo ' + nome + ' salvo.');
      }, function (err) {
        var code = err && err.code;
        if (code === 'declined') DT.aviso('Download cancelado.');
        else if (code === 'rate_limited') DT.aviso('Aguarde um instante e tente salvar novamente.');
        else copiarComoAlternativa(texto);
      });
      return;
    }
    if (fsApi) {
      (async function () {
        try {
          if (!handle || comoNovo) handle = await window.showSaveFilePicker({ suggestedName: nome, types: tiposArquivo });
          var w = await handle.createWritable();
          await w.write(texto);
          await w.close();
          marcarSalvo(handle.name);
          DT.aviso('Arquivo ' + handle.name + ' salvo.');
        } catch (e) {
          if (e && e.name === 'AbortError') return;
          DT.aviso('Não foi possível salvar o arquivo: ' + (e && e.message ? e.message : e), true);
        }
      })();
      return;
    }
    var url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    marcarSalvo(nome);
    DT.aviso('Arquivo ' + nome + ' baixado (verifique a pasta Downloads).');
  }

  function carregarTexto(texto, nome, h) {
    var r;
    try { r = M.normalizar(texto); } catch (e) { DT.aviso(e.message, true); return; }
    DT.state.doc = r.doc;
    DT.state.sel = null;
    desfazerPilha = []; refazerPilha = []; pendente = null;
    nomeArquivo = nome || null;
    handle = h || null;
    sujo = false;
    salvoEm = null;
    renderTudo();
    DT.canvas.ajustar();
    agendarRascunho();
    var msg = 'Arquivo ' + (nome || '') + ' aberto com ' + r.doc.nos.length + ' nós.';
    if (r.avisos.length) msg += ' ' + r.avisos.length + ' ajuste(s): ' + r.avisos.slice(0, 2).join(' ');
    DT.aviso(msg, false);
  }
  function confirmarDescarte(titulo) {
    if (!sujo || !DT.state.doc.nos.length) return Promise.resolve(true);
    return DT.confirmar(titulo, 'Há alterações que ainda não foram salvas em arquivo. Se continuar, elas serão perdidas.', 'Continuar sem salvar');
  }
  function abrir() {
    confirmarDescarte('Abrir outro arquivo?').then(function (ok) {
      if (!ok) return;
      if (fsApi && window.showOpenFilePicker) {
        (async function () {
          try {
            var hs = await window.showOpenFilePicker({ types: tiposArquivo, multiple: false });
            var f = await hs[0].getFile();
            carregarTexto(await f.text(), f.name, hs[0]);
          } catch (e) {
            if (e && e.name === 'AbortError') return;
            $('fileInput').click();
          }
        })();
      } else $('fileInput').click();
    });
  }
  function lerArquivo(f) {
    if (!f) return;
    var leitor = new FileReader();
    leitor.onload = function () { carregarTexto(String(leitor.result), f.name, null); };
    leitor.onerror = function () { DT.aviso('Não foi possível ler o arquivo ' + f.name + '.', true); };
    leitor.readAsText(f, 'utf-8');
  }
  function novo() {
    confirmarDescarte('Começar uma nova árvore?').then(function (ok) {
      if (!ok) return;
      DT.state.doc = M.novoDoc();
      DT.state.sel = null;
      desfazerPilha = []; refazerPilha = []; pendente = null;
      nomeArquivo = null; handle = null; sujo = false; salvoEm = null;
      renderTudo();
      DT.canvas.ajustar();
      agendarRascunho();
      $('docTitle').focus();
      $('docTitle').select();
    });
  }

  /* ---------- rascunho no navegador ---------- */
  function agendarRascunho() {
    clearTimeout(timerRascunho);
    timerRascunho = setTimeout(function () {
      try {
        localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({ doc: DT.state.doc, nomeArquivo: nomeArquivo, sujo: sujo }));
      } catch (e) { /* armazenamento indisponível: segue sem rascunho */ }
    }, 400);
  }
  function lerRascunho() {
    try {
      var bruto = localStorage.getItem(CHAVE_RASCUNHO);
      if (!bruto) return null;
      var r = JSON.parse(bruto);
      var n = M.normalizar(r.doc);
      return { doc: n.doc, nomeArquivo: r.nomeArquivo || null, sujo: !!r.sujo };
    } catch (e) { return null; }
  }

  /* ---------- teste (simulação) ---------- */
  var sim = null;
  DT.abrirTeste = function (inicioId) {
    var doc = DT.state.doc, id = inicioId || doc.inicio;
    if (!id || !M.no(doc, id)) { DT.aviso('Adicione uma pergunta e defina o início da árvore antes de testar.', true); return; }
    sim = { atual: id, caminho: [], inicio: id };
    $('simModal').hidden = false;
    renderTeste();
    var b = $('simBody').querySelector('.sim-option:not([disabled])') || $('simDone');
    b.focus();
  };
  function fecharTeste() {
    if (!sim) return;
    var atual = sim.atual;
    sim = null;
    $('simModal').hidden = true;
    DT.selecionar({ tipo: 'no', noId: atual });
    DT.canvas.mostrarNo(atual, true);
  }
  function renderTeste() {
    var doc = DT.state.doc, rot = M.rotulos(doc), corpo = $('simBody'), n = M.no(doc, sim.atual);
    corpo.textContent = '';
    function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
    var trilha = el('div', 'sim-path');
    if (sim.inicio !== doc.inicio) trilha.appendChild(el('span', null, 'Começando em ' + rot[sim.inicio] + ' · '));
    if (!sim.caminho.length) trilha.appendChild(el('span', null, 'Responda às perguntas para percorrer a árvore.'));
    sim.caminho.forEach(function (passo, i) {
      var r = M.resposta(doc, passo.noId, passo.respId);
      if (i) trilha.appendChild(el('span', null, '→'));
      var b = el('b', null, rot[passo.noId] + ': ' + (r ? r.texto : '?'));
      trilha.appendChild(b);
    });
    corpo.appendChild(trilha);

    var card = el('div', 'sim-card sim-card--' + n.tipo);
    card.appendChild(el('div', 'sim-card__tag', rot[n.id] + ' · ' + (n.tipo === 'decisao' ? 'Decisão / recomendação' : 'Pergunta')));
    card.appendChild(el('p', 'sim-card__text', String(n.texto || '').trim() || '(sem texto)'));
    if (String(n.observacao || '').trim()) card.appendChild(el('p', 'sim-card__obs', n.observacao));
    corpo.appendChild(card);

    if (n.tipo === 'pergunta') {
      if (!n.respostas.length) corpo.appendChild(el('p', 'muted', 'Esta pergunta ainda não tem opções de resposta. Feche o teste e adicione as opções.'));
      var ops = el('div', 'sim-options');
      n.respostas.forEach(function (r) {
        var b = el('button', 'sim-option');
        b.type = 'button';
        b.appendChild(el('span', null, String(r.texto || '').trim() || '(opção sem texto)'));
        if (!r.destino) { b.disabled = true; b.appendChild(el('small', null, 'sem destino')); }
        b.addEventListener('click', function () {
          sim.caminho.push({ noId: n.id, respId: r.id });
          sim.atual = r.destino;
          renderTeste();
          var prox = $('simBody').querySelector('.sim-option:not([disabled])') || $('simRestart');
          prox.focus();
        });
        ops.appendChild(b);
      });
      corpo.appendChild(ops);
    } else {
      corpo.appendChild(el('p', 'muted', 'Fim do caminho: esta é a conduta indicada para as respostas escolhidas.'));
    }
    $('simBack').disabled = !sim.caminho.length;
  }

  /* ---------- inicialização ---------- */
  function ligar(id, fn) { $(id).addEventListener('click', fn); }
  function init() {
    DT.state = { doc: null, sel: null, view: { x: 40, y: 40, k: 1 } };
    DT.canvas.init();
    DT.inspector.init();

    var r = lerRascunho();
    if (r && r.doc.nos.length) {
      DT.state.doc = r.doc; nomeArquivo = r.nomeArquivo; sujo = r.sujo;
    } else {
      DT.state.doc = M.exemplo();
    }

    if (fsApi) $('btnSaveAs').hidden = false;
    ligar('btnNew', novo);
    ligar('btnOpen', abrir);
    ligar('btnSave', function () { salvar(false); });
    ligar('btnSaveAs', function () { salvar(true); });
    ligar('btnAddQ', function () { DT.criarNo('pergunta'); });
    ligar('btnAddD', function () { DT.criarNo('decisao'); });
    ligar('btnUndo', desfazer);
    ligar('btnRedo', refazer);
    ligar('btnLayout', function () {
      if (!DT.state.doc.nos.length) return;
      DT.checkpoint();
      M.organizar(DT.state.doc, DT.canvas.alturasMedidas());
      DT.alterou();
      DT.canvas.ajustar();
    });
    ligar('btnTest', function () { DT.abrirTeste(); });
    ligar('emptyAddQ', function () { DT.criarNo('pergunta'); });
    ligar('emptyExample', function () {
      DT.checkpoint();
      DT.state.doc = M.exemplo();
      DT.state.sel = null;
      $('docTitle').value = DT.state.doc.titulo;
      DT.alterou();
      DT.canvas.ajustar();
    });
    ligar('simClose', fecharTeste);
    ligar('simDone', fecharTeste);
    ligar('simRestart', function () { sim.atual = sim.inicio; sim.caminho = []; renderTeste(); });
    ligar('simBack', function () {
      var passo = sim.caminho.pop();
      if (passo) { sim.atual = passo.noId; renderTeste(); }
    });
    $('simModal').addEventListener('click', function (e) { if (e.target === $('simModal')) fecharTeste(); });

    var titulo = $('docTitle');
    titulo.addEventListener('focus', DT.iniciarEdicao);
    titulo.addEventListener('input', function () {
      DT.editando();
      DT.state.doc.titulo = titulo.value;
      var f = $('f-titulo');
      if (f) f.value = titulo.value;
      DT.alterou({ semPainel: true });
    });
    titulo.addEventListener('keydown', function (e) { if (e.key === 'Enter') titulo.blur(); });

    $('fileInput').addEventListener('change', function () {
      lerArquivo(this.files[0]);
      this.value = '';
    });
    var canvas = $('canvas');
    canvas.addEventListener('dragover', function (e) {
      if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0) {
        e.preventDefault();
        canvas.classList.add('dropzone-active');
      }
    });
    canvas.addEventListener('dragleave', function (e) { if (e.target === canvas) canvas.classList.remove('dropzone-active'); });
    canvas.addEventListener('drop', function (e) {
      canvas.classList.remove('dropzone-active');
      var f = e.dataTransfer && e.dataTransfer.files[0];
      if (!f) return;
      e.preventDefault();
      confirmarDescarte('Abrir o arquivo ' + f.name + '?').then(function (ok) { if (ok) lerArquivo(f); });
    });

    document.addEventListener('pointerdown', function (e) {
      if (!$('popmenu').hidden && !e.target.closest('#popmenu')) DT.fecharMenu();
    }, true);
    document.addEventListener('keydown', function (e) {
      var emCampo = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      var mod = e.ctrlKey || e.metaKey, k = (e.key || '').toLowerCase();
      if (mod && k === 's') { e.preventDefault(); salvar(e.shiftKey); return; }
      if (mod && k === 'o') { e.preventDefault(); abrir(); return; }
      if (!$('confirmModal').hidden) return;
      if (!$('simModal').hidden) { if (e.key === 'Escape') fecharTeste(); return; }
      if (e.key === 'Escape') {
        if (!$('popmenu').hidden) DT.fecharMenu();
        else if (emCampo) e.target.blur();
        else if (DT.state.sel) DT.selecionar(null);
        return;
      }
      if (emCampo) return;
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) refazer(); else desfazer(); }
      else if (mod && k === 'y') { e.preventDefault(); refazer(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && DT.state.sel) { e.preventDefault(); DT.excluirSelecao(); }
    });
    window.addEventListener('beforeunload', function (e) {
      agendarRascunho();
      if (sujo && !noArtifact && DT.state.doc.nos.length) { e.preventDefault(); e.returnValue = ''; }
    });

    if (noArtifact) {
      window.claude.use('downloads').then(function (d) { downloads = d; }, function () { downloads = null; });
    }

    renderTudo();
    requestAnimationFrame(function () { DT.canvas.ajustar(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { DT.canvas.render(); DT.canvas.ajustar(); });
    if (r && r.doc.nos.length) DT.aviso('Seu último trabalho foi restaurado deste navegador.');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

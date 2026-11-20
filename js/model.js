/* Modelo de dados da árvore de decisão: criação, edição, validação,
   layout automático e leitura/escrita do JSON. Sem dependência de DOM. */
(function (root) {
  'use strict';

  var FORMATO = 'arvore-decisao';
  var VERSAO = 1;
  var TIPOS = { pergunta: 'Pergunta', decisao: 'Decisão / Recomendação' };

  function agoraISO() { return new Date().toISOString(); }

  function novoDoc(titulo) {
    return {
      formato: FORMATO,
      versao: VERSAO,
      titulo: titulo || 'Nova árvore de decisão',
      descricao: '',
      autor: '',
      atualizadoEm: agoraISO(),
      inicio: null,
      nos: []
    };
  }

  /* ---------- identificadores ---------- */
  function idsUsados(doc) {
    var s = new Set();
    doc.nos.forEach(function (n) {
      s.add(n.id);
      (n.respostas || []).forEach(function (r) { s.add(r.id); });
    });
    return s;
  }
  function novoId(doc, prefixo) {
    var usados = idsUsados(doc), i = 1;
    while (usados.has(prefixo + i)) i++;
    return prefixo + i;
  }

  /* ---------- consultas ---------- */
  function no(doc, id) {
    for (var i = 0; i < doc.nos.length; i++) if (doc.nos[i].id === id) return doc.nos[i];
    return null;
  }
  function resposta(doc, noId, respId) {
    var n = no(doc, noId);
    if (!n) return null;
    for (var i = 0; i < n.respostas.length; i++) if (n.respostas[i].id === respId) return n.respostas[i];
    return null;
  }
  /* respostas (de outros nós) que levam ao nó id */
  function entradas(doc, id) {
    var out = [];
    doc.nos.forEach(function (n) {
      n.respostas.forEach(function (r) { if (r.destino === id) out.push({ no: n, resposta: r }); });
    });
    return out;
  }
  function alcancaveis(doc, inicioId) {
    var vistos = new Set();
    if (!inicioId || !no(doc, inicioId)) return vistos;
    var pilha = [inicioId];
    while (pilha.length) {
      var id = pilha.pop();
      if (vistos.has(id)) continue;
      vistos.add(id);
      var n = no(doc, id);
      if (!n) continue;
      n.respostas.forEach(function (r) { if (r.destino && !vistos.has(r.destino)) pilha.push(r.destino); });
    }
    return vistos;
  }
  /* rótulos curtos exibidos na interface: P1, P2... e D1, D2... */
  function rotulos(doc) {
    var m = {}, p = 0, d = 0;
    doc.nos.forEach(function (n) { m[n.id] = n.tipo === 'decisao' ? 'D' + (++d) : 'P' + (++p); });
    return m;
  }

  /* ---------- edição ---------- */
  function adicionarNo(doc, tipo, posicao, texto) {
    var n = {
      id: novoId(doc, 'n'),
      tipo: tipo === 'decisao' ? 'decisao' : 'pergunta',
      texto: texto || '',
      observacao: '',
      posicao: posicao ? { x: Math.round(posicao.x), y: Math.round(posicao.y) } : { x: 80, y: 80 },
      respostas: []
    };
    doc.nos.push(n);
    if (!doc.inicio) doc.inicio = n.id;
    return n;
  }

  function removerNo(doc, id) {
    doc.nos = doc.nos.filter(function (n) { return n.id !== id; });
    doc.nos.forEach(function (n) {
      n.respostas.forEach(function (r) { if (r.destino === id) r.destino = null; });
    });
    if (doc.inicio === id) {
      var raizes = doc.nos.filter(function (n) { return entradas(doc, n.id).length === 0; });
      doc.inicio = raizes.length ? raizes[0].id : (doc.nos[0] ? doc.nos[0].id : null);
    }
  }

  function duplicarNo(doc, id) {
    var orig = no(doc, id);
    if (!orig) return null;
    var c = adicionarNo(doc, orig.tipo, { x: orig.posicao.x + 40, y: orig.posicao.y + 40 }, orig.texto);
    c.observacao = orig.observacao;
    orig.respostas.forEach(function (r) {
      c.respostas.push({ id: novoId(doc, 'r'), texto: r.texto, destino: r.destino });
    });
    return c;
  }

  function definirTipo(doc, id, tipo) {
    var n = no(doc, id);
    if (!n) return;
    n.tipo = tipo === 'decisao' ? 'decisao' : 'pergunta';
    if (n.tipo === 'decisao') n.respostas = [];
  }

  function adicionarResposta(doc, noId, texto) {
    var n = no(doc, noId);
    if (!n || n.tipo !== 'pergunta') return null;
    var r = { id: novoId(doc, 'r'), texto: texto || '', destino: null };
    n.respostas.push(r);
    return r;
  }

  function removerResposta(doc, noId, respId) {
    var n = no(doc, noId);
    if (!n) return;
    n.respostas = n.respostas.filter(function (r) { return r.id !== respId; });
  }

  function moverResposta(doc, noId, respId, delta) {
    var n = no(doc, noId);
    if (!n) return;
    var i = n.respostas.findIndex(function (r) { return r.id === respId; });
    var j = i + delta;
    if (i < 0 || j < 0 || j >= n.respostas.length) return;
    var tmp = n.respostas[i];
    n.respostas[i] = n.respostas[j];
    n.respostas[j] = tmp;
  }

  /* Uma resposta leva a um único nó. Impede auto-ligação e ciclos. */
  function podeConectar(doc, origemId, destinoId) {
    if (!no(doc, destinoId)) return { ok: false, motivo: 'O nó de destino não existe.' };
    if (origemId === destinoId) return { ok: false, motivo: 'Uma resposta não pode levar à própria pergunta.' };
    if (alcancaveis(doc, destinoId).has(origemId)) {
      return { ok: false, motivo: 'Esta ligação criaria um ciclo: o destino já leva de volta a esta pergunta.' };
    }
    return { ok: true };
  }

  function conectar(doc, noId, respId, destinoId) {
    var r = resposta(doc, noId, respId);
    if (!r) return { ok: false, motivo: 'Resposta não encontrada.' };
    if (destinoId == null) { r.destino = null; return { ok: true }; }
    var v = podeConectar(doc, noId, destinoId);
    if (v.ok) r.destino = destinoId;
    return v;
  }

  /* ---------- validação ---------- */
  function validar(doc) {
    var problemas = [];
    var rot = rotulos(doc);
    function add(nivel, noId, msg, respId) {
      problemas.push({ nivel: nivel, noId: noId || null, respId: respId || null, msg: msg });
    }
    if (!doc.nos.length) {
      add('aviso', null, 'A árvore está vazia. Comece adicionando uma pergunta.');
      return problemas;
    }
    if (!doc.inicio || !no(doc, doc.inicio)) add('erro', null, 'Defina qual nó é o início da árvore.');
    var alc = alcancaveis(doc, doc.inicio);
    doc.nos.forEach(function (n) {
      var r = rot[n.id];
      if (!String(n.texto || '').trim()) {
        add('erro', n.id, r + ': o texto ' + (n.tipo === 'decisao' ? 'da decisão' : 'da pergunta') + ' está vazio.');
      }
      if (n.tipo === 'pergunta') {
        if (!n.respostas.length) add('erro', n.id, r + ': a pergunta não tem opções de resposta.');
        else if (n.respostas.length === 1) add('aviso', n.id, r + ': a pergunta tem apenas uma opção de resposta.');
        var textos = {};
        n.respostas.forEach(function (resp, i) {
          var t = String(resp.texto || '').trim();
          if (!t) add('erro', n.id, r + ': a opção ' + (i + 1) + ' está sem texto.', resp.id);
          else if (textos[t.toLowerCase()]) add('aviso', n.id, r + ': a opção "' + t + '" aparece repetida.', resp.id);
          textos[t.toLowerCase()] = true;
          if (!resp.destino) add('erro', n.id, r + ': a opção "' + (t || (i + 1)) + '" ainda não leva a nenhum nó.', resp.id);
        });
      }
      if (doc.inicio && n.id !== doc.inicio && !alc.has(n.id)) {
        add('aviso', n.id, r + ': não é alcançado a partir do início.');
      }
    });
    return problemas;
  }

  /* ---------- layout automático (camadas da esquerda para a direita) ---------- */
  var LARGURA_NO = 280, ESPACO_X = 120, ESPACO_Y = 36;
  function alturaEstimada(n) { return n.tipo === 'decisao' ? 110 : 92 + 34 * n.respostas.length; }

  function organizar(doc, alturas) {
    alturas = alturas || {};
    var h = function (n) { return alturas[n.id] || alturaEstimada(n); };
    var grauEntrada = {}, prof = {};
    doc.nos.forEach(function (n) { grauEntrada[n.id] = 0; prof[n.id] = 0; });
    doc.nos.forEach(function (n) {
      n.respostas.forEach(function (r) { if (r.destino && grauEntrada[r.destino] != null) grauEntrada[r.destino]++; });
    });
    // ordem topológica (Kahn) com profundidade = maior caminho
    var fila = doc.nos.filter(function (n) { return grauEntrada[n.id] === 0; }).map(function (n) { return n.id; });
    fila.sort(function (a, b) { return (a === doc.inicio ? -1 : 0) - (b === doc.inicio ? -1 : 0); });
    var restante = Object.assign({}, grauEntrada), visit = new Set();
    while (fila.length) {
      var id = fila.shift();
      visit.add(id);
      no(doc, id).respostas.forEach(function (r) {
        if (!r.destino || restante[r.destino] == null) return;
        prof[r.destino] = Math.max(prof[r.destino], prof[id] + 1);
        if (--restante[r.destino] === 0) fila.push(r.destino);
      });
    }
    var maxProf = 0;
    Object.keys(prof).forEach(function (k) { maxProf = Math.max(maxProf, prof[k]); });
    doc.nos.forEach(function (n) { if (!visit.has(n.id)) prof[n.id] = maxProf + 1; }); // ciclos importados

    var colunas = [];
    doc.nos.forEach(function (n) { (colunas[prof[n.id]] = colunas[prof[n.id]] || []).push(n); });
    var centroY = {};
    colunas.forEach(function (col, c) {
      if (!col) return;
      col.forEach(function (n) {
        var pais = entradas(doc, n.id).filter(function (e) { return centroY[e.no.id] != null; });
        if (!pais.length) { n._alvo = n.id === doc.inicio ? -1e6 : 1e6; return; }
        var s = 0;
        pais.forEach(function (e) {
          var i = e.no.respostas.indexOf(e.resposta);
          s += e.no.posicao.y + 70 + i * 34;
        });
        n._alvo = s / pais.length - 40;
      });
      col.sort(function (a, b) { return a._alvo - b._alvo; });
      var y = 0;
      col.forEach(function (n) {
        var alvo = Math.abs(n._alvo) >= 1e6 ? y : n._alvo;
        n.posicao = { x: c * (LARGURA_NO + ESPACO_X), y: Math.round(Math.max(y, alvo)) };
        y = n.posicao.y + h(n) + ESPACO_Y;
        centroY[n.id] = n.posicao.y + h(n) / 2;
        delete n._alvo;
      });
    });
  }

  /* ---------- leitura e escrita do JSON ---------- */
  function texto(v) { return v == null ? '' : String(v); }

  function normalizar(bruto) {
    if (typeof bruto === 'string') {
      try { bruto = JSON.parse(bruto); } catch (e) {
        throw new Error('O arquivo não é um JSON válido (' + e.message + ').');
      }
    }
    if (!bruto || typeof bruto !== 'object' || !Array.isArray(bruto.nos)) {
      throw new Error('O arquivo não parece ser uma árvore de decisão: falta a lista "nos".');
    }
    var doc = novoDoc(texto(bruto.titulo) || 'Árvore sem título');
    doc.descricao = texto(bruto.descricao);
    doc.autor = texto(bruto.autor);
    if (bruto.atualizadoEm) doc.atualizadoEm = texto(bruto.atualizadoEm);
    var avisos = [], semPosicao = false, ids = new Set();
    bruto.nos.forEach(function (b, i) {
      if (!b || typeof b !== 'object') return;
      var id = texto(b.id) || 'n_importado_' + (i + 1);
      if (ids.has(id)) { avisos.push('Identificador repetido "' + id + '" foi renomeado.'); id = id + '_' + (i + 1); }
      ids.add(id);
      var p = b.posicao;
      var temPos = p && isFinite(p.x) && isFinite(p.y);
      if (!temPos) semPosicao = true;
      doc.nos.push({
        id: id,
        tipo: b.tipo === 'decisao' ? 'decisao' : 'pergunta',
        texto: texto(b.texto),
        observacao: texto(b.observacao),
        posicao: temPos ? { x: Number(p.x), y: Number(p.y) } : { x: 0, y: 0 },
        respostas: b.tipo === 'decisao' ? [] : (Array.isArray(b.respostas) ? b.respostas : []).map(function (r, j) {
          return { id: texto(r && r.id) || id + '_r' + (j + 1), texto: texto(r && r.texto), destino: r && r.destino ? texto(r.destino) : null };
        })
      });
    });
    doc.nos.forEach(function (n) {
      n.respostas.forEach(function (r) {
        if (r.destino && !ids.has(r.destino)) {
          avisos.push('A opção "' + r.texto + '" apontava para um nó inexistente ("' + r.destino + '") e foi desconectada.');
          r.destino = null;
        }
      });
    });
    doc.inicio = bruto.inicio && ids.has(texto(bruto.inicio)) ? texto(bruto.inicio) : (doc.nos[0] ? doc.nos[0].id : null);
    if (semPosicao) organizar(doc);
    return { doc: doc, avisos: avisos };
  }

  function serializar(doc) {
    doc.atualizadoEm = agoraISO();
    return JSON.stringify({
      formato: FORMATO,
      versao: VERSAO,
      titulo: doc.titulo,
      descricao: doc.descricao,
      autor: doc.autor,
      atualizadoEm: doc.atualizadoEm,
      inicio: doc.inicio,
      nos: doc.nos.map(function (n) {
        var o = { id: n.id, tipo: n.tipo, texto: n.texto, observacao: n.observacao,
          posicao: { x: Math.round(n.posicao.x), y: Math.round(n.posicao.y) } };
        if (n.tipo === 'pergunta') o.respostas = n.respostas.map(function (r) { return { id: r.id, texto: r.texto, destino: r.destino }; });
        return o;
      })
    }, null, 2);
  }

  function nomeArquivo(doc) {
    var base = String(doc.titulo || 'arvore-de-decisao').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return (base || 'arvore-de-decisao') + '.json';
  }

  /* ---------- exemplo ilustrativo ---------- */
  function exemplo() {
    var d = novoDoc('Exemplo: avaliação da dor no pós-operatório');
    d.descricao = 'Exemplo ilustrativo para aprender a usar o modelador. Não é um protocolo clínico validado.';
    function P(texto, x, y) { return adicionarNo(d, 'pergunta', { x: x, y: y }, texto); }
    function D(texto, obs, x, y) { var n = adicionarNo(d, 'decisao', { x: x, y: y }, texto); n.observacao = obs || ''; return n; }
    var p1 = P('O paciente consegue relatar a intensidade da dor?', 0, 140);
    var p2 = P('Qual a intensidade da dor na escala numérica (0 a 10)?', 400, 0);
    var p3 = P('A escala comportamental indica presença de dor?', 400, 330);
    var d1 = D('Manter analgesia prescrita e medidas não farmacológicas. Reavaliar na rotina.', '', 800, -40);
    var d2 = D('Administrar analgesia conforme prescrição e protocolo institucional. Reavaliar em 30 a 60 minutos.', 'Recebe pacientes de dois caminhos: dor moderada relatada e dor identificada pela escala comportamental.', 800, 110);
    var d3 = D('Comunicar a equipe médica, administrar analgesia de resgate conforme prescrição e reavaliar em 30 minutos.', '', 800, 260);
    var d4 = D('Manter monitoramento e reavaliar a dor na próxima aferição de sinais vitais.', '', 800, 420);
    function R(p, t, dest) { var r = adicionarResposta(d, p.id, t); r.destino = dest.id; }
    R(p1, 'Sim', p2); R(p1, 'Não', p3);
    R(p2, '0 a 3 (leve)', d1); R(p2, '4 a 6 (moderada)', d2); R(p2, '7 a 10 (intensa)', d3);
    R(p3, 'Sim, há sinais de dor', d2); R(p3, 'Não há sinais de dor', d4);
    d.inicio = p1.id;
    return d;
  }

  var api = {
    FORMATO: FORMATO, VERSAO: VERSAO, TIPOS: TIPOS, LARGURA_NO: LARGURA_NO,
    novoDoc: novoDoc, no: no, resposta: resposta, entradas: entradas, alcancaveis: alcancaveis, rotulos: rotulos,
    adicionarNo: adicionarNo, removerNo: removerNo, duplicarNo: duplicarNo, definirTipo: definirTipo,
    adicionarResposta: adicionarResposta, removerResposta: removerResposta, moverResposta: moverResposta,
    podeConectar: podeConectar, conectar: conectar, validar: validar, organizar: organizar,
    normalizar: normalizar, serializar: serializar, nomeArquivo: nomeArquivo, exemplo: exemplo
  };
  root.DTModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

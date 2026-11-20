/* Área de desenho: renderiza nós e ligações, zoom, movimentação e conexão por arraste. */
(function () {
  'use strict';
  var DT = window.DT = window.DT || {};
  var M = window.DTModel;
  var wrap, world, nodesEl, edgesEl, zoomVal, emptyEl;
  var elPorId = {};
  var gesto = null; // { modo: 'pan' | 'no' | 'conectar', ... }

  function h(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  /* ---------- visão (pan/zoom) ---------- */
  function aplicarVisao() {
    var v = DT.state.view;
    world.style.transform = 'translate(' + v.x + 'px,' + v.y + 'px) scale(' + v.k + ')';
    wrap.style.backgroundPosition = v.x + 'px ' + v.y + 'px';
    wrap.style.backgroundSize = (24 * v.k) + 'px ' + (24 * v.k) + 'px';
    zoomVal.textContent = Math.round(v.k * 100) + '%';
  }
  function telaParaMundo(cx, cy) {
    var r = wrap.getBoundingClientRect(), v = DT.state.view;
    return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k };
  }
  function zoom(fator, cx, cy) {
    var v = DT.state.view, r = wrap.getBoundingClientRect();
    if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    var k = Math.min(2, Math.max(0.25, v.k * fator));
    var px = cx - r.left, py = cy - r.top;
    v.x = px - (px - v.x) * (k / v.k);
    v.y = py - (py - v.y) * (k / v.k);
    v.k = k;
    aplicarVisao();
  }
  function limites() {
    var doc = DT.state.doc, b = null;
    doc.nos.forEach(function (n) {
      var el = elPorId[n.id], w = el ? el.offsetWidth : M.LARGURA_NO, hh = el ? el.offsetHeight : 120;
      var x2 = n.posicao.x + w, y2 = n.posicao.y + hh;
      if (!b) b = { x1: n.posicao.x, y1: n.posicao.y, x2: x2, y2: y2 };
      else { b.x1 = Math.min(b.x1, n.posicao.x); b.y1 = Math.min(b.y1, n.posicao.y); b.x2 = Math.max(b.x2, x2); b.y2 = Math.max(b.y2, y2); }
    });
    return b;
  }
  function ajustar() {
    var b = limites(), v = DT.state.view, r = wrap.getBoundingClientRect();
    if (!b) { v.x = 40; v.y = 40; v.k = 1; aplicarVisao(); return; }
    var pad = 48, bw = b.x2 - b.x1, bh = b.y2 - b.y1;
    var k = Math.min(1, (r.width - pad * 2) / bw, (r.height - pad * 2 - 40) / bh);
    k = Math.max(0.25, k);
    v.k = k;
    v.x = (r.width - bw * k) / 2 - b.x1 * k;
    v.y = Math.max(pad, (r.height - 40 - bh * k) / 2) - b.y1 * k;
    aplicarVisao();
  }
  /* desloca a visão só se o nó estiver fora da área visível */
  function mostrarNo(id, piscar) {
    var n = M.no(DT.state.doc, id), el = elPorId[id];
    if (!n || !el) return;
    var v = DT.state.view, r = wrap.getBoundingClientRect();
    var x = n.posicao.x * v.k + v.x, y = n.posicao.y * v.k + v.y;
    var w = el.offsetWidth * v.k, hh = el.offsetHeight * v.k;
    if (x < 20 || y < 20 || x + w > r.width - 20 || y + hh > r.height - 20) {
      v.x = r.width / 2 - (n.posicao.x + el.offsetWidth / 2) * v.k;
      v.y = r.height / 2 - (n.posicao.y + el.offsetHeight / 2) * v.k;
      aplicarVisao();
    }
    if (piscar) { el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash'); }
  }

  /* ---------- renderização ---------- */
  function render() {
    var st = DT.state, doc = st.doc, rot = M.rotulos(doc), probs = DT.problemasPorNo || {};
    nodesEl.textContent = '';
    elPorId = {};
    doc.nos.forEach(function (n) {
      var el = h('div', 'node node--' + n.tipo);
      el.dataset.id = n.id;
      el.style.left = n.posicao.x + 'px';
      el.style.top = n.posicao.y + 'px';
      if (st.sel && st.sel.noId === n.id) el.classList.add('is-selected');
      if (M.entradas(doc, n.id).length) el.appendChild(h('div', 'node__in'));

      var head = h('div', 'node__head');
      head.appendChild(h('span', 'node__tag', rot[n.id] + ' · ' + (n.tipo === 'decisao' ? 'Decisão' : 'Pergunta')));
      var flags = h('span', 'node__flags');
      if (doc.inicio === n.id) flags.appendChild(h('span', 'pill pill--start', 'Início'));
      var p = probs[n.id];
      if (p && p.erros) {
        var pe = h('span', 'pill pill--err', p.erros + (p.erros > 1 ? ' pendências' : ' pendência'));
        pe.title = p.msgs.join('\n');
        flags.appendChild(pe);
      } else if (p && p.avisos) {
        var pa = h('span', 'pill pill--warn', 'aviso');
        pa.title = p.msgs.join('\n');
        flags.appendChild(pa);
      }
      head.appendChild(flags);
      el.appendChild(head);

      var txt = String(n.texto || '').trim();
      el.appendChild(h('div', 'node__text' + (txt ? '' : ' is-empty'),
        txt || (n.tipo === 'decisao' ? 'Escreva a decisão ou recomendação…' : 'Escreva a pergunta…')));

      if (n.tipo === 'pergunta') {
        var ul = h('ul', 'node__answers');
        n.respostas.forEach(function (r) {
          var li = h('li', 'answer' + (r.destino ? '' : ' is-open'));
          li.dataset.resp = r.id;
          if (st.sel && st.sel.respId === r.id) li.classList.add('is-selected');
          var rt = String(r.texto || '').trim();
          li.appendChild(h('span', 'answer__text' + (rt ? '' : ' is-empty'), rt || 'opção sem texto'));
          var port = h('span', 'port' + (r.destino ? ' is-linked' : ''));
          port.dataset.port = r.id;
          port.title = 'Arraste até outra pergunta ou decisão para conectar';
          li.appendChild(port);
          ul.appendChild(li);
        });
        if (!n.respostas.length) {
          var vazio = h('li', 'answer');
          vazio.appendChild(h('span', 'answer__text is-empty', 'sem opções de resposta'));
          ul.appendChild(vazio);
        }
        el.appendChild(ul);
      } else {
        el.appendChild(h('div', 'node__foot', 'Fim do caminho'));
      }
      nodesEl.appendChild(el);
      elPorId[n.id] = el;
    });
    emptyEl.hidden = doc.nos.length > 0;
    desenharLigacoes();
  }

  function pontoPorta(n, respId) {
    var el = elPorId[n.id];
    if (!el) return null;
    var li = el.querySelector('[data-resp="' + respId + '"]');
    if (!li) return null;
    return { x: n.posicao.x + el.offsetWidth + 9, y: n.posicao.y + li.offsetTop + li.offsetHeight / 2 };
  }
  function pontoEntrada(n) { return { x: n.posicao.x - 3, y: n.posicao.y + 22 }; }
  function curva(a, b) {
    var dx = Math.max(50, Math.abs(b.x - a.x) / 2);
    return 'M' + a.x + ' ' + a.y + ' C' + (a.x + dx) + ' ' + a.y + ' ' + (b.x - dx) + ' ' + b.y + ' ' + b.x + ' ' + b.y;
  }

  function desenharLigacoes(temp) {
    var st = DT.state, doc = st.doc, b = limites() || { x1: 0, y1: 0, x2: 0, y2: 0 };
    var pad = 400;
    var ox = b.x1 - pad, oy = b.y1 - pad;
    edgesEl.style.left = ox + 'px';
    edgesEl.style.top = oy + 'px';
    edgesEl.setAttribute('width', b.x2 - b.x1 + pad * 2);
    edgesEl.setAttribute('height', b.y2 - b.y1 + pad * 2);
    edgesEl.style.width = (b.x2 - b.x1 + pad * 2) + 'px';
    edgesEl.style.height = (b.y2 - b.y1 + pad * 2) + 'px';
    edgesEl.textContent = '';
    var g0 = s('g', { transform: 'translate(' + (-ox) + ',' + (-oy) + ')' });
    var selNo = st.sel && st.sel.noId;
    doc.nos.forEach(function (n) {
      n.respostas.forEach(function (r) {
        if (!r.destino) return;
        var alvo = M.no(doc, r.destino), a = pontoPorta(n, r.id);
        if (!alvo || !a) return;
        var d = curva(a, pontoEntrada(alvo));
        var sel = st.sel && st.sel.respId === r.id;
        var rel = !sel && selNo && (n.id === selNo || r.destino === selNo) && !st.sel.respId;
        var g = s('g', { 'class': 'edge-g' + (sel ? ' is-selected' : '') + (rel ? ' is-related' : '') });
        g.dataset.no = n.id;
        g.dataset.resp = r.id;
        var titulo = s('title', {});
        titulo.textContent = '"' + r.texto + '" leva a: ' + (alvo.texto || '(sem texto)');
        g.appendChild(titulo);
        g.appendChild(s('path', { 'class': 'edge-hit', d: d }));
        g.appendChild(s('path', { 'class': 'edge', d: d, 'marker-end': (sel || rel) ? 'url(#arrow-sel)' : 'url(#arrow)' }));
        g0.appendChild(g);
      });
    });
    if (temp) g0.appendChild(s('path', { 'class': 'edge edge--temp', d: curva(temp.a, temp.b) }));
    edgesEl.appendChild(g0);
  }

  function alturasMedidas() {
    var m = {};
    Object.keys(elPorId).forEach(function (id) { m[id] = elPorId[id].offsetHeight; });
    return m;
  }

  /* ---------- menu ao soltar no vazio ---------- */
  function menuCriar(cx, cy, origem) {
    var menu = document.getElementById('popmenu');
    menu.textContent = '';
    var pos = telaParaMundo(cx, cy);
    menu.appendChild(h('div', 'popmenu__title', origem ? 'Esta opção leva a…' : 'Criar aqui'));
    function item(txt, fn) {
      var bt = h('button', null, txt);
      bt.type = 'button';
      bt.addEventListener('click', function () { DT.fecharMenu(); fn(); });
      menu.appendChild(bt);
    }
    item('Nova pergunta', function () { DT.criarNo('pergunta', { x: pos.x, y: pos.y - 22 }, origem); });
    item('Nova decisão / recomendação', function () { DT.criarNo('decisao', { x: pos.x, y: pos.y - 22 }, origem); });
    item('Cancelar', function () {});
    menu.hidden = false;
    var mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.min(cx, window.innerWidth - mw - 8) + 'px';
    menu.style.top = Math.min(cy, window.innerHeight - mh - 8) + 'px';
    var primeiro = menu.querySelector('button');
    if (primeiro) primeiro.focus();
  }

  /* ---------- gestos ---------- */
  function noSobPonteiro(e) {
    var alvo = document.elementFromPoint(e.clientX, e.clientY);
    var el = alvo && alvo.closest ? alvo.closest('.node') : null;
    return el && wrap.contains(el) ? el : null;
  }
  function limparAlvo() {
    nodesEl.querySelectorAll('.is-drop-target,.is-drop-invalid').forEach(function (el) {
      el.classList.remove('is-drop-target', 'is-drop-invalid');
    });
  }

  function aoPressionar(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.target.closest('.zoombar,.hint,.empty__card')) return;
    DT.fecharMenu();
    var port = e.target.closest('.port');
    var nodeEl = e.target.closest('.node');
    var edge = e.target.closest('.edge-g');
    if (port && nodeEl) {
      e.preventDefault();
      var n = M.no(DT.state.doc, nodeEl.dataset.id);
      gesto = { modo: 'conectar', noId: n.id, respId: port.dataset.port, a: pontoPorta(n, port.dataset.port) };
      wrap.setPointerCapture(e.pointerId);
      return;
    }
    if (nodeEl) {
      var id = nodeEl.dataset.id, li = e.target.closest('.answer[data-resp]');
      var sel = { tipo: li ? 'resp' : 'no', noId: id, respId: li ? li.dataset.resp : null };
      var mudou = !DT.state.sel || DT.state.sel.noId !== id || DT.state.sel.respId !== sel.respId;
      if (mudou) DT.selecionar(sel);
      var no = M.no(DT.state.doc, id);
      gesto = { modo: 'no', id: id, x0: e.clientX, y0: e.clientY, px: no.posicao.x, py: no.posicao.y, moveu: false };
      wrap.setPointerCapture(e.pointerId);
      return;
    }
    if (edge) {
      DT.selecionar({ tipo: 'resp', noId: edge.dataset.no, respId: edge.dataset.resp });
      return;
    }
    var v = DT.state.view;
    gesto = { modo: 'pan', x0: e.clientX, y0: e.clientY, vx: v.x, vy: v.y, moveu: false };
    wrap.classList.add('is-panning');
    wrap.setPointerCapture(e.pointerId);
  }

  function aoMover(e) {
    if (!gesto) return;
    var v = DT.state.view;
    if (gesto.modo === 'pan') {
      var dx = e.clientX - gesto.x0, dy = e.clientY - gesto.y0;
      if (Math.abs(dx) + Math.abs(dy) > 3) gesto.moveu = true;
      v.x = gesto.vx + dx; v.y = gesto.vy + dy;
      aplicarVisao();
    } else if (gesto.modo === 'no') {
      var mx = (e.clientX - gesto.x0) / v.k, my = (e.clientY - gesto.y0) / v.k;
      if (!gesto.moveu && Math.abs(mx) + Math.abs(my) < 4) return;
      if (!gesto.moveu) { gesto.moveu = true; DT.checkpoint(); }
      var n = M.no(DT.state.doc, gesto.id);
      n.posicao.x = Math.round(gesto.px + mx);
      n.posicao.y = Math.round(gesto.py + my);
      var el = elPorId[gesto.id];
      el.style.left = n.posicao.x + 'px';
      el.style.top = n.posicao.y + 'px';
      desenharLigacoes();
    } else if (gesto.modo === 'conectar') {
      limparAlvo();
      var alvoEl = noSobPonteiro(e);
      if (alvoEl) {
        var ok = M.podeConectar(DT.state.doc, gesto.noId, alvoEl.dataset.id).ok;
        alvoEl.classList.add(ok ? 'is-drop-target' : 'is-drop-invalid');
      }
      desenharLigacoes({ a: gesto.a, b: telaParaMundo(e.clientX, e.clientY) });
    }
  }

  function aoSoltar(e) {
    if (!gesto) return;
    var g = gesto;
    gesto = null;
    wrap.classList.remove('is-panning');
    if (g.modo === 'pan' && !g.moveu && e.type === 'pointerup') DT.selecionar(null);
    if (g.modo === 'no' && g.moveu) DT.alterou({ semPainel: true });
    if (g.modo === 'conectar') {
      limparAlvo();
      desenharLigacoes();
      if (e.type !== 'pointerup') return;
      var alvoEl = noSobPonteiro(e);
      if (alvoEl) {
        if (alvoEl.dataset.id === g.noId) return; // soltou na própria pergunta: cancela
        var v = M.podeConectar(DT.state.doc, g.noId, alvoEl.dataset.id);
        if (!v.ok) { DT.aviso(v.motivo, true); return; }
        DT.checkpoint();
        M.conectar(DT.state.doc, g.noId, g.respId, alvoEl.dataset.id);
        DT.state.sel = { tipo: 'resp', noId: g.noId, respId: g.respId };
        DT.alterou();
      } else if (wrap.contains(document.elementFromPoint(e.clientX, e.clientY))) {
        menuCriar(e.clientX, e.clientY, { noId: g.noId, respId: g.respId });
      }
    }
  }

  function init() {
    wrap = document.getElementById('canvas');
    world = document.getElementById('world');
    nodesEl = document.getElementById('nodes');
    edgesEl = document.getElementById('edges');
    zoomVal = document.getElementById('zoomVal');
    emptyEl = document.getElementById('empty');
    wrap.addEventListener('pointerdown', aoPressionar);
    wrap.addEventListener('pointermove', aoMover);
    wrap.addEventListener('pointerup', aoSoltar);
    wrap.addEventListener('pointercancel', aoSoltar);
    wrap.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) zoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
      else { DT.state.view.x -= e.deltaX; aplicarVisao(); }
    }, { passive: false });
    wrap.addEventListener('dblclick', function (e) {
      if (e.target.closest('.node,.zoombar,.hint,.empty__card,.edge-g')) return;
      menuCriar(e.clientX, e.clientY, null);
    });
    document.getElementById('zoomIn').addEventListener('click', function () { zoom(1.2); });
    document.getElementById('zoomOut').addEventListener('click', function () { zoom(1 / 1.2); });
    document.getElementById('zoomFit').addEventListener('click', ajustar);
    var largo = window.innerWidth > 860;
    window.addEventListener('resize', function () {
      var l = window.innerWidth > 860;
      if (l !== largo) { largo = l; ajustar(); } else aplicarVisao();
    });
  }

  DT.canvas = {
    init: init, render: render, desenharLigacoes: desenharLigacoes, aplicarVisao: aplicarVisao,
    ajustar: ajustar, mostrarNo: mostrarNo, telaParaMundo: telaParaMundo, alturasMedidas: alturasMedidas,
    centroVisivel: function () {
      var r = wrap.getBoundingClientRect();
      return telaParaMundo(r.left + r.width / 2, r.top + r.height / 2);
    }
  };
})();

/* ========== 知识图谱（可视化 + 分类列表） ========== */
var Graph = (function() {

  // ========== SVG 图谱状态 ==========
  var nodes = [];
  var edges = [];
  var svgWidth = 0;
  var svgHeight = 0;
  var transform = { x: 0, y: 0, scale: 1 };
  var NODE_RADIUS = 22;

  // ========== 主渲染 ==========

  function render() {
    var stats = Storage.getStats();
    var total = stats.totalPlants + stats.totalKnowledge + stats.totalEcology;

    var html = '';

    // 统计概览
    html += '<div class="graph-stats">';
    html += '<div class="graph-stats-title">你的植物学探索进度</div>';
    html += '<div class="graph-stats-numbers">';
    html += '<div class="graph-stat-item"><div class="graph-stat-num">' + stats.totalPlants + '</div><div class="graph-stat-label">种植物</div></div>';
    html += '<div class="graph-stat-item"><div class="graph-stat-num">' + stats.totalKnowledge + '</div><div class="graph-stat-label">条知识</div></div>';
    html += '<div class="graph-stat-item"><div class="graph-stat-num">' + stats.totalEcology + '</div><div class="graph-stat-label">个发现</div></div>';
    html += '<div class="graph-stat-item"><div class="graph-stat-num">' + stats.totalFamilies + '</div><div class="graph-stat-label">个科</div></div>';
    html += '</div>';
    html += '</div>';

    if (total === 0) {
      html += '<div class="empty-state">';
      html += '<div class="empty-state-text">开始记录后，这里会展示你的知识图谱</div>';
      html += '</div>';
      return html;
    }

    // 视图切换
    html += '<div class="graph-view-toggle">';
    html += '<button class="filter-chip active" id="gv-btn-visual" onclick="Graph.showVisual()">🕸 图谱</button>';
    html += '<button class="filter-chip" id="gv-btn-tree" onclick="Graph.showTree()">📋 列表</button>';
    html += '</div>';

    // 可视化图谱容器
    html += '<div id="graph-visual-container">';
    html += '<div class="graph-canvas-wrap" id="graph-canvas-wrap"></div>';
    html += '<div class="graph-legend">';
    html += '<span class="graph-legend-item"><span class="graph-legend-dot" style="background:var(--green);"></span>植物</span>';
    html += '<span class="graph-legend-item"><span class="graph-legend-dot" style="background:var(--blue);"></span>知识</span>';
    html += '<span class="graph-legend-item"><span class="graph-legend-dot" style="background:var(--orange);"></span>发现</span>';
    html += '<span class="graph-legend-item"><span class="graph-legend-line solid"></span>手动</span>';
    html += '<span class="graph-legend-item"><span class="graph-legend-line dashed"></span>自动</span>';
    html += '</div>';
    html += '</div>';

    // 分类列表容器（默认隐藏）
    html += '<div id="graph-tree-container" style="display:none;">';
    html += renderTaxonomyTree();
    html += renderKnowledgeTree();
    html += renderEcologyList();
    html += '</div>';

    return html;
  }

  // ========== 视图切换 ==========

  function showVisual() {
    document.getElementById('graph-visual-container').style.display = '';
    document.getElementById('graph-tree-container').style.display = 'none';
    document.getElementById('gv-btn-visual').classList.add('active');
    document.getElementById('gv-btn-tree').classList.remove('active');
  }

  function showTree() {
    document.getElementById('graph-visual-container').style.display = 'none';
    document.getElementById('graph-tree-container').style.display = '';
    document.getElementById('gv-btn-visual').classList.remove('active');
    document.getElementById('gv-btn-tree').classList.add('active');
  }

  // ========== SVG 可视化图谱 ==========

  function initVisual() {
    var wrap = document.getElementById('graph-canvas-wrap');
    if (!wrap) return;

    svgWidth = wrap.clientWidth || 350;
    svgHeight = Math.max(350, Math.min(500, window.innerHeight - 280));
    transform = { x: 0, y: 0, scale: 1 };

    buildGraphData();

    if (nodes.length === 0) {
      wrap.innerHTML = '<div class="empty-state" style="padding:40px 0;"><div class="empty-state-text">还没有记录，无法生成图谱</div></div>';
      return;
    }

    runForceLayout(200);
    centerGraph();
    drawSVG(wrap);
    bindEvents(wrap);
  }

  function buildGraphData() {
    var records = Storage.getCompleted();
    nodes = [];
    edges = [];
    var idToIndex = {};

    // 创建节点
    records.forEach(function(r, i) {
      nodes.push({
        id: r.id,
        label: r.name || r.title || '未命名',
        type: r.type,
        x: svgWidth / 2 + (Math.random() - 0.5) * svgWidth * 0.6,
        y: svgHeight / 2 + (Math.random() - 0.5) * svgHeight * 0.6,
        vx: 0, vy: 0
      });
      idToIndex[r.id] = i;
    });

    // 手动链接（实线）
    var edgeSet = {};
    records.forEach(function(r) {
      if (!r.links) return;
      r.links.forEach(function(linkId) {
        if (idToIndex[linkId] === undefined) return;
        var a = idToIndex[r.id];
        var b = idToIndex[linkId];
        var key = Math.min(a, b) + '-' + Math.max(a, b);
        if (!edgeSet[key]) {
          edgeSet[key] = true;
          edges.push({ source: a, target: b, implicit: false });
        }
      });
    });

    // 自动发现隐含关联（虚线）
    discoverImplicitEdges(records, idToIndex, edgeSet);
  }

  function discoverImplicitEdges(records, idToIndex, edgeSet) {
    var plants = records.filter(function(r) { return r.type === 'plant'; });

    // 同属连线
    for (var i = 0; i < plants.length; i++) {
      for (var j = i + 1; j < plants.length; j++) {
        if (plants[i].genus && plants[j].genus && plants[i].genus === plants[j].genus) {
          addImplicitEdge(idToIndex[plants[i].id], idToIndex[plants[j].id], edgeSet);
        }
      }
    }

    // 同科连线
    for (var i = 0; i < plants.length; i++) {
      for (var j = i + 1; j < plants.length; j++) {
        if (plants[i].family && plants[j].family && plants[i].family === plants[j].family) {
          addImplicitEdge(idToIndex[plants[i].id], idToIndex[plants[j].id], edgeSet);
        }
      }
    }

    // 生态关联的 relatedObjects 提及植物名
    var ecology = records.filter(function(r) { return r.type === 'ecology'; });
    ecology.forEach(function(eco) {
      if (!eco.relatedObjects) return;
      plants.forEach(function(p) {
        if (p.name && eco.relatedObjects.indexOf(p.name) !== -1) {
          addImplicitEdge(idToIndex[eco.id], idToIndex[p.id], edgeSet);
        }
      });
    });

    // 共同标签连线（跨类型）
    for (var i = 0; i < records.length; i++) {
      for (var j = i + 1; j < records.length; j++) {
        if (records[i].type === records[j].type) continue; // 只连跨类型
        var tagsA = records[i].tags || [];
        var tagsB = records[j].tags || [];
        if (tagsA.length === 0 || tagsB.length === 0) continue;
        var hasShared = tagsA.some(function(t) { return tagsB.indexOf(t) !== -1; });
        if (hasShared) {
          addImplicitEdge(idToIndex[records[i].id], idToIndex[records[j].id], edgeSet);
        }
      }
    }
  }

  function addImplicitEdge(a, b, edgeSet) {
    var key = Math.min(a, b) + '-' + Math.max(a, b);
    if (!edgeSet[key]) {
      edgeSet[key] = true;
      edges.push({ source: a, target: b, implicit: true });
    }
  }

  // ========== 力导向布局 ==========

  function runForceLayout(iterations) {
    var REPULSION = 4000;
    var SPRING_LEN = 90;
    var SPRING_K = 0.04;
    var DAMPING = 0.85;
    var MAX_VEL = 8;
    var GRAVITY = 0.01;
    var cx = svgWidth / 2;
    var cy = svgHeight / 2;

    for (var iter = 0; iter < iterations; iter++) {
      // 斥力（所有节点对）
      for (var i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          var dx = nodes[j].x - nodes[i].x;
          var dy = nodes[j].y - nodes[i].y;
          var dist = Math.sqrt(dx * dx + dy * dy) || 1;
          var force = REPULSION / (dist * dist);
          var fx = (dx / dist) * force;
          var fy = (dy / dist) * force;
          nodes[i].vx -= fx;
          nodes[i].vy -= fy;
          nodes[j].vx += fx;
          nodes[j].vy += fy;
        }
      }

      // 弹力（连线）
      for (var e = 0; e < edges.length; e++) {
        var s = nodes[edges[e].source];
        var t = nodes[edges[e].target];
        var dx = t.x - s.x;
        var dy = t.y - s.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var disp = dist - SPRING_LEN;
        var force = SPRING_K * disp;
        var fx = (dx / dist) * force;
        var fy = (dy / dist) * force;
        s.vx += fx;
        s.vy += fy;
        t.vx -= fx;
        t.vy -= fy;
      }

      // 向心力
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].vx += (cx - nodes[i].x) * GRAVITY;
        nodes[i].vy += (cy - nodes[i].y) * GRAVITY;
      }

      // 应用速度
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].vx *= DAMPING;
        nodes[i].vy *= DAMPING;
        nodes[i].vx = Math.max(-MAX_VEL, Math.min(MAX_VEL, nodes[i].vx));
        nodes[i].vy = Math.max(-MAX_VEL, Math.min(MAX_VEL, nodes[i].vy));
        nodes[i].x += nodes[i].vx;
        nodes[i].y += nodes[i].vy;
      }
    }
  }

  function centerGraph() {
    if (nodes.length === 0) return;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(function(n) {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x > maxX) maxX = n.x;
      if (n.y > maxY) maxY = n.y;
    });
    var graphW = maxX - minX + NODE_RADIUS * 4;
    var graphH = maxY - minY + NODE_RADIUS * 4;
    var scaleX = svgWidth / graphW;
    var scaleY = svgHeight / graphH;
    var scale = Math.min(scaleX, scaleY, 1.5);
    var offsetX = (svgWidth - graphW * scale) / 2 - minX * scale + NODE_RADIUS * 2 * scale;
    var offsetY = (svgHeight - graphH * scale) / 2 - minY * scale + NODE_RADIUS * 2 * scale;
    transform = { x: offsetX, y: offsetY, scale: scale };
  }

  // ========== SVG 绘制 ==========

  function drawSVG(wrap) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'graph-svg');
    svg.setAttribute('width', svgWidth);
    svg.setAttribute('height', svgHeight);
    svg.setAttribute('viewBox', '0 0 ' + svgWidth + ' ' + svgHeight);
    svg.id = 'graph-svg';

    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.id = 'graph-transform';
    g.setAttribute('transform', 'translate(' + transform.x + ',' + transform.y + ') scale(' + transform.scale + ')');

    // 画连线
    edges.forEach(function(e) {
      var s = nodes[e.source];
      var t = nodes[e.target];
      var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', s.x);
      line.setAttribute('y1', s.y);
      line.setAttribute('x2', t.x);
      line.setAttribute('y2', t.y);
      line.setAttribute('class', 'graph-edge' + (e.implicit ? ' implicit' : ''));
      g.appendChild(line);
    });

    // 画节点
    nodes.forEach(function(n) {
      var group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('class', 'graph-node');
      group.setAttribute('transform', 'translate(' + n.x + ',' + n.y + ')');
      group.setAttribute('data-id', n.id);

      // 外圈
      var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', NODE_RADIUS);
      var colors = getNodeColors(n.type);
      circle.setAttribute('fill', colors.light);
      circle.setAttribute('stroke', colors.main);
      circle.setAttribute('stroke-width', '2');
      group.appendChild(circle);

      // 图标
      var icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      icon.setAttribute('text-anchor', 'middle');
      icon.setAttribute('dy', '6');
      icon.setAttribute('font-size', '16');
      icon.textContent = n.type === 'plant' ? '🌿' : n.type === 'knowledge' ? '📖' : '🔗';
      group.appendChild(icon);

      // 标签
      var label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('class', 'graph-node-label');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dy', NODE_RADIUS + 14 + '');
      label.setAttribute('font-size', '11');
      var truncLabel = n.label.length > 5 ? n.label.substring(0, 5) + '..' : n.label;
      label.textContent = truncLabel;
      group.appendChild(label);

      // 点击事件
      group.addEventListener('click', function(ev) {
        ev.stopPropagation();
        App.showDetail(n.id);
      });

      g.appendChild(group);
    });

    svg.appendChild(g);
    wrap.innerHTML = '';
    wrap.appendChild(svg);
  }

  function getNodeColors(type) {
    if (type === 'plant') return { main: '#7ba862', light: '#e8f2de' };
    if (type === 'knowledge') return { main: '#6b9ebb', light: '#deedf5' };
    return { main: '#c4935a', light: '#f5ead8' };
  }

  // ========== 触摸/鼠标交互 ==========

  function bindEvents(wrap) {
    var svg = document.getElementById('graph-svg');
    if (!svg) return;

    var isPanning = false;
    var startX = 0, startY = 0;
    var lastPinchDist = 0;

    function applyTransform() {
      var g = document.getElementById('graph-transform');
      if (g) g.setAttribute('transform', 'translate(' + transform.x + ',' + transform.y + ') scale(' + transform.scale + ')');
    }

    function getPinchDist(e) {
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    // 触摸
    svg.addEventListener('touchstart', function(e) {
      if (e.touches.length === 1) {
        isPanning = true;
        startX = e.touches[0].clientX - transform.x;
        startY = e.touches[0].clientY - transform.y;
      } else if (e.touches.length === 2) {
        isPanning = false;
        lastPinchDist = getPinchDist(e);
      }
    }, { passive: true });

    svg.addEventListener('touchmove', function(e) {
      if (e.touches.length === 1 && isPanning) {
        transform.x = e.touches[0].clientX - startX;
        transform.y = e.touches[0].clientY - startY;
        applyTransform();
      } else if (e.touches.length === 2) {
        var dist = getPinchDist(e);
        if (lastPinchDist > 0) {
          var delta = dist / lastPinchDist;
          transform.scale = Math.max(0.3, Math.min(3, transform.scale * delta));
          applyTransform();
        }
        lastPinchDist = dist;
      }
    }, { passive: true });

    svg.addEventListener('touchend', function() {
      isPanning = false;
      lastPinchDist = 0;
    });

    // 鼠标拖拽
    svg.addEventListener('mousedown', function(e) {
      isPanning = true;
      startX = e.clientX - transform.x;
      startY = e.clientY - transform.y;
      svg.style.cursor = 'grabbing';
    });
    svg.addEventListener('mousemove', function(e) {
      if (!isPanning) return;
      transform.x = e.clientX - startX;
      transform.y = e.clientY - startY;
      applyTransform();
    });
    svg.addEventListener('mouseup', function() {
      isPanning = false;
      svg.style.cursor = '';
    });
    svg.addEventListener('mouseleave', function() {
      isPanning = false;
      svg.style.cursor = '';
    });

    // 鼠标滚轮缩放
    svg.addEventListener('wheel', function(e) {
      e.preventDefault();
      var delta = e.deltaY > 0 ? 0.9 : 1.1;
      transform.scale = Math.max(0.3, Math.min(3, transform.scale * delta));
      applyTransform();
    });
  }

  // ========== 分类列表（原有功能） ==========

  function renderTaxonomyTree() {
    var tree = Storage.getTaxonomyTree();
    var families = Object.keys(tree);
    if (families.length === 0) return '';

    var html = '<div class="knowledge-section">';
    html += '<div class="section-title">🌿 植物分类 <span class="count">' + countPlants(tree) + ' 种</span></div>';

    families.sort().forEach(function(family) {
      var genera = tree[family];
      var genusKeys = Object.keys(genera);
      var plantCount = 0;
      genusKeys.forEach(function(g) { plantCount += genera[g].length; });

      var familyId = 'f-' + family.replace(/\s/g, '_');
      html += '<div class="tree-node">';
      html += '<div class="tree-branch" onclick="Graph.toggleBranch(\'' + familyId + '\')">';
      html += '<div class="tree-branch-icon" style="background:var(--green);"></div>';
      html += '<span class="tree-branch-name">' + escapeHtml(family) + '</span>';
      html += '<span class="tree-branch-count">' + plantCount + ' 种</span>';
      html += '</div>';

      html += '<div class="tree-children" id="' + familyId + '">';
      genusKeys.sort().forEach(function(genus) {
        var plants = genera[genus];
        var genusId = familyId + '-' + genus.replace(/\s/g, '_');

        html += '<div class="tree-node">';
        html += '<div class="tree-branch" onclick="Graph.toggleBranch(\'' + genusId + '\')">';
        html += '<div class="tree-branch-icon" style="background:var(--green); opacity:0.6; width:6px; height:6px;"></div>';
        html += '<span class="tree-branch-name" style="font-size:13px;">' + escapeHtml(genus) + '</span>';
        html += '<span class="tree-branch-count">' + plants.length + '</span>';
        html += '</div>';

        html += '<div class="tree-children" id="' + genusId + '">';
        plants.forEach(function(p) {
          html += '<div class="tree-node">';
          html += '<div class="tree-branch" onclick="App.showDetail(\'' + p.id + '\')" style="padding-left:24px;">';
          html += '<span style="font-size:13px; color:var(--gray-700);">' + escapeHtml(p.name || '未命名') + '</span>';
          if (p.latinName) {
            html += '<span style="font-size:11px; color:var(--gray-400); font-style:italic; margin-left:6px;">' + escapeHtml(p.latinName) + '</span>';
          }
          html += '</div></div>';
        });
        html += '</div></div>';
      });
      html += '</div></div>';
    });

    html += '</div>';
    return html;
  }

  function renderKnowledgeTree() {
    var categories = Storage.getKnowledgeCategories();
    var cats = Object.keys(categories);
    if (cats.length === 0) return '';

    var html = '<div class="knowledge-section">';
    html += '<div class="section-title">📖 知识分类</div>';

    cats.sort().forEach(function(cat) {
      var items = categories[cat];
      var catId = 'k-' + cat.replace(/\s/g, '_');

      html += '<div class="tree-node">';
      html += '<div class="tree-branch" onclick="Graph.toggleBranch(\'' + catId + '\')">';
      html += '<div class="tree-branch-icon" style="background:var(--blue);"></div>';
      html += '<span class="tree-branch-name">' + escapeHtml(cat) + '</span>';
      html += '<span class="tree-branch-count">' + items.length + '</span>';
      html += '</div>';

      html += '<div class="tree-children" id="' + catId + '">';
      items.forEach(function(item) {
        html += '<div class="tree-node">';
        html += '<div class="tree-branch" onclick="App.showDetail(\'' + item.id + '\')" style="padding-left:24px;">';
        html += '<span style="font-size:13px; color:var(--gray-700);">' + escapeHtml(item.title || '未命名') + '</span>';
        html += '</div></div>';
      });
      html += '</div></div>';
    });

    html += '</div>';
    return html;
  }

  function renderEcologyList() {
    var ecology = Storage.getByType('ecology').filter(function(r) { return r.status !== 'pending'; });
    if (ecology.length === 0) return '';

    var html = '<div class="knowledge-section">';
    html += '<div class="section-title">🔍 野外发现 <span class="count">' + ecology.length + ' 个</span></div>';

    ecology.forEach(function(item) {
      html += '<div class="knowledge-item" onclick="App.showDetail(\'' + item.id + '\')">';
      html += '<div class="knowledge-icon orange">🔗</div>';
      html += '<div style="flex:1; min-width:0;">';
      html += '<div style="font-size:14px; font-weight:500;">' + escapeHtml(item.title || '未命名') + '</div>';
      if (item.relatedObjects) {
        html += '<div style="font-size:12px; color:var(--gray-500);">' + escapeHtml(item.relatedObjects) + '</div>';
      }
      html += '</div></div>';
    });

    html += '</div>';
    return html;
  }

  // ========== 工具函数 ==========

  function toggleBranch(id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('open');
  }

  function countPlants(tree) {
    var count = 0;
    Object.keys(tree).forEach(function(f) {
      Object.keys(tree[f]).forEach(function(g) {
        count += tree[f][g].length;
      });
    });
    return count;
  }

  // escapeHtml 已提取到 utils.js

  return {
    render: render,
    initVisual: initVisual,
    showVisual: showVisual,
    showTree: showTree,
    toggleBranch: toggleBranch
  };
})();

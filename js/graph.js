/* ========== 知识图谱 ========== */
var Graph = (function() {

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
    html += '<div class="graph-stat-item"><div class="graph-stat-num">' + stats.totalEcology + '</div><div class="graph-stat-label">个关联</div></div>';
    html += '<div class="graph-stat-item"><div class="graph-stat-num">' + stats.totalFamilies + '</div><div class="graph-stat-label">个科</div></div>';
    html += '</div>';
    html += '</div>';

    if (total === 0) {
      html += '<div class="empty-state">';
      html += '<div class="empty-state-text">开始记录后，这里会展示你的知识图谱</div>';
      html += '</div>';
      return html;
    }

    // 植物分类树
    html += renderTaxonomyTree();

    // 知识分类
    html += renderKnowledgeTree();

    // 生态关联
    html += renderEcologyList();

    return html;
  }

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
    html += '<div class="section-title">🔗 生态关联 <span class="count">' + ecology.length + ' 个</span></div>';

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

  function toggleBranch(id) {
    var el = document.getElementById(id);
    if (el) {
      el.classList.toggle('open');
    }
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

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return {
    render: render,
    toggleBranch: toggleBranch
  };
})();

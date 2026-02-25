/* ========== 知识库视图 ========== */
var Knowledge = (function() {

  function render() {
    var knowledgeItems = Storage.getByType('knowledge').filter(function(r) { return r.status !== 'pending'; });
    var ecologyItems = Storage.getByType('ecology').filter(function(r) { return r.status !== 'pending'; });

    knowledgeItems.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    ecologyItems.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

    var total = knowledgeItems.length + ecologyItems.length;

    if (total === 0) {
      return '<div class="empty-state">' +
        '<div class="empty-state-icon">📚</div>' +
        '<div class="empty-state-text">还没有知识记录<br>遇到有趣的植物学知识就来记一笔</div>' +
        '<div style="display:flex; gap:10px; justify-content:center;">' +
        '<button class="btn btn-primary" onclick="Form.openNew(\'knowledge\')">记录知识</button>' +
        '<button class="btn btn-secondary" onclick="Form.openNew(\'ecology\')">记录发现</button>' +
        '</div></div>';
    }

    var html = '';

    // 搜索
    html += '<div class="search-bar">';
    html += '<input class="search-input" placeholder="搜索知识..." id="knowledge-search" oninput="Knowledge.filter()">';
    html += '</div>';

    // 筛选
    html += '<div class="filter-chips">';
    html += '<button class="filter-chip active" id="kf-all" onclick="Knowledge.setFilter(\'all\', this)">全部 (' + total + ')</button>';
    html += '<button class="filter-chip" id="kf-knowledge" onclick="Knowledge.setFilter(\'knowledge\', this)">📖 知识 (' + knowledgeItems.length + ')</button>';
    html += '<button class="filter-chip" id="kf-ecology" onclick="Knowledge.setFilter(\'ecology\', this)">🔍 发现 (' + ecologyItems.length + ')</button>';
    html += '</div>';

    // 列表
    html += '<div id="knowledge-list">';
    html += renderList(knowledgeItems.concat(ecologyItems));
    html += '</div>';

    // 新建按钮
    html += '<div style="display:flex; gap:10px; margin-top:16px;">';
    html += '<button class="btn btn-blue btn-block btn-sm" onclick="Form.openNew(\'knowledge\')">+ 植物学知识</button>';
    html += '<button class="btn btn-orange btn-block btn-sm" onclick="Form.openNew(\'ecology\')">+ 记录发现</button>';
    html += '</div>';

    return html;
  }

  function renderList(items) {
    items.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    var html = '';
    items.forEach(function(item) {
      var isKnowledge = item.type === 'knowledge';
      var icon = isKnowledge ? '📖' : '🔗';
      var iconClass = isKnowledge ? 'blue' : 'orange';
      var title = item.title || '未命名';
      var subtitle = isKnowledge ? (item.category || '') : (item.relatedObjects || '');
      var excerpt = item.content || item.source || item.observation || '';

      html += '<div class="knowledge-item" onclick="App.showDetail(\'' + item.id + '\')">';
      html += '<div class="knowledge-icon ' + iconClass + '">' + icon + '</div>';
      html += '<div style="flex:1; min-width:0;">';
      html += '<div style="font-size:15px; font-weight:600;">' + escapeHtml(title) + '</div>';
      if (subtitle) {
        html += '<div style="font-size:13px; color:var(--gray-500);">' + escapeHtml(subtitle) + '</div>';
      }
      if (excerpt) {
        html += '<div class="card-excerpt" style="margin-top:4px;">' + escapeHtml(excerpt) + '</div>';
      }
      html += '</div></div>';
    });
    return html;
  }

  var currentFilter = 'all';

  function setFilter(type, btn) {
    currentFilter = type;
    document.querySelectorAll('.filter-chips .filter-chip').forEach(function(c) {
      c.classList.remove('active');
    });
    btn.classList.add('active');
    applyFilter();
  }

  function filter() {
    applyFilter();
  }

  function applyFilter() {
    var search = (document.getElementById('knowledge-search') || {}).value || '';
    search = search.toLowerCase();

    var items = [];
    if (currentFilter === 'all' || currentFilter === 'knowledge') {
      items = items.concat(Storage.getByType('knowledge').filter(function(r) { return r.status !== 'pending'; }));
    }
    if (currentFilter === 'all' || currentFilter === 'ecology') {
      items = items.concat(Storage.getByType('ecology').filter(function(r) { return r.status !== 'pending'; }));
    }

    if (search) {
      items = items.filter(function(r) {
        var text = (r.title || '') + (r.category || '') + (r.content || '') +
          (r.relatedObjects || '') + (r.source || '') + (r.observation || '') + (r.tags || []).join(' ');
        return text.toLowerCase().indexOf(search) !== -1;
      });
    }

    var list = document.getElementById('knowledge-list');
    if (list) {
      list.innerHTML = items.length > 0 ? renderList(items) :
        '<div class="empty-state"><div class="empty-state-text">没有匹配的记录</div></div>';
    }
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return {
    render: render,
    filter: filter,
    setFilter: setFilter
  };
})();

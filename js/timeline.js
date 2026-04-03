/* ========== 时间线视图 ========== */
var Timeline = (function() {

  function render() {
    var records = Storage.getCompleted();
    records.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

    if (records.length === 0) {
      return '<div class="empty-state">' +
        '<div class="empty-state-icon">📅</div>' +
        '<div class="empty-state-text">还没有记录<br>点击右下角的相机按钮开始第一条记录</div>' +
        '</div>';
    }

    var html = '';

    // 搜索栏
    html += '<div class="search-bar">';
    html += '<input class="search-input" placeholder="搜索记录..." id="timeline-search" oninput="Timeline.filter()">';
    html += '</div>';

    // 筛选标签
    html += '<div class="filter-chips" id="timeline-filters">';
    html += '<button class="filter-chip active" data-filter="all" onclick="Timeline.setFilter(\'all\', this)">全部</button>';
    html += '<button class="filter-chip" data-filter="plant" onclick="Timeline.setFilter(\'plant\', this)">🌿 植物</button>';
    html += '<button class="filter-chip" data-filter="knowledge" onclick="Timeline.setFilter(\'knowledge\', this)">📖 知识</button>';
    html += '<button class="filter-chip" data-filter="ecology" onclick="Timeline.setFilter(\'ecology\', this)">🔍 发现</button>';
    html += '</div>';

    // 时间线
    html += '<div class="timeline" id="timeline-list">';
    html += renderItems(records);
    html += '</div>';

    return html;
  }

  function renderItems(records) {
    var html = '';
    var lastDate = '';

    records.forEach(function(r) {
      var dateStr = formatDate(r.createdAt);
      if (dateStr !== lastDate) {
        html += '<div class="timeline-date">' + dateStr + '</div>';
        lastDate = dateStr;
      }

      var dotClass = r.type === 'knowledge' ? 'knowledge' : r.type === 'ecology' ? 'ecology' : '';
      var badgeClass = r.type === 'plant' ? 'badge-plant' : r.type === 'knowledge' ? 'badge-knowledge' : 'badge-ecology';
      var typeLabel = r.type === 'plant' ? '🌿 植物' : r.type === 'knowledge' ? '📖 知识' : '🔍 发现';
      var name = r.name || r.title || r.quickSummary || summarizeTimelineRecord(r) || '未命名';
      var excerpt = r.notes || r.content || r.attraction || r.observation || r.detailedObservation || '';

      html += '<div class="timeline-item" onclick="App.showDetail(\'' + r.id + '\')">';
      html += '<div class="timeline-dot ' + dotClass + '"></div>';
      html += '<div class="timeline-card">';
      html += '<div class="timeline-card-header">';
      html += '<span class="card-type-badge ' + badgeClass + '">' + typeLabel + '</span>';
      html += '<span class="timeline-card-title">' + escapeHtml(name) + '</span>';
      html += '</div>';
      if (excerpt) {
        html += '<div class="card-excerpt">' + escapeHtml(excerpt) + '</div>';
      }
      if (r.tags && r.tags.length > 0) {
        html += '<div style="margin-top:6px; display:flex; gap:4px; flex-wrap:wrap;">';
        r.tags.forEach(function(tag) {
          html += '<span class="tag" style="font-size:11px; padding:2px 6px;">' + escapeHtml(tag) + '</span>';
        });
        html += '</div>';
      }
      html += '</div>';
      html += '</div>';
    });

    return html;
  }

  var currentFilter = 'all';

  function setFilter(type, btn) {
    currentFilter = type;
    document.querySelectorAll('#timeline-filters .filter-chip').forEach(function(c) {
      c.classList.remove('active');
    });
    btn.classList.add('active');
    applyFilter();
  }

  function filter() {
    applyFilter();
  }

  function applyFilter() {
    var search = (document.getElementById('timeline-search') || {}).value || '';
    search = search.toLowerCase();
    var records = Storage.getCompleted();

    if (currentFilter !== 'all') {
      records = records.filter(function(r) { return r.type === currentFilter; });
    }

    if (search) {
      records = records.filter(function(r) {
        var text = (r.name || '') + (r.title || '') + (r.notes || '') + (r.content || '') +
          (r.family || '') + (r.genus || '') + (r.features || '') + (r.tags || []).join(' ');
        return text.toLowerCase().indexOf(search) !== -1;
      });
    }

    records.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

    var list = document.getElementById('timeline-list');
    if (list) {
      list.innerHTML = records.length > 0 ? renderItems(records) :
        '<div class="empty-state"><div class="empty-state-text">没有找到匹配的记录</div></div>';
    }
  }

  function formatDate(isoString) {
    var d = new Date(isoString);
    var months = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
    return d.getFullYear() + '年' + months[d.getMonth()] + d.getDate() + '日';
  }

  // escapeHtml 已提取到 utils.js

  function summarizeTimelineRecord(record) {
    var text = record.detailedObservation || record.notes || record.content || record.observation || '';
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    return text.length > 20 ? text.slice(0, 20) + '…' : text;
  }

  return {
    render: render,
    filter: filter,
    setFilter: setFilter
  };
})();

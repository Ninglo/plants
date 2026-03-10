/* ========== 植物档案卡片墙 ========== */
var Cards = (function() {

  var currentTag = null;
  var selectionMode = false;
  var selectedIds = [];
  var batchTags = [];

  function render() {
    var plants = Storage.getByType('plant').filter(function(r) { return r.status !== 'pending'; });
    plants.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

    var html = '';

    // 搜索 + 选择按钮
    html += '<div class="cards-toolbar">';
    html += '<div class="search-bar">';
    html += '<input class="search-input" placeholder="搜索植物..." id="cards-search" oninput="Cards.filter()">';
    html += '</div>';
    if (plants.length > 0) {
      html += '<button class="cards-select-toggle' + (selectionMode ? ' active' : '') + '" id="cards-select-btn" onclick="Cards.toggleSelectionMode()" title="批量选择">';
      html += '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>';
      html += '</button>';
    }
    html += '</div>';

    // 标签筛选
    var tags = getPlantTags();
    if (tags.length > 0) {
      html += '<div class="filter-chips" id="cards-filters">';
      html += '<button class="filter-chip active" onclick="Cards.clearTagFilter(this)">全部</button>';
      tags.forEach(function(tag) {
        html += '<button class="filter-chip" onclick="Cards.setTagFilter(\'' + escapeAttr(tag) + '\', this)">' + escapeHtml(tag) + '</button>';
      });
      html += '</div>';
    }

    if (plants.length === 0) {
      html += '<div class="empty-state">' +
        '<div class="empty-state-icon">🌿</div>' +
        '<div class="empty-state-text">还没有植物档案<br>发现一棵有趣的植物就来记录吧</div>' +
        '<button class="btn btn-primary" onclick="Form.openNew(\'plant\')">记录第一棵植物</button>' +
        '</div>';
      return html;
    }

    // 卡片网格
    html += '<div class="card-grid" id="cards-grid">';
    html += renderCards(plants);
    html += '</div>';

    return html;
  }

  function renderCards(plants) {
    var html = '';
    plants.forEach(function(p) {
      var isSelected = selectionMode && selectedIds.indexOf(p.id) !== -1;
      var clickAction = selectionMode
        ? 'Cards.toggleSelect(\'' + p.id + '\')'
        : 'App.showDetail(\'' + p.id + '\')';
      html += '<div class="card' + (isSelected ? ' card-selected' : '') + '" onclick="' + clickAction + '">';

      if (selectionMode) {
        html += '<div class="card-checkbox' + (isSelected ? ' checked' : '') + '">' + (isSelected ? '✓' : '') + '</div>';
      }

      if (p.photoIds && p.photoIds[0]) {
        html += '<img class="card-image" data-photo-id="' + p.photoIds[0] + '" src="' + Storage.BLANK_IMG + '" loading="lazy">';
      } else {
        html += '<div class="card-image" style="display:flex;align-items:center;justify-content:center;font-size:48px;background:var(--green-light);">🌿</div>';
      }
      html += '<div class="card-body">';
      html += '<div class="card-title">' + escapeHtml(p.name || '未命名');
      if (p.status === 'observed') {
        html += ' <span class="badge-observed">已观察</span>';
      } else if (p.status === 'complete') {
        html += ' <span class="badge-collected">已收录</span>';
      }
      html += '</div>';
      if (p.family || p.genus) {
        html += '<div class="card-meta">' + escapeHtml([p.family, p.genus].filter(Boolean).join(' · ')) + '</div>';
      }
      if (p.features) {
        html += '<div class="card-excerpt">' + escapeHtml(p.features) + '</div>';
      }
      html += '</div></div>';
    });
    return html;
  }

  function getPlantTags() {
    var tagSet = {};
    Storage.getByType('plant').forEach(function(r) {
      if (r.tags && r.status !== 'pending') {
        r.tags.forEach(function(t) { tagSet[t] = true; });
      }
    });
    return Object.keys(tagSet);
  }

  function setTagFilter(tag, btn) {
    currentTag = tag;
    document.querySelectorAll('#cards-filters .filter-chip').forEach(function(c) {
      c.classList.remove('active');
    });
    btn.classList.add('active');
    applyFilter();
  }

  function clearTagFilter(btn) {
    currentTag = null;
    document.querySelectorAll('#cards-filters .filter-chip').forEach(function(c) {
      c.classList.remove('active');
    });
    btn.classList.add('active');
    applyFilter();
  }

  function filter() {
    applyFilter();
  }

  function applyFilter() {
    var search = (document.getElementById('cards-search') || {}).value || '';
    search = search.toLowerCase();
    var plants = Storage.getByType('plant').filter(function(r) { return r.status !== 'pending'; });

    if (currentTag) {
      plants = plants.filter(function(r) {
        return r.tags && r.tags.indexOf(currentTag) !== -1;
      });
    }

    if (search) {
      plants = plants.filter(function(r) {
        var text = (r.name || '') + (r.family || '') + (r.genus || '') + (r.features || '') + (r.tags || []).join(' ');
        return text.toLowerCase().indexOf(search) !== -1;
      });
    }

    plants.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

    var grid = document.getElementById('cards-grid');
    if (grid) {
      grid.innerHTML = plants.length > 0 ? renderCards(plants) :
        '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-text">没有匹配的植物</div></div>';
      Storage.loadPhotosInDom(grid);
    }
    // 选择模式下更新底部操作栏
    if (selectionMode) updateBatchBar();
  }

  // ===== 批量选择模式 =====

  function toggleSelectionMode() {
    selectionMode = !selectionMode;
    selectedIds = [];
    batchTags = [];
    applyFilter();
    updateBatchBar();
    var btn = document.getElementById('cards-select-btn');
    if (btn) btn.classList.toggle('active', selectionMode);
    // 隐藏/显示 FAB
    var fab = document.getElementById('btn-quick-photo');
    if (fab) fab.style.display = selectionMode ? 'none' : '';
  }

  function toggleSelect(id) {
    var index = selectedIds.indexOf(id);
    if (index === -1) {
      selectedIds.push(id);
    } else {
      selectedIds.splice(index, 1);
    }
    applyFilter();
    updateBatchBar();
  }

  function updateBatchBar() {
    var existing = document.getElementById('batch-tag-bar');
    if (!selectionMode || selectedIds.length === 0) {
      if (existing) existing.remove();
      return;
    }
    if (!existing) {
      existing = document.createElement('div');
      existing.id = 'batch-tag-bar';
      existing.className = 'batch-tag-bar';
      document.body.appendChild(existing);
    }

    var html = '<div class="batch-tag-header">';
    html += '<span class="batch-tag-count">已选 ' + selectedIds.length + ' 株</span>';
    html += '<button class="btn btn-sm" onclick="Cards.exitSelection()">取消</button>';
    html += '</div>';
    html += '<div class="batch-tag-input-area">';
    html += '<div class="tags-container" id="batch-tags-container">';
    batchTags.forEach(function(tag, i) {
      html += '<span class="tag">' + escapeHtml(tag) + '<button class="tag-remove" onclick="Cards.removeBatchTag(' + i + ')">×</button></span>';
    });
    html += '<input type="text" class="tag-input" id="batch-tag-input" placeholder="输入标签后按回车" onkeydown="Cards.handleBatchTagKey(event)">';
    html += '</div>';
    // 已有标签建议
    var allTags = getPlantTags();
    if (allTags.length > 0) {
      html += '<div class="batch-tag-suggestions">';
      allTags.forEach(function(tag) {
        if (batchTags.indexOf(tag) === -1) {
          html += '<button class="filter-chip" onclick="Cards.addBatchTag(\'' + escapeAttr(tag) + '\')">' + escapeHtml(tag) + '</button>';
        }
      });
      html += '</div>';
    }
    html += '</div>';
    html += '<button class="btn btn-primary btn-block" onclick="Cards.applyBatchTags()"' + (batchTags.length === 0 ? ' disabled' : '') + '>添加标签到 ' + selectedIds.length + ' 株植物</button>';

    existing.innerHTML = html;
  }

  function handleBatchTagKey(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      var input = document.getElementById('batch-tag-input');
      var tag = input.value.trim();
      if (tag && batchTags.indexOf(tag) === -1) {
        batchTags.push(tag);
        updateBatchBar();
      }
    }
  }

  function addBatchTag(tag) {
    if (batchTags.indexOf(tag) === -1) {
      batchTags.push(tag);
      updateBatchBar();
    }
  }

  function removeBatchTag(index) {
    batchTags.splice(index, 1);
    updateBatchBar();
  }

  function applyBatchTags() {
    if (batchTags.length === 0 || selectedIds.length === 0) return;
    var count = selectedIds.length;
    selectedIds.forEach(function(id) {
      var record = Storage.getById(id);
      if (record) {
        var tags = (record.tags || []).slice();
        batchTags.forEach(function(t) {
          if (tags.indexOf(t) === -1) tags.push(t);
        });
        Storage.update(id, { tags: tags });
      }
    });
    exitSelection();
    showBatchToast('已为 ' + count + ' 株植物添加标签');
  }

  function exitSelection() {
    selectionMode = false;
    selectedIds = [];
    batchTags = [];
    var bar = document.getElementById('batch-tag-bar');
    if (bar) bar.remove();
    var fab = document.getElementById('btn-quick-photo');
    if (fab) fab.style.display = '';
    App.refreshView();
  }

  function showBatchToast(msg) {
    var toast = document.createElement('div');
    toast.className = 'batch-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function() { toast.classList.add('show'); }, 10);
    setTimeout(function() {
      toast.classList.remove('show');
      setTimeout(function() { toast.remove(); }, 300);
    }, 2000);
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function escapeAttr(text) {
    return text.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  return {
    render: render,
    filter: filter,
    setTagFilter: setTagFilter,
    clearTagFilter: clearTagFilter,
    toggleSelectionMode: toggleSelectionMode,
    toggleSelect: toggleSelect,
    handleBatchTagKey: handleBatchTagKey,
    addBatchTag: addBatchTag,
    removeBatchTag: removeBatchTag,
    applyBatchTags: applyBatchTags,
    exitSelection: exitSelection
  };
})();

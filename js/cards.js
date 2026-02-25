/* ========== 植物档案卡片墙 ========== */
var Cards = (function() {

  function render() {
    var plants = Storage.getByType('plant').filter(function(r) { return r.status !== 'pending'; });
    plants.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

    var html = '';

    // 搜索
    html += '<div class="search-bar">';
    html += '<input class="search-input" placeholder="搜索植物..." id="cards-search" oninput="Cards.filter()">';
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
      html += '<div class="card" onclick="App.showDetail(\'' + p.id + '\')">';
      if (p.photoIds && p.photoIds[0]) {
        html += '<img class="card-image" data-photo-id="' + p.photoIds[0] + '" src="' + Storage.BLANK_IMG + '" loading="lazy">';
      } else {
        html += '<div class="card-image" style="display:flex;align-items:center;justify-content:center;font-size:48px;background:var(--green-light);">🌿</div>';
      }
      html += '<div class="card-body">';
      html += '<div class="card-title">' + escapeHtml(p.name || '未命名') + '</div>';
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

  var currentTag = null;

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
    clearTagFilter: clearTagFilter
  };
})();

/* ========== 主应用入口 ========== */
var App = (function() {
  var currentView = 'home';

  function init() {
    // 绑定底部导航
    document.querySelectorAll('.nav-item').forEach(function(btn) {
      btn.addEventListener('click', function() {
        switchView(btn.getAttribute('data-view'));
      });
    });

    // 快速拍照按钮
    document.getElementById('btn-quick-photo').addEventListener('click', function() {
      Inbox.openQuickPhoto();
    });

    // 同步按钮
    document.getElementById('btn-sync').addEventListener('click', function() {
      openSyncModal();
    });

    // 模态框关闭
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', function(e) {
      if (e.target === this) closeModal();
    });

    // 迁移旧版照片数据，完成后渲染首页
    Storage.migratePhotos().then(function() {
      renderView('home');
    });
  }

  function switchView(view) {
    currentView = view;
    // 更新导航高亮
    document.querySelectorAll('.nav-item').forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-view') === view);
    });
    renderView(view);
    // 回到顶部
    window.scrollTo(0, 0);
  }

  function renderView(view) {
    var content = document.getElementById('main-content');
    switch (view) {
      case 'home':
        content.innerHTML = renderHome();
        break;
      case 'timeline':
        content.innerHTML = Timeline.render();
        break;
      case 'plants':
        content.innerHTML = Cards.render();
        break;
      case 'knowledge':
        content.innerHTML = Knowledge.render();
        break;
      case 'graph':
        content.innerHTML = Graph.render();
        setTimeout(function() { Graph.initVisual(); }, 50);
        break;
    }
    // 异步加载照片
    Storage.loadPhotosInDom();
  }

  function renderHome() {
    var stats = Storage.getStats();
    var html = '';

    // 统计卡片
    html += '<div class="home-stats">';
    html += '<div class="stat-card"><div class="stat-number">' + stats.totalPlants + '</div><div class="stat-label">种植物</div></div>';
    html += '<div class="stat-card blue"><div class="stat-number">' + stats.totalKnowledge + '</div><div class="stat-label">条知识</div></div>';
    html += '<div class="stat-card orange"><div class="stat-number">' + stats.totalEcology + '</div><div class="stat-label">个关联</div></div>';
    html += '</div>';

    // 待处理队列
    html += Inbox.renderPendingList();

    // 快速新建
    html += '<div style="display:flex; gap:8px; margin-bottom:20px;">';
    html += '<button class="btn btn-primary btn-sm" style="flex:1;" onclick="Form.openNew(\'plant\')">🌿 记录植物</button>';
    html += '<button class="btn btn-blue btn-sm" style="flex:1;" onclick="Form.openNew(\'knowledge\')">📖 记录知识</button>';
    html += '<button class="btn btn-orange btn-sm" style="flex:1;" onclick="Form.openNew(\'ecology\')">🔗 记录关联</button>';
    html += '</div>';

    // 最近记录
    var recent = Storage.getCompleted();
    recent.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    recent = recent.slice(0, 5);

    if (recent.length > 0) {
      html += '<div class="section-title">最近记录</div>';
      recent.forEach(function(r) {
        var badgeClass = r.type === 'plant' ? 'badge-plant' : r.type === 'knowledge' ? 'badge-knowledge' : 'badge-ecology';
        var typeLabel = r.type === 'plant' ? '🌿' : r.type === 'knowledge' ? '📖' : '🔗';
        var name = r.name || r.title || '未命名';

        html += '<div class="knowledge-item" onclick="App.showDetail(\'' + r.id + '\')">';
        if (r.photoIds && r.photoIds[0]) {
          html += '<img style="width:44px; height:44px; border-radius:8px; object-fit:cover; flex-shrink:0;" data-photo-id="' + r.photoIds[0] + '" src="' + Storage.BLANK_IMG + '">';
        } else {
          html += '<div class="knowledge-icon ' + (r.type === 'knowledge' ? 'blue' : r.type === 'ecology' ? 'orange' : '') + '" style="background:var(--green-light);">' + typeLabel + '</div>';
        }
        html += '<div style="flex:1; min-width:0;">';
        html += '<div style="font-size:14px; font-weight:500;">' + escapeHtml(name) + '</div>';
        html += '<div style="font-size:12px; color:var(--gray-500);">' + formatDate(r.createdAt) + '</div>';
        html += '</div>';
        html += '<span class="card-type-badge ' + badgeClass + '" style="flex-shrink:0;">' + typeLabel + '</span>';
        html += '</div>';
      });
    } else {
      html += '<div class="empty-state">';
      html += '<div class="empty-state-icon">🌱</div>';
      html += '<div class="empty-state-text">欢迎来到植物笔记！<br>点击上方按钮或右下角的相机开始记录</div>';
      html += '</div>';
    }

    return html;
  }

  // 详情页
  function showDetail(id) {
    var record = Storage.getById(id);
    if (!record) return;

    var html = '';

    // 照片轮播
    if (record.photoIds && record.photoIds.length > 0) {
      html += '<div class="detail-photos">';
      record.photoIds.forEach(function(photoId) {
        html += '<img class="detail-photo" data-photo-id="' + photoId + '" src="' + Storage.BLANK_IMG + '">';
      });
      html += '</div>';
    }

    // 类型标记
    var badgeClass = record.type === 'plant' ? 'badge-plant' : record.type === 'knowledge' ? 'badge-knowledge' : 'badge-ecology';
    var typeLabel = record.type === 'plant' ? '🌿 植物档案' : record.type === 'knowledge' ? '📖 植物学知识' : '🔗 生态关联';
    html += '<span class="card-type-badge ' + badgeClass + '" style="margin-bottom:12px;">' + typeLabel + '</span>';

    // 根据类型渲染字段
    if (record.type === 'plant') {
      html += renderField('中文名', record.name);
      html += renderField('学名', record.latinName);
      html += renderField('科', record.family);
      html += renderField('属', record.genus);
      html += renderField('关键特征', record.features);
      html += renderField('发现日期', record.date);
      html += renderField('发现地点', record.location);
      html += renderField('是什么吸引了我', record.attraction);
      html += renderField('学习笔记', record.notes);
      html += renderField('我的思考', record.thoughts);
    } else if (record.type === 'knowledge') {
      html += renderField('主题', record.title);
      html += renderField('知识分类', record.category);
      html += renderField('内容', record.content);
      html += renderField('引发思考的来源', record.source);
      html += renderField('日期', record.date);
    } else {
      html += renderField('主题', record.title);
      html += renderField('关联对象', record.relatedObjects);
      html += renderField('内容', record.content);
      html += renderField('我的观察', record.observation);
      html += renderField('日期', record.date);
    }

    // 标签
    if (record.tags && record.tags.length > 0) {
      html += '<div class="detail-tags">';
      record.tags.forEach(function(tag) {
        html += '<span class="tag" onclick="App.filterByTag(\'' + escapeAttr(tag) + '\')">' + escapeHtml(tag) + '</span>';
      });
      html += '</div>';
    }

    // 关联记录
    if (record.links && record.links.length > 0) {
      html += '<div class="detail-links">';
      html += '<div style="font-size:14px; font-weight:600; margin-bottom:8px;">相关记录</div>';
      record.links.forEach(function(linkId) {
        var linked = Storage.getById(linkId);
        if (linked) {
          var linkIcon = linked.type === 'plant' ? '🌿' : linked.type === 'knowledge' ? '📖' : '🔗';
          var linkName = linked.name || linked.title || '未命名';
          html += '<div class="detail-link-item" onclick="App.showDetail(\'' + linkId + '\')">';
          html += linkIcon + ' ' + escapeHtml(linkName);
          html += '</div>';
        }
      });
      html += '</div>';
    }

    // 操作按钮
    html += '<div class="detail-actions">';
    html += '<button class="btn btn-primary btn-block" onclick="Form.openEdit(\'' + record.id + '\')">编辑</button>';
    html += '<button class="btn btn-danger" onclick="App.deleteFromDetail(\'' + record.id + '\')">删除</button>';
    html += '</div>';

    var title = record.name || record.title || '详情';
    document.getElementById('modal-body').innerHTML = html;
    openModal(title);

    // 异步加载详情中的照片
    Storage.loadPhotosInDom(document.getElementById('modal-body'));
  }

  function renderField(label, value) {
    if (!value) return '';
    return '<div class="detail-field">' +
      '<div class="detail-field-label">' + label + '</div>' +
      '<div class="detail-field-value">' + escapeHtml(value) + '</div>' +
      '</div>';
  }

  function deleteFromDetail(id) {
    if (confirm('确定要删除这条记录吗？')) {
      Storage.remove(id);
      closeModal();
      refreshView();
    }
  }

  function filterByTag(tag) {
    closeModal();
    switchView('timeline');
    setTimeout(function() {
      var searchInput = document.getElementById('timeline-search');
      if (searchInput) {
        searchInput.value = tag;
        Timeline.filter();
      }
    }, 100);
  }

  // 同步模态
  function openSyncModal() {
    var html = '<div class="sync-btns">';

    html += '<button class="sync-btn" onclick="App.doExport()">';
    html += '<div class="sync-btn-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>';
    html += '<div><div class="sync-btn-title">导出到其他设备</div>';
    html += '<div class="sync-btn-desc">下载 JSON 文件，通过 AirDrop 发送</div></div>';
    html += '</button>';

    html += '<label class="sync-btn" style="cursor:pointer;">';
    html += '<input type="file" accept=".json" style="display:none" onchange="App.doImport(this.files)">';
    html += '<div class="sync-btn-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>';
    html += '<div><div class="sync-btn-title">从其他设备导入</div>';
    html += '<div class="sync-btn-desc">选择收到的 JSON 文件，自动合并</div></div>';
    html += '</label>';

    html += '</div>';
    html += '<div class="sync-result" id="sync-result"></div>';

    document.getElementById('modal-body').innerHTML = html;
    openModal('数据同步');
  }

  function doExport() {
    Storage.exportData().then(function() {
      var result = document.getElementById('sync-result');
      result.style.display = 'block';
      result.textContent = '导出成功！请通过 AirDrop 发送给其他设备。';
    });
  }

  function doImport(files) {
    if (!files || !files[0]) return;
    var reader = new FileReader();
    reader.onload = function(e) {
      Storage.importData(e.target.result).then(function(result) {
        var el = document.getElementById('sync-result');
        el.style.display = 'block';
        el.textContent = result.message;
        if (result.success) {
          el.style.background = 'var(--green-light)';
          el.style.color = 'var(--green)';
          refreshView();
        } else {
          el.style.background = '#ffebee';
          el.style.color = '#c62828';
        }
      });
    };
    reader.readAsText(files[0]);
  }

  // 模态框操作
  function openModal(title) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-overlay').classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.remove('show');
    document.body.style.overflow = '';
  }

  function refreshView() {
    renderView(currentView);
  }

  function formatDate(isoString) {
    var d = new Date(isoString);
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function escapeAttr(text) {
    return text.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  // 初始化
  document.addEventListener('DOMContentLoaded', init);

  return {
    switchView: switchView,
    openModal: openModal,
    closeModal: closeModal,
    refreshView: refreshView,
    showDetail: showDetail,
    deleteFromDetail: deleteFromDetail,
    filterByTag: filterByTag,
    doExport: doExport,
    doImport: doImport
  };
})();

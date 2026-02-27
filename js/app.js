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
    // 引文
    html += '<div class="home-quote">Little by little, you come to know.</div>';

    html += '<div class="home-stats">';
    html += '<div class="stat-card"><div class="stat-number">' + stats.totalPlants + '</div><div class="stat-label">种植物</div></div>';
    html += '<div class="stat-card blue"><div class="stat-number">' + stats.totalKnowledge + '</div><div class="stat-label">条知识</div></div>';
    html += '<div class="stat-card orange"><div class="stat-number">' + stats.totalEcology + '</div><div class="stat-label">个发现</div></div>';
    html += '</div>';

    // 待处理队列
    html += Inbox.renderPendingList();

    // 待补充（已观察未收录）
    html += renderObservedList();

    // 快速新建
    html += '<div style="display:flex; gap:8px; margin-bottom:20px;">';
    html += '<button class="btn btn-primary btn-sm" style="flex:1;" onclick="Form.openNew(\'plant\')">🌿 记录植物</button>';
    html += '<button class="btn btn-blue btn-sm" style="flex:1;" onclick="Form.openNew(\'knowledge\')">📖 记录知识</button>';
    html += '<button class="btn btn-orange btn-sm" style="flex:1;" onclick="Form.openNew(\'ecology\')">🔍 记录发现</button>';
    html += '</div>';

    // 最近记录
    var recent = Storage.getCompleted();
    recent.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    recent = recent.slice(0, 5);

    if (recent.length > 0) {
      html += '<div class="section-title">最近记录</div>';
      recent.forEach(function(r) {
        var badgeClass = r.type === 'plant' ? 'badge-plant' : r.type === 'knowledge' ? 'badge-knowledge' : 'badge-ecology';
        var typeLabel = r.type === 'plant' ? '🌿' : r.type === 'knowledge' ? '📖' : '🔍';
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
      html += '<div class="empty-state-text">欢迎来到野径手记！<br>点击上方按钮或右下角的相机开始记录</div>';
      html += '</div>';
    }

    return html;
  }

  function renderObservedList() {
    var observed = Storage.getObserved();
    if (observed.length === 0) return '';

    observed.sort(function(a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); });

    var html = '<div class="section-title">待补充 <span style="font-size:12px; color:var(--gray-400); font-weight:400;">' + observed.length + ' 条已观察</span></div>';
    observed.forEach(function(item) {
      html += '<div class="knowledge-item observed-item" onclick="Form.openEdit(\'' + item.id + '\')">';
      if (item.photoIds && item.photoIds[0]) {
        html += '<img style="width:44px; height:44px; border-radius:8px; object-fit:cover; flex-shrink:0;" data-photo-id="' + item.photoIds[0] + '" src="' + Storage.BLANK_IMG + '">';
      } else {
        html += '<div class="knowledge-icon" style="background:var(--green-light);">🌿</div>';
      }
      html += '<div style="flex:1; min-width:0;">';
      html += '<div style="font-size:14px; font-weight:500;">' + escapeHtml(item.name || '未命名') + '</div>';
      html += '<div style="font-size:12px; color:var(--gray-400);">' + formatDate(item.updatedAt) + '</div>';
      html += '</div>';
      html += '<span class="badge-observed" style="flex-shrink:0;">已观察</span>';
      html += '</div>';
    });
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
    var typeLabel = record.type === 'plant' ? '🌿 植物档案' : record.type === 'knowledge' ? '📖 植物学知识' : '🔍 野外发现';
    html += '<span class="card-type-badge ' + badgeClass + '" style="margin-bottom:12px;">' + typeLabel + '</span>';
    if (record.type === 'plant' && record.status === 'observed') {
      html += ' <span class="badge-observed" style="margin-bottom:12px;">已观察</span>';
    } else if (record.type === 'plant' && record.status === 'complete') {
      html += ' <span class="badge-collected" style="margin-bottom:12px;">已收录</span>';
    }

    // 根据类型渲染字段
    if (record.type === 'plant') {
      html += renderField('中文名', record.name);

      // 观察记录区（分组展示）
      var obsGroups = [
        { title: '整体', icon: '🌳', fields: [
          { key: 'growthForm', label: '形态' }
        ]},
        { title: '叶片', icon: '🍃', fields: [
          { key: 'leafArrangement', label: '排列' },
          { key: 'leafType', label: '结构' },
          { key: 'leafEdge', label: '边缘' },
          { key: 'leafVein', label: '叶脉' },
          { key: 'leafTexture', label: '手感' }
        ]},
        { title: '花朵', icon: '🌸', fields: [
          { key: 'petalCount', label: '花瓣' },
          { key: 'flowerSymmetry', label: '对称' },
          { key: 'petalConnection', label: '连接' },
          { key: 'flowerCluster', label: '花序' }
        ]},
        { title: '果实', icon: '🍎', fields: [
          { key: 'fruitTexture', label: '质感' },
          { key: 'fruitDetail', label: '类型' }
        ]}
      ];
      // 旧版字段兼容
      var oldFields = [
        { key: 'lifeForm', label: '生活型' },
        { key: 'leafStructure', label: '叶结构' },
        { key: 'flowerForm', label: '花形态' },
        { key: 'fruitType', label: '果实' },
        { key: 'intuitionCategory', label: '直觉分类' }
      ];
      var hasNewObs = obsGroups.some(function(g) {
        return g.fields.some(function(f) { return record[f.key]; });
      });
      var hasOldObs = oldFields.some(function(f) { return record[f.key]; });
      if (hasNewObs || hasOldObs) {
        html += '<div class="detail-obs-section">';
        html += '<div class="detail-obs-title">我的观察</div>';
        if (hasNewObs) {
          obsGroups.forEach(function(g) {
            var groupHasData = g.fields.some(function(f) { return record[f.key]; });
            if (!groupHasData) return;
            html += '<div style="margin-bottom:8px;">';
            html += '<div style="font-size:12px;color:var(--gray-400);margin-bottom:4px;">' + g.icon + ' ' + g.title + '</div>';
            html += '<div class="detail-obs-chips">';
            g.fields.forEach(function(f) {
              if (record[f.key]) {
                html += '<div class="detail-obs-item">';
                html += '<span class="detail-obs-label">' + f.label + '</span>';
                html += '<span class="detail-obs-value">' + escapeHtml(record[f.key]) + '</span>';
                html += '</div>';
              }
            });
            html += '</div></div>';
          });
        }
        // 显示旧版字段（如果有且新版对应字段为空）
        if (hasOldObs && !hasNewObs) {
          html += '<div class="detail-obs-chips">';
          oldFields.forEach(function(f) {
            if (record[f.key]) {
              html += '<div class="detail-obs-item">';
              html += '<span class="detail-obs-label">' + f.label + '</span>';
              html += '<span class="detail-obs-value">' + escapeHtml(record[f.key]) + '</span>';
              html += '</div>';
            }
          });
          html += '</div>';
        }
        html += '</div>';
      }

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
      html += renderField('涉及对象', record.relatedObjects);
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
          var linkIcon = linked.type === 'plant' ? '🌿' : linked.type === 'knowledge' ? '📖' : '🔍';
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
    if (record.type === 'plant' && record.status === 'observed') {
      html += '<button class="btn btn-primary btn-block" onclick="Form.openEdit(\'' + record.id + '\')">补充专业信息</button>';
    } else {
      html += '<button class="btn btn-primary btn-block" onclick="Form.openEdit(\'' + record.id + '\')">编辑</button>';
    }
    // AI 聊天入口
    if (record.type === 'plant' && record.photoIds && record.photoIds.length > 0) {
      html += '<button class="btn btn-block" style="margin-top:8px; border-color:var(--orange); color:var(--orange);" onclick="Chat.openChat(\'' + record.id + '\')">🤖 和AI聊聊</button>';
    }
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
    var html = '';

    // ===== 云端同步区 =====
    html += '<div class="sync-section">';
    html += '<div class="sync-section-title">☁️ 云端同步</div>';
    if (Sync.hasToken()) {
      html += '<div class="sync-token-row">';
      html += '<span class="sync-token-masked">' + Sync.maskToken(Sync.getToken()) + '</span>';
      html += '<a href="javascript:void(0)" class="sync-clear-link" onclick="App.clearSyncToken()">清除</a>';
      html += '</div>';
      html += '<button class="btn btn-primary btn-block" style="margin-top:10px;" onclick="App.syncToCloud()">同步</button>';
      var lastSync = Sync.formatLastSync();
      if (lastSync) {
        html += '<div class="sync-last-time">上次同步：' + lastSync + '</div>';
      }
    } else {
      html += '<input type="text" class="sync-token-input" id="sync-token-input" placeholder="粘贴 GitHub Personal Access Token (gist scope)">';
      html += '<button class="btn btn-primary btn-block" style="margin-top:8px;" onclick="App.saveSyncToken()">验证并保存</button>';
      html += '<div style="font-size:12px; color:var(--gray-400); margin-top:6px;">需要一个有 gist 权限的 Token，两台设备用同一个</div>';
    }
    html += '<div class="sync-result" id="sync-cloud-result"></div>';
    html += '</div>';

    // ===== 分隔线 =====
    html += '<div class="sync-divider"></div>';

    // ===== 文件导入导出 =====
    html += '<div class="sync-section">';
    html += '<div class="sync-section-title">📁 文件传输</div>';
    html += '<div class="sync-btns">';

    html += '<button class="sync-btn" onclick="App.doExport()">';
    html += '<div class="sync-btn-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>';
    html += '<div><div class="sync-btn-title">导出</div>';
    html += '<div class="sync-btn-desc">下载 JSON，AirDrop 发送</div></div>';
    html += '</button>';

    html += '<label class="sync-btn" style="cursor:pointer;">';
    html += '<input type="file" accept=".json" style="display:none" onchange="App.doImport(this.files)">';
    html += '<div class="sync-btn-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>';
    html += '<div><div class="sync-btn-title">导入</div>';
    html += '<div class="sync-btn-desc">选择 JSON 文件合并</div></div>';
    html += '</label>';

    html += '</div>';
    html += '<div class="sync-result" id="sync-result"></div>';
    html += '</div>';

    // ===== API 密钥区 =====
    html += '<div class="sync-divider"></div>';
    html += '<div class="sync-section">';
    html += '<div class="sync-section-title">🔑 AI 对话密钥</div>';
    var openaiKey = localStorage.getItem('plants_openai_key') || '';
    if (openaiKey) {
      html += '<div class="sync-token-row">';
      html += '<span class="sync-token-masked">sk-****' + openaiKey.slice(-4) + '</span>';
      html += '<a href="javascript:void(0)" class="sync-clear-link" onclick="App.clearOpenAIKey()">清除</a>';
      html += '</div>';
    } else {
      html += '<input type="text" class="sync-token-input" id="openai-key-input" placeholder="粘贴 OpenAI API Key (sk-...)">';
      html += '<button class="btn btn-block" style="margin-top:8px;" onclick="App.saveOpenAIKey()">保存</button>';
    }
    html += '</div>';

    document.getElementById('modal-body').innerHTML = html;
    openModal('设置');
  }

  function syncToCloud() {
    var resultEl = document.getElementById('sync-cloud-result');
    resultEl.style.display = 'block';
    resultEl.style.background = 'var(--gray-100)';
    resultEl.style.color = 'var(--gray-600)';
    resultEl.textContent = '正在同步...';

    Sync.doSync(function(msg) {
      resultEl.textContent = msg;
    }).then(function(result) {
      resultEl.style.background = 'var(--green-light)';
      resultEl.style.color = 'var(--green)';
      resultEl.textContent = result.message;
      refreshView();
    }).catch(function(err) {
      resultEl.style.background = '#ffebee';
      resultEl.style.color = '#c62828';
      resultEl.textContent = err.message || '同步失败';
    });
  }

  function saveSyncToken() {
    var input = document.getElementById('sync-token-input');
    var token = (input && input.value || '').trim();
    if (!token) return;

    var resultEl = document.getElementById('sync-cloud-result');
    resultEl.style.display = 'block';
    resultEl.style.background = 'var(--gray-100)';
    resultEl.style.color = 'var(--gray-600)';
    resultEl.textContent = '正在验证...';

    Sync.validateToken(token).then(function(res) {
      if (res.valid) {
        Sync.setToken(token);
        resultEl.style.background = 'var(--green-light)';
        resultEl.style.color = 'var(--green)';
        resultEl.textContent = '验证成功！用户：' + res.username;
        setTimeout(function() { openSyncModal(); }, 1000);
      } else {
        resultEl.style.background = '#ffebee';
        resultEl.style.color = '#c62828';
        resultEl.textContent = 'Token 无效，请检查是否有 gist 权限';
      }
    });
  }

  function clearSyncToken() {
    Sync.clearToken();
    openSyncModal();
  }

  function saveOpenAIKey() {
    var input = document.getElementById('openai-key-input');
    var key = (input && input.value || '').trim();
    if (!key) return;
    localStorage.setItem('plants_openai_key', key);
    openSyncModal();
  }

  function clearOpenAIKey() {
    localStorage.removeItem('plants_openai_key');
    openSyncModal();
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
    doImport: doImport,
    openSyncModal: openSyncModal,
    syncToCloud: syncToCloud,
    saveSyncToken: saveSyncToken,
    clearSyncToken: clearSyncToken,
    saveOpenAIKey: saveOpenAIKey,
    clearOpenAIKey: clearOpenAIKey
  };
})();

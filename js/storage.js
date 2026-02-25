/* ========== 数据存储层 ========== */
var Storage = (function() {
  var STORAGE_KEY = 'plants_data';
  var BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  // 生成唯一ID
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  function generatePhotoId() {
    return 'photo_' + generateId();
  }

  // 获取所有记录
  function getAll() {
    try {
      var data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('读取数据失败:', e);
      return [];
    }
  }

  // 保存所有记录
  function saveAll(records) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
      console.error('保存数据失败:', e);
      alert('保存失败，可能是存储空间不足。请导出数据备份后清理一些旧照片。');
    }
  }

  // 获取单条记录
  function getById(id) {
    var records = getAll();
    return records.find(function(r) { return r.id === id; }) || null;
  }

  // 创建新记录
  function create(record) {
    var records = getAll();
    var now = new Date().toISOString();
    record.id = generateId();
    record.createdAt = now;
    record.updatedAt = now;
    record.tags = record.tags || [];
    record.links = record.links || [];
    record.photoIds = record.photoIds || [];
    records.push(record);
    saveAll(records);
    return record;
  }

  // 更新记录
  function update(id, changes) {
    var records = getAll();
    var index = records.findIndex(function(r) { return r.id === id; });
    if (index === -1) return null;
    Object.assign(records[index], changes);
    records[index].updatedAt = new Date().toISOString();
    saveAll(records);
    return records[index];
  }

  // 删除记录
  function remove(id) {
    var records = getAll();
    records = records.filter(function(r) { return r.id !== id; });
    records.forEach(function(r) {
      if (r.links) {
        r.links = r.links.filter(function(linkId) { return linkId !== id; });
      }
    });
    saveAll(records);
  }

  // 按类型获取记录
  function getByType(type) {
    return getAll().filter(function(r) { return r.type === type; });
  }

  // 获取待处理记录
  function getPending() {
    return getAll().filter(function(r) { return r.status === 'pending'; });
  }

  // 获取正式记录（非待处理）
  function getCompleted() {
    return getAll().filter(function(r) { return r.status !== 'pending'; });
  }

  // 获取已观察但未收录的记录
  function getObserved() {
    return getAll().filter(function(r) { return r.status === 'observed'; });
  }

  // 按标签筛选
  function getByTag(tag) {
    return getAll().filter(function(r) {
      return r.tags && r.tags.indexOf(tag) !== -1;
    });
  }

  // 获取所有标签
  function getAllTags() {
    var tags = {};
    getAll().forEach(function(r) {
      if (r.tags) {
        r.tags.forEach(function(t) {
          tags[t] = (tags[t] || 0) + 1;
        });
      }
    });
    return tags;
  }

  // 获取统计数据
  function getStats() {
    var records = getCompleted();
    var plants = records.filter(function(r) { return r.type === 'plant'; });
    var families = {};
    plants.forEach(function(p) {
      if (p.family) families[p.family] = true;
    });
    return {
      totalPlants: plants.length,
      totalKnowledge: records.filter(function(r) { return r.type === 'knowledge'; }).length,
      totalEcology: records.filter(function(r) { return r.type === 'ecology'; }).length,
      totalFamilies: Object.keys(families).length,
      pendingCount: getPending().length,
      observedCount: getObserved().length
    };
  }

  // 迁移旧版照片：从 localStorage 中的 base64 迁移到 IndexedDB
  function migratePhotos() {
    var records = getAll();
    var hasLegacy = false;
    var photoMap = {};

    records.forEach(function(record) {
      if (record.photos && record.photos.length > 0 &&
          typeof record.photos[0] === 'string' &&
          record.photos[0].indexOf('data:') === 0) {
        hasLegacy = true;
        var ids = [];
        record.photos.forEach(function(photoData) {
          var pid = generatePhotoId();
          photoMap[pid] = photoData;
          ids.push(pid);
        });
        record.photoIds = ids;
        delete record.photos;
      }
    });

    if (hasLegacy) {
      saveAll(records);
      return PhotoDB.saveMultiple(photoMap);
    }
    return Promise.resolve();
  }

  // 在 DOM 中加载照片（异步从 IndexedDB 读取）
  function loadPhotosInDom(container) {
    var root = container || document;
    var imgs = root.querySelectorAll('img[data-photo-id]');
    if (imgs.length === 0) return;
    imgs.forEach(function(img) {
      var photoId = img.getAttribute('data-photo-id');
      if (photoId) {
        PhotoDB.get(photoId).then(function(data) {
          if (data) img.src = data;
        });
      }
    });
  }

  // 导出数据（异步，从 IndexedDB 取照片内嵌到 JSON 中）
  function exportData() {
    var records = getAll();
    return PhotoDB.getAll().then(function(allPhotos) {
      var exportRecords = records.map(function(r) {
        var copy = Object.assign({}, r);
        if (copy.photoIds && copy.photoIds.length > 0) {
          copy.photos = copy.photoIds.map(function(pid) {
            return allPhotos[pid] || '';
          }).filter(Boolean);
        }
        return copy;
      });

      var data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        records: exportRecords
      };
      var json = JSON.stringify(data, null, 2);
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'plants-sync.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // 导入数据（异步，将照片存入 IndexedDB）
  function importData(jsonString) {
    try {
      var imported = JSON.parse(jsonString);
      if (!imported.records || !Array.isArray(imported.records)) {
        return Promise.resolve({ success: false, message: '文件格式不正确' });
      }

      var existing = getAll();
      var existingMap = {};
      existing.forEach(function(r) { existingMap[r.id] = r; });

      var added = 0;
      var updated = 0;
      var skipped = 0;
      var photoMap = {};

      imported.records.forEach(function(incoming) {
        // 提取内嵌的照片数据
        if (incoming.photos && incoming.photos.length > 0 &&
            typeof incoming.photos[0] === 'string' &&
            incoming.photos[0].indexOf('data:') === 0) {
          var ids = [];
          incoming.photos.forEach(function(photoData, i) {
            var pid = (incoming.photoIds && incoming.photoIds[i]) ? incoming.photoIds[i] : generatePhotoId();
            photoMap[pid] = photoData;
            ids.push(pid);
          });
          incoming.photoIds = ids;
          delete incoming.photos;
        }

        var local = existingMap[incoming.id];
        if (!local) {
          existing.push(incoming);
          added++;
        } else {
          if (new Date(incoming.updatedAt) > new Date(local.updatedAt)) {
            Object.assign(local, incoming);
            updated++;
          } else {
            skipped++;
          }
        }
      });

      saveAll(existing);

      var photoKeys = Object.keys(photoMap);
      var savePromise = photoKeys.length > 0 ? PhotoDB.saveMultiple(photoMap) : Promise.resolve();

      return savePromise.then(function() {
        return {
          success: true,
          message: '导入完成：新增 ' + added + ' 条，更新 ' + updated + ' 条' + (skipped > 0 ? '，跳过 ' + skipped + ' 条（本地更新）' : '')
        };
      });
    } catch (e) {
      return Promise.resolve({ success: false, message: '导入失败：文件格式错误' });
    }
  }

  // 压缩图片（返回 Promise）
  function compressImage(file, maxWidth, quality) {
    maxWidth = maxWidth || 800;
    quality = quality || 0.7;
    return new Promise(function(resolve) {
      var reader = new FileReader();
      reader.onload = function(e) {
        var img = new Image();
        img.onload = function() {
          var canvas = document.createElement('canvas');
          var ratio = Math.min(maxWidth / img.width, 1);
          canvas.width = img.width * ratio;
          canvas.height = img.height * ratio;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // 获取分类树（用于知识图谱）
  function getTaxonomyTree() {
    var plants = getByType('plant').filter(function(r) { return r.status !== 'pending'; });
    var tree = {};
    plants.forEach(function(p) {
      var family = p.family || '未分类';
      var genus = p.genus || '未分类';
      if (!tree[family]) tree[family] = {};
      if (!tree[family][genus]) tree[family][genus] = [];
      tree[family][genus].push(p);
    });
    return tree;
  }

  // 获取知识分类
  function getKnowledgeCategories() {
    var knowledge = getByType('knowledge').filter(function(r) { return r.status !== 'pending'; });
    var categories = {};
    knowledge.forEach(function(k) {
      var cat = k.category || '未分类';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(k);
    });
    return categories;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    remove: remove,
    getByType: getByType,
    getPending: getPending,
    getCompleted: getCompleted,
    getObserved: getObserved,
    getByTag: getByTag,
    getAllTags: getAllTags,
    getStats: getStats,
    exportData: exportData,
    importData: importData,
    compressImage: compressImage,
    getTaxonomyTree: getTaxonomyTree,
    getKnowledgeCategories: getKnowledgeCategories,
    migratePhotos: migratePhotos,
    loadPhotosInDom: loadPhotosInDom,
    BLANK_IMG: BLANK_IMG
  };
})();

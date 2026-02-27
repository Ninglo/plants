var Sync = (function() {
  'use strict';

  var TOKEN_KEY = 'plants_sync_token';
  var GIST_ID_KEY = 'plants_sync_gist_id';
  var LAST_SYNC_KEY = 'plants_sync_last';
  var GIST_DESC = 'plants-sync-data';
  var GIST_FILE = 'plants-sync-data.json';
  var API_BASE = 'https://api.github.com';

  function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(GIST_ID_KEY);
  }
  function getGistId() { return localStorage.getItem(GIST_ID_KEY) || ''; }
  function setGistId(id) { localStorage.setItem(GIST_ID_KEY, id); }
  function getLastSync() { return localStorage.getItem(LAST_SYNC_KEY) || ''; }
  function setLastSync() { localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString()); }
  function hasToken() { return !!getToken(); }

  function headers() {
    return {
      'Authorization': 'Bearer ' + getToken(),
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    };
  }

  // 验证 token，返回 {valid, username}
  function validateToken(token) {
    return fetch(API_BASE + '/user', {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json'
      }
    }).then(function(res) {
      if (!res.ok) return { valid: false, username: '' };
      return res.json().then(function(data) {
        return { valid: true, username: data.login || '' };
      });
    }).catch(function() {
      return { valid: false, username: '' };
    });
  }

  // 搜索已有的同步 gist
  function findExistingGist() {
    return fetch(API_BASE + '/gists?per_page=100', { headers: headers() })
      .then(function(res) {
        if (res.status === 401) throw new Error('Token 无效或已过期，请重新设置');
        if (res.status === 403) throw new Error('Token 没有 gist 权限，请重新生成（勾选 gist scope）');
        if (!res.ok) throw new Error('查询 Gist 失败 (' + res.status + ')');
        return res.json();
      })
      .then(function(gists) {
        if (!gists) return null;
        for (var i = 0; i < gists.length; i++) {
          if (gists[i].description === GIST_DESC && gists[i].files[GIST_FILE]) {
            return gists[i].id;
          }
        }
        return null;
      })
      .catch(function(err) {
        if (err.message && err.message.indexOf('Token') >= 0) throw err;
        throw new Error('无法连接 GitHub：' + (err.message || '网络错误'));
      });
  }

  // 创建新 gist
  function createGist(content) {
    var files = {};
    files[GIST_FILE] = { content: content };
    return fetch(API_BASE + '/gists', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ description: GIST_DESC, public: false, files: files })
    }).then(function(res) {
      if (res.status === 401) throw new Error('Token 无效或已过期，请重新设置');
      if (res.status === 403) throw new Error('Token 没有 gist 权限，请重新生成（勾选 gist scope）');
      if (!res.ok) throw new Error('创建 Gist 失败 (' + res.status + ')');
      return res.json();
    }).then(function(data) {
      setGistId(data.id);
      return data.id;
    });
  }

  // 读取 gist 内容
  function readGist(gistId) {
    return fetch(API_BASE + '/gists/' + gistId, { headers: headers() })
      .then(function(res) {
        if (res.status === 404) {
          // gist 被删除了，清除本地 ID
          localStorage.removeItem(GIST_ID_KEY);
          return null;
        }
        if (!res.ok) throw new Error('读取 Gist 失败 (' + res.status + ')');
        return res.json();
      })
      .then(function(data) {
        if (!data || !data.files || !data.files[GIST_FILE]) return null;
        return data.files[GIST_FILE].content;
      });
  }

  // 更新 gist
  function updateGist(gistId, content) {
    var files = {};
    files[GIST_FILE] = { content: content };
    return fetch(API_BASE + '/gists/' + gistId, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ files: files })
    }).then(function(res) {
      if (!res.ok) throw new Error('更新 Gist 失败 (' + res.status + ')');
      return res.json();
    });
  }

  // 主同步流程
  function doSync(onProgress) {
    if (!getToken()) return Promise.reject(new Error('请先设置 GitHub Token'));

    onProgress && onProgress('正在准备本地数据...');

    return Storage.getExportPayload().then(function(localJson) {
      var gistId = getGistId();

      // 没有 gist ID，尝试搜索或创建
      if (!gistId) {
        onProgress && onProgress('正在查找云端数据...');
        return findExistingGist().then(function(foundId) {
          if (foundId) {
            setGistId(foundId);
            return mergeAndUpdate(foundId, localJson, onProgress);
          } else {
            onProgress && onProgress('首次同步，正在创建云端存储...');
            return createGist(localJson).then(function() {
              setLastSync();
              return { message: '首次同步完成，数据已上传到云端' };
            });
          }
        });
      }

      return mergeAndUpdate(gistId, localJson, onProgress);
    });
  }

  function mergeAndUpdate(gistId, localJson, onProgress) {
    onProgress && onProgress('正在下载云端数据...');

    return readGist(gistId).then(function(remoteContent) {
      if (!remoteContent) {
        // gist 为空或被删除，重新上传
        onProgress && onProgress('云端数据为空，正在上传...');
        return createGist(localJson).then(function() {
          setLastSync();
          return { message: '数据已上传到云端' };
        });
      }

      onProgress && onProgress('正在合并数据...');

      // 将远端数据合并到本地
      return Storage.importData(remoteContent).then(function(importResult) {
        // 重新导出合并后的本地数据
        return Storage.getExportPayload().then(function(mergedJson) {
          onProgress && onProgress('正在上传合并后的数据...');
          return updateGist(gistId, mergedJson).then(function() {
            setLastSync();
            return {
              message: '同步完成！' + (importResult.message || '')
            };
          });
        });
      });
    });
  }

  // 格式化上次同步时间
  function formatLastSync() {
    var last = getLastSync();
    if (!last) return '';
    var d = new Date(last);
    var now = new Date();
    var diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    return d.getMonth() + 1 + '/' + d.getDate() + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // 遮罩 token 显示
  function maskToken(token) {
    if (!token || token.length < 8) return '****';
    return token.slice(0, 4) + '****' + token.slice(-4);
  }

  return {
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    hasToken: hasToken,
    validateToken: validateToken,
    doSync: doSync,
    formatLastSync: formatLastSync,
    maskToken: maskToken
  };
})();

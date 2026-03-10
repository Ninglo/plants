/* ========== 照片存储（IndexedDB） ========== */
var PhotoDB = (function() {
  var DB_NAME = 'plants_photos';
  var STORE_NAME = 'photos';
  var DB_VERSION = 1;
  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function(resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function(e) {
        e.target.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = function(e) {
        resolve(e.target.result);
      };
      request.onerror = function(e) {
        reject(e.target.error);
      };
    });
    return dbPromise;
  }

  function save(id, base64) {
    return open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(base64, id);
        tx.oncomplete = function() { resolve(id); };
        tx.onerror = function(e) { reject(e.target.error); };
      });
    });
  }

  function get(id) {
    return open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readonly');
        var request = tx.objectStore(STORE_NAME).get(id);
        request.onsuccess = function() { resolve(request.result); };
        request.onerror = function(e) { reject(e.target.error); };
      });
    });
  }

  function getMultiple(ids) {
    if (!ids || ids.length === 0) return Promise.resolve([]);
    return open().then(function(db) {
      return Promise.all(ids.map(function(id) {
        return new Promise(function(resolve) {
          var tx = db.transaction(STORE_NAME, 'readonly');
          var request = tx.objectStore(STORE_NAME).get(id);
          request.onsuccess = function() { resolve({ id: id, data: request.result }); };
          request.onerror = function() { resolve({ id: id, data: null }); };
        });
      }));
    });
  }

  function remove(id) {
    return open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function(e) { reject(e.target.error); };
      });
    });
  }

  function getAll() {
    return open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readonly');
        var store = tx.objectStore(STORE_NAME);
        var photos = {};
        var cursor = store.openCursor();
        cursor.onsuccess = function(e) {
          var c = e.target.result;
          if (c) {
            photos[c.key] = c.value;
            c.continue();
          } else {
            resolve(photos);
          }
        };
        cursor.onerror = function(e) { reject(e.target.error); };
      });
    });
  }

  function saveMultiple(photosMap) {
    var keys = Object.keys(photosMap);
    if (keys.length === 0) return Promise.resolve();
    return open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        keys.forEach(function(key) {
          store.put(photosMap[key], key);
        });
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function(e) { reject(e.target.error); };
      });
    });
  }

  return {
    open: open,
    save: save,
    get: get,
    getMultiple: getMultiple,
    remove: remove,
    getAll: getAll,
    saveMultiple: saveMultiple
  };
})();

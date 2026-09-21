// @ts-check
const DB = "learn-local-v1";
/** @returns {Promise<IDBDatabase>} */
function open() { return new Promise((resolve, reject) => { const request=indexedDB.open(DB, 1); request.onupgradeneeded=()=> { const db=request.result; for (const name of ["lessons","learning_events","navigation_events","projections"]) db.createObjectStore(name,{keyPath:"id"}); }; request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error); }); }
/** @param {IDBDatabase} db @param {string} store @param {IDBTransactionMode} mode */
function objectStore(db,store,mode) { return db.transaction(store,mode).objectStore(store); }
/** @param {IDBRequest} request */ function done(request) { return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}); }
export const localRepository = {
  async seed(lesson) { const db=await open(); const found=await done(objectStore(db,"lessons","readonly").get(lesson.revisionId)); if (!found) await done(objectStore(db,"lessons","readwrite").put({id:lesson.revisionId, lesson})); },
  async lesson(id) { const db=await open(); return (await done(objectStore(db,"lessons","readonly").get(id)))?.lesson; },
  async events(store) { const db=await open(); return /** @type {any[]} */(await done(objectStore(db,store,"readonly").getAll())); },
  async append(store,event) { const db=await open(); await done(objectStore(db,store,"readwrite").put(event)); },
  async projection(id,value) { const db=await open(); if (value === undefined) return (await done(objectStore(db,"projections","readonly").get(id)))?.value; await done(objectStore(db,"projections","readwrite").put({id,value})); },
  async clearProjections() { const db=await open(); await done(objectStore(db,"projections","readwrite").clear()); }
};

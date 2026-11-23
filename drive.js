// Google Drive: list a folder shared as "Anyone with the link" and download its files.
// Uses the Drive API v3 with an API key, which is all a static page can use for public files.
// Google Slides, Docs and Sheets are exported as PDF; everything else is downloaded as is.
'use strict';
const GDrive = (() => {
  const API = 'https://www.googleapis.com/drive/v3/files';
  const FOLDER = 'application/vnd.google-apps.folder', SHORTCUT = 'application/vnd.google-apps.shortcut';
  const NATIVE = { 'application/vnd.google-apps.presentation':'Google Slides', 'application/vnd.google-apps.document':'Google Docs',
    'application/vnd.google-apps.spreadsheet':'Google Sheets', 'application/vnd.google-apps.drawing':'Google Drawing' };
  const PPTX_TYPES = ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
    'application/vnd.openxmlformats-officedocument.presentationml.template'];

  class DriveError extends Error { constructor(msg, status){ super(msg); this.status = status; } }

  // Accepts folder or file links (any of Google's URL shapes) or a bare ID
  function parseLink(s){
    s = String(s || '').trim(); if(!s) return null;
    const rk = /[?&]resourcekey=([\w-]+)/i.exec(s)?.[1] || null;
    let m = /\/folders\/([\w-]{10,})/.exec(s); if(m) return { id:m[1], kind:'folder', rk };
    m = /\/d\/([\w-]{10,})/.exec(s) || /[?&]id=([\w-]{10,})/.exec(s); if(m) return { id:m[1], kind:'any', rk };
    m = /^([\w-]{15,})$/.exec(s); if(m) return { id:m[1], kind:'any', rk };
    return null;
  }

  function explain(status, body){
    const e = body && body.error, reason = (e?.errors?.[0]?.reason || '') + ' ' + (e?.status || '') + ' ' + JSON.stringify(e?.details || ''), msg = e?.message || '';
    if(/keyInvalid|API_KEY_INVALID|keyExpired/i.test(reason) || /API key not valid|API key expired/i.test(msg)) return 'The API key is not valid. Check that you copied all of it.';
    if(/accessNotConfigured|SERVICE_DISABLED/i.test(reason) || /has not been used|is disabled/i.test(msg)) return 'Google Drive API is not turned on for this key. In Google Cloud Console open APIs & Services → Library → Google Drive API and press Enable, then wait a minute.';
    if(/REFERRER|referer|API_KEY_.*BLOCKED|ANDROID|IOS/i.test(reason + msg)) return 'This API key only works on other websites or apps. In Google Cloud Console set its Application restrictions to None (keep the API restriction on Google Drive API).';
    if(/rateLimit|userRateLimit|quotaExceeded|RESOURCE_EXHAUSTED/i.test(reason) || status === 429) return 'Google Drive is limiting requests right now. Wait a minute and try again.';
    if(/downloadQuotaExceeded/i.test(reason)) return 'This file was downloaded too many times today; Google blocks it for a while. Try again later.';
    if(/cannotDownloadFile|cannotExportFile/i.test(reason)) return 'The owner turned off downloading for this file.';
    if(/exportSizeLimitExceeded/i.test(reason)) return 'Too large for Google to export as PDF. Download it in Drive as PowerPoint and add it with Add file.';
    if(status === 404 || /notFound/i.test(reason)) return 'Not found. Check the link, and that it is shared as “Anyone with the link”.';
    if(status === 403) return 'Google Drive refused access. Check that the folder is shared as “Anyone with the link”.';
    return msg || `Google Drive returned an error (${status}).`;
  }
  async function get(url, key, rk){
    const u = url + (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key) + '&supportsAllDrives=true';
    let r;
    try{ r = await fetch(u, rk ? { headers:{ 'X-Goog-Drive-Resource-Keys':rk } } : undefined); }
    catch(e){ throw new DriveError(navigator.onLine === false ? 'You are offline. Connect to the internet to reach Google Drive.' : 'Could not reach Google Drive. Check the connection and try again.', 0); }
    if(!r.ok){ let body = null; try{ body = await r.json(); }catch(e){} throw new DriveError(explain(r.status, body), r.status); }
    return r;
  }
  const FIELDS = 'id,name,mimeType,size,modifiedTime,resourceKey,shortcutDetails(targetId,targetMimeType,targetResourceKey)';
  async function meta(id, key, rk){ return (await get(`${API}/${id}?fields=${encodeURIComponent(FIELDS)}`, key, rk && `${id}/${rk}`)).json(); }

  // Every file under the folder, subfolders included, each with its folder path
  async function listFolder(rootId, key, rk, onProgress){
    const out = [], seen = new Set(); let folders = 0;
    async function walk(id, path, rkey, depth){
      if(seen.has(id) || depth > 8 || folders > 300) return; seen.add(id); folders++;
      onProgress && onProgress(folders, out.length);
      let token = ''; const subs = [];
      do{
        const q = encodeURIComponent(`'${id}' in parents and trashed = false`);
        const r = await (await get(`${API}?q=${q}&pageSize=1000&orderBy=folder,name_natural&includeItemsFromAllDrives=true&fields=${encodeURIComponent('nextPageToken,files(' + FIELDS + ')')}${token ? '&pageToken=' + token : ''}`,
          key, rkey && `${id}/${rkey}`)).json();
        for(let f of r.files || []){
          if(f.mimeType === SHORTCUT && f.shortcutDetails){ f = { ...f, id:f.shortcutDetails.targetId, mimeType:f.shortcutDetails.targetMimeType, resourceKey:f.shortcutDetails.targetResourceKey }; }
          if(f.mimeType === FOLDER) subs.push(f); else out.push({ ...f, path });
        }
        token = r.nextPageToken || '';
      } while(token);
      // A folder's own files come first, then each subfolder
      for(const f of subs) await walk(f.id, path ? path + ' / ' + f.name : f.name, f.resourceKey, depth + 1);
    }
    await walk(rootId, '', rk, 0);
    return out;
  }

  // What Marginalia can do with a Drive file
  function kind(f){
    const n = (f.name || '').toLowerCase();
    if(NATIVE[f.mimeType]) return { ok:true, label:NATIVE[f.mimeType], export:true };
    if(f.mimeType === 'application/pdf' || n.endsWith('.pdf')) return { ok:true, label:'PDF' };
    if(PPTX_TYPES.includes(f.mimeType) || /\.(pptx|ppsx|potx)$/.test(n)) return { ok:true, label:'PowerPoint' };
    if(f.mimeType === 'application/vnd.ms-powerpoint' || n.endsWith('.ppt')) return { ok:false, label:'Old .ppt', why:'Old .ppt files cannot be opened. Open it in Google Slides, then File → Save as Google Slides; that copy can be added here.' };
    return { ok:false, label:(f.name.split('.').pop() || 'File').toUpperCase().slice(0, 6), why:'Only PDF, PowerPoint and Google Slides, Docs or Sheets files open in Marginalia.' };
  }

  // Downloads (or exports to PDF) with progress in [0, 1] when the size is known
  async function download(f, key, onProgress){
    const k = kind(f), rk = f.resourceKey ? `${f.id}/${f.resourceKey}` : null;
    const r = await get(k.export ? `${API}/${f.id}/export?mimeType=application%2Fpdf` : `${API}/${f.id}?alt=media`, key, rk);
    const total = +f.size || +r.headers.get('content-length') || 0;
    if(!r.body || !r.body.getReader) return r.arrayBuffer();
    const reader = r.body.getReader(), parts = []; let got = 0;
    for(;;){
      const { done, value } = await reader.read(); if(done) break;
      parts.push(value); got += value.length; onProgress && onProgress(total ? Math.min(1, got / total) : null, got);
    }
    const out = new Uint8Array(got); let o = 0; for(const p of parts){ out.set(p, o); o += p.length; }
    return out.buffer;
  }

  // Name for the library: exports get .pdf so the importer treats them right
  const fileName = f => kind(f).export ? f.name + '.pdf' : f.name;

  return { parseLink, meta, listFolder, kind, download, fileName, DriveError, FOLDER };
})();

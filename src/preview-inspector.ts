export function inspectorScript() {
  return `(() => {
    const existing = globalThis.__spokeuiInspector;
    if (existing) return;

    const host = document.createElement('div');
    host.dataset.spokeuiInspector = '';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const hoverBox = document.createElement('div');
    const selectedBox = document.createElement('div');
    const hoverLabel = document.createElement('div');
    const selectedLabel = document.createElement('div');
    for (const box of [hoverBox, selectedBox]) box.style.cssText = 'position:fixed;display:none;box-sizing:border-box;border:2px solid #1455ff;background:rgba(20,85,255,.09);border-radius:4px;box-shadow:0 0 0 1px rgba(255,255,255,.8) inset;transition:left 60ms linear,top 60ms linear,width 60ms linear,height 60ms linear;';
    selectedBox.style.cssText += 'border-color:#ff5a36;background:rgba(255,90,54,.08);';
    for (const label of [hoverLabel, selectedLabel]) label.style.cssText = 'position:fixed;display:none;max-width:360px;padding:5px 8px;border-radius:5px;background:#1d201c;color:#fff;font:600 11px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 3px 10px rgba(0,0,0,.22);';
    selectedLabel.style.background = '#e94f2d';
    const agentPanel = document.createElement('section');
    agentPanel.style.cssText = 'position:fixed;right:18px;bottom:18px;width:min(520px,calc(100vw - 36px));max-height:min(620px,calc(100vh - 36px));display:none;pointer-events:auto;overflow:auto;background:#fbfaf7;color:#20231f;border:1px solid rgba(32,35,31,.18);border-radius:14px;box-shadow:0 22px 60px rgba(20,22,20,.28);font:13px/1.45 Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;';
    shadow.append(hoverBox, selectedBox, hoverLabel, selectedLabel, agentPanel);
    document.documentElement.appendChild(host);

    const currentMode = 'select';
    let hovered = null;
    let selected = [];
    const selectionOverlays = new Map();
    let lastSelection = '[]';
    const eventInsidePanel = (event) => {
      if (agentPanel.style.display === 'none') return false;
      const rect = agentPanel.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    };
    const nodeDetails = (node) => {
      if (!(node instanceof Element)) return { tag: '', id: null, classes: [] };
      return {
        tag: node.tagName.toLowerCase(),
        id: node.id || null,
        classes: [...node.classList].filter((name) => name && !name.startsWith('__spokeui')).slice(0, 6),
      };
    };
    const compact = (node) => {
      const details = nodeDetails(node);
      const id = details.id ? '#' + CSS.escape(details.id) : '';
      const classes = details.classes.slice(0, 2).map((name) => '.' + CSS.escape(name)).join('');
      return details.tag + id + classes;
    };
    const selectorFor = (element) => {
      if (element.id && document.querySelectorAll('#' + CSS.escape(element.id)).length === 1) return '#' + CSS.escape(element.id);
      const testId = element.getAttribute('data-testid');
      if (testId && document.querySelectorAll('[data-testid="' + CSS.escape(testId) + '"]').length === 1) return '[data-testid="' + CSS.escape(testId) + '"]';
      const parts = [];
      let current = element;
      while (current) {
        let part = compact(current);
        if (current.parentElement) {
          const peers = [...current.parentElement.children].filter((child) => child.tagName === current.tagName);
          if (peers.length > 1) part += ':nth-of-type(' + (peers.indexOf(current) + 1) + ')';
        }
        parts.unshift(part);
        if (current.id && document.querySelectorAll('#' + CSS.escape(current.id)).length === 1) break;
        current = current.parentElement;
      }
      return parts.join(' > ');
    };
    const describe = (element) => {
      const styles = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const properties = ['display','position','width','height','padding','gap','font-size','font-weight','color','background-color','border-radius','grid-template-columns','flex-direction','align-items','justify-content'];
      return {
        tag: element.tagName.toLowerCase(),
        id: element.id || null,
        classes: [...element.classList].slice(0, 12),
        text: (element.innerText || element.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 500),
        selector: selectorFor(element),
        ancestry: (() => { const result = []; let node = element; while (node && node instanceof Element && result.length < 8) { result.push(nodeDetails(node)); node = node.parentElement; } return result; })(),
        attributes: Object.fromEntries([...element.attributes].filter((attr) => !attr.name.startsWith('style')).slice(0, 20).map((attr) => [attr.name, attr.value.slice(0, 300)])),
        bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        styles: Object.fromEntries(properties.map((name) => [name, styles.getPropertyValue(name)])),
      };
    };
    const paint = (element, box, label) => {
      if (!element || currentMode !== 'select') { box.style.display = 'none'; label.style.display = 'none'; return; }
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) { box.style.display = 'none'; label.style.display = 'none'; return; }
      box.style.display = 'block';
      box.style.left = Math.max(0, rect.left) + 'px'; box.style.top = Math.max(0, rect.top) + 'px';
      box.style.width = rect.width + 'px'; box.style.height = rect.height + 'px';
      label.textContent = element.tagName.toLowerCase() + '  ' + Math.round(rect.width) + ' × ' + Math.round(rect.height);
      label.style.display = 'block';
      label.style.left = Math.max(5, Math.min(innerWidth - 365, rect.left)) + 'px';
      label.style.top = (rect.top > 30 ? rect.top - 27 : Math.min(innerHeight - 28, rect.bottom + 5)) + 'px';
    };
    const emitSelection = () => {
      const payload = JSON.stringify(selected.map(describe));
      if (payload !== lastSelection) { lastSelection = payload; globalThis.__spokeuiSelect(payload); }
    };
    const repaint = () => {
      selected = selected.filter((element) => element.isConnected);
      paint(hovered?.isConnected ? hovered : null, hoverBox, hoverLabel);
      for (const [element, overlay] of selectionOverlays) {
        if (!selected.includes(element)) { overlay.box.remove(); overlay.label.remove(); selectionOverlays.delete(element); }
      }
      selected.forEach((element, index) => {
        let overlay = selectionOverlays.get(element);
        if (!overlay) {
          overlay = { box: selectedBox.cloneNode(), label: selectedLabel.cloneNode() };
          shadow.insertBefore(overlay.box, agentPanel); shadow.insertBefore(overlay.label, agentPanel);
          selectionOverlays.set(element, overlay);
        }
        paint(element, overlay.box, overlay.label);
        if (selected.length > 1) overlay.label.textContent = (index + 1) + ' · ' + overlay.label.textContent;
      });
      emitSelection();
    };
    const removeTarget = (selector) => {
      selected = selector === undefined ? [] : selected.filter((element) => selectorFor(element) !== selector);
      repaint();
    };
    const pickTarget = (event) => {
      let target = document.elementsFromPoint(event.clientX, event.clientY).find((item) => item !== host && !item.closest('[data-spokeui-inspector]')) || null;
      if (target && target instanceof SVGElement && target.tagName.toLowerCase() !== 'svg') target = target.closest('svg');
      while (target && target.parentElement && target !== document.body) {
        const rect = target.getBoundingClientRect();
        if (rect.width >= 6 && rect.height >= 6) break;
        target = target.parentElement;
      }
      return target;
    };
    document.addEventListener('pointermove', (event) => {
      if (currentMode !== 'select') return;
      if (eventInsidePanel(event)) {
        hovered = null;
        paint(null, hoverBox, hoverLabel);
        return;
      }
      const target = pickTarget(event);
      if (target === hovered) return;
      hovered = target || null;
      paint(hovered, hoverBox, hoverLabel);
    }, true);
    document.addEventListener('pointerleave', () => { hovered = null; paint(null, hoverBox, hoverLabel); }, true);
    document.addEventListener('click', (event) => {
      if (currentMode !== 'select') return;
      if (eventInsidePanel(event)) return;
      const target = pickTarget(event);
      if (!target) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      selected = (event.metaKey || (event.ctrlKey && !/Mac/.test(navigator.platform)))
        ? selected.includes(target) ? selected.filter((element) => element !== target) : [...selected, target]
        : [target];
      hovered = null; repaint();
    }, true);
    document.addEventListener('contextmenu', (event) => {
      if (eventInsidePanel(event)) return;
      const target = pickTarget(event);
      if (!target) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      selected = [target]; hovered = null; repaint();
      const snapshot = describe(target);
      globalThis.__spokeuiContext(JSON.stringify(snapshot));
    }, true);
    const escapeText = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
    const statusLabel = (status) => status === 'running' ? 'Agent working' : status === 'pending' ? 'Review required' : status === 'accepted' ? 'Accepted' : status === 'rejected' ? 'Reverted' : status === 'failed' ? 'Needs attention' : status;
    const renderChange = (change) => {
      agentPanel.style.width = 'min(880px,calc(100vw - 36px))';
      const files = Array.isArray(change.files) ? change.files : [];
      const targetName = change.targets?.length > 1 ? change.targets.length + ' elements' : change.target ? '&lt;' + escapeText(change.target.tag) + '&gt;' : 'Page';
      const before = change.beforeImage ? '<img src="' + change.beforeImage + '" alt="Component before the agent change">' : '<div class="empty-shot">Capturing before</div>';
      const after = change.afterImage ? '<img src="' + change.afterImage + '" alt="Component after the agent change">' : '<div class="empty-shot"><span class="panel-spinner"></span>Waiting for HMR</div>';
      const fileRows = files.slice(0, 8).map((file) => '<li><span>' + escapeText(file.path) + '</span><code>+' + file.additions + ' −' + file.deletions + '</code></li>').join('');
      const response = change.response ? '<div class="agent-answer"><strong>Agent response</strong><p>' + escapeText(change.response).replace(/\\n/g, '<br>') + '</p></div>' : '';
      agentPanel.innerHTML = '<style>' +
        '.panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:16px 17px 13px;border-bottom:1px solid rgba(32,35,31,.11)}.panel-head span{display:block;color:#787b74;font-size:10px;margin-bottom:3px}.panel-head strong{font-size:14px}.status{flex:0 0 auto;padding:5px 7px;border-radius:6px;background:#e7edff;color:#1455ff;font-size:10px;font-weight:700}.status.pending{background:#fff2d8;color:#8a5b05}.status.accepted{background:#e5f5eb;color:#14734d}.status.rejected,.status.failed{background:#fdeae6;color:#ae3527}' +
        '.review-body{padding:16px 17px}.request{margin:0 0 15px;color:#555a52;font-size:12px}.compare{display:grid;grid-template-columns:1fr 1fr;gap:10px}.shot{min-width:0}.shot label{display:flex;justify-content:space-between;margin-bottom:7px;color:#8b8e87;font-size:9px;font-weight:750;letter-spacing:.1em}.shot-frame{height:min(300px,34vh);min-height:210px;display:grid;place-items:center;overflow:hidden;border:1px solid rgba(32,35,31,.12);border-radius:9px;background:#eeefec}.shot-frame img{display:block;width:100%;height:100%;object-fit:contain;object-position:center;background:#fff}.empty-shot{display:flex;align-items:center;gap:7px;color:#858981;font-size:10px}.panel-spinner{width:10px;height:10px;border:2px solid #bdc9ea;border-top-color:#1455ff;border-radius:50%;animation:spin .8s linear infinite}' +
        '.summary{display:flex;align-items:center;gap:12px;padding:12px 0 4px;color:#666a62;font-size:11px}.summary strong{color:#20231f}.add{color:#14734d}.del{color:#ae3527}.details{margin-top:9px;border-top:1px solid rgba(32,35,31,.1);padding-top:9px}.details summary{cursor:pointer;color:#4f544d;font-weight:650;font-size:11px}.details ul{list-style:none;margin:8px 0 0;padding:0}.details li{display:flex;justify-content:space-between;gap:12px;padding:5px 0;color:#60645d;font-size:10px}.details li span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.details code{flex:0 0 auto;color:#596056}.agent-answer{margin-top:11px;padding:11px;border-radius:8px;background:#eeefec}.agent-answer strong{font-size:10px}.agent-answer p{max-height:180px;overflow:auto;margin:5px 0 0;color:#535850;font-size:11px;white-space:normal}' +
        '.panel-actions{display:flex;justify-content:flex-end;gap:7px;padding:12px 17px;border-top:1px solid rgba(32,35,31,.11)}.panel-actions button{height:32px;border-radius:7px;padding:0 12px;font:650 11px Inter,-apple-system,sans-serif;cursor:pointer}.secondary{border:1px solid rgba(32,35,31,.18);background:#fbfaf7;color:#353a34}.reject{border:1px solid #edc5bd;background:#fff5f2;color:#ae3527}.accept{border:0;background:#20231f;color:#fbfaf7}.close{border:0;background:transparent;color:#777b74;padding:2px!important;height:auto!important;font-size:18px!important}@media(max-width:720px){.compare{grid-template-columns:1fr}.shot-frame{height:220px;min-height:0}}@keyframes spin{to{transform:rotate(360deg)}}' +
        '</style><header class="panel-head"><div><span>AGENT CHANGE · ' + targetName + '</span><strong>' + escapeText(change.runtime === 'claude' ? 'Claude Code' : 'Codex') + '</strong></div><div class="status ' + escapeText(change.status) + '">' + escapeText(statusLabel(change.status)) + '</div></header>' +
        '<div class="review-body"><p class="request">' + escapeText(change.instruction) + '</p><div class="compare"><div class="shot"><label>BEFORE</label><div class="shot-frame">' + before + '</div></div><div class="shot"><label>AFTER</label><div class="shot-frame">' + after + '</div></div></div>' +
        '<div class="summary"><strong>' + files.length + ' file' + (files.length === 1 ? '' : 's') + ' changed</strong><span class="add">+' + Number(change.additions || 0) + '</span><span class="del">−' + Number(change.deletions || 0) + '</span></div>' +
        (files.length ? '<details class="details"><summary>Detailed review</summary><ul>' + fileRows + '</ul></details>' : '') + response + '</div>' +
        '<footer class="panel-actions">' + (change.status === 'pending' ? '<button class="reject" data-action="reject">Reject</button><button class="accept" data-action="accept">Accept</button>' : '') + '<button class="secondary" data-action="dismiss">' + (change.status === 'running' ? 'Hide' : 'Close') + '</button></footer>';
      agentPanel.style.display = 'block';
      agentPanel.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => {
        const action = button.getAttribute('data-action');
        if (action === 'dismiss') agentPanel.style.display = 'none';
        else globalThis.__spokeuiChangeAction(JSON.stringify({ id: change.id, action }));
      }));
    };
    const showDebug = (title, text, working) => {
      agentPanel.style.width = 'min(520px,calc(100vw - 36px))';
      agentPanel.innerHTML = '<style>.debug-head{display:flex;justify-content:space-between;align-items:center;padding:15px 17px;border-bottom:1px solid rgba(32,35,31,.11)}.debug-head strong{font-size:13px}.debug-body{padding:16px 17px;color:#50554d;font-size:12px;line-height:1.55;white-space:pre-wrap;max-height:360px;overflow:auto}.debug-working{display:inline-block;width:10px;height:10px;margin-right:8px;border:2px solid #bdc9ea;border-top-color:#1455ff;border-radius:50%;animation:spin .8s linear infinite}.debug-close{border:0;background:transparent;color:#777b74;font-size:18px;cursor:pointer}@keyframes spin{to{transform:rotate(360deg)}}</style><header class="debug-head"><strong>' + escapeText(title) + '</strong><button class="debug-close" aria-label="Close">×</button></header><div class="debug-body">' + (working ? '<span class="debug-working"></span>' : '') + escapeText(text) + '</div>';
      agentPanel.style.display = 'block';
      agentPanel.querySelector('.debug-close').addEventListener('click', () => { agentPanel.style.display = 'none'; });
    };
    const showHistory = (records) => {
      agentPanel.style.width = 'min(660px,calc(100vw - 36px))';
      const rows = records.map((change) => '<button class="history-row" data-change-id="' + escapeText(change.id) + '"><span><strong>' + escapeText(change.targets?.length > 1 ? change.targets.length + ' elements' : change.target ? '<' + change.target.tag + '>' : 'Page change') + '</strong><small>' + escapeText(change.instruction) + '</small></span><span class="history-meta"><em class="' + escapeText(change.status) + '">' + escapeText(statusLabel(change.status)) + '</em><code>' + Number(change.files?.length || 0) + ' files · +' + Number(change.additions || 0) + ' −' + Number(change.deletions || 0) + '</code></span></button>').join('');
      agentPanel.innerHTML = '<style>.history-head{display:flex;justify-content:space-between;align-items:center;padding:15px 17px;border-bottom:1px solid rgba(32,35,31,.11)}.history-head strong{font-size:13px}.history-close{border:0;background:transparent;color:#777b74;font-size:18px;cursor:pointer}.history-list{max-height:430px;overflow:auto}.history-row{width:100%;border:0;border-bottom:1px solid rgba(32,35,31,.09);background:transparent;padding:12px 17px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px;text-align:left;cursor:pointer}.history-row:hover{background:#f0efeb}.history-row>span,.history-row strong,.history-row small{display:block;min-width:0}.history-row strong{font-size:11px}.history-row small{max-width:280px;margin-top:3px;color:#777b74;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.history-meta{text-align:right}.history-meta em{display:inline-block;padding:3px 5px;border-radius:5px;background:#e7edff;color:#1455ff;font-size:9px;font-style:normal;font-weight:700}.history-meta em.pending{background:#fff2d8;color:#8a5b05}.history-meta em.accepted{background:#e5f5eb;color:#14734d}.history-meta em.rejected,.history-meta em.failed{background:#fdeae6;color:#ae3527}.history-meta code{margin-top:4px;color:#777b74;font-size:9px}.history-empty{padding:44px 18px;text-align:center;color:#777b74;font-size:11px}</style><header class="history-head"><strong>Component history</strong><button class="history-close" aria-label="Close">×</button></header><div class="history-list">' + (rows || '<div class="history-empty">Agent changes will appear here.</div>') + '</div>';
      agentPanel.style.display = 'block';
      agentPanel.querySelector('.history-close').addEventListener('click', () => { agentPanel.style.display = 'none'; });
      agentPanel.querySelectorAll('[data-change-id]').forEach((button) => button.addEventListener('click', () => globalThis.__spokeuiChangeAction(JSON.stringify({ id: button.getAttribute('data-change-id'), action: 'view' }))));
    };
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && selected.length) { selected = []; hovered = null; repaint(); }
    }, true);
    let repaintQueued = false;
    const observer = new MutationObserver(() => {
      if (repaintQueued) return;
      repaintQueued = true;
      requestAnimationFrame(() => { repaintQueued = false; repaint(); });
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    addEventListener('scroll', repaint, true);
    addEventListener('resize', repaint);
    globalThis.__spokeuiInspector = { active: true, removeTarget, renderChange, showDebug, showHistory, setUiVisible: (visible) => { host.style.visibility = visible ? 'visible' : 'hidden'; } };
    document.documentElement.style.cursor = 'crosshair';
  })()`;
}

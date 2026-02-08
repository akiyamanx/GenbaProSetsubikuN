// ==========================================
// 間取りエディタ — 描画ツール・設備アイコン (現場Pro 設備くん Phase4)
// 部屋・壁・ドア・窓・配管・設備・寸法の描画ロジック、
// 設備アイコン描画、オブジェクトの追加/削除/更新、プロパティ編集
// 依存: madori-core.js → 後続: madori-ui.js, madori-data.js
// ==========================================

var EQUIP_SIZES = {
  toilet:{w:400,h:700,label:'トイレ'}, sink:{w:600,h:500,label:'流し台'},
  bathtub:{w:700,h:1400,label:'浴槽'}, kitchen:{w:2500,h:650,label:'キッチン'},
  washbasin:{w:600,h:450,label:'洗面台'}, washer:{w:600,h:600,label:'洗濯機'},
  waterheater:{w:400,h:600,label:'給湯器'}, gasrange:{w:600,h:500,label:'コンロ'},
  ac:{w:800,h:200,label:'エアコン'}
};
window.EQUIP_SIZES = EQUIP_SIZES;

// === オブジェクト追加/削除 ===
function addMadoriObject(obj) {
  if (!obj.id) obj.id = (typeof generateId==='function') ? generateId() : Date.now().toString(36);
  if (typeof pushUndo==='function') pushUndo();
  window._madoriState.objects.push(obj);
  renderMadoriCanvas(); return obj;
}
function removeMadoriObject(id) {
  var st = window._madoriState;
  if (typeof pushUndo==='function') pushUndo();
  st.objects = st.objects.filter(function(o){return o.id!==id;});
  if (st.selectedId===id) { st.selectedId=null; updateSelectionBar(); }
  renderMadoriCanvas();
}

// === ツール別PointerDown ===
function onMadoriToolDown(mode, wx, wy, rawX, rawY, sx, sy) {
  var st = window._madoriState;
  if (mode==='select') {
    // Check resize handles first
    if (st.selectedId && typeof hitTestResizeHandle==='function') {
      var rh = hitTestResizeHandle(rawX, rawY);
      if (rh) {
        var obj = getObjectById(st.selectedId);
        if (obj && obj.type==='room') {
          st.isResizing=true; st.resizeHandle=rh.handle;
          st.resizeStartWX=wx; st.resizeStartWY=wy;
          st.resizeObjStart={x:obj.x,y:obj.y,w:obj.width,h:obj.height};
          if (typeof pushUndo==='function') pushUndo();
          return;
        }
      }
    }
    var hit = hitTest(rawX, rawY);
    if (hit) {
      st.selectedId=hit.id; st.isDragging=true;
      st.dragStartWX=wx; st.dragStartWY=wy; st.dragObjStartX=hit.x; st.dragObjStartY=hit.y;
      if (typeof pushUndo==='function') pushUndo();
    } else {
      st.selectedId=null; st.isPanning=true;
      st.panStartX=sx; st.panStartY=sy; st.panStartOffsetX=st.viewport.offsetX; st.panStartOffsetY=st.viewport.offsetY;
    }
    updateSelectionBar(); renderMadoriCanvas(); return;
  }
  if (mode==='room') { st.drawingStart={x:wx,y:wy}; st._drawingEnd={x:wx,y:wy}; return; }
  if (mode==='wall') {
    if (!st.drawingStart) { st.drawingStart={x:wx,y:wy}; }
    else { addMadoriObject({type:'wall',x:st.drawingStart.x,y:st.drawingStart.y,x2:wx,y2:wy,thickness:120,wallType:'exterior'}); st.drawingStart=null; }
    renderMadoriCanvas(); return;
  }
  if (mode==='door') {
    if (typeof showDoorTypePicker==='function') { showDoorTypePicker(wx, wy); }
    else { addMadoriObject({type:'door',x:wx,y:wy,width:800,doorStyle:'hinged-right',angle:0}); }
    return;
  }
  if (mode==='window') { addMadoriObject({type:'window',x:wx,y:wy,width:900,angle:0}); return; }
  if (mode==='pipe') {
    st.drawingPoints.push({x:wx,y:wy});
    var sub=document.getElementById('madoriSubToolbar'); if(sub) sub.innerHTML=buildPipeSubToolbar();
    renderMadoriCanvas(); return;
  }
  if (mode==='equipment') {
    if (!st._selectedEquipType) { if(typeof openEquipmentPicker==='function') openEquipmentPicker(); return; }
    var sz = EQUIP_SIZES[st._selectedEquipType]||{w:500,h:500,label:''};
    addMadoriObject({type:'equipment',equipType:st._selectedEquipType,x:wx,y:wy,angle:0,label:sz.label}); return;
  }
  if (mode==='dimension') {
    if (!st._dimStart) { st._dimStart={x:wx,y:wy}; }
    else {
      var val = Math.round(Math.sqrt(Math.pow(wx-st._dimStart.x,2)+Math.pow(wy-st._dimStart.y,2)));
      var dimObj = addMadoriObject({type:'dimension',x:st._dimStart.x,y:st._dimStart.y,x2:wx,y2:wy,value:val,source:'manual'});
      st._dimStart=null;
      if (typeof showDimValueInput==='function') showDimValueInput(dimObj);
    }
    renderMadoriCanvas(); return;
  }
}

// === ツール別PointerMove ===
function onMadoriToolMove(mode, wx, wy, rawX, rawY, sx, sy) {
  var st = window._madoriState;
  if (mode==='select') {
    if (st.isResizing && st.selectedId) {
      var obj=getObjectById(st.selectedId);
      if (obj && obj.type==='room' && st.resizeObjStart) {
        var dx=wx-st.resizeStartWX, dy=wy-st.resizeStartWY, s=st.resizeObjStart, h=st.resizeHandle;
        if (h==='br') { obj.width=Math.max(200,s.w+dx); obj.height=Math.max(200,s.h+dy); }
        else if (h==='bl') { obj.x=s.x+dx; obj.width=Math.max(200,s.w-dx); obj.height=Math.max(200,s.h+dy); }
        else if (h==='tr') { obj.y=s.y+dy; obj.width=Math.max(200,s.w+dx); obj.height=Math.max(200,s.h-dy); }
        else if (h==='tl') { obj.x=s.x+dx; obj.y=s.y+dy; obj.width=Math.max(200,s.w-dx); obj.height=Math.max(200,s.h-dy); }
        renderMadoriCanvas();
      }
      return;
    }
    if (st.isDragging && st.selectedId) {
      var obj=getObjectById(st.selectedId);
      if (obj) { obj.x=st.dragObjStartX+(wx-st.dragStartWX); obj.y=st.dragObjStartY+(wy-st.dragStartWY); renderMadoriCanvas(); }
    } else if (st.isPanning) {
      st.viewport.offsetX=st.panStartOffsetX+(sx-st.panStartX); st.viewport.offsetY=st.panStartOffsetY+(sy-st.panStartY); renderMadoriCanvas();
    }
    return;
  }
  if (mode==='room' && st.drawingStart) { st._drawingEnd={x:wx,y:wy}; renderMadoriCanvas(); }
}

// === ツール別PointerUp ===
function onMadoriToolUp(mode, wx, wy) {
  var st = window._madoriState;
  if (mode==='select') { st.isDragging=false; st.isPanning=false; st.isResizing=false; st.resizeHandle=null; return; }
  if (mode==='room' && st.drawingStart) {
    var x1=Math.min(st.drawingStart.x,wx), y1=Math.min(st.drawingStart.y,wy);
    var w=Math.abs(wx-st.drawingStart.x), h=Math.abs(wy-st.drawingStart.y);
    if (w<200||h<200) { st.drawingStart=null; return; }
    st._pendingRoomObj={x:x1,y:y1,width:w,height:h}; st.drawingStart=null;
    showRoomLabelModal();
  }
}

// === 配管完了 ===
function finishPipeDraw() {
  var st = window._madoriState;
  if (st.drawingPoints.length<2) { st.drawingPoints=[]; return; }
  addMadoriObject({type:'pipe',pipeType:st._pipeType,points:st.drawingPoints.slice(),diameter:20,x:0,y:0});
  st.drawingPoints = [];
  var sub=document.getElementById('madoriSubToolbar'); if(sub) sub.innerHTML=buildPipeSubToolbar();
  renderMadoriCanvas();
}

// === 部屋ラベルモーダル ===
function showRoomLabelModal() { var m=document.getElementById('madoriRoomLabelModal'); if(m) m.style.display='flex'; var i=document.getElementById('madoriRoomLabelInput'); if(i) i.value=''; }
function setRoomLabel(label) { var i=document.getElementById('madoriRoomLabelInput'); if(i) i.value=label; }
function confirmRoomLabel() {
  var st=window._madoriState, inp=document.getElementById('madoriRoomLabelInput');
  var label = inp ? inp.value.trim() : ''; if (!label) label='部屋';
  var p = st._pendingRoomObj;
  if (p) addMadoriObject({type:'room',x:p.x,y:p.y,width:p.width,height:p.height,label:label,fillColor:ROOM_COLORS[label]||'#f3f4f6',roomType:'rectangle',angle:0});
  st._pendingRoomObj=null; closeRoomLabelModal();
}
function cancelRoomLabel() { window._madoriState._pendingRoomObj=null; closeRoomLabelModal(); }
function closeRoomLabelModal() { var m=document.getElementById('madoriRoomLabelModal'); if(m) m.style.display='none'; }

// === 設備ピッカー ===
function openEquipmentPicker() { var m=document.getElementById('madoriEquipPicker'); if(m) m.style.display='flex'; }
function closeEquipPicker() { var m=document.getElementById('madoriEquipPicker'); if(m) m.style.display='none'; }
function selectEquipType(type) { window._madoriState._selectedEquipType=type; closeEquipPicker(); }

// === 選択中オブジェクト操作 ===
function rotateMadoriObject() {
  var st=window._madoriState; if(!st.selectedId) return;
  var obj=getObjectById(st.selectedId); if(!obj) return;
  if(typeof pushUndo==='function') pushUndo();
  obj.angle = ((obj.angle||0)+90) % 360; renderMadoriCanvas();
}
function deleteMadoriObject() {
  var st=window._madoriState; if(!st.selectedId) return;
  removeMadoriObject(st.selectedId);
}

// === オブジェクト描画 ===
function renderMadoriObject(ctx, obj) {
  switch(obj.type) {
    case 'room': drawRoom(ctx,obj); break; case 'wall': drawWall(ctx,obj); break;
    case 'door': drawDoor(ctx,obj); break; case 'window': drawWindow(ctx,obj); break;
    case 'pipe': drawPipe(ctx,obj); break; case 'equipment': drawEquipment(ctx,obj); break;
    case 'dimension': drawDimension(ctx,obj); break;
  }
}

function drawRoom(ctx, r) {
  var tl=worldToScreen(r.x,r.y), br=worldToScreen(r.x+r.width,r.y+r.height);
  var w=br.x-tl.x, h=br.y-tl.y;
  ctx.save();
  if (r.angle) {
    var cx=tl.x+w/2, cy=tl.y+h/2;
    ctx.translate(cx,cy); ctx.rotate(r.angle*Math.PI/180); ctx.translate(-cx,-cy);
  }
  ctx.fillStyle=r.fillColor||'#f3f4f6'; ctx.fillRect(tl.x,tl.y,w,h);
  ctx.strokeStyle='#374151'; ctx.lineWidth=2; ctx.strokeRect(tl.x,tl.y,w,h);
  if (r.label) {
    var fs=Math.max(10,Math.min(16,w/6));
    ctx.font='bold '+fs+'px sans-serif'; ctx.fillStyle='#1f2937'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(r.label, tl.x+w/2, tl.y+h/2-fs*0.6);
  }
  var ds=Math.max(8,Math.min(12,w/8));
  ctx.font=ds+'px sans-serif'; ctx.fillStyle='#6b7280'; ctx.textAlign='center';
  var dimText = (r.width>=1000) ? (r.width/1000).toFixed(1)+'m' : Math.round(r.width)+'mm';
  dimText += ' x ';
  dimText += (r.height>=1000) ? (r.height/1000).toFixed(1)+'m' : Math.round(r.height)+'mm';
  ctx.fillText(dimText, tl.x+w/2, tl.y+h/2+ds);
  ctx.restore();
}

function drawWall(ctx, wall) {
  var s1=worldToScreen(wall.x,wall.y), s2=worldToScreen(wall.x2,wall.y2);
  ctx.save(); ctx.strokeStyle='#1f2937';
  ctx.lineWidth=Math.max(3,wall.thickness*window._madoriState.viewport.scale*window._madoriState.pixelsPerMm*0.3);
  ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(s1.x,s1.y); ctx.lineTo(s2.x,s2.y); ctx.stroke(); ctx.restore();
}

function drawDoor(ctx, door) {
  var s=worldToScreen(door.x,door.y), sc=window._madoriState.viewport.scale*window._madoriState.pixelsPerMm;
  var wPx=(door.width||800)*sc;
  var style=door.doorStyle||'hinged-right';
  // Backward compat
  if (style==='hinged') style='hinged-right';
  if (style==='sliding') style='sliding-single';
  ctx.save(); ctx.translate(s.x,s.y); ctx.rotate((door.angle||0)*Math.PI/180);
  ctx.strokeStyle='#3b82f6'; ctx.lineWidth=2;
  if (style==='hinged-left') {
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(wPx,0); ctx.stroke();
    ctx.setLineDash([4,4]); ctx.beginPath(); ctx.arc(0,0,wPx,0,-Math.PI/2,true); ctx.stroke(); ctx.setLineDash([]);
  } else if (style==='hinged-right') {
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(wPx,0); ctx.stroke();
    ctx.setLineDash([4,4]); ctx.beginPath(); ctx.arc(wPx,0,wPx,Math.PI,Math.PI*1.5); ctx.stroke(); ctx.setLineDash([]);
  } else if (style==='sliding-single') {
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(wPx,0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wPx*0.3,-8); ctx.lineTo(wPx*0.7,-8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wPx*0.6,-14); ctx.lineTo(wPx*0.7,-8); ctx.lineTo(wPx*0.6,-2); ctx.stroke();
  } else if (style==='sliding-double') {
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(wPx,0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wPx*0.45,-8); ctx.lineTo(wPx*0.2,-8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wPx*0.25,-14); ctx.lineTo(wPx*0.2,-8); ctx.lineTo(wPx*0.25,-2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wPx*0.55,-8); ctx.lineTo(wPx*0.8,-8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wPx*0.75,-14); ctx.lineTo(wPx*0.8,-8); ctx.lineTo(wPx*0.75,-2); ctx.stroke();
  }
  ctx.restore();
}

function drawWindow(ctx, win) {
  var s=worldToScreen(win.x,win.y), sc=window._madoriState.viewport.scale*window._madoriState.pixelsPerMm;
  var wPx=(win.width||900)*sc;
  ctx.save(); ctx.translate(s.x,s.y); ctx.rotate((win.angle||0)*Math.PI/180);
  ctx.strokeStyle='#0ea5e9'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(0,-4); ctx.lineTo(wPx,-4); ctx.moveTo(0,4); ctx.lineTo(wPx,4); ctx.stroke();
  ctx.strokeStyle='#bae6fd'; ctx.lineWidth=1;
  var step=wPx/6;
  for (var i=step; i<wPx; i+=step) { ctx.beginPath(); ctx.moveTo(i,-4); ctx.lineTo(i,4); ctx.stroke(); }
  ctx.restore();
}

function drawPipe(ctx, pipe) {
  if (!pipe.points||pipe.points.length<2) return;
  var color=PIPE_COLORS[pipe.pipeType]||'#6b7280';
  ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=3; ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.beginPath();
  var s0=worldToScreen(pipe.points[0].x,pipe.points[0].y); ctx.moveTo(s0.x,s0.y);
  for (var i=1; i<pipe.points.length; i++) { var si=worldToScreen(pipe.points[i].x,pipe.points[i].y); ctx.lineTo(si.x,si.y); }
  ctx.stroke();
  var pl=pipe.points, p1=pl[pl.length-2], p2=pl[pl.length-1];
  var a1=worldToScreen(p1.x,p1.y), a2=worldToScreen(p2.x,p2.y);
  var ang=Math.atan2(a2.y-a1.y,a2.x-a1.x);
  ctx.fillStyle=color; ctx.beginPath(); ctx.moveTo(a2.x,a2.y);
  ctx.lineTo(a2.x-12*Math.cos(ang-0.4),a2.y-12*Math.sin(ang-0.4));
  ctx.lineTo(a2.x-12*Math.cos(ang+0.4),a2.y-12*Math.sin(ang+0.4));
  ctx.closePath(); ctx.fill();
  var mi=Math.floor(pl.length/2), ms=worldToScreen(pl[mi].x,pl[mi].y);
  var pipeInfo = '';
  if (pipe.pipeMaterial) pipeInfo += pipe.pipeMaterial;
  if (pipe.pipeDiameter) pipeInfo += (pipeInfo ? ' ' : '') + pipe.pipeDiameter;
  if (!pipeInfo) pipeInfo = PIPE_LABELS[pipe.pipeType] || '';
  else pipeInfo += ' (' + (PIPE_LABELS[pipe.pipeType]||'') + ')';
  ctx.font='bold 10px sans-serif'; ctx.fillStyle=color;
  ctx.fillText(pipeInfo, ms.x+4, ms.y-6);
  ctx.restore();
}

function drawEquipment(ctx, eq) {
  var s=worldToScreen(eq.x,eq.y), sc=window._madoriState.viewport.scale*window._madoriState.pixelsPerMm;
  var info=EQUIP_SIZES[eq.equipType]||{w:500,h:500,label:'?'};
  var eqW=eq.customW||info.w, eqH=eq.customH||info.h;
  var wPx=eqW*sc, hPx=eqH*sc;
  ctx.save(); ctx.translate(s.x+wPx/2,s.y+hPx/2); ctx.rotate((eq.angle||0)*Math.PI/180);
  ctx.strokeStyle='#6b7280'; ctx.lineWidth=1.5; ctx.fillStyle='#f8fafc';
  ctx.fillRect(-wPx/2,-hPx/2,wPx,hPx); ctx.strokeRect(-wPx/2,-hPx/2,wPx,hPx);
  var fs=Math.max(8,Math.min(14,wPx/5));
  ctx.font=fs+'px sans-serif'; ctx.fillStyle='#374151'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(eq.label||info.label, 0, 0); ctx.restore();
}

function drawDimension(ctx, dim) {
  var s1=worldToScreen(dim.x,dim.y), s2=worldToScreen(dim.x2,dim.y2);
  ctx.save(); ctx.strokeStyle='#ef4444'; ctx.fillStyle='#ef4444'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(s1.x,s1.y); ctx.lineTo(s2.x,s2.y); ctx.stroke();
  [s1,s2].forEach(function(p){ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();});
  var mx=(s1.x+s2.x)/2, my=(s1.y+s2.y)/2, text=dim.value+'mm';
  ctx.font='bold 12px sans-serif'; ctx.textAlign='center';
  var tw=ctx.measureText(text).width;
  ctx.fillStyle='white'; ctx.fillRect(mx-tw/2-3,my-8,tw+6,16);
  ctx.fillStyle='#ef4444'; ctx.fillText(text,mx,my+4); ctx.restore();
}

// === 描画中プレビュー ===
function drawMadoriPreview(ctx) {
  var st = window._madoriState;
  if (st.mode==='room' && st.drawingStart && st._drawingEnd) {
    var tl=worldToScreen(Math.min(st.drawingStart.x,st._drawingEnd.x),Math.min(st.drawingStart.y,st._drawingEnd.y));
    var br=worldToScreen(Math.max(st.drawingStart.x,st._drawingEnd.x),Math.max(st.drawingStart.y,st._drawingEnd.y));
    ctx.save(); ctx.fillStyle='rgba(14,165,233,0.15)'; ctx.strokeStyle='#0ea5e9'; ctx.lineWidth=2; ctx.setLineDash([6,3]);
    ctx.fillRect(tl.x,tl.y,br.x-tl.x,br.y-tl.y); ctx.strokeRect(tl.x,tl.y,br.x-tl.x,br.y-tl.y);
    ctx.setLineDash([]); ctx.restore();
  }
  if (st.mode==='wall' && st.drawingStart) {
    var sp=worldToScreen(st.drawingStart.x,st.drawingStart.y);
    ctx.save(); ctx.fillStyle='#1f2937'; ctx.beginPath(); ctx.arc(sp.x,sp.y,4,0,Math.PI*2); ctx.fill(); ctx.restore();
  }
  if (st.mode==='pipe' && st.drawingPoints.length>0) {
    var color=PIPE_COLORS[st._pipeType]||'#6b7280';
    ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=2; ctx.setLineDash([4,4]); ctx.beginPath();
    var p0=worldToScreen(st.drawingPoints[0].x,st.drawingPoints[0].y); ctx.moveTo(p0.x,p0.y);
    for(var i=1;i<st.drawingPoints.length;i++){var pi=worldToScreen(st.drawingPoints[i].x,st.drawingPoints[i].y);ctx.lineTo(pi.x,pi.y);}
    ctx.stroke(); ctx.setLineDash([]);
    st.drawingPoints.forEach(function(pt){var sp=worldToScreen(pt.x,pt.y);ctx.fillStyle=color;ctx.beginPath();ctx.arc(sp.x,sp.y,4,0,Math.PI*2);ctx.fill();});
    ctx.restore();
  }
  if (st.mode==='dimension' && st._dimStart) {
    var sd=worldToScreen(st._dimStart.x,st._dimStart.y);
    ctx.save(); ctx.fillStyle='#ef4444'; ctx.beginPath(); ctx.arc(sd.x,sd.y,4,0,Math.PI*2); ctx.fill(); ctx.restore();
  }
}

// === グローバル公開 ===
window.addMadoriObject = addMadoriObject;
window.removeMadoriObject = removeMadoriObject;
window.onMadoriToolDown = onMadoriToolDown;
window.onMadoriToolMove = onMadoriToolMove;
window.onMadoriToolUp = onMadoriToolUp;
window.renderMadoriObject = renderMadoriObject;
window.drawMadoriPreview = drawMadoriPreview;
window.finishPipeDraw = finishPipeDraw;
window.showRoomLabelModal = showRoomLabelModal;
window.setRoomLabel = setRoomLabel;
window.confirmRoomLabel = confirmRoomLabel;
window.cancelRoomLabel = cancelRoomLabel;
window.openEquipmentPicker = openEquipmentPicker;
window.closeEquipPicker = closeEquipPicker;
window.selectEquipType = selectEquipType;
window.rotateMadoriObject = rotateMadoriObject;
window.deleteMadoriObject = deleteMadoriObject;
console.log('[madori-tools.js] ✓ 間取り描画ツール 読み込み完了');

/** View-only camera geometry. World coordinates and character routes stay fixed. */
export const SCENE_SIZE = Object.freeze({width:1000,height:700});
const MAX_RELATIVE_ZOOM=3;
const positive=(value,fallback)=>Number.isFinite(value)&&value>0?value:fallback;
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

/** Bounds not covered by the measured controls, in host CSS pixels. */
export function cameraViewport(width,height,insets={}) {
  width=positive(width,1);height=positive(height,1);
  const inset=name=>Math.max(0,Number.isFinite(insets[name])?insets[name]:0);
  let left=inset('left'),right=inset('right'),top=inset('top'),bottom=inset('bottom');
  // A temporarily cramped layout must never produce negative/zero geometry.
  const sx=Math.min(1,(width-1)/Math.max(1,left+right));
  const sy=Math.min(1,(height-1)/Math.max(1,top+bottom));
  left*=sx;right*=sx;top*=sy;bottom*=sy;
  return {left,top,width:width-left-right,height:height-top-bottom};
}

export function cameraFitZoom(viewport,size=SCENE_SIZE) {
  return Math.min(viewport.width/size.width,viewport.height/size.height);
}

export function clampCameraPan(pan,zoom,viewport,size=SCENE_SIZE) {
  const axis=(position,origin,available,extent)=>extent<=available
    ?origin+(available-extent)/2
    :clamp(position,origin+available-extent,origin);
  return {x:axis(pan.x,viewport.left,viewport.width,size.width*zoom),y:axis(pan.y,viewport.top,viewport.height,size.height*zoom)};
}

export function fitCamera(viewport,size=SCENE_SIZE) {
  const zoom=cameraFitZoom(viewport,size);
  return {viewport,zoom,pan:clampCameraPan({x:0,y:0},zoom,viewport,size)};
}

/** Keep a floating corner label in the letterbox when possible, rather than
 * wasting its entire row. If it intersects the fitted image, use the largest
 * remaining rectangular view beside it. */
export function avoidCameraOccluder(viewport,rect,size=SCENE_SIZE) {
  const fitted=fitCamera(viewport,size),left=fitted.pan.x,top=fitted.pan.y;
  if(left+size.width*fitted.zoom<=rect.left||left>=rect.right||top+size.height*fitted.zoom<=rect.top||top>=rect.bottom)return viewport;
  const right=viewport.left+viewport.width,bottom=viewport.top+viewport.height;
  const candidates=[
    {left:Math.max(viewport.left,rect.right),top:viewport.top,width:right-Math.max(viewport.left,rect.right),height:viewport.height},
    {left:viewport.left,top:Math.max(viewport.top,rect.bottom),width:viewport.width,height:bottom-Math.max(viewport.top,rect.bottom)},
    {left:viewport.left,top:viewport.top,width:Math.min(right,rect.left)-viewport.left,height:viewport.height},
    {left:viewport.left,top:viewport.top,width:viewport.width,height:Math.min(bottom,rect.top)-viewport.top}
  ].filter(v=>v.width>0&&v.height>0);
  return candidates.sort((a,b)=>cameraFitZoom(b,size)-cameraFitZoom(a,size))[0]||viewport;
}

export function cameraFocalPoint(camera) {
  const {viewport,zoom,pan}=camera;
  return {x:(viewport.left+viewport.width/2-pan.x)/zoom,y:(viewport.top+viewport.height/2-pan.y)/zoom};
}

/** Preserve the world point at the viewport centre, unless an edge clamps it. */
export function resizeCamera(camera,viewport,size=SCENE_SIZE) {
  if(!camera)return fitCamera(viewport,size);
  const relative=clamp(camera.zoom/cameraFitZoom(camera.viewport,size),1,MAX_RELATIVE_ZOOM);
  if(relative<=1+1e-7)return fitCamera(viewport,size);
  const focal=cameraFocalPoint(camera),zoom=cameraFitZoom(viewport,size)*relative;
  return {viewport,zoom,pan:clampCameraPan({x:viewport.left+viewport.width/2-focal.x*zoom,y:viewport.top+viewport.height/2-focal.y*zoom},zoom,viewport,size)};
}

/** Zoom around the visible centre; minimum is always the whole-scene view. */
export function zoomCamera(camera,factor,size=SCENE_SIZE) {
  if(!Number.isFinite(factor)||factor<=0)return camera;
  const {viewport}=camera,minimum=cameraFitZoom(viewport,size);
  const zoom=clamp(camera.zoom*factor,minimum,minimum*MAX_RELATIVE_ZOOM);
  if(zoom<=minimum*(1+1e-7))return fitCamera(viewport,size);
  const focal=cameraFocalPoint(camera);
  return {viewport,zoom,pan:clampCameraPan({x:viewport.left+viewport.width/2-focal.x*zoom,y:viewport.top+viewport.height/2-focal.y*zoom},zoom,viewport,size)};
}

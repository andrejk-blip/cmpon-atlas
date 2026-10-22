#!/usr/bin/env python3
"""Exact exported scene + GLSL in a native surfaceless GLES2 context.
This is a renderer integration test, not browser UI or hardware FPS QA.
Input JSON is exported from the exact entry harness; no gameplay edits.
"""
import ctypes as C, json, math, sys, time
from pathlib import Path
from PIL import Image

egl=C.CDLL('libEGL.so.1'); I=C.c_int; U=C.c_uint; P=C.c_void_p; F=C.c_float
def ef(name,result,args):
 f=getattr(egl,name);f.restype=result;f.argtypes=args;return f
getproc=ef('eglGetProcAddress',P,[C.c_char_p])
platform=C.CFUNCTYPE(P,U,P,C.POINTER(I))(getproc(b'eglGetPlatformDisplayEXT'))
display=platform(0x31DD,None,None)
major,minor=I(),I()
assert ef('eglInitialize',U,[P,C.POINTER(I),C.POINTER(I)])(display,C.byref(major),C.byref(minor)), 'EGL init unavailable'
assert ef('eglBindAPI',U,[U])(0x30A0)
attrs=(I*15)(0x3033,1,0x3040,4,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3025,24,0x3038)
config,n=P(),I();assert ef('eglChooseConfig',U,[P,C.POINTER(I),C.POINTER(P),I,C.POINTER(I)])(display,attrs,C.byref(config),1,C.byref(n)) and n.value
w,h=1280,720
surface=ef('eglCreatePbufferSurface',P,[P,P,C.POINTER(I)])(display,config,(I*5)(0x3057,w,0x3056,h,0x3038))
context=ef('eglCreateContext',P,[P,P,P,C.POINTER(I)])(display,config,None,(I*3)(0x3098,2,0x3038))
assert surface and context
assert ef('eglMakeCurrent',U,[P,P,P,P])(display,surface,surface,context)
def gl(name,result,args):
 address=getproc(name.encode());assert address,name
 return C.CFUNCTYPE(result,*args)(address)
getstring=gl('glGetString',C.c_char_p,[U]);vendor=getstring(0x1F00).decode();renderer=getstring(0x1F01).decode();version=getstring(0x1F02).decode()
data=json.loads(Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/base270-gl-scene.json').read_text())
create_shader=gl('glCreateShader',U,[U]);source=gl('glShaderSource',None,[U,I,C.POINTER(C.c_char_p),C.POINTER(I)]);compile_=gl('glCompileShader',None,[U]);shaderiv=gl('glGetShaderiv',None,[U,U,C.POINTER(I)])
def shader(kind,text):
 handle=create_shader(kind);src=C.c_char_p(text.encode());source(handle,1,C.byref(src),None);compile_(handle);status=I();shaderiv(handle,0x8B81,C.byref(status))
 if not status.value:
  log=C.create_string_buffer(8192);gl('glGetShaderInfoLog',None,[U,I,C.POINTER(I),C.c_char_p])(handle,8192,None,log);raise AssertionError(log.value.decode())
 return handle
vs,fs=shader(0x8B31,data['vertex']),shader(0x8B30,data['fragment'])
program=gl('glCreateProgram',U,[])();attach=gl('glAttachShader',None,[U,U]);attach(program,vs);attach(program,fs);gl('glLinkProgram',None,[U])(program)
ok=I();gl('glGetProgramiv',None,[U,U,C.POINTER(I)])(program,0x8B82,C.byref(ok));assert ok.value,'program link failed'
gl('glUseProgram',None,[U])(program)
location=gl('glGetUniformLocation',I,[U,C.c_char_p]);attribute=gl('glGetAttribLocation',I,[U,C.c_char_p]);matrix=gl('glUniformMatrix4fv',None,[I,I,U,C.POINTER(F)]);vec=gl('glUniform3fv',None,[I,I,C.POINTER(F)]);scalar=gl('glUniform1f',None,[I,F])
uniforms={k:location(program,k.encode()) for k in ['uView','uProjection','uModel','uColor','uEye','uEmissive','uAlpha','uKind','uInterior','uLightA','uLightB','uLightC','uTintA','uTintB','uTintC']}
camera=data['camera'];r,u,f,pos=[camera[k] for k in ['r','u','f','pos']]
dot=lambda a,b:sum(x*y for x,y in zip(a,b))
view=[r[0],u[0],-f[0],0,r[1],u[1],-f[1],0,r[2],u[2],-f[2],0,-dot(r,pos),-dot(u,pos),dot(f,pos),1]
near,far=camera.get('near',3.5),camera.get('far',6000);t=1/math.tan(camera['fov']/2)
projection=[t*h/w,0,0,0,0,t,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]
matrix(uniforms['uView'],1,0,(F*16)(*view));matrix(uniforms['uProjection'],1,0,(F*16)(*projection));vec(uniforms['uEye'],1,(F*3)(*pos))
scalar(uniforms['uInterior'],camera.get('interior',0))
for index,suffix in enumerate('ABC'):
 light=camera.get('lights',[])[index] if index<len(camera.get('lights',[])) else {}
 vec(uniforms['uLight'+suffix],1,(F*3)(*light.get('pos',[0,0,0])));vec(uniforms['uTint'+suffix],1,(F*3)(*light.get('color',[0,0,0])))
buffers={};gen=gl('glGenBuffers',None,[I,C.POINTER(U)]);bind=gl('glBindBuffer',None,[U,U]);upload=gl('glBufferData',None,[U,C.c_ssize_t,P,U]);attrib=gl('glVertexAttribPointer',None,[U,I,U,U,I,P]);enable=gl('glEnableVertexAttribArray',None,[U])
apos,anorm=attribute(program,b'aPosition'),attribute(program,b'aNormal');enable(apos);enable(anorm)
for name,mesh in data['meshes'].items():
 ids=(U*2)();gen(2,ids)
 for i,key in enumerate(['p','n']):
  values=(F*len(mesh[key]))(*mesh[key]);bind(0x8892,ids[i]);upload(0x8892,C.sizeof(values),C.cast(values,P),0x88E4)
 buffers[name]=(ids,len(mesh['p'])//3)
gl('glViewport',None,[I,I,I,I])(0,0,w,h);gl('glEnable',None,[U])(0x0B71);gl('glDepthFunc',None,[U])(0x0203)
gl('glBlendFunc',None,[U,U])(0x0302,0x0303);gl('glClearColor',None,[F,F,F,F])(.035,.055,.08,1)
draw=gl('glDrawArrays',None,[U,I,I]);depthmask=gl('glDepthMask',None,[U]);start=time.perf_counter()
gl('glClear',None,[U])(0x00004000|0x00000100)
items=sorted(data['items'],key=lambda x:(x['alpha']<1,-sum((x['pos'][i]-pos[i])**2 for i in range(3)) if x['alpha']<1 else 0))
for item in items:
 if item['alpha']<1:gl('glEnable',None,[U])(0x0BE2);depthmask(0)
 ids,count=buffers[item['mesh']]
 for i,attr in enumerate([apos,anorm]):bind(0x8892,ids[i]);attrib(attr,3,0x1406,0,0,None)
 matrix(uniforms['uModel'],1,0,(F*16)(*item['model']));vec(uniforms['uColor'],1,(F*3)(*item['color']))
 for key,value in [('uEmissive',item['emissive']),('uAlpha',item['alpha']),('uKind',item['kind'])]:scalar(uniforms[key],value)
 draw(0x0004,0,count)
pixels=(C.c_ubyte*(w*h*4))();gl('glReadPixels',None,[I,I,I,I,U,U,P])(0,0,w,h,0x1908,0x1401,C.cast(pixels,P))
error=gl('glGetError',U,[])();assert error==0,hex(error)
out=Path(__file__).parent/'qa-2.7.0';Image.frombytes('RGBA',(w,h),bytes(pixels)).transpose(Image.Transpose.FLIP_TOP_BOTTOM).save(out/'base-native-gles.png')
report={'pass':True,'files':data.get('files',[]),'vendor':vendor,'renderer':renderer,'version':version,'egl':f'{major.value}.{minor.value}','shaderCompile':True,'programLink':True,'glError':error,'items':len(items),'millisecondsIncludingReadback':(time.perf_counter()-start)*1000,'method':'Native surfaceless EGL/GLES, exact exported scene and production shader. Software GPU integration with production interior lights and projection. No browser, postprocessing, hardware GPU or FPS claim.'}
(out/'base-native-gles.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
ef('eglMakeCurrent',U,[P,P,P,P])(display,None,None,None);ef('eglDestroyContext',U,[P,P])(display,context);ef('eglDestroySurface',U,[P,P])(display,surface);ef('eglTerminate',U,[P])(display)

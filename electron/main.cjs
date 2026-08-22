const {app,BrowserWindow,Menu,shell,session}=require('electron');
const path=require('node:path');

const APP_NAME='妈妈在哪里：雾中逃亡';
app.setName(APP_NAME);
app.commandLine.appendSwitch('autoplay-policy','user-gesture-required');

function createWindow(){
  const win=new BrowserWindow({
    width:1280,height:800,minWidth:900,minHeight:640,
    title:APP_NAME,backgroundColor:'#0b0d09',
    show:false,trafficLightPosition:{x:18,y:18},
    webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,devTools:false}
  });
  win.webContents.setUserAgent(`${win.webContents.getUserAgent()} CowcomeMac/20260823.2`);
  win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//i.test(url))shell.openExternal(url);return{action:'deny'};});
  win.webContents.on('will-navigate',(event,url)=>{if(url!==win.webContents.getURL()){event.preventDefault();if(/^https?:\/\//i.test(url))shell.openExternal(url);}});
  win.once('ready-to-show',()=>win.show());
  win.loadFile(path.join(app.getAppPath(),'dist','index.html'));
}

app.whenReady().then(()=>{
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  Menu.setApplicationMenu(Menu.buildFromTemplate([{role:'appMenu'},{role:'editMenu'},{role:'viewMenu'},{role:'windowMenu'}]));
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});

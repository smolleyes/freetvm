//node modules
var fs = require('fs'),
    path = require('path'),
    mkdirp = require('mkdirp'),
    util = require('util'),
    http = require('http'),
    cpu = require('os-utils'),
    nodeip = require('node-ip'),
    deviceType = require('ua-device-type'),
    url = require('url'),
    spawn = require('child_process').spawn,
    upnp = require('upnp'),
    myIp = require('node-ip').address(),
    sudo = require('sudo'),
    spawn = require('child_process').spawn,
    wintools,
    upnpClient = require('upnp-client'),
    cli = new upnpClient(),
    _ = require('underscore'),
    temp = require('temp'),
    request = require('request'),
    parseString = require('xml2js').parseString;

// node-webkit window
var gui = require('nw.gui');
var win = gui.Window.get();
win.setResizable(false);
win.on('loaded', function() {
    this.show();
    this.setPosition("center");
    cli.searchDevices();
});

//set default timout
$.ajaxSetup({timeout: 5000});

//globals
VERSION="0.2.2";
var timeout = 10000; //ms
var exec_path=path.dirname(process.execPath);
var winIshidden = true;
var fn;
var megaServer;
var storage = localStorage;
var settings = {};
var ffmpeg;
var ffar = [];
var execDir = path.dirname(process.execPath);
var osType = getOsType();
var HOME = getUserHome();

// Create a tray icon
var tray = new gui.Tray({ title: 'FreeTvM-server', icon: 'img/icon.png' });

// Give it a menu
var menu = new gui.Menu();
menu.append(new gui.MenuItem({ label: 'Quitter' }));
tray.menu = menu;
menu.items[0].click = function() { 
    win.hide();
    win.close(true);
};

// on tray click
tray.on('click',function(e){
    if(winIshidden){
        win.show();
        winIshidden = false;
    } else {
        win.hide();
        winIshidden = true;
    }
});

//catch exceptions
try {
	process.on('uncaughtException', function(err) {
		try{
			var error = err.stack;
      console.log("exception error" + error);
		} catch(err){}
	});
} catch(err) {
	console.log("exception error" + err);
}

// start app
$(document).on('ready',function(e){
    
    ////////////////////////////////////////
    // start keyevent listener
    fn = function(e){ onKeyPress(e); };
    document.addEventListener("keydown", fn, false );
    // remove listener if input focused
    $('#inputPassword').focusin(function() {
        document.removeEventListener("keydown",fn, false);
    });
    $('#inputPassword').focusout(function() {
        document.addEventListener("keydown", fn, false );
    }); 

    /////////////////////////
    // show/hide password
    $(".reveal").mousedown(function() {
        $(".pwd").replaceWith($('.pwd').clone().attr('type', 'text'));
    })
    .mouseup(function() {
        $(".pwd").replaceWith($('.pwd').clone().attr('type', 'password'));
    })
    .mouseout(function() {
        $(".pwd").replaceWith($('.pwd').clone().attr('type', 'password'));
    });
    // save password
    var pass;
    $('#savePassword').click(function(e){
        var pass = $("#inputPassword").val();
        var options = {
            cachePassword: true,
            prompt: 'password:',
            spawnOptions: { /* other options for spawn */ }
        };
        //test a command
        var child = sudo([ 'ls', '-l', '/tmp' ], options, pass);

        child.on('exit',function(code) {
            if(code === 0) {
                alert('Commande sudo ok!');
                settings.password = pass;
                storage.ftvSettings = JSON.stringify(settings);
                $("#password").hide();
                $("#main").show();
                // verify/create autostart file
                createAutostart();
            } else {
                alert('Problème avec votre mot de passe, réessayez...');
            }
        })
    });

    //load stored infos
    if (storage.ftvSettings === undefined) {
        if (osType !== 'windows') {
            askPassword();
        }
        testFbxVersion(false);
        settings.ip = nodeip.address();
        settings.version = VERSION;
        settings.sharedFolders = [];
        storage.ftvSettings = JSON.stringify(settings);
    } else {
        settings = JSON.parse(storage.ftvSettings);
        // verify password
        if (osType !== 'windows') {
          if (settings.password === undefined || settings.password === null) {
            askPassword();
          } else {
            // verify/create autostart file
            createAutostart();
          }
        }
        testFbxVersion(true);
    }
    
    // check stored VERSION and update if necessary
    if(settings.version !== VERSION) {
        settings.version = VERSION;
        storage.ftvSettings = JSON.stringify(settings);
    }

    // collapsible div
    $(document).on('click', '.panel-heading span.clickable', function(e){
        var $this = $(this);
        if(!$this.hasClass('panel-collapsed')) {
            $this.parents('.panel').find('.panel-body').slideUp();
            $this.parents('.panel').find('.panel-footer').slideUp();
            $this.addClass('panel-collapsed');
            $this.find('i').removeClass('glyphicon-chevron-up').addClass('glyphicon-chevron-down');

        } else {
            $this.parents('.panel').find('.panel-body').slideDown();
            $this.parents('.panel').find('.panel-footer').slideDown();
            $this.removeClass('panel-collapsed');
            $this.find('i').removeClass('glyphicon-chevron-down').addClass('glyphicon-chevron-up');
        }
    }); 
    // add stored folders to the list
    var list = settings.sharedFolders;
    var length = list.length;
    if (length !== 0) {
        $('#foldersList').empty();
        $.each(list,function(index,folder){
            addFolder(folder);
        });
    }
    // add folder
    $("#addFolderBtn").click(function(e){
        e.preventDefault();
        chooseFile("#fileDialog");
    });
    // remove folder
    $(document).on("click",".removeFolderBtn",function(e){
        e.preventDefault();
        var folder = $(this).attr('data').trim();
        var index = $.inArray(folder, settings.sharedFolders);
        if (index>=0) settings.sharedFolders.splice(index, 1);
        $(this).parent().remove();
        storage.ftvSettings = JSON.stringify(settings);
        if($(".removeFolderBtn").length === 0) {
            $('#foldersList').empty().append('<li class="list-group-item">Aucun dossier partagé...</li>');
        }
    });
    
    //fbxv5 config 
   $(document).on("click","#showFbxConfigLink",function(){
      console.log('clicked')
      gui.Shell.openExternal("http://www.dslvalley.com/dossiers/freebox/freebox-nat.php")
    });

    //start server
    startMegaServer();
    // show window when ready
    winIshidden = false;
});

// test fbx version
function testFbxVersion(init) {
    $.get('http://mafreebox.freebox.fr',function(res){
      var verif = res.match(/Freebox OS/);
      if(verif !== null) {
        settings.fbxVersion = 'V6';
        storage.ftvSettings = JSON.stringify(settings);
        //start upnpIGD config
        startUpnp();
      } else {
        settings.fbxVersion = 'V5';
        storage.ftvSettings = JSON.stringify(settings);
        // show ip settings if fbx V5
        if(!init){
            $('#v5Container').append('<p>Vous devez configurer une redirection du <b>port 8888 en tcp sur l\'ip '+myIp+'</b> sur votre console de gestion free.<br> si vous ne savez pas comment faire suivez la procèdure indiquée <a id="showFbxConfigLink" href="#" >ici</a></p>');
            $('#fbxV5Config').show();
        }
        // get public ip
        $.getJSON('http://www.realip.info/api/realip.php',function(res){
            settings.publicIp = res.IP;
            storage.ftvSettings = JSON.stringify(settings);
            $("#ipFreebox").empty().append('<b>Ip publique: </b>    ' +settings.publicIp);
        }).error(function(res){
            alert('http://whatsmyip.org est inaccessible, vérifiez votre connexion...');
            return;
        });
      }
    }).error(function(res){
      alert('http://mafreebox.freebox.fr est inaccessible, vérifiez votre connexion...');
      return;
    });
}

// get user HOMEDIR
function getUserHome() {
    return process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
}

//get os type
function getOsType() {  
    var arch = process.arch;
    if (process.platform === 'win32') {
        wintools = require('wintools');
        return 'windows';
    } else if (process.platform === 'darwin') {
       return 'mac';
    } else {
        if (arch === 'ia32') {
            return 'linux-32';
        } else if (arch === 'x64') {
            return 'linux-64';
        }
    }
}

// ask password function
function askPassword() {
    $('#main').hide();
    $('#password').show();
}

// shutdown pc 
function shutdown(res) {
	console.log('shutdown asked');
	if(osType !== 'windows') {
		var child;
		if(osType === "mac") {
			child = sudo([ 'shutdown','-h','now' ], {}, settings.password);
		} else {
			child = sudo([ 'shutdown','-P','now' ], {}, settings.password);
		}
		var options = {
			cachePassword: true,
			prompt: 'password:',
			spawnOptions: { /* other options for spawn */ }
		};
		child.on('exit',function(code) {
			if(code === 0) {
				res.writeHead(200,{'Content-type': 'text/html'});
				res.write('ok');
				res.end();
			} else {
				res.writeHead(200,{'Content-type': 'text/html'});
				res.write('nok');
				res.end();
			}
		});
	} else {
		wintools.shutdown.poweroff(function() {
			res.writeHead(200,{'Content-type': 'text/html'});
			res.write('ok');
			res.end();
		});
	}
}

// create / add automatic startup file
function createAutostart() {
    if(osType === 'linux-32' || osType === 'linux-64') {
        fs.exists(HOME+'/.config/autostart', function (exists) {
            util.debug(exists ? createLinuxAutostart() : makeLinuxAutostartDir() );
        });
    } else if (osType === 'mac') {
		var exec = require('child_process').exec;
		var args = [ '-e', 'tell application "System Events" to get the name of every login item' ];
		var child = exec('osascript -e \'tell application "System Events" to get the name of every login item\'', function (error, stdout, stderr) {
    		console.log('autostart list:'+ stdout.trim());
    		if (error === null) {
			  if(stdout.trim() === '') {
			  	 console.log('FreetvM autostart not created, creating...');
				 createMacAutostart();
			  } else if (stdout.indexOf('FreetvM-server') !== -1) {
				console.log('Autostart already exist, delete...');
				var args = [ '-e', 'tell application "System Events" to delete login item "FreetvM-server"' ];
				var child = spawn('osascript', args);
				child.on('exit',function(code) {
					if(code === 0) {
						console.log('Autostart deleted successfully');
						//recreate new one
						createMacAutostart();
					} else {
						alert('Impossible de créer le fichier de démarrage automatique de FreetvM-server');
					}
				});
			  }
    	  	} else {
    	  		alert('Impossible de créer le fichier de démarrage automatique de FreetvM-server' + error);
    	  	}
		});
    } else {
        alert('Os inconnu... impossible de créer le fichier de démarrage automatique!');
    }
}

function createMacAutostart() {
	var execPath = execDir.match(/(.*)FreetvM-server.app/)[0];
	var args = [ '-e', 'tell application "System Events" to make login item at end with properties {path:"'+execPath+'", hidden:false}' ];
	var child = spawn('osascript', args);
	child.on('exit',function(code) {
		if(code === 0) {
			console.log('Autostart created successfully');
		} else {
			alert('Impossible de créer le fichier de démarrage automatique de FreetvM-server');
		}
	});
}

// make autostart dir
function makeLinuxAutostartDir() {
    mkdirp(HOME+'/.config/autostart', function(err) { 
        if(err){
            alert('Impossible de créer le dossier autostart '+HOME+'/.config/autostart');
        } else {
            console.log('Dossier autostart '+HOME+'/.config/autostart'+' crée avec succès');
            createLinuxAutostart();
        }   
    });
}

//create linux autostart desktop file
function createLinuxAutostart() {
    console.log('creating desktop file');
    fs.writeFile(HOME+'/.config/autostart/freetvm.desktop', '[Desktop Entry]\nType=Application\nExec='+execDir+'/freetvm\nHidden=false\nNoDisplay=false\nX-GNOME-Autostart-enabled=true\nName[fr_FR]=Freetvm\nName=Freetvm\nComment[fr_FR]=\nComment=\n', function(err) {
        if(err) {
            alert('Imopssible de créer le fichier autostart '+HOME+'/.config/autostart/freetvm.desktop');
        } else {
            console.log("freetvm.desktop file created!");
        }
    });
}

// open fileDialog and save result in localStorage
function chooseFile(name) {
    var chooser = $(name);
    chooser.on("change",function(evt) {
        var folder = $(this).val();
        if($.inArray(folder,settings.sharedFolders) == -1) {
            settings.sharedFolders.push(folder);
            storage.ftvSettings = JSON.stringify(settings);
            addFolder(folder);
        }
    });
    chooser.click();
}

// add folder function
function addFolder(folder){
    var list = $(".removeFolderBtn");
    if(list.length === 0) {
        $('#foldersList').empty();
    }
    var html ='<li class="list-group-item">'+path.basename(folder)+' \
                    <a href="#" data='+folder+' class="btn btn-sm btn-danger pull-right glyphicon glyphicon-minus removeFolderBtn"></a> \
                </li>';
    $('#foldersList').append(html);
}

// Start server
function startMegaServer() {
    try {
        megaServer.close();
    } catch(err) {
    megaServer = http.createServer(function (req, res) {
        console.log("[DEBUG] request received : "+req.url+"\n");
        if((req.url !== "/favicon.ico") && (req.url !== "/")) {
            if (req.url.indexOf("/getPlaylist") !== -1) {
                var html="";
                var json = {};
                json.channels = [];
                var canalArr = [];
                var fChannels = [];
                $.get('http://mafreebox.freebox.fr/freeboxtv/playlist.m3u',function(resp){
                  var list = resp.split('#EXTINF');
                  $.each(list,function(index,c){
                    var chaine = c.trim().replace(/(\r\n|\n|\r)/gm,"");
                    var infos = {};
                    try {
                        infos.canal = chaine.split(" ")[0].split(",")[1];
                        infos.link = 'rtsp://'+chaine.match(/rtsp:\/\/(.*)/)[1];
                        var n = chaine.match(/(.*?)-(.*?)\)/)[2]+(')');
                        infos.name = n.trim();
                        infos.thumb = 'img/fbxLogos/'+infos.canal+'.png';
                        if(infos.name.indexOf('(auto)') !== -1 || infos.name.indexOf('(TNT)') !== -1) {
                            json.channels.push(infos);
                            canalArr.push(infos.canal);
                        } else {
                            fChannels.push(infos);
                        }
                        var link =  'http://'+req.headers["host"]+'/?file='+infos.link+'&tv';
                      if (index+1 === list.length) {
                        if (req.url.indexOf("json") !== -1){
                              $.each(fChannels,function(index2,channel){
                                  if($.inArray(channel.canal,canalArr) === -1) {
                                      json.channels.push(channel);
                                      if (index2+1 == fChannels.length) {
                                          var list = _.sortBy(json.channels, function(obj){ return parseInt(obj.canal) });
                                          var body = JSON.stringify({"channels":list});
                                          res.writeHead(200, {"Content-Type": "application/json;charset=utf-8",'Access-Control-Allow-Origin' : '*'});
                                          res.end(body);
                                      }
                                  }
                              });
                        } else {
                              res.writeHead(200,{'Content-type': 'text/html','Access-Control-Allow-Origin' : '*'});
                              res.end(html, 'utf-8');
                        }
                      }
                    } catch(err){
                      console.log("n'est pas une chaine", err);
                    }
                 });
              });
            } else if (req.url.indexOf("/getUpnpServers") !== -1){
              $.each(cli._servers,function(index,server) {
                  res.writeHead(200, {"Content-Type": "application/json;charset=utf-8",'Access-Control-Allow-Origin' : '*'});
                  var body = JSON.stringify(cli._servers);
                  res.end(body)
              });
            } else if (req.url.indexOf("/loadUpnpFiles") !== -1){
              var params = decodeURIComponent(req.url.split('?')[1]);
              var serverId = params.split('&')[0].replace('server=','');
              var fileIndex = params.split('&')[1].replace('index=','');
              browseUpnpDir(serverId,fileIndex,res);
            } else if (req.url.indexOf("/getFile") !== -1){
                var link = decodeURIComponent(req.url.split('link=')[1]);
                r = request(decodeURIComponent(link)).on('response',function(response) {
                    response.pipe(res);
                });
            } else if (req.url.indexOf("/getLocalDbJson") !== -1){
                res.writeHead(200,{'Content-type': 'text/html','Access-Control-Allow-Origin' : '*'});
                getLocalDb(res);
            } else if (req.url.indexOf("/test") !== -1){
                res.writeHead(200, {"Content-Type": 'application/json;charset=utf-8','Access-Control-Allow-Origin' : '*'});
                var obj = {"success":true,"ipLocale":myIp,"ipFbx":settings.publicIp};
                var body = JSON.stringify(obj);
                res.end(body);
            } else if (req.url.indexOf("/shutdown") !== -1){
                res.writeHead(200,{'Content-type': 'text/html','Access-Control-Allow-Origin' : '*'});
                shutdown(res);
            } else if (req.url.indexOf("/wakeup") !== -1){
                res.writeHead(200,{'Content-type': 'text/html','Access-Control-Allow-Origin' : '*'});
                wakeup(res);
            } else {
                getMetadata(req,res);
            }
        }
    }).listen(8888);
    $("#serverStateImg").attr('src','img/online.png');
    $("#serverState").empty().append('Serveur en écoute sur '+nodeip.address()+' port 8888'),
    $("#ipLocale").empty().append('<b>Ip locale: </b>'+myIp);
  }
}


////////////////////////////////////////////////
// list local shared folders

function getLocalDb(res) {
    try {
        var dirs = settings.sharedFolders;
        if ((dirs === undefined) || (dirs.length === 0)) {
            res.writeHead(200, {"Content-Type": "text/html;",'Access-Control-Allow-Origin' : '*'});
            res.write('no share');
            res.end();
            return;
        }
    } catch(err) {
        console.log("shared dirs error : "+ err);
        res.writeHead(200, {"Content-Type": "text/html;",'Access-Control-Allow-Origin' : '*'});
        res.write('no share');
        res.end();
        return;
    }
    var fileList = [];
    var total = dirs.length;
    $.each(dirs,function(index,dir){
        if (dir === "") {
            if (index+1 === dirs.length) {
                var body = JSON.stringify(fileList);
                res.writeHead(200, {"Content-Type": "application/json;charset=utf-8",'Access-Control-Allow-Origin' : '*'});
                res.end(body);
            }
            return true;
        } else {
            fileList.push(dirTree(dir));
            if (index+1 === dirs.length) {
                var body = JSON.stringify(fileList);
                res.writeHead(200, {"Content-Type": "application/json;charset=utf-8",'Access-Control-Allow-Origin' : '*'});
                res.end(body);
            }
        }
    }); 
}

function dirTree(filename) {
    var stats = fs.lstatSync(filename),
    info = {
        path: filename,
        name: path.basename(filename)
    };
    if (stats.isDirectory()) {
        info.type = "folder";
        info.children = fs.readdirSync(filename).map(function(child) {
            return dirTree(filename + '/' + child);
        });
    } else {
        // Assuming it's a file. In real life it could be a symlink or
        // something else!
        info.type = "file";
    }
    return info;
}

//////////////////////////////////////////////
// get ffprobe metadata

function getMetadata(req,res){
    var ffprobe;
    var link;
    var bitrate = '';
    var resolution = '';
    var parsedLink = decodeURIComponent(url.parse(req.url).href);
    try {
        link = parsedLink.match(/\?file=(.*?)&tv/)[1].replace(/\+/g,' ');
    } catch(err) {
        try {
            link = parsedLink.match(/\?file=(.*)/)[1].replace(/\+/g,' ');
        } catch(err) {
            res.end();
            return;
        }
    }
    //var args = ['-show_streams','-print_format','json',link];
    var args = [link];
    var error = false;
    if (process.platform === 'win32') {
        ffprobe = spawn(exec_path+'/ffprobe.exe', args);
    } else {
        ffprobe = spawn(exec_path+'/ffprobe', args);
    }
    ffprobe.stderr.on('data', function(data) {
        var infos = data.toString();
        if(infos.indexOf('453 Not Enough Bandwidth') !== -1) {
            res.writeHead(400,{"Content-Type": "text/html"});
            res.write("Pas assez de débit");
            res.end();
            error = true;
        }
        try{
            if (resolution === '') {
                var vinfos = infos.match(/Video:(.*)/)[1];
                console.log(vinfos)
                resolution = vinfos.toLowerCase().match(/\d{3}(?:\d*)?x\d{3}(?:\d*)/)[0];
            }
        }catch(err){

        }
    });
    
    ffprobe.on('exit', function(data) {
        if(error) {
            return;
        }
        console.log('[DEBUG] ffprobe exited...'+bitrate+' '+resolution);
        var width = 640;
        var height = 480;
        width = parseInt(resolution.split("x")[0]);
        height = parseInt(resolution.split("x")[1]);
        startStreaming(req,res,width,height)
    });
}

///////////////////////////////////////////////
// streaming function
function startStreaming(req,res,inwidth,inheight) {
    try {
        cleanffar();
    } catch(err) {
        console.log(err);
    }
    try {
        var link;
        var baseLink = url.parse(req.url).href;
        var parsedLink = decodeURIComponent(url.parse(req.url).href);
        var device = deviceType(req.headers['user-agent']);
        var linkParams = parsedLink.split('&');
        var bitrate = 300;
        var swidth=inwidth;
        var sheight=inheight;
        var host = req.headers['host'];
        var args;
        //get link
        try {
            link = parsedLink.match(/\?file=(.*?)&tv/)[1].replace(/&apos;/g,'\'');
        } catch(err) {
            link = parsedLink.match(/\?file=(.*)/)[1].replace(/&apos;/g,'\'');
        }
        console.log("[DEBUG] Opening link: " + link.replace(/&apos;/g,'\'')+ " req headers: "+req.headers)
        //get screen dimensions from request
        try {
            swidth = parseInt(linkParams.slice(-1)[0].replace('screen=',"").split('x')[0]);
            sheight = parseInt(linkParams.slice(-1)[0].replace('screen=',"").split('x')[1]);
            if (swidth > inwidth) {
                swidth = inwidth;
                sheight = inheight;
            }
            console.log("[DEBUG] Video size: " + swidth + "x" + sheight);
        } catch(err) {
            console.log("[DEBUG] no width/height specified...using "+inwidth+'x'+inheight);
        }
        // get bitrate
        if (parsedLink.indexOf('&bitrate') !== -1){
            try {
              bitrate = parsedLink.match(/&bitrate=(.*?)&/)[1];
            } catch(err) {
              bitrate = parsedLink.match(/&bitrate=(.*)/)[1];
            }
            console.log("[DEBUG] Bitrate:" + bitrate + "k");
        }
        // set response headers
        res.writeHead(200, {
            'Connection':'keep-alive',
            'Content-Type': 'video/mp4',
            'Server':'Ht5treamer/0.0.1'
        });
        // if local file
        var ffmpeg;
        if (link.indexOf('file:') !== -1) {
            res.writeHead(200, {
                'Content-Type': 'video/mp4'
            });
            var link = link.replace('file://','');
            ffmpeg = spawnFfmpeg(link,device,host,bitrate,swidth,sheight,function (code) { // exit
              $("#serverStats").empty().append("<span>ERREUR FFMPEG:<br>"+e+"</span>");
              res.end();
            });
            var x = fs.createReadStream(link).pipe(ffmpeg.stdin);
            x.on('error',function(err) {
                  console.log('ffmpeg stdin error...' + err);
                  if (err.stack.indexOf('codec') === -1) {
                    console.log("Arret demandé !!!");
                    res.end();
                  }
            });
            ffmpeg.stdout.pipe(res);
        } else {
            // start ffmpeg
            ffmpeg = spawnFfmpeg(link,device,host,bitrate,swidth,sheight,function (code) { // exit
                res.end();
            });
            ffmpeg.stdout.pipe(res);
        }

        ffmpeg.on('exit', function() {
                console.log('[DEBUG] FFmpeg stopped...');
                ffmpeg.kill('SIGKILL');
                res.end();
                setTimeout(function(){
                    $("#serverStats").empty().append("<span>En attente...</span>");
                },2000);
        });
              
        ffmpeg.stderr.on('data', function (data) {
            updateStats(data.toString(),swidth,sheight,bitrate);
            console.log(data.toString());
            if(data.toString().indexOf('453 Not Enough Bandwidth') !== -1) {
                res.writeHead(400,{"Content-Type": "text/html"});
                res.write("Pas assez de débit");
                res.end();
            }
        });

        ffmpeg.on('error',function(e) {
            console.log(e);
            res.end();
            ffmpeg.kill('SIGKILL');
            $("#serverStats").empty().append("<span>ERREUR FFMPEG:<br>"+e+"</span>");
        });

    } catch(err) {
        console.log("[DEBUG] ERROR in startStreaming function: " + err);
        res.end();
    }
    res.on("close",function(){
        ffmpeg.kill('SIGKILL');
        setTimeout(function(){
            $("#serverStats").empty().append("<span>En attente...</span>");
        },2000);
    });
}

function spawnFfmpeg(link,device,host,bitrate,swidth,sheight,exitCallback) {
    if (host.match(/(^127\.)|(^192\.168\.)|(^10\.)|(^172\.1[6-9]\.)|(^172\.2[0-9]\.)|(^172\.3[0-1]\.)|(^::1$)/) !== null) {
        if(link.indexOf('rtsp://') === -1) {
            args = ['-re','-i',''+link+'','-f','matroska','-sn','-c:v', 'libx264','-preset', 'fast','-deinterlace',"-aspect", "16:9","-b:v",bitrate+"k","-bufsize",bitrate+"k",'-c:a', 'libopus','-b:a','128k','-threads', '0', '-'];
        } else {
            args = ['-i',''+link+'','-f','matroska','-sn','-c:v', 'libx264','-preset', 'fast','-deinterlace',"-aspect", "16:9","-b:v",bitrate+"k","-bufsize",bitrate+"k",'-c:a', 'libopus','-b:a','128k','-threads', '0', '-'];
        }
    } else {
        if(link.indexOf('rtsp://') === -1) {
            args = ['-re','-i',''+link+'','-f','matroska','-sn','-c:v', 'libx264','-preset', 'fast','-deinterlace',"-aspect", "16:9","-b:v",bitrate+"k","-bufsize",bitrate+"k",'-c:a', 'libopus','-b:a','96k','-threads', '0', '-'];
        } else {
            args = ['-i',''+link+'','-f','matroska','-sn','-c:v', 'libx264','-preset', 'fast','-deinterlace',"-aspect", "16:9","-b:v",bitrate+"k","-bufsize",bitrate+"k",'-c:a', 'libopus','-b:a','64k','-threads', '0', '-'];
        }
    }
    console.log('[DEBUG] Starting ffmpeg:\n' + args.join(' '));
    if (process.platform === 'win32') {
        ffmpeg = spawn(exec_path+'/ffmpeg.exe', args);
    } else {
        ffmpeg = spawn(exec_path+'/ffmpeg', args);
    }
    ffar.push(ffmpeg);
    return ffmpeg;
}

function updateStats(infos,width,height) {
    var data = infos;
    cpu.cpuUsage(function(v){
        var cpuStats = ( 'Utilisation cpu: ' + (v*100).toFixed(2) + "%" );
        try {
            var infos = '';
            infos += "<b>infos vidéos:</b><br>";
            infos += "Résolution: "+width+'x'+height+'<br><br>';
            infos += "<b>statistiques d'encodage:</b><br>";
            infos += "Durée encodage: "+ data.match(/time=(.*?)bitrate/)[1].trim()+"<br>";
            infos += "Qualité: "+ data.match(/bitrate=(.*?)kb/)[1].trim()+"kbits/s<br>";
            infos += "Total encodé: "+ data.match(/size=(.*?)time/)[1].trim()+"<br>";
            infos += "Images/secondes: "+ data.match(/fps=(.*?)q/)[1].trim()+"<br>";
            $("#serverStats").empty().append("<span>"+infos+"</span><span>"+cpuStats+"</span>");
        } catch(err) {
            $("#serverStats").empty().append("<span>Streaming audio en cours...<span><br>"+cpuStats+"</span>");
            return;
        }
    });
}


function cleanffar() {
    $.each(ffar,function(index,ff){
      try{
        ff.kill("SIGKILL");
      } catch(err){}
      if (index+1 === ffar.length){
        ffar = [];
      }
    });
}

////////////////////////////////////////////////
// onKeypress EventListener

function onKeyPress(key) {
    if (key.key === 'd') {
        key.preventDefault();
        win.showDevTools();
    }
}


function startUpnp() {
	// start upnp port forwarding
	upnp.searchGateway(timeout, function(err, gateway) {
	 
	  if (err) console.log(err);
	  
	  console.log("Found Gateway!");
	  console.log("Fetching External IP ... ");
	  
	  gateway.getExternalIP(function(err, ip) {
	  
		if (err) console.log(err);
		$("#ipFreebox").empty().append('<b>Ip publique: </b>    ' +ip);
		
		gateway.AddPortMapping(
			"TCP"             // or "UDP"
		  , 8888              // External port
		  , 8888              // Internal Port
		  , myIp              // Internal Host (ip address of your pc)
		  , "Freetvm"     // Description.
		  , function(err) {
		  
		  if (err) alert('Impossible d\'activer la redirection de port, merci d\'activer l\'upnpIGD sur votre freebox!');
		  //verify access
		  $.get('http://'+myIp+':8888/test',function(res){
			if(!res.success) {
				alert("pas d'accès exterieur à votre freebox, merci de vérifier vos firewalls etc... (autoriser port 8888 en tcp)");
			} else {
				console.log("Accès exterieur ok!")
			}
		  });  
		});
		
	  });
	  
	});
}


function browseUpnpDir(serverId,indexId,res) {
  
  mediaServer = new Plug.UPnP_ContentDirectory( cli._servers[serverId], { debug: false } );
  mediaServer.index = serverId;
  
  mediaServer.browse(decodeURIComponent(indexId), null, null, 0, 1000, null).then(function(response) {
      if (response && response.data) {
        try {
          var xml = encodeXML(response.data.Result);
          var channels = [];
          parseString(xml, function (err, result) {
              var dirs = undefined;
              try {
                dirs = result['DIDL-Lite']['container'];
              } catch(err){}
              var items = undefined;
              try {
                items = result['DIDL-Lite']['item'];
              } catch(err){}
              if(items === undefined && dirs === undefined) {
                  res.writeHead(200,{'Content-type': 'text/html','Access-Control-Allow-Origin' : '*'});
                  res.write('no files');
                  res.end();
              }
              $('#items_container').empty().show();
              if (items) {
                  $.each(items,function(index,dir){
                    var uclass;
                    if(dir['upnp:class'][0].indexOf('object.container') !== -1){
                      var obj = dir['$'];
                      obj.serverId = serverId;
                      var html = '<div data-role="collapsible" class="upnpFolder" data-collapsed="true" data-mini="true" data="'+encodeURIComponent(JSON.stringify(obj))+'"><h3>'+dir["dc:title"]+'</h3></div>';
                      var channel = {};
                      channel.num = parseInt(dir['dc:title'][0].split('-')[0].trim());
                      channel.data = html;
                      channels.push(channel);
                    } else if(dir['upnp:class'][0].indexOf('object.item') !== -1) {
                        if(dir['upnp:class'][0] === "object.item.imageItem") {
                          var uclass="upnpImage";
                          var html = '<a data-role="button" data-mini="true" role="button" href="#" src="'+decodeUri(dir["res"][0]["_"])+'" class="'+uclass+'" data="'+encodeURIComponent(JSON.stringify(dir.$))+'">'+dir['dc:title'][0]+'</a>';
                        } else if (dir['upnp:class'][0] === "object.item.textItem") {
                          var uclass="upnpText";
                          var html = '<a data-role="button" data-mini="true" role="button" href="#" src="'+decodeUri(dir["res"][0]["_"])+'" class="'+uclass+'" data="'+encodeURIComponent(JSON.stringify(dir.$))+'">'+dir['dc:title'][0]+'</a>';
                        } else {
                          var uclass="tvLink";
                          var html = '<a data-role="button" data-mini="true" role="button" href="#" src="'+decodeUri(dir["res"][0]["_"])+'" class="'+uclass+'" data="'+encodeURIComponent(JSON.stringify(dir.$))+'">'+dir['dc:title'][0]+'</a>';
                        }
                        var channel = {};
                        channel.num = parseInt(dir['dc:title'][0].split('-')[0].trim());
                        channel.data = html;
                        channels.push(channel);
                    }
                    if(index+1 === items.length) {
                      if(dirs) {
                        $.each(dirs,function(index,dir){
                          var uclass;
                          if(dir['upnp:class'][0].indexOf('object.container') !== -1){
                            var obj = dir.$;
                            var obj = dir['$'];
                            obj.serverId = serverId;
                            var html = '<div data-role="collapsible" class="upnpFolder" data-collapsed="true" data-mini="true" data="'+encodeURIComponent(JSON.stringify(obj))+'"><h3>'+dir["dc:title"]+'</h3></div>';
                            var channel = {};
                            channel.num = parseInt(dir['dc:title'][0].split('-')[0].trim());
                            channel.data = html;
                            channels.push(channel);
                          } else if(dir['upnp:class'][0].indexOf('object.item') !== -1) {
                              if(dir['upnp:class'][0] === "object.item.imageItem") {
                                var uclass="upnpImage";
                                var html = '<a data-role="button" data-mini="true" role="button" href="#" src="'+decodeUri(dir["res"][0]["_"])+'" class="'+uclass+'" data="'+encodeURIComponent(JSON.stringify(dir.$))+'">'+dir['dc:title'][0]+'</a>';
                              } else if (dir['upnp:class'][0] === "object.item.textItem") {
                                var uclass="upnpText";
                                var html = '<a data-role="button" data-mini="true" role="button" href="#" src="'+decodeUri(dir["res"][0]["_"])+'" class="'+uclass+'" data="'+encodeURIComponent(JSON.stringify(dir.$))+'">'+dir['dc:title'][0]+'</a>';
                              } else {
                                var uclass="tvLink";
                                var html = '<a data-role="button" data-mini="true" role="button" href="#" src="'+decodeUri(dir["res"][0]["_"])+'" class="'+uclass+'" data="'+encodeURIComponent(JSON.stringify(dir.$))+'">'+dir['dc:title'][0]+'</a>';
                              }
                              var channel = {};
                              channel.num = parseInt(dir['dc:title'][0].split('-')[0].trim());
                              channel.data = html;
                              channels.push(channel);
                          }
                          if(index+1 === dirs.length) {
                            var sorted = _.sortBy(channels, 'num');
                            var body = JSON.stringify(sorted);
                            res.writeHead(200,{'Content-type': 'text/html','Access-Control-Allow-Origin' : '*'});
                            res.end(body);
                          }
                      });
                    } else {
                        var sorted = _.sortBy(channels, 'num');
                        var body = JSON.stringify(sorted);
                        res.writeHead(200,{'Content-type': 'text/html','Access-Control-Allow-Origin' : '*'});
                        res.end(body);
                    }
                  }
                });
              } else {
                if(dirs) {
                  $.each(dirs,function(index,dir){
                    console.log(dir)
                    var uclass;
                   if(dir['upnp:class'][0].indexOf('object.container') !== -1){
                      var obj = dir['$'];
                      obj.serverId = serverId;
                      console.log(obj)
                      var html = '<div data-role="collapsible" class="upnpFolder" data-collapsed="true" data-mini="true" data="'+encodeURIComponent(JSON.stringify(obj))+'"><h3>'+dir["dc:title"]+'</h3></div>';
                      var channel = {};
                      channel.num = parseInt(dir['dc:title'][0].split('-')[0].trim());
                      channel.data = html;
                      channels.push(channel);
                    } else if(dir['upnp:class'][0].indexOf('object.item') !== -1) {
                        if(dir['upnp:class'][0] === "object.item.imageItem") {
                          var uclass="upnpImage";
                          var html = '<a data-role="button" data-mini="true" role="button" href="#" src="'+decodeUri(dir["res"][0]["_"])+'" class="'+uclass+'" data="'+encodeURIComponent(JSON.stringify(dir.$))+'">'+dir['dc:title'][0]+'</a>';
                        } else if (dir['upnp:class'][0] === "object.item.textItem") {
                          var uclass="upnpText";
                          var html = '<a data-role="button" data-mini="true" role="button" href="#" src="'+decodeUri(dir["res"][0]["_"])+'" class="'+uclass+'" data="'+encodeURIComponent(JSON.stringify(dir.$))+'">'+dir['dc:title'][0]+'</a>';
                        } else {
                          var uclass="tvLink";
                          var html = '<a data-role="button" data-mini="true" role="button" href="#" src="'+decodeUri(dir["res"][0]["_"])+'" class="'+uclass+'" data="'+encodeURIComponent(JSON.stringify(dir.$))+'">'+dir['dc:title'][0]+'</a>';
                        }
                        var channel = {};
                        channel.num = parseInt(dir['dc:title'][0].split('-')[0].trim());
                        channel.data = html;
                        channels.push(channel);
                    }
                    console.log(index+1, dirs.length)
                    if(index+1 === dirs.length) {
                        var sorted = _.sortBy(channels, 'num');
                        var body = JSON.stringify(sorted);
                        res.writeHead(200,{'Content-type': 'text/html','Access-Control-Allow-Origin' : '*'});
                        res.end(body);
                    }
                });
              }
            }
          });
        } catch(err) {
          console.log("ERRORRRRRR "+ err)
          }
      } else {
          console.log("no response")
      }
      
  }).then( null, function( error ) { // Handle any errors
  
      debugLog( "An error occurred: " + error.description );
  
  });
}


var decodeUri = function(uri) {
  if(uri.match(/\/%25\//) !== null) {
    uri = uri.replace(/\/%25\//g,'/');
  }
  if(uri.match(/%2525/) !== null){
    uri = uri.replace(/%2525/g,'%');
  }
  if(uri.match(/%25/) !== null) {
    uri = uri.replace(/%25/g,'%');
  }
  // test double http
  if(uri.match(/http/g).length > 1 ) {
    uri = "http://"+uri.split('http').pop();
  }
  return encodeXML(uri);
}

var encodeXML = function ( str ) {
    return str.replace(/\&/g, '&amp;')
};

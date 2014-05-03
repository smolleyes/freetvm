//node modules
var fs = require('fs'),
    path = require('path'),
    http = require('http'),
    cpu = require('os-utils'),
    nodeip = require('node-ip'),
    deviceType = require('ua-device-type'),
    url = require('url'),
    spawn = require('child_process').spawn;
    upnp = require("upnp");
    myIp = require("node-ip").address();

// node-webkit window
var gui = require('nw.gui');
var win = gui.Window.get();
win.setResizable(false);
win.on('loaded', function() {
    this.show();
    this.setPosition("center");
    startUpnp();
});

//globals
VERSION="0.2.1";
var timeout = 5000; //ms
var exec_path=path.dirname(process.execPath);
var winIshidden = true;
var megaServer;
var storage = localStorage;
var settings = {};
var ffmpeg;
var ffar = [];

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

// start app
$(document).on('ready',function(e){
    //load stored infos
    if (storage.ftvSettings === undefined) {
        settings.ip = nodeip.address();
        settings.version = VERSION;
        settings.sharedFolders = [];
        storage.ftvSettings = JSON.stringify(settings);
    } else {
        settings = JSON.parse(storage.ftvSettings);
    }
    // check stored version
    if(settings.version !== VERSION) {
		settings.version = VERSION;
		storage.ftvSettings = JSON.stringify(settings);
	} 
    
    // start keyevent listener
    fn = function(e){ onKeyPress(e); };
    document.addEventListener("keydown", fn, false );
    //start server
    startMegaServer();
    // show window when ready
    winIshidden = false;

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
});

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
        console.log("[DEBUG] request received : "+decodeURIComponent(req.url)+"\n");
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
                        if(infos.name.indexOf('(auto)') !== -1) {
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
                                          var body = JSON.stringify(json);
                                          res.writeHead(200, {"Content-Type": "application/json;charset=utf-8"});
                                          res.end(body);
                                      }
                                  }
                              });
                        } else {
                              res.writeHead(200,{'Content-type': 'text/html'});
                              res.end(html, 'utf-8');
                        }
                      }
                    } catch(err){
                      console.log("n'est pas une chaine", err);
                    }
                 });
              });
            } else if (req.url.indexOf("/getLocalDbJson") !== -1){
                getLocalDb(res);
            } else if (req.url.indexOf("/test") !== -1){
                res.writeHead(200, {"Content-Type": 'text/html'});
                res.write('ok!');
                res.end();
            } else {
                getMetadata(req,res);
                //startStreaming(req,res);
            }
        }
    }).listen(8888);
    $("#serverStateImg").attr('src','img/online.png');
    $("#serverState").empty().append('Serveur en écoute sur '+nodeip.address()+' port 8888'),
    $("#ipLocale").empty().append('<b>Ip locale</b>: '+myIp);
    }
}


////////////////////////////////////////////////
// list local shared folders

function getLocalDb(res) {
    try {
        var dirs = settings.sharedFolders;
        if ((dirs === undefined) || (dirs.length === 0)) {
            res.writeHead(200, {"Content-Type": "text/html;"});
            res.write('no share');
            res.end();
            return;
        }
    } catch(err) {
        console.log("shared dirs error : "+ err);
        res.writeHead(200, {"Content-Type": "text/html;"});
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
                res.writeHead(200, {"Content-Type": "application/json;charset=utf-8"});
                res.end(body);
            }
            return true;
        } else {
            fileList.push(dirTree(dir));
            if (index+1 === dirs.length) {
                var body = JSON.stringify(fileList);
                res.writeHead(200, {"Content-Type": "application/json;charset=utf-8"});
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
    var args = ['-show_streams',link];
    if (process.platform === 'win32') {
        ffprobe = spawn(exec_path+'/ffprobe.exe', args);
    } else {
        ffprobe = spawn(exec_path+'/ffprobe', args);
    }
    ffprobe.stderr.on('data', function(data) {
        var infos = data.toString();
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
            link = parsedLink.match(/\?file=(.*?)&tv/)[1].replace(/\+/g,' ');
        } catch(err) {
            link = parsedLink.match(/\?file=(.*)/)[1].replace(/\+/g,' ');
        }
        console.log("[DEBUG] Opening link: " + link)
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
        args = ['-i',link,'-f','matroska','-sn','-c:v', 'libx264','-preset', 'fast','-deinterlace',"-aspect", "16:9","-b:v",bitrate+"k",'-c:a', 'libopus','-b:a','256k','-threads', '0', '-'];
    } else {
        args = ['-i',link,'-f','matroska','-sn','-c:v', 'libx264','-preset', 'fast','-deinterlace',"-aspect", "16:9","-b:v",bitrate+"k",'-c:a', 'libopus','-b:a','64k','-threads', '0', '-'];
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
	 
	  if (err) throw err;
	  
	  console.log("Found Gateway!");
	  console.log("Fetching External IP ... ");
	  
	  gateway.getExternalIP(function(err, ip) {
	  
		if (err) console.log(err);
		$("#ipFreebox").empty().append('<b>Ip</b>:    ' +ip);
		
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
			if(res !== 'ok!') {
				alert("pas d'accès exterieur à votre freebox, merci de vérifier vos firewalls etc... (autoriser port 8888 en tcp)");
			} else {
				console.log("Accès exterieur ok!")
			}
		  });  
		});
		
	  });
	  
	});
}

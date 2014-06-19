var os = require('os');
var fs = require('fs');
var address = require('network-address');
var proc = require('child_process');
var readTorrent = require('read-torrent');
var peerflix = require('peerflix');
var mime = require('mime');
var ts = require('torrent-stream');

var path = require('path');
var mime = require('mime');
var ___ = require('underscore');

var statsUpdater = null;
var active = function(wire) {
    return !wire.peerChoking;
};

var stateModel = {};
stateModel.state='';
var videoStreamer = null;
var torrentsArr = [];

var app = {};

// Minimum percentage to open video
var MIN_PERCENTAGE_LOADED = 0.5;
var STREAM_PORT = 21584; // 'PT'!
// Minimum bytes loaded to open video
var BUFFERING_SIZE = 10 * 1024 * 1024;

var maxTry = 90;
var numTry = 0; 
var stateModel = {};
var streamInfo = {};

var tmpFolder = path.join(os.tmpDir(), 'ht5Torrents');
if( ! fs.existsSync(tmpFolder) ) { fs.mkdir(tmpFolder); }

function getTorrent(link,res) {
  try {
    stopTorrent();
  } catch(err) {}
  stateModel = {state: 'connecting', backdrop: '',numTry: 0};
  streamInfo = {};
  var readTorrent = require('read-torrent');
  readTorrent(link, function(err, torrent) {
      if(err) {
         console.log(err);
      } else {
          title = torrent.name;
          var torrentInfo = {
              info: torrent,
              title: title
          };
          handleTorrent(torrentInfo, stateModel,res);
      }
  });
}

function stopTorrent(res) {
  $.each(torrentsArr,function(index,torrent) {
    wipeTmpFolder();
    try {
    videoStreamer = null;
    clearTimeout(statsUpdater);
    console.log("stopping torrent :" + torrent.name);
    var flix = torrent.obj;
    torrentsArr.pop(index,1);
    flix.destroy();
    delete flix;
    if(res) {
      res.writeHead(200,{'Content-type': 'text/html','Access-Control-Allow-Origin' : '*'});
      res.end();
    }
  } catch(err) {
      if(res) {
        res.writeHead(500,{'Content-type': 'text/html','Access-Control-Allow-Origin' : '*'});
        res.end(err);
      }
      console.log(err);
  }
  });
}

var wipeTmpFolder = function() {
    if( typeof tmpFolder != 'string' ){ return; }
    fs.readdir(tmpFolder, function(err, files){
        for( var i in files ) {
            fs.unlink(tmpFolder+'/'+files[i],function(){console.log("file deleted");});
        }
    });
}

var watchState = function(stateModel) {
    if (videoStreamer != null) {
        var swarm = videoStreamer.swarm;
        var state = 'connecting';

        if(swarm.downloaded > BUFFERING_SIZE) {
            state = 'ready';
        } else if(swarm.downloaded) {
            state = 'downloading';
        } else if(swarm.wires.length) {
            state = 'startingDownload';
        }

        stateModel.state = state;
        stateModel.numTry += 1;
        if(state != 'ready') {
            ___.delay(watchState, 1000, stateModel);
        } else {
            clearTimeout(___.delay(watchState, 1000, stateModel));
        }
    }
};

app.updateStats = function(streamInfo) {
			var active = function(wire) {return !wire.peerChoking;};
			var swarm = streamInfo.swarm;

			var upload_speed = swarm.uploadSpeed(); // upload speed
			var final_upload_speed = '0 B/s';
			if(!isNaN(upload_speed) && upload_speed != 0){
				var converted_speed = Math.floor( Math.log(upload_speed) / Math.log(1024) );
				final_upload_speed = ( upload_speed / Math.pow(1024, converted_speed) ).toFixed(2) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][converted_speed]+'/s';
			}

			var download_speed = swarm.downloadSpeed(); // download speed
			var final_download_speed = '0 B/s';
			if(!isNaN(download_speed) && download_speed != 0){
				var converted_speed = Math.floor( Math.log(download_speed) / Math.log(1024) );
				final_download_speed = ( download_speed / Math.pow(1024, converted_speed) ).toFixed(2) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][converted_speed]+'/s';
			}

			this.downloaded = swarm.downloaded;
			this.active_peers=swarm.wires.filter(active).length;
			this.total_peers=swarm.wires.length;

			this.uploadSpeed=final_upload_speed; // variable for Upload Speed
			this.downloadSpeed=final_download_speed; // variable for Download Speed

			this.downloaded = (swarm.downloaded) ? swarm.downloaded : 0;
			this.percent = (swarm.downloaded / (BUFFERING_SIZE / 100)).toFixed(2);
      if(stateModel.state != 'ready') {
          if(stateModel.state === 'connecting') {
              if(parseInt(stateModel.numTry) > 90) {
                setTimeout(function() {$('#preloadProgress').empty().append('Torrent invalide ou pas de seeders, impossible de télécharger...!');},5000);
                clearTimeout(statsUpdater);
                return;
              } else {
                $('#preloadProgress').empty().append('Connexion... merci de patienter (essai '+stateModel.numTry+'/'+maxTry+')');
              }
          } else if (stateModel.state === 'downloading' || stateModel.state === 'startingDownload') {
              if (parseInt(this.percent) > 0 && parseInt(this.percent) < 100) {
                  $('#preloadProgress').empty().append('Chargement  '+ this.percent +' % effectué à '+ this.downloadSpeed);
                  $('#preloadTorrent progress').attr('value',this.percent).text(this.percent);
              } 
          }
      } else {
          $('#preloadTorrent').remove();
          var stream = {};
          playFromHttp = true;
          clearTimeout(statsUpdater);
          //startPlay(stream);
      }
      
};


function handleTorrent(torrent, stateModel, res) {
  var tmpFilename = torrent.info.infoHash;
  tmpFilename = tmpFilename.replace(/([^a-zA-Z0-9-_])/g, '_') +'-'+ (new Date()*1);
  var tmpFile = path.join(tmpFolder, tmpFilename);
  
  $('.mejs-overlay-button').hide();
  $('#preloadTorrent').empty().remove();
  $('.mejs-container').append('<div id="preloadTorrent" \
  style="position: absolute;top: 45%;margin: 0 50%;color: white;font-size: 12px;text-align: center;z-index: 10000;width: 450px;right: 50%;left: -225px;"> \
  <p><b id="preloadProgress">Connexion... merci de patienter</b></p> \
  <progress value="5" min="0" max="100">0%</progress> \
  </div>');
  videoStreamer = peerflix(torrent.info, {
      connections: 100, // Max amount of peers to be connected to.
      path: tmpFile, // we'll have a different file name for each stream also if it's same torrent in same session
      buffer: (1.5 * 1024 * 1024).toString() // create a buffer on torrent-stream
  });
      
      streamInfo = new app.updateStats(videoStreamer);
      statsUpdater = setInterval(___.bind(app.updateStats, streamInfo, videoStreamer), 1000);
      stateModel.streamInfo = streamInfo;
      watchState(stateModel);
  
  var checkReady = function() {
    if(stateModel.state === 'ready') {
        // we need subtitle in the player
        streamInfo.title = torrent.title;

        stateModel.state = 'ready';
        stateModel.destroy();
    }
  };

  videoStreamer.server.on('listening', function(){
      streamInfo.src = 'http://'+myIp+':' + videoStreamer.server.address().port + '/';
      streamInfo.type = 'video/mp4';
      var item = {};
      item.name = videoStreamer.files[0].name;
      item.obj = videoStreamer;
      torrentsArr.push(item);
      var obj = {};
      obj.link = 'http://'+myIp+':' + videoStreamer.server.address().port + '/';
      obj.title = videoStreamer.files[0].name;
      res.writeHead(200,{'Content-type': 'application/json','Access-Control-Allow-Origin' : '*'});
      res.end(JSON.stringify(obj));

      // TEST for custom NW
      //streamInfo.set('type', mime.lookup(videoStreamer.server.index.name));
      //stateModel.on('change:state', checkReady);
      checkReady();
  });
  
  
  // not used anymore
  videoStreamer.on('ready', function() {});

  videoStreamer.on('uninterested', function() {
      if (videoStreamer) {
          videoStreamer.swarm.pause();
      }
      
  });

  videoStreamer.on('interested', function() {
      if (videoStreamer) {
          videoStreamer.swarm.resume();
      }            
  });

  //var flix = peerflix(torrent.info, {
      //connections: 100, // Max amount of peers to be connected to.
      //path: tmpFile, // we'll have a different file name for each stream also if it's same torrent in same session
      //buffer: (1.5 * 1024 * 1024).toString() // create a buffer on torrent-stream
  //}, function (err, flix) {
    //if (err) throw err;

    //var started = Date.now(),
    //refresh = true;
    //loadedTimeout;
    
    //flix.server.on('listening', function () {
      //var href = 'http://'+ipaddress+':' + flix.server.address().port + '/';
      //loadedTimeout ? clearTimeout(loadedTimeout) : null;
      
      //var item = {};
      //item.name = flix.selected.name;
      //item.obj = flix;
      //torrentsArr.push(item);
      //var maxTry = 90;
      //var tried = 0;
      
      //var checkLoadingProgress = function () {
        //try {
        //var now = flix.downloaded,
        //total = flix.selected.length,
        //// There's a minimum size before we start playing the video.
        //// Some movies need quite a few frames to play properly, or else the user gets another (shittier) loading screen on the video player.
          //targetLoadedSize = MIN_SIZE_LOADED > total ? total : MIN_SIZE_LOADED,
          //targetLoadedPercent = MIN_PERCENTAGE_LOADED * total / 100.0,

          //targetLoaded = Math.max(targetLoadedPercent, targetLoadedSize),

          //percent = (now / targetLoaded * 100.0).toFixed(2);
          //var downloaded = bytesToSize(flix.downloaded, 2);
          //var downloadRate = bytesToSize(flix.speed(), 2);
          //if (now > targetLoaded) {
            //clearTimeout(loadedTimeout);
            //$('#preloadTorrent').remove();
            //var stream = {};
            //playFromHttp = true;
            //stream.link = href;
            //stream.next = '';
            //stream.title = flix.selected.name;
            //startPlay(stream);
          //} else {
            //if (percent > 0) {
              //$('#preloadProgress').empty().append('Chargement  '+ percent +' % effectué à '+ downloadRate +'/s');
              //$('#preloadTorrent progress').attr('value',percent).text(percent);
            //} else {
              //tried += 1;
              //if (tried === 90) {
                  //clearTimeout(loadedTimeout);
                  //$('#preloadProgress').empty().append('Connexion impossible, mauvais torrent...');
                  //setTimeout(stopTorrent,5000);
              //} else {
                  //$('#preloadProgress').empty().append('Connexion... merci de patienter (essai '+tried+'/'+maxTry+')');
              //}
            //}
            //if (refresh === true) {
              //loadedTimeout = setTimeout(checkLoadingProgress, 1000);
            //}
          //}
          //} catch(err) {
              //console.log(err)
          //}
      //}
      //checkLoadingProgress();
    //});
}

function bytesToSize(bytes, precision) {	
	var kilobyte = 1024;
	var megabyte = kilobyte * 1024;
	var gigabyte = megabyte * 1024;
	var terabyte = gigabyte * 1024;

	if ((bytes >= 0) && (bytes < kilobyte)) {
		return bytes + ' Bits';

	} else if ((bytes >= kilobyte) && (bytes < megabyte)) {
		return (bytes / kilobyte).toFixed(precision) + ' Ko';

	} else if ((bytes >= megabyte) && (bytes < gigabyte)) {
		return (bytes / megabyte).toFixed(precision) + ' Mo';

	} else if ((bytes >= gigabyte) && (bytes < terabyte)) {
		return (bytes / gigabyte).toFixed(precision) + ' Go';

	} else if (bytes >= terabyte) {
		return (bytes / terabyte).toFixed(precision) + ' To';
	} else {
		return bytes + 'Bits';
	}
}
